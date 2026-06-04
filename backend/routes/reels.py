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
        """V15 — Returns the provider profile if one exists, OR a synthetic
        user profile so any logged-in user can post a reel (even without
        being a verified provider). The synthetic shape uses the same keys
        the feed already consumes so the frontend doesn't branch."""
        prov = await db.provider_profiles.find_one(
            {"user_id": user_id, "is_active": True},
            {
                "_id": 0, "provider_id": 1, "user_id": 1, "slug": 1,
                "business_name": 1, "logo_url": 1, "city": 1,
                "verification_status": 1, "getamano_code": 1,
            },
        )
        if prov:
            return prov
        # Fallback to user-level identity
        u = await db.users.find_one(
            {"user_id": user_id},
            {"_id": 0, "name": 1, "username": 1, "picture": 1, "city": 1, "preferred_language": 1},
        )
        if not u:
            return None
        return {
            "provider_id": None,
            "user_id": user_id,
            "slug": u.get("username"),
            "business_name": u.get("name") or u.get("username") or "Usuario",
            "logo_url": u.get("picture"),
            "city": u.get("city"),
            "verification_status": "none",
            "getamano_code": None,
        }

    @router.post("/reels")
    async def create_reel(payload: ReelCreateIn, user: User = Depends(get_current_user)) -> dict:
        prof = await _author_profile(user.user_id)
        if not prof:
            raise HTTPException(status_code=403, detail="Tu cuenta aún no está lista para subir reels.")

        # Throttle: max 10 reels per author per 24h to keep the feed quality high.
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
            "provider_id": prof.get("provider_id"),
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
            "plays_count": 0,
            "likes_count": 0,
            "wows_count": 0,
            "saves_count": 0,
            "shares_count": 0,
            "comments_count": 0,
            "reshares_count": 0,
            "milestones": [],
            "is_public": True,
            "created_at": now_iso,
        }
        await db.reels.insert_one(doc)
        doc.pop("_id", None)

        # V15 — Fan-out push notification to (a) followers and (b) users
        # whose interest_category equals the author's primary category.
        # Best-effort: any failure logs + swallows.
        try:
            await _notify_new_reel(db, doc, prof)
        except Exception as e:
            logger.warning(f"reel fanout push failed: {e}")

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

    @router.post("/reels/{reel_id}/play")
    async def track_play(reel_id: str, user: User = Depends(get_current_user)) -> dict:
        """V18.2 — Increment plays_count when the video actually starts
        playing (vs `/view` which counts opening the reel surface).

        Throttled to once per (reel, viewer) per 5 min so we don't
        double-count autoplays / quick scrolls where the user goes back
        to the same reel. The 5-min window is shorter than `/view`'s
        24h because the same person watching the same reel twice in a
        day IS meaningful engagement.
        """
        key = {"reel_id": reel_id, "viewer_user_id": user.user_id}
        existed = await db.reel_plays.find_one(key, {"_id": 0, "played_at": 1})
        now = datetime.now(timezone.utc)
        if existed:
            try:
                last_dt = datetime.fromisoformat(str(existed.get("played_at")).replace("Z", "+00:00"))
                if (now - last_dt).total_seconds() < 5 * 60:
                    return {"ok": True, "counted": False}
            except Exception:
                pass
        await db.reel_plays.update_one(
            key, {"$set": {**key, "played_at": now.isoformat()}}, upsert=True,
        )
        await db.reels.update_one({"reel_id": reel_id}, {"$inc": {"plays_count": 1}})
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
            # V18.1 — fresh-content milestone (5/10/25/50/...) on the
            # reel owner's notifications + push. Idempotent: only fires
            # once per (reel, threshold) and within 24h of creation.
            try:
                fresh = await db.reels.find_one({"reel_id": reel_id}, {"_id": 0, "likes_count": 1, "user_id": 1})
                if fresh:
                    from services.engagement_milestone import maybe_fire_engagement_milestone
                    await maybe_fire_engagement_milestone(
                        db,
                        subject_type="reel",
                        subject_id=reel_id,
                        new_count=fresh.get("likes_count") or 0,
                        metric="like",
                    )
            except Exception as _e:
                logger.warning(f"reel milestone failed: {_e}")
        return {"ok": True, "liked": liked}

    # ─── V15 — Wow / Save / Share toggles + metrics ──────────────────

    @router.post("/reels/{reel_id}/wow")
    async def toggle_wow(reel_id: str, user: User = Depends(get_current_user)) -> dict:
        """Idempotent "Impresionante" reaction (only one per user per reel)."""
        existing = await db.reel_wows.find_one(
            {"reel_id": reel_id, "user_id": user.user_id}, {"_id": 1}
        )
        if existing:
            await db.reel_wows.delete_one({"_id": existing["_id"]})
            await db.reels.update_one({"reel_id": reel_id}, {"$inc": {"wows_count": -1}})
            return {"ok": True, "wowed": False}
        await db.reel_wows.insert_one({
            "reel_id": reel_id,
            "user_id": user.user_id,
            "wowed_at": datetime.now(timezone.utc).isoformat(),
        })
        await db.reels.update_one({"reel_id": reel_id}, {"$inc": {"wows_count": 1}})
        # V18.1 — fresh-content milestone celebration (wows count).
        try:
            fresh = await db.reels.find_one({"reel_id": reel_id}, {"_id": 0, "wows_count": 1})
            if fresh:
                from services.engagement_milestone import maybe_fire_engagement_milestone
                await maybe_fire_engagement_milestone(
                    db,
                    subject_type="reel",
                    subject_id=reel_id,
                    new_count=fresh.get("wows_count") or 0,
                    metric="wow",
                )
        except Exception as _e:
            logger.warning(f"reel wow milestone failed: {_e}")
        return {"ok": True, "wowed": True}

    @router.post("/reels/{reel_id}/save")
    async def toggle_save(reel_id: str, user: User = Depends(get_current_user)) -> dict:
        """Save / unsave a reel to the user's personal collection."""
        existing = await db.reel_saves.find_one(
            {"reel_id": reel_id, "user_id": user.user_id}, {"_id": 1}
        )
        if existing:
            await db.reel_saves.delete_one({"_id": existing["_id"]})
            await db.reels.update_one({"reel_id": reel_id}, {"$inc": {"saves_count": -1}})
            return {"ok": True, "saved": False}
        await db.reel_saves.insert_one({
            "reel_id": reel_id,
            "user_id": user.user_id,
            "saved_at": datetime.now(timezone.utc).isoformat(),
        })
        await db.reels.update_one({"reel_id": reel_id}, {"$inc": {"saves_count": 1}})
        return {"ok": True, "saved": True}

    @router.post("/reels/{reel_id}/share")
    async def track_share(reel_id: str, user: User = Depends(get_current_user)) -> dict:
        """Non-idempotent — every share is counted (no dedupe). Includes
        the share channel (web/wa/copy) for analytics later."""
        await db.reel_shares.insert_one({
            "reel_id": reel_id,
            "user_id": user.user_id,
            "shared_at": datetime.now(timezone.utc).isoformat(),
        })
        await db.reels.update_one({"reel_id": reel_id}, {"$inc": {"shares_count": 1}})
        return {"ok": True}

    @router.get("/reels/{reel_id}/reactions/me")
    async def my_reactions(reel_id: str, user: User = Depends(get_current_user)) -> dict:
        """Tells the frontend whether the current viewer already
        liked / wowed / saved this reel so toggles render in the correct
        state immediately."""
        liked = await db.reel_likes.find_one({"reel_id": reel_id, "user_id": user.user_id}, {"_id": 1}) is not None
        wowed = await db.reel_wows.find_one({"reel_id": reel_id, "user_id": user.user_id}, {"_id": 1}) is not None
        saved = await db.reel_saves.find_one({"reel_id": reel_id, "user_id": user.user_id}, {"_id": 1}) is not None
        return {"liked": liked, "wowed": wowed, "saved": saved}

    @router.get("/reels/me/saved")
    async def list_my_saved(user: User = Depends(get_current_user)) -> list:
        """Section 'Guardados' for the user dashboard."""
        cursor = db.reel_saves.find({"user_id": user.user_id}, {"_id": 0}).sort("saved_at", -1).limit(60)
        rows = await cursor.to_list(60)
        ids = [r["reel_id"] for r in rows]
        if not ids:
            return []
        reels = await db.reels.find({"reel_id": {"$in": ids}}, {"_id": 0}).to_list(60)
        order = {rid: i for i, rid in enumerate(ids)}
        return sorted(reels, key=lambda r: order.get(r["reel_id"], 999))

    @router.get("/reels/me/metrics")
    async def my_reel_metrics(user: User = Depends(get_current_user)) -> dict:
        """Aggregate metrics across every reel the caller owns:
        views, likes, wows, saves, shares. Used by the provider dashboard."""
        cursor = db.reels.find(
            {"provider_user_id": user.user_id},
            {"_id": 0, "reel_id": 1, "caption": 1, "views_count": 1,
             "likes_count": 1, "wows_count": 1, "saves_count": 1,
             "shares_count": 1, "created_at": 1, "thumbnail_url": 1},
        ).sort("created_at", -1)
        items = await cursor.to_list(50)
        totals = {
            "reels": len(items),
            "views": sum(int(r.get("views_count") or 0) for r in items),
            "likes": sum(int(r.get("likes_count") or 0) for r in items),
            "wows": sum(int(r.get("wows_count") or 0) for r in items),
            "saves": sum(int(r.get("saves_count") or 0) for r in items),
            "shares": sum(int(r.get("shares_count") or 0) for r in items),
        }
        return {"totals": totals, "items": items}

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


# ─── V15: Fan-out push notification helper ──────────────────────────

async def _notify_new_reel(db, reel: dict, prof: dict) -> None:
    """Pushes "X publicó un reel" to:
      (a) every user who follows the author (collection: `user_follows`,
          docs `{follower_user_id, followed_user_id}`).
      (b) every user whose `interest_categories` (array of category_ids)
          contains the author's primary category — this is the
          "ecosistema de interés" the founder asked for.
    Self is excluded. Each recipient gets at most one push per reel
    thanks to deduplication on `user_id`.
    """
    from routes.push import send_push_to_user
    recipients: set[str] = set()

    # (a) followers
    async for f in db.user_follows.find(
        {"followed_user_id": reel["provider_user_id"]},
        {"_id": 0, "follower_user_id": 1},
    ):
        uid = f.get("follower_user_id")
        if uid and uid != reel["provider_user_id"]:
            recipients.add(uid)

    # (b) same-category interest cohort. We only know the category if
    # the author has a provider_id (real eCard); user-only authors don't
    # currently carry a category.
    if reel.get("provider_id"):
        full_prof = await db.provider_profiles.find_one(
            {"provider_id": reel["provider_id"]},
            {"_id": 0, "category_id": 1},
        )
        cat_id = (full_prof or {}).get("category_id")
        if cat_id:
            async for u in db.users.find(
                {"interest_categories": cat_id, "user_id": {"$ne": reel["provider_user_id"]}},
                {"_id": 0, "user_id": 1},
            ):
                uid = u.get("user_id")
                if uid:
                    recipients.add(uid)

    if not recipients:
        return

    business_name = prof.get("business_name") or "Alguien"
    title = "🎬 Nuevo reel"
    body = f"{business_name} acaba de publicar un reel"
    deep_url = f"/reels?r={reel['reel_id']}"
    for uid in recipients:
        try:
            await send_push_to_user(db, uid, {
                "title": title,
                "body": body,
                "icon": prof.get("logo_url") or "/icon-192x192.png",
                "url": deep_url,
                "tag": f"new_reel_{reel['reel_id']}",
            })
        except Exception:
            # don't let one failed recipient stop the rest
            pass


async def ensure_reels_indexes(db) -> None:
    """Best-effort indexes for the reels collections."""
    try:
        await db.reels.create_index("created_at")
        await db.reels.create_index("provider_user_id")
        await db.reel_likes.create_index([("reel_id", 1), ("user_id", 1)], unique=True)
        await db.reel_views.create_index([("reel_id", 1), ("viewer_user_id", 1)], unique=True)
        # V15 — new reaction collections
        await db.reel_wows.create_index([("reel_id", 1), ("user_id", 1)], unique=True)
        await db.reel_saves.create_index([("reel_id", 1), ("user_id", 1)], unique=True)
        await db.reel_shares.create_index([("reel_id", 1), ("shared_at", -1)])
        await db.user_follows.create_index([("follower_user_id", 1), ("followed_user_id", 1)], unique=True)
        await db.user_follows.create_index("followed_user_id")
        await db.users.create_index("interest_categories")
        logger.info("reels indexes ensured")
    except Exception as e:
        logger.warning(f"reels index creation skipped: {e}")
