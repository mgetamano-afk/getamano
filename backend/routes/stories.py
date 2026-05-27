"""
Stories module — Section 60 refactor.

All `/api/stories/*` endpoints extracted from server.py. Provider stories are
24h ephemeral posts (Instagram pattern) with a photo + short caption. Stories
auto-expire via the MongoDB TTL index `stories.expires_at_1` configured at
backend startup.

Endpoints (all `/api/stories/*`):
  POST   /stories                       (auth: provider)
  GET    /stories/active
  GET    /stories/by-provider/{user_id}
  POST   /stories/{story_id}/view       (auth)
  POST   /stories/{story_id}/like       (auth)
  GET    /stories/{story_id}/like-state (auth)
  DELETE /stories/{story_id}            (auth: owner or admin)
"""

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field


class StoryCreateIn(BaseModel):
    image_url: str = Field(..., min_length=4, max_length=600)
    caption: Optional[str] = Field(default=None, max_length=140)


def make_router(*, db, User, get_current_user) -> APIRouter:
    router = APIRouter()

    @router.post("/stories")
    async def create_story(payload: StoryCreateIn, user: User = Depends(get_current_user)):
        """Create a 24h ephemeral story. Providers only."""
        if user.role != "provider":
            raise HTTPException(status_code=403, detail="Solo proveedores pueden crear historias.")
        profile = await db.provider_profiles.find_one(
            {"user_id": user.user_id},
            {"_id": 0, "provider_id": 1, "slug": 1, "business_name": 1, "logo_url": 1,
             "verification_status": 1},
        )
        if not profile:
            raise HTTPException(status_code=404, detail="Sin perfil de proveedor.")

        # Throttle: max 5 active stories per provider at any time
        now = datetime.now(timezone.utc)
        active = await db.stories.count_documents({
            "provider_user_id": user.user_id,
            "expires_at": {"$gt": now},
        })
        if active >= 5:
            raise HTTPException(status_code=429, detail="Límite de 5 historias activas alcanzado.")

        story_id = f"sto_{uuid.uuid4().hex[:12]}"
        doc = {
            "story_id": story_id,
            "provider_user_id": user.user_id,
            "provider_id": profile.get("provider_id"),
            "provider_slug": profile.get("slug"),
            "business_name": profile.get("business_name"),
            "logo_url": profile.get("logo_url"),
            "verified": profile.get("verification_status") == "approved",
            "image_url": payload.image_url,
            "caption": (payload.caption or "").strip() or None,
            "views_count": 0,
            "is_public": True,
            "created_at": now,
            "expires_at": now + timedelta(hours=24),
        }
        await db.stories.insert_one(doc)
        out = {**doc}
        out["created_at"] = out["created_at"].isoformat()
        out["expires_at"] = out["expires_at"].isoformat()
        out.pop("_id", None)
        return out

    @router.get("/stories/active")
    async def list_active_stories(limit: int = 30):
        """Public — return active (non-expired) stories grouped by provider.

        Returns one entry per provider with their LATEST story (Instagram
        pattern: one tile per author, tap to see the rest). Limit caps the
        number of providers, not the number of stories.
        """
        limit = max(1, min(60, limit))
        now = datetime.now(timezone.utc)
        pipeline = [
            {"$match": {"is_public": True, "expires_at": {"$gt": now}}},
            {"$sort": {"created_at": -1}},
            {"$group": {
                "_id": "$provider_user_id",
                "latest": {"$first": "$$ROOT"},
                "count": {"$sum": 1},
            }},
            {"$sort": {"latest.created_at": -1}},
            {"$limit": limit},
            {"$project": {
                "_id": 0,
                "provider_user_id": "$_id",
                "stories_count": "$count",
                "latest_story_id": "$latest.story_id",
                "provider_slug": "$latest.provider_slug",
                "business_name": "$latest.business_name",
                "logo_url": "$latest.logo_url",
                "verified": "$latest.verified",
                "image_url": "$latest.image_url",
                "caption": "$latest.caption",
                "created_at": "$latest.created_at",
            }},
        ]
        rows = await db.stories.aggregate(pipeline).to_list(limit)
        for r in rows:
            if isinstance(r.get("created_at"), datetime):
                r["created_at"] = r["created_at"].isoformat()
        return rows

    @router.get("/stories/by-provider/{provider_user_id}")
    async def stories_by_provider(provider_user_id: str):
        """Return all active stories from one provider, oldest first (carousel playback)."""
        now = datetime.now(timezone.utc)
        rows = await db.stories.find(
            {"provider_user_id": provider_user_id, "is_public": True, "expires_at": {"$gt": now}},
            {"_id": 0},
        ).sort("created_at", 1).to_list(20)
        for r in rows:
            if isinstance(r.get("created_at"), datetime):
                r["created_at"] = r["created_at"].isoformat()
            if isinstance(r.get("expires_at"), datetime):
                r["expires_at"] = r["expires_at"].isoformat()
        return rows

    @router.post("/stories/{story_id}/view")
    async def track_story_view(story_id: str, user: User = Depends(get_current_user)):
        """Count a unique view per (story, viewer). Idempotent via unique index."""
        try:
            await db.story_views.insert_one({
                "story_id": story_id,
                "viewer_user_id": user.user_id,
                "viewed_at": datetime.now(timezone.utc),
            })
            await db.stories.update_one({"story_id": story_id}, {"$inc": {"views_count": 1}})
        except Exception:
            pass  # duplicate view — already counted
        return {"ok": True}

    @router.post("/stories/{story_id}/like")
    async def toggle_story_like(story_id: str, user: User = Depends(get_current_user)):
        """Like/unlike a story. Idempotent per user. Story owner cannot like own."""
        story = await db.stories.find_one(
            {"story_id": story_id},
            {"_id": 0, "provider_user_id": 1, "expires_at": 1},
        )
        if not story:
            raise HTTPException(status_code=404, detail="Historia no encontrada.")
        if story["provider_user_id"] == user.user_id:
            raise HTTPException(status_code=400, detail="No puedes dar like a tu propia historia.")
        if isinstance(story.get("expires_at"), datetime):
            exp = story["expires_at"]
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp < datetime.now(timezone.utc):
                raise HTTPException(status_code=410, detail="La historia expiró.")
        existing = await db.story_likes.find_one(
            {"story_id": story_id, "user_id": user.user_id},
            {"_id": 0},
        )
        if existing:
            await db.story_likes.delete_one({"story_id": story_id, "user_id": user.user_id})
            await db.stories.update_one({"story_id": story_id}, {"$inc": {"likes_count": -1}})
            liked = False
        else:
            await db.story_likes.insert_one({
                "story_id": story_id,
                "user_id": user.user_id,
                "created_at": datetime.now(timezone.utc),
            })
            await db.stories.update_one({"story_id": story_id}, {"$inc": {"likes_count": 1}})
            liked = True
        fresh = await db.stories.find_one({"story_id": story_id}, {"_id": 0, "likes_count": 1})
        return {"liked": liked, "likes_count": (fresh or {}).get("likes_count", 0)}

    @router.get("/stories/{story_id}/like-state")
    async def get_story_like_state(story_id: str, user: User = Depends(get_current_user)):
        existing = await db.story_likes.find_one(
            {"story_id": story_id, "user_id": user.user_id},
            {"_id": 0},
        )
        return {"liked": bool(existing)}

    @router.delete("/stories/{story_id}")
    async def delete_story(story_id: str, user: User = Depends(get_current_user)):
        """Owner or admin deletes a story manually before expiry."""
        s = await db.stories.find_one({"story_id": story_id}, {"_id": 0, "provider_user_id": 1})
        if not s:
            raise HTTPException(status_code=404, detail="Historia no encontrada.")
        if user.role != "admin" and s["provider_user_id"] != user.user_id:
            raise HTTPException(status_code=403, detail="No puedes eliminar esta historia.")
        await db.stories.delete_one({"story_id": story_id})
        await db.story_views.delete_many({"story_id": story_id})
        return {"ok": True}

    return router
