"""
Reels — Section 89 v4 Phase E
==============================

Short-form vertical video posts created by providers. Reels live in the
`reels` collection. The UX mirrors TikTok / Instagram Reels: full-screen
vertical swipe with auto-play, like, share, and a CTA to the author's
eCard.

Endpoints (`/api/reels/*`):
  POST   /reels                        — create (provider auth)
  GET    /reels                        — public feed (cursor by created_at)
  GET    /reels/{reel_id}              — single reel
  POST   /reels/{reel_id}/view         — track view (24h-deduped per user)
  POST   /reels/{reel_id}/like         — toggle like
  DELETE /reels/{reel_id}              — owner or admin

Model
-----
{
  reel_id, provider_user_id, provider_id, provider_slug,
  business_name, logo_url, verified, getamano_code,
  video_url, thumbnail_url?, caption?, duration_s?, city?,
  views_count, likes_count, created_at
}
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class ReelCreateIn(BaseModel):
    video_url: str = Field(min_length=4, max_length=600)
    thumbnail_url: Optional[str] = Field(default=None, max_length=600)
    caption: Optional[str] = Field(default=None, max_length=300)
    duration_s: Optional[float] = Field(default=None, ge=0.5, le=180.0)


def make_router(*, db, User, get_current_user) -> APIRouter:
    router = APIRouter()

    async def _author_profile(user_id: str) -> Optional[dict]:
        return await db.provider_profiles.find_one(
            {"user_id": user_id, "is_active": True},
            {
                "_id": 0, "provider_id": 1, "user_id": 1, "slug": 1,
                "business_name": 1, "logo_url": 1, "city": 1,
                "verification_status": 1, "getamano_code": 1,
            },
        )

    @router.post("/reels")
    async def create_reel(payload: ReelCreateIn, user: User = Depends(get_current_user)) -> dict:
        prof = await _author_profile(user.user_id)
        if not prof:
            raise HTTPException(status_code=403, detail="Activa tu perfil de proveedor para subir un reel.")

        # Throttle: max 10 reels per provider per 24h to keep the feed quality high.
        since = datetime.now(timezone.utc).timestamp() - 24 * 3600
        recent = await db.reels.count_documents({
            "provider_user_id": user.user_id,
            "created_at": {"$gte": datetime.fromtimestamp(since, tz=timezone.utc).isoformat()},
        })
        if recent >= 10:
            raise HTTPException(status_code=429, detail="Límite diario de 10 reels alcanzado.")

        now_iso = datetime.now(timezone.utc).isoformat()
        doc = {
            "reel_id": f"reel_{uuid.uuid4().hex[:12]}",
            "provider_user_id": user.user_id,
            "provider_id": prof["provider_id"],
            "provider_slug": prof.get("slug"),
            "business_name": prof.get("business_name"),
            "logo_url": prof.get("logo_url"),
            "verified": prof.get("verification_status") == "approved",
            "getamano_code": prof.get("getamano_code"),
            "city": prof.get("city"),
            "video_url": payload.video_url,
            "thumbnail_url": payload.thumbnail_url,
            "caption": (payload.caption or "").strip() or None,
            "duration_s": payload.duration_s,
            "views_count": 0,
            "likes_count": 0,
            "is_public": True,
            "created_at": now_iso,
        }
        await db.reels.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.get("/reels")
    async def list_reels(limit: int = 20, before: Optional[str] = None) -> List[dict]:
        """Public feed. Cursor by `created_at`. Mixed sort: recent first
        with a soft boost for high-engagement reels (likes_count * 60s)."""
        limit = max(1, min(60, limit))
        q: dict = {"is_public": True}
        if before:
            q["created_at"] = {"$lt": before}
        rows = await db.reels.find(q, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
        return rows

    @router.get("/reels/{reel_id}")
    async def get_reel(reel_id: str) -> dict:
        doc = await db.reels.find_one({"reel_id": reel_id, "is_public": True}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Reel no encontrado.")
        return doc

    # Section 89 v9 Part 2 — public reels by provider slug. Always
    # returns an array (never 404s) so the eCard page never crashes.
    @router.get("/providers/by-slug/{slug}/reels")
    async def list_reels_by_slug(slug: str, limit: int = 12) -> list:
        prof = await db.provider_profiles.find_one(
            {"slug": slug, "is_active": True},
            {"_id": 0, "user_id": 1},
        )
        if not prof:
            return []
        limit = max(1, min(50, limit))
        return await db.reels.find(
            {"provider_user_id": prof["user_id"], "is_public": True},
            {"_id": 0},
        ).sort("created_at", -1).limit(limit).to_list(limit)

    @router.post("/reels/{reel_id}/view")
    async def track_view(reel_id: str, user: User = Depends(get_current_user)) -> dict:
        """Increment view count once per (reel, viewer) per 24h."""
        key = {"reel_id": reel_id, "viewer_user_id": user.user_id}
        existed = await db.reel_views.find_one(key, {"_id": 0, "viewed_at": 1})
        now = datetime.now(timezone.utc)
        if existed:
            last = existed.get("viewed_at")
            try:
                last_dt = datetime.fromisoformat(str(last).replace("Z", "+00:00"))
                if (now - last_dt).total_seconds() < 24 * 3600:
                    return {"ok": True, "counted": False}
            except Exception:
                pass
        await db.reel_views.update_one(
            key, {"$set": {**key, "viewed_at": now.isoformat()}}, upsert=True,
        )
        await db.reels.update_one({"reel_id": reel_id}, {"$inc": {"views_count": 1}})
        return {"ok": True, "counted": True}

    @router.post("/reels/{reel_id}/like")
    async def toggle_like(reel_id: str, user: User = Depends(get_current_user)) -> dict:
        existing = await db.reel_likes.find_one(
            {"reel_id": reel_id, "user_id": user.user_id}, {"_id": 1}
        )
        if existing:
            await db.reel_likes.delete_one({"_id": existing["_id"]})
            await db.reels.update_one({"reel_id": reel_id}, {"$inc": {"likes_count": -1}})
            liked = False
        else:
            await db.reel_likes.insert_one({
                "reel_id": reel_id,
                "user_id": user.user_id,
                "liked_at": datetime.now(timezone.utc).isoformat(),
            })
            await db.reels.update_one({"reel_id": reel_id}, {"$inc": {"likes_count": 1}})
            liked = True
            # Push to the reel owner (fire-and-forget)
            try:
                reel = await db.reels.find_one({"reel_id": reel_id}, {"_id": 0, "provider_user_id": 1, "likes_count": 1})
                if reel and reel.get("provider_user_id") != user.user_id and (reel.get("likes_count") or 0) % 10 == 0:
                    from routes.push import send_push_to_user
                    await send_push_to_user(db, reel["provider_user_id"], {
                        "title": "🔥 Tu reel está prendiendo",
                        "body": f"Llevas {reel['likes_count']} likes",
                        "icon": "/icon-192x192.png",
                        "url": "/reels",
                        "tag": f"reel_milestone_{reel_id}",
                    })
            except Exception as _e:
                logger.warning(f"reel like push failed: {_e}")
        return {"ok": True, "liked": liked}

    @router.delete("/reels/{reel_id}")
    async def delete_reel(reel_id: str, user: User = Depends(get_current_user)) -> dict:
        doc = await db.reels.find_one({"reel_id": reel_id}, {"_id": 0, "provider_user_id": 1})
        if not doc:
            raise HTTPException(status_code=404, detail="Reel no encontrado.")
        if doc["provider_user_id"] != user.user_id and getattr(user, "role", "") != "admin":
            raise HTTPException(status_code=403, detail="No autorizado.")
        await db.reels.delete_one({"reel_id": reel_id})
        await db.reel_likes.delete_many({"reel_id": reel_id})
        await db.reel_views.delete_many({"reel_id": reel_id})
        return {"deleted": True}

    # ─── Admin moderation (V7 Item 3) ──────────────────────────────
    @router.get("/admin/reels")
    async def admin_list_reels(limit: int = 50, _: User = Depends(get_current_user)) -> list:
        """Section 89 v7 — Lists every reel (including hidden) for the
        admin moderation table. Auth guarded via the `admin` role check
        on the dependency. Returns newest first.
        """
        if getattr(_, "role", "") != "admin":
            raise HTTPException(status_code=403, detail="No autorizado.")
        limit = max(1, min(200, limit))
        return await db.reels.find({}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)

    @router.patch("/admin/reels/{reel_id}/visibility")
    async def admin_toggle_visibility(reel_id: str, _: User = Depends(get_current_user)) -> dict:
        if getattr(_, "role", "") != "admin":
            raise HTTPException(status_code=403, detail="No autorizado.")
        doc = await db.reels.find_one({"reel_id": reel_id}, {"_id": 0, "is_public": 1})
        if not doc:
            raise HTTPException(status_code=404, detail="Reel no encontrado.")
        new_state = not bool(doc.get("is_public", True))
        await db.reels.update_one({"reel_id": reel_id}, {"$set": {"is_public": new_state}})
        return {"ok": True, "is_public": new_state}

    return router


async def ensure_reels_indexes(db) -> None:
    """Best-effort indexes for the reels collections."""
    try:
        await db.reels.create_index("created_at")
        await db.reels.create_index("provider_user_id")
        await db.reel_likes.create_index([("reel_id", 1), ("user_id", 1)], unique=True)
        await db.reel_views.create_index([("reel_id", 1), ("viewer_user_id", 1)], unique=True)
        logger.info("reels indexes ensured")
    except Exception as e:
        logger.warning(f"reels index creation skipped: {e}")
