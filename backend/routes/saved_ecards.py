"""
Saved eCards module — Section 63 backend refactor.

Holds every `/api/saved-ecards/*` endpoint extracted from server.py:
  - PUT    /saved-ecards
  - DELETE /saved-ecards/{provider_id}
  - PUT    /saved-ecards/{provider_id}/note
  - GET    /saved-ecards/me/state/{provider_id}
  - GET    /saved-ecards/me

`make_router(...)` wires the shared dependencies (db, User model, get_current_user)
into a SimpleNamespace-free closure pattern matching the existing routes/auth.py
convention. Business logic stays in module-level handlers so it can be tested.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field


SaveType = Literal["bookmark", "like", "both"]


class SaveECardIn(BaseModel):
    provider_id: str
    save_type: SaveType = "bookmark"
    personal_note: Optional[str] = Field(default=None, max_length=500)


class SaveECardNoteIn(BaseModel):
    personal_note: Optional[str] = Field(default=None, max_length=500)


def make_router(*, db, User, get_current_user) -> APIRouter:
    """Build & return the saved-ecards APIRouter wired to shared deps."""
    router = APIRouter()

    async def _recompute_provider_save_counts(provider_id: str) -> None:
        likes = await db.saved_ecards.count_documents({
            "provider_id": provider_id,
            "save_type": {"$in": ["like", "both"]},
        })
        bookmarks = await db.saved_ecards.count_documents({
            "provider_id": provider_id,
            "save_type": {"$in": ["bookmark", "both"]},
        })
        await db.provider_profiles.update_one(
            {"provider_id": provider_id},
            {"$set": {"like_count": likes, "bookmark_count": bookmarks}},
        )

    @router.put("/saved-ecards")
    async def upsert_saved_ecard(payload: SaveECardIn, user: User = Depends(get_current_user)):
        """Create/update a saved-eCard entry. Self-save forbidden for providers."""
        own = await db.provider_profiles.find_one(
            {"user_id": user.user_id, "provider_id": payload.provider_id},
            {"_id": 0, "provider_id": 1},
        )
        if own:
            raise HTTPException(status_code=400, detail="No puedes guardar tu propia eCard.")

        target = await db.provider_profiles.find_one(
            {"provider_id": payload.provider_id},
            {"_id": 0, "provider_id": 1, "verification_status": 1},
        )
        if not target:
            raise HTTPException(status_code=404, detail="Proveedor no encontrado.")

        now_iso = datetime.now(timezone.utc).isoformat()
        note = (payload.personal_note or "").strip() or None

        await db.saved_ecards.update_one(
            {"user_id": user.user_id, "provider_id": payload.provider_id},
            {
                "$set": {
                    "user_id": user.user_id,
                    "provider_id": payload.provider_id,
                    "save_type": payload.save_type,
                    "personal_note": note,
                    "personal_note_updated_at": now_iso if note else None,
                    "last_updated_at": now_iso,
                },
                "$setOnInsert": {
                    "save_id": f"sav_{uuid.uuid4().hex[:12]}",
                    "saved_at": now_iso,
                },
            },
            upsert=True,
        )
        await _recompute_provider_save_counts(payload.provider_id)
        saved = await db.saved_ecards.find_one(
            {"user_id": user.user_id, "provider_id": payload.provider_id},
            {"_id": 0},
        )
        return saved or {"ok": True}

    @router.delete("/saved-ecards/{provider_id}")
    async def delete_saved_ecard(provider_id: str, user: User = Depends(get_current_user)):
        """Fully remove the saved-eCard entry (both bookmark + like)."""
        res = await db.saved_ecards.delete_one({"user_id": user.user_id, "provider_id": provider_id})
        if res.deleted_count:
            await _recompute_provider_save_counts(provider_id)
        return {"ok": True, "removed": res.deleted_count}

    @router.put("/saved-ecards/{provider_id}/note")
    async def update_saved_ecard_note(provider_id: str, payload: SaveECardNoteIn,
                                       user: User = Depends(get_current_user)):
        """Update only the personal note on an existing saved-eCard entry."""
        existing = await db.saved_ecards.find_one(
            {"user_id": user.user_id, "provider_id": provider_id},
            {"_id": 0},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="No tienes esta eCard guardada.")
        note = (payload.personal_note or "").strip() or None
        await db.saved_ecards.update_one(
            {"user_id": user.user_id, "provider_id": provider_id},
            {"$set": {
                "personal_note": note,
                "personal_note_updated_at": datetime.now(timezone.utc).isoformat() if note else None,
            }},
        )
        return {"ok": True, "personal_note": note}

    @router.get("/saved-ecards/me/state/{provider_id}")
    async def get_saved_state(provider_id: str, user: User = Depends(get_current_user)):
        """Return the current user's save state for a specific provider."""
        s = await db.saved_ecards.find_one(
            {"user_id": user.user_id, "provider_id": provider_id},
            {"_id": 0},
        )
        return s or {"save_type": None, "personal_note": None}

    @router.get("/saved-ecards/me")
    async def list_my_saved_ecards(filter: Optional[Literal["all", "bookmark", "like"]] = "all",
                                    user: User = Depends(get_current_user)):
        """List all eCards the user has bookmarked/liked, with provider data joined."""
        query: dict = {"user_id": user.user_id}
        if filter == "bookmark":
            query["save_type"] = {"$in": ["bookmark", "both"]}
        elif filter == "like":
            query["save_type"] = {"$in": ["like", "both"]}
        rows = await db.saved_ecards.find(query, {"_id": 0}).sort("saved_at", -1).to_list(300)
        provider_ids = [r["provider_id"] for r in rows]
        profiles = await db.provider_profiles.find(
            {"provider_id": {"$in": provider_ids}},
            {"_id": 0, "user_id": 0},
        ).to_list(len(provider_ids) or 1)
        by_pid = {p["provider_id"]: p for p in profiles}
        result = []
        for r in rows:
            prof = by_pid.get(r["provider_id"])
            if not prof:
                continue
            result.append({
                **r,
                "provider": {
                    "provider_id": prof.get("provider_id"),
                    "slug": prof.get("slug"),
                    "business_name": prof.get("business_name"),
                    "logo_url": prof.get("logo_url"),
                    "category_id": prof.get("category_id"),
                    "city": prof.get("city"),
                    "state": prof.get("state"),
                    "rating_avg": prof.get("rating_avg", 0),
                    "rating_count": prof.get("rating_count", 0),
                    "verification_status": prof.get("verification_status"),
                    "phone": prof.get("phone"),
                },
            })
        return result

    return router
