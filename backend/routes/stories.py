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
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator


# ─── Section 78 — Interactive story stickers ─────────────────────────
# Stickers are positioned overlays that providers add to their stories
# to turn passive content into a CTA: tap-to-call, tap-for-promo, etc.
# All stickers share x/y (0-100 percentage of canvas), a type, and a
# small payload validated below.
StickerType = Literal["phone", "promo", "tip"]


class StickerIn(BaseModel):
    """One sticker overlaid on a story. Coords are 0-100 percent of
    the image canvas so they render identically across viewport sizes."""
    id: Optional[str] = None
    type: StickerType
    x: float = Field(..., ge=0, le=100)
    y: float = Field(..., ge=0, le=100)
    text: Optional[str] = Field(default=None, max_length=40)
    phone: Optional[str] = Field(default=None, max_length=24)

    @field_validator("phone")
    @classmethod
    def _digits_only(cls, v):
        if v is None:
            return v
        # Strip everything except digits + leading "+"
        cleaned = "".join(c for c in v if c.isdigit() or c == "+")
        if len(cleaned) < 7:
            raise ValueError("phone too short")
        return cleaned


class StoryCreateIn(BaseModel):
    # V15.4 — Stories ahora aceptan video además de imagen. Al menos
    # uno de los dos campos debe estar presente.
    image_url: Optional[str] = Field(default=None, max_length=600)
    video_url: Optional[str] = Field(default=None, max_length=600)
    thumbnail_url: Optional[str] = Field(default=None, max_length=600)
    duration_s: Optional[float] = Field(default=None, ge=0, le=15.5)
    caption: Optional[str] = Field(default=None, max_length=140)
    stickers: Optional[List[StickerIn]] = Field(default=None, max_length=3)
    # Section 89 v4 — clients can post testimonial stories that tag a
    # provider. When set, the story is OWNED by the author but features
    # the tagged provider's snapshot for the "Ver perfil →" CTA.
    tagged_provider_id: Optional[str] = Field(default=None, max_length=64)

    @field_validator("image_url", "video_url")
    @classmethod
    def _strip_empty(cls, v):
        if v is None:
            return v
        v = v.strip()
        return v if len(v) >= 4 else None


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
        """Create a 24h ephemeral story.

        Section 89 v4 — Stories are now open to *any* logged-in user
        when they tag a provider (client testimonial). Providers can
        still post their own stories without a tag.
        """
        profile = await db.provider_profiles.find_one(
            {"user_id": user.user_id, "is_active": True},
            {"_id": 0, "provider_id": 1, "slug": 1, "business_name": 1, "logo_url": 1,
             "verification_status": 1, "user_id": 1},
        )
        is_author_provider = profile is not None
        if not is_author_provider and not payload.tagged_provider_id:
            raise HTTPException(
                status_code=403,
                detail="Etiqueta a un proveedor para publicar tu historia.",
            )

        # Resolve tagged provider snapshot (if any)
        tagged = None
        if payload.tagged_provider_id:
            tagged = await db.provider_profiles.find_one(
                {"provider_id": payload.tagged_provider_id, "is_active": True},
                {"_id": 0, "provider_id": 1, "user_id": 1, "slug": 1,
                 "business_name": 1, "logo_url": 1, "verification_status": 1,
                 "getamano_code": 1},
            )
            if not tagged:
                raise HTTPException(status_code=404, detail="Proveedor etiquetado no encontrado.")

        # Throttle: max 5 active stories per author at any time
        now = datetime.now(timezone.utc)
        active = await db.stories.count_documents({
            "provider_user_id": user.user_id,
            "expires_at": {"$gt": now},
        })
        if active >= 5:
            raise HTTPException(status_code=429, detail="Límite de 5 historias activas alcanzado.")

        story_id = f"sto_{uuid.uuid4().hex[:12]}"
        # Section 78 — Normalize stickers: ensure each has a stable id
        # and that phone stickers actually carry a phone, promo/tip carry text.
        stickers_out = []
        for s in (payload.stickers or []):
            if s.type == "phone" and not s.phone:
                raise HTTPException(status_code=422, detail="Sticker 'phone' requiere número.")
            if s.type in ("promo", "tip") and not (s.text or "").strip():
                raise HTTPException(status_code=422, detail=f"Sticker '{s.type}' requiere texto.")
            stickers_out.append({
                "id": s.id or f"sti_{uuid.uuid4().hex[:8]}",
                "type": s.type,
                "x": round(float(s.x), 2),
                "y": round(float(s.y), 2),
                "text": (s.text or "").strip() or None,
                "phone": s.phone,
            })

        doc = {
            "story_id": story_id,
            # Author identity (kept on `provider_user_id` for legacy
            # aggregation compat — every existing query groups stories
            # by provider_user_id and that's still correct: it's the
            # author either way).
            "provider_user_id": user.user_id,
            "provider_id": (profile or {}).get("provider_id"),
            "provider_slug": (profile or {}).get("slug"),
            "business_name": (profile or {}).get("business_name") or user.name,
            "logo_url": (profile or {}).get("logo_url"),
            "verified": (profile or {}).get("verification_status") == "approved",
            "is_provider_author": is_author_provider,
            "image_url": payload.image_url,
            "caption": (payload.caption or "").strip() or None,
            "stickers": stickers_out,
            "views_count": 0,
            "is_public": True,
            "created_at": now,
            "expires_at": now + timedelta(hours=24),
        }
        # Section 89 v4 — Tagged provider snapshot (testimonial mode)
        if tagged:
            doc["tagged_provider_id"] = tagged["provider_id"]
            doc["tagged_provider_user_id"] = tagged["user_id"]
            doc["tagged_provider_slug"] = tagged.get("slug")
            doc["tagged_business_name"] = tagged.get("business_name")
            doc["tagged_logo_url"] = tagged.get("logo_url")
            doc["tagged_verified"] = tagged.get("verification_status") == "approved"
            doc["tagged_getamano_code"] = tagged.get("getamano_code")

        await db.stories.insert_one(doc)

        # Push to the tagged provider (fire-and-forget)
        if tagged and tagged["user_id"] != user.user_id:
            try:
                from routes.push import send_push_to_user
                await send_push_to_user(db, tagged["user_id"], {
                    "title": f"{user.name} compartió una historia sobre tu trabajo",
                    "body": (payload.caption or "")[:140] or "Toca para ver el testimonio.",
                    "icon": (profile or {}).get("logo_url") or "/icon-192x192.png",
                    "url": "/comunidad",
                    "tag": f"story_tag_{story_id}",
                })
            except Exception:
                pass

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
                # Section 89 v4 — testimonial tagged provider
                "is_provider_author": {"$ifNull": ["$latest.is_provider_author", True]},
                "tagged_provider_id": {"$ifNull": ["$latest.tagged_provider_id", None]},
                "tagged_provider_slug": {"$ifNull": ["$latest.tagged_provider_slug", None]},
                "tagged_business_name": {"$ifNull": ["$latest.tagged_business_name", None]},
                "tagged_logo_url": {"$ifNull": ["$latest.tagged_logo_url", None]},
                "tagged_verified": {"$ifNull": ["$latest.tagged_verified", False]},
                "tagged_getamano_code": {"$ifNull": ["$latest.tagged_getamano_code", None]},
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
