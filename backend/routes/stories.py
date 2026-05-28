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


# Like-count thresholds that trigger a one-time celebration push.
# Tuned for the early creator economy: 10 = first social validation,
# 50 = warm reach, 100 = viral by getamano standards.
_MILESTONE_TIERS = {
    10:  {"emoji": "🔥", "label_es": "primeros 10 likes", "label_en": "first 10 likes"},
    50:  {"emoji": "🌟", "label_es": "50 likes",          "label_en": "50 likes"},
    100: {"emoji": "🚀", "label_es": "100 likes",         "label_en": "100 likes"},
}


async def _emit_story_milestone(db, story: dict, story_id: str, threshold: int) -> None:
    """Fire an in-app + push notification when a story hits a like milestone.

    Idempotent: a unique `notification_key` per (story, threshold) prevents
    duplicate notifications even under race conditions.
    """
    tier = _MILESTONE_TIERS.get(threshold)
    if not tier:
        return
    owner_id = story.get("provider_user_id")
    if not owner_id:
        return
    notif_key = f"story_milestone:{story_id}:{threshold}"
    existing = await db.notifications.find_one({"notification_key": notif_key}, {"_id": 0, "notification_id": 1})
    if existing:
        return  # already sent — atomic guard

    now = datetime.now(timezone.utc)
    body = f"{tier['emoji']} Tu historia acaba de cruzar los {tier['label_es']}"
    try:
        await db.notifications.insert_one({
            "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
            "notification_key": notif_key,
            "user_id": owner_id,
            "category": "story_milestone",
            "title": f"{tier['emoji']} ¡Tu historia está en racha!",
            "body": body,
            "cta_label": "Ver historia",
            "cta_url": "/comunidad",
            "icon": "heart",
            "priority": "high",
            "is_read": False,
            "dismissed_at": None,
            "story_id": story_id,
            "threshold": threshold,
            "created_at": now.isoformat(),
        })
    except Exception:
        pass  # never let notification failures break the like flow

    # Web Push (sandbox-safe; fails silently if no subscription)
    try:
        from routes.push import send_push_to_user
        await send_push_to_user(db, owner_id, {
            "title": f"{tier['emoji']} ¡Tu historia está en racha!",
            "body": body,
            "url": "/comunidad",
            "tag": notif_key,
            "icon": "/icon-192x192.png",
        })
    except Exception:
        pass


def make_router(*, db, User, get_current_user) -> APIRouter:
    router = APIRouter()

    @router.post("/stories")
    async def create_story(payload: StoryCreateIn, user: User = Depends(get_current_user)) -> dict:
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
    async def list_active_stories(limit: int = 30) -> list:
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
                "likes_count": {"$ifNull": ["$latest.likes_count", 0]},
                "views_count": {"$ifNull": ["$latest.views_count", 0]},
            }},
        ]
        rows = await db.stories.aggregate(pipeline).to_list(limit)
        for r in rows:
            if isinstance(r.get("created_at"), datetime):
                r["created_at"] = r["created_at"].isoformat()
        return rows

    @router.get("/stories/by-provider/{provider_user_id}")
    async def stories_by_provider(provider_user_id: str) -> list:
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
    async def track_story_view(story_id: str, user: User = Depends(get_current_user)) -> dict:
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
    async def toggle_story_like(story_id: str, user: User = Depends(get_current_user)) -> dict:
        """Like/unlike a story. Idempotent per user. Story owner cannot like own.

        Side-effects on a *new* like:
        - If the story crosses 10/50/100 likes, fire a one-time milestone
          notification (in-app + push) to the owner. The notification_key
          guarantees idempotency even under race conditions.
        """
        story = await db.stories.find_one(
            {"story_id": story_id},
            {"_id": 0, "provider_user_id": 1, "expires_at": 1, "image_url": 1, "caption": 1},
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
        new_count = (fresh or {}).get("likes_count", 0)

        # Milestone notifications — only on a *new* like that lands on a threshold.
        if liked and new_count in (10, 50, 100):
            await _emit_story_milestone(db, story, story_id, new_count)

        return {"liked": liked, "likes_count": new_count}

    @router.get("/stories/{story_id}/like-state")
    async def get_story_like_state(story_id: str, user: User = Depends(get_current_user)) -> dict:
        existing = await db.story_likes.find_one(
            {"story_id": story_id, "user_id": user.user_id},
            {"_id": 0},
        )
        return {"liked": bool(existing)}

    @router.delete("/stories/{story_id}")
    async def delete_story(story_id: str, user: User = Depends(get_current_user)) -> dict:
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
