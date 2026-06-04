"""
User Profile (V9 Part 1 + 4C) — social profile endpoints
==========================================================

Provides everything `/profile` and `/u/{username}` need:

  GET    /api/users/me/profile        — read my profile
  PUT    /api/users/me/profile        — update my profile
  POST   /api/users/me/avatar         — upload avatar (multipart)
  GET    /api/users/username-available — check username uniqueness
  DELETE /api/users/me                — hard delete account + content

  GET    /api/users/me/photos         — my photos
  POST   /api/users/me/photos         — upload one photo (multipart)
  DELETE /api/users/me/photos/{id}    — delete my photo

  GET    /api/users/{username}/profile — public profile by handle
  GET    /api/users/{username}/photos  — public photos
  GET    /api/users/{username}/reels   — public reels

Username auto-generation: derives a slug from name + last 4 chars of
user_id on the first profile read. We keep the legacy `users` doc as
the source of truth for email/role/name and store the social fields
inline (`username`, `bio`, `city`, `avatar_url`, `social_links`,
`is_public`).
"""
import logging
import os
import re
import shutil
import uuid
from datetime import datetime, timezone
from typing import Any, Optional, List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger(__name__)

UPLOAD_DIR = "/app/backend/uploads"
MAX_PHOTOS = 30


# ─── Pydantic models ───────────────────────────────────────────────

class SocialLinks(BaseModel):
    instagram: Optional[str] = Field(default=None, max_length=40)
    tiktok: Optional[str] = Field(default=None, max_length=40)
    facebook: Optional[str] = Field(default=None, max_length=80)
    linkedin: Optional[str] = Field(default=None, max_length=80)
    twitter: Optional[str] = Field(default=None, max_length=40)

    @field_validator("instagram", "tiktok", "facebook", "linkedin", "twitter", mode="before")
    @classmethod
    def strip_at(cls, v):
        if v is None or v == "":
            return None
        s = str(v).strip()
        if s.startswith("@"):
            s = s[1:]
        return s or None


class UserProfileIn(BaseModel):
    full_name: Optional[str] = Field(default=None, max_length=120)
    username: Optional[str] = Field(default=None, min_length=3, max_length=24)
    city: Optional[str] = Field(default=None, max_length=80)
    bio: Optional[str] = Field(default=None, max_length=160)
    social_links: Optional[SocialLinks] = None
    is_public: Optional[bool] = None
    phone: Optional[str] = Field(default=None, max_length=20)
    preferred_lang: Optional[str] = Field(default=None, max_length=4)

    @field_validator("username")
    @classmethod
    def validate_username(cls, v):
        if v is None:
            return v
        if not re.fullmatch(r"[a-zA-Z0-9_]{3,24}", v):
            raise ValueError("Username solo puede tener letras, números y guion bajo (3-24 chars).")
        return v.lower()


class UserPhotoIn(BaseModel):
    caption: Optional[str] = Field(default=None, max_length=240)


# ─── Helpers ───────────────────────────────────────────────────────

def _slugify_username(name: str, user_id: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9_]", "", (name or "").lower()) or "user"
    return f"{base[:18]}_{user_id[-4:]}".lower()


async def _ensure_username(db, user_doc: dict) -> str:
    """Lazily back-fill `username` for users created before V9."""
    if user_doc.get("username"):
        return user_doc["username"]
    candidate = _slugify_username(user_doc.get("name") or "user", user_doc["user_id"])
    # Avoid collision
    for i in range(10):
        existing = await db.users.find_one(
            {"username": candidate, "user_id": {"$ne": user_doc["user_id"]}},
            {"_id": 0, "user_id": 1},
        )
        if not existing:
            break
        candidate = f"{candidate}{i}"
    await db.users.update_one({"user_id": user_doc["user_id"]}, {"$set": {"username": candidate}})
    return candidate


async def _is_provider(db, user_id: str) -> tuple[bool, bool, Optional[str], Optional[str]]:
    prof = await db.provider_profiles.find_one(
        {"user_id": user_id, "is_active": True},
        {"_id": 0, "slug": 1, "verification_status": 1, "provider_verified": 1, "getamano_code": 1},
    )
    if not prof:
        return False, False, None, None
    verified = prof.get("verification_status") == "approved" or bool(prof.get("provider_verified"))
    return True, verified, prof.get("slug"), prof.get("getamano_code")


def _profile_dict(user: dict, is_provider: bool, provider_verified: bool, provider_slug: Optional[str], getamano_code: Optional[str]) -> dict:
    return {
        "user_id": user["user_id"],
        "full_name": user.get("name") or "",
        "username": user.get("username") or "",
        "email": user.get("email"),
        "phone": user.get("phone"),
        "preferred_lang": user.get("preferred_lang") or user.get("language") or "es",
        "city": user.get("city"),
        "bio": user.get("bio"),
        "avatar_url": user.get("avatar_url") or user.get("picture"),
        # V19.2 — Cover banner for the personal profile page. Optional;
        # if missing, the frontend shows the gradient placeholder + a
        # "completa tu perfil" prompt that opens the uploader.
        "cover_url": user.get("cover_url"),
        "social_links": user.get("social_links") or {},
        "is_public": user.get("is_public", True),
        "is_provider": is_provider,
        "provider_verified": provider_verified,
        "provider_slug": provider_slug,
        "getamano_code": getamano_code,
        "role": user.get("role"),
        "created_at": user.get("created_at"),
    }


def make_router(
    *,
    db: Any,
    User: type,
    get_current_user,
    issue_session_token=None,
) -> APIRouter:
    router = APIRouter()

    # ─── ME ────────────────────────────────────────────────────────

    @router.get("/users/me/profile")
    async def get_my_profile(me: User = Depends(get_current_user)) -> dict:
        u = await db.users.find_one({"user_id": me.user_id}, {"_id": 0})
        if not u:
            raise HTTPException(status_code=404, detail="Usuario no encontrado.")
        username = await _ensure_username(db, u)
        u["username"] = username
        is_prov, verified, slug, code = await _is_provider(db, me.user_id)
        return _profile_dict(u, is_prov, verified, slug, code)

    @router.put("/users/me/profile")
    async def update_my_profile(payload: UserProfileIn, me: User = Depends(get_current_user)) -> dict:
        update: dict = {}
        if payload.full_name is not None:
            update["name"] = payload.full_name.strip()
        if payload.username is not None:
            # Uniqueness check
            existing = await db.users.find_one(
                {"username": payload.username, "user_id": {"$ne": me.user_id}},
                {"_id": 0, "user_id": 1},
            )
            if existing:
                raise HTTPException(status_code=409, detail="Username ya está en uso.")
            update["username"] = payload.username
        for field in ("city", "bio", "phone", "preferred_lang"):
            val = getattr(payload, field, None)
            if val is not None:
                update[field] = val.strip() if isinstance(val, str) else val
        if payload.social_links is not None:
            cleaned = {k: v for k, v in payload.social_links.model_dump().items() if v}
            update["social_links"] = cleaned
        if payload.is_public is not None:
            update["is_public"] = payload.is_public
        if update:
            update["updated_at"] = datetime.now(timezone.utc).isoformat()
            await db.users.update_one({"user_id": me.user_id}, {"$set": update})
        u = await db.users.find_one({"user_id": me.user_id}, {"_id": 0})
        is_prov, verified, slug, code = await _is_provider(db, me.user_id)
        return _profile_dict(u, is_prov, verified, slug, code)

    @router.get("/users/username-available")
    async def username_available(username: str, me: User = Depends(get_current_user)) -> dict:
        try:
            if not re.fullmatch(r"[a-zA-Z0-9_]{3,24}", username):
                return {"available": False, "reason": "format"}
        except Exception:
            return {"available": False, "reason": "format"}
        existing = await db.users.find_one(
            {"username": username.lower(), "user_id": {"$ne": me.user_id}},
            {"_id": 0, "user_id": 1},
        )
        return {"available": existing is None}

    @router.post("/users/me/avatar")
    async def upload_avatar(file: UploadFile = File(...), me: User = Depends(get_current_user)) -> dict:
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        ext = (file.filename or "").rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "jpg"
        if ext not in {"jpg", "jpeg", "png", "webp"}:
            raise HTTPException(status_code=400, detail="Formato no soportado (jpg, png, webp).")
        fname = f"avatar_{me.user_id}_{uuid.uuid4().hex[:8]}.{ext}"
        path = os.path.join(UPLOAD_DIR, fname)
        with open(path, "wb") as out:
            shutil.copyfileobj(file.file, out)
        url = f"/api/uploads/{fname}"
        await db.users.update_one({"user_id": me.user_id}, {"$set": {"avatar_url": url, "picture": url}})
        return {"avatar_url": url}

    @router.post("/users/me/cover")
    async def upload_cover(file: UploadFile = File(...), me: User = Depends(get_current_user)) -> dict:
        """V19.2 — Cover/banner image for the personal profile page.

        Mirrors the avatar upload but stores under `cover_url`. We accept
        the same image formats; the frontend renders the file inside a
        fixed-aspect banner so large landscape photos look correct.
        """
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        ext = (file.filename or "").rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "jpg"
        if ext not in {"jpg", "jpeg", "png", "webp"}:
            raise HTTPException(status_code=400, detail="Formato no soportado (jpg, png, webp).")
        fname = f"cover_{me.user_id}_{uuid.uuid4().hex[:8]}.{ext}"
        path = os.path.join(UPLOAD_DIR, fname)
        with open(path, "wb") as out:
            shutil.copyfileobj(file.file, out)
        url = f"/api/uploads/{fname}"
        await db.users.update_one({"user_id": me.user_id}, {"$set": {"cover_url": url}})
        return {"cover_url": url}

    @router.delete("/users/me/cover")
    async def delete_cover(me: User = Depends(get_current_user)) -> dict:
        await db.users.update_one({"user_id": me.user_id}, {"$unset": {"cover_url": ""}})
        return {"ok": True}

    @router.delete("/users/me")
    async def delete_my_account(me: User = Depends(get_current_user)) -> dict:
        """Hard delete everything we have on the user. We DO NOT cascade
        into reviews left ON other providers, but we anonymize them.
        """
        uid = me.user_id
        await db.user_photos.delete_many({"user_id": uid})
        await db.stories.delete_many({"provider_user_id": uid})
        await db.reels.delete_many({"provider_user_id": uid})
        await db.reel_likes.delete_many({"user_id": uid})
        await db.community_posts.delete_many({"user_id": uid})
        await db.community_comments.delete_many({"user_id": uid})
        await db.community_likes.delete_many({"user_id": uid})
        await db.gremio_members.delete_many({"user_id": uid})
        await db.push_subscriptions.delete_many({"user_id": uid})
        await db.favorites.delete_many({"user_id": uid})
        await db.reviews.update_many({"user_id": uid}, {"$set": {"anonymized": True, "client_name": "Anónimo"}})
        await db.provider_profiles.delete_many({"user_id": uid})
        await db.users.delete_one({"user_id": uid})
        return {"deleted": True}

    # ─── My photos ────────────────────────────────────────────────

    @router.get("/users/me/photos")
    async def list_my_photos(me: User = Depends(get_current_user)) -> List[dict]:
        rows = await db.user_photos.find({"user_id": me.user_id}, {"_id": 0}).sort("created_at", -1).to_list(MAX_PHOTOS)
        return rows

    @router.post("/users/me/photos")
    async def upload_photo(
        file: UploadFile = File(...),
        caption: Optional[str] = None,
        me: User = Depends(get_current_user),
    ) -> dict:
        count = await db.user_photos.count_documents({"user_id": me.user_id})
        if count >= MAX_PHOTOS:
            raise HTTPException(status_code=429, detail=f"Máximo {MAX_PHOTOS} fotos por usuario.")
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        ext = (file.filename or "").rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "jpg"
        if ext not in {"jpg", "jpeg", "png", "webp"}:
            raise HTTPException(status_code=400, detail="Formato no soportado.")
        fname = f"upph_{me.user_id}_{uuid.uuid4().hex[:8]}.{ext}"
        path = os.path.join(UPLOAD_DIR, fname)
        with open(path, "wb") as out:
            shutil.copyfileobj(file.file, out)
        url = f"/api/uploads/{fname}"
        doc = {
            "id": f"uph_{uuid.uuid4().hex[:12]}",
            "user_id": me.user_id,
            "image_url": url,
            "caption": (caption or "").strip() or None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.user_photos.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.delete("/users/me/photos/{photo_id}")
    async def delete_my_photo(photo_id: str, me: User = Depends(get_current_user)) -> dict:
        result = await db.user_photos.delete_one({"id": photo_id, "user_id": me.user_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Foto no encontrada.")
        return {"deleted": True}

    # ─── Public — by username ─────────────────────────────────────

    @router.get("/users/{username}/profile")
    async def get_public_profile(username: str) -> dict:
        u = await db.users.find_one({"username": username.lower()}, {"_id": 0})
        if not u:
            raise HTTPException(status_code=404, detail="Usuario no encontrado.")
        is_prov, verified, slug, code = await _is_provider(db, u["user_id"])
        full = _profile_dict(u, is_prov, verified, slug, code)
        if not full.get("is_public", True):
            return {
                "user_id": full["user_id"],
                "full_name": full["full_name"],
                "username": full["username"],
                "city": full.get("city"),
                "avatar_url": full.get("avatar_url"),
                "is_public": False,
                "is_provider": full["is_provider"],
                "provider_verified": full["provider_verified"],
            }
        # Strip private fields for non-owners
        for f in ("email", "phone", "preferred_lang"):
            full.pop(f, None)
        return full

    @router.get("/users/{username}/photos")
    async def get_public_photos(username: str) -> List[dict]:
        u = await db.users.find_one({"username": username.lower()}, {"_id": 0, "user_id": 1, "is_public": 1})
        if not u or not u.get("is_public", True):
            return []
        return await db.user_photos.find({"user_id": u["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(MAX_PHOTOS)

    @router.get("/users/{username}/reels")
    async def get_public_reels(username: str) -> List[dict]:
        u = await db.users.find_one({"username": username.lower()}, {"_id": 0, "user_id": 1, "is_public": 1})
        if not u or not u.get("is_public", True):
            return []
        return await db.reels.find(
            {"provider_user_id": u["user_id"], "is_public": True}, {"_id": 0}
        ).sort("created_at", -1).limit(30).to_list(30)

    return router


async def ensure_user_profile_indexes(db) -> None:
    try:
        await db.users.create_index([("username", 1)], unique=True, partialFilterExpression={"username": {"$exists": True}})
        await db.user_photos.create_index([("user_id", 1), ("created_at", -1)])
        logger.info("user profile indexes ensured")
    except Exception as e:
        logger.warning(f"user profile indexes skipped: {e}")
