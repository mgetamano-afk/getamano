"""
Follows / "Red de Aliados" module — Section 65.

Lightweight directed-graph store: a user (provider OR client) can follow
another USER's profile. Both directions are tracked so we can:
  · Show follower / following counts on the eCard
  · List my followers and the people I follow
  · Drive a feed of "people you follow just posted X"
  · Power the "Mi Red" view in provider dashboards

Data model:
  follows = { follow_id, follower_user_id, followed_user_id, created_at }
  Unique index on (follower_user_id, followed_user_id).

Endpoints (all `/api/follows/*`):
  POST   /follows/{user_id}         — follow a user (idempotent)
  DELETE /follows/{user_id}         — unfollow
  GET    /follows/{user_id}/state   — am I following them + counts
  GET    /follows/me/following      — list users I follow
  GET    /follows/me/followers      — list users who follow me
  GET    /follows/{user_id}/stats   — public { followers, following }
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException


def make_router(*, db, User, get_current_user, get_optional_user=None) -> APIRouter:
    router = APIRouter()

    async def _ensure_indexes():
        try:
            await db.follows.create_index(
                [("follower_user_id", 1), ("followed_user_id", 1)],
                unique=True,
                name="follows_pair_unique",
            )
            await db.follows.create_index("followed_user_id")
            await db.follows.create_index("follower_user_id")
        except Exception:
            pass

    # Best-effort index creation on startup
    import asyncio
    try:
        asyncio.get_event_loop().create_task(_ensure_indexes())
    except Exception:
        pass

    async def _enrich_user(uid: str) -> dict:
        """Return a compact display object for a user_id."""
        u = await db.users.find_one(
            {"user_id": uid},
            {"_id": 0, "user_id": 1, "name": 1, "email": 1, "role": 1, "avatar_url": 1},
        ) or {}
        prof = None
        if u.get("role") == "provider":
            prof = await db.provider_profiles.find_one(
                {"user_id": uid},
                {"_id": 0, "provider_id": 1, "business_name": 1, "slug": 1,
                 "logo_url": 1, "city": 1, "state": 1, "category_id": 1,
                 "rating_avg": 1, "rating_count": 1, "verification_status": 1},
            )
        return {
            "user_id": uid,
            "name": (u.get("name") or u.get("email", "").split("@")[0] or "").strip(),
            "role": u.get("role", "client"),
            "avatar_url": u.get("avatar_url"),
            "provider": prof,
        }

    @router.post("/follows/{user_id}")
    async def follow_user(user_id: str, me: User = Depends(get_current_user)):
        if user_id == me.user_id:
            raise HTTPException(status_code=400, detail="No puedes seguirte a ti mismo.")
        target = await db.users.find_one({"user_id": user_id}, {"_id": 0, "user_id": 1})
        if not target:
            raise HTTPException(status_code=404, detail="Usuario no encontrado.")
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.follows.update_one(
            {"follower_user_id": me.user_id, "followed_user_id": user_id},
            {
                "$set": {"updated_at": now_iso},
                "$setOnInsert": {
                    "follow_id": f"flw_{uuid.uuid4().hex[:12]}",
                    "follower_user_id": me.user_id,
                    "followed_user_id": user_id,
                    "created_at": now_iso,
                },
            },
            upsert=True,
        )
        followers = await db.follows.count_documents({"followed_user_id": user_id})
        following = await db.follows.count_documents({"follower_user_id": me.user_id})
        return {"following": True, "followers_count": followers, "following_count": following}

    @router.delete("/follows/{user_id}")
    async def unfollow_user(user_id: str, me: User = Depends(get_current_user)):
        res = await db.follows.delete_one({
            "follower_user_id": me.user_id,
            "followed_user_id": user_id,
        })
        followers = await db.follows.count_documents({"followed_user_id": user_id})
        return {"following": False, "removed": res.deleted_count, "followers_count": followers}

    @router.get("/follows/{user_id}/state")
    async def follow_state(user_id: str, me: User = Depends(get_current_user)):
        rec = await db.follows.find_one(
            {"follower_user_id": me.user_id, "followed_user_id": user_id},
            {"_id": 0, "follow_id": 1, "created_at": 1},
        )
        followers = await db.follows.count_documents({"followed_user_id": user_id})
        return {
            "following": bool(rec),
            "since": rec.get("created_at") if rec else None,
            "followers_count": followers,
        }

    @router.get("/follows/{user_id}/stats")
    async def follow_stats(user_id: str):
        """Public counts — no auth needed (used on eCards)."""
        followers = await db.follows.count_documents({"followed_user_id": user_id})
        following = await db.follows.count_documents({"follower_user_id": user_id})
        return {"followers": followers, "following": following}

    @router.get("/follows/me/following")
    async def list_my_following(limit: int = 100, me: User = Depends(get_current_user)):
        rows = await db.follows.find(
            {"follower_user_id": me.user_id},
            {"_id": 0, "followed_user_id": 1, "created_at": 1},
        ).sort("created_at", -1).to_list(min(limit, 500))
        users = []
        for r in rows:
            u = await _enrich_user(r["followed_user_id"])
            u["since"] = r.get("created_at")
            users.append(u)
        return users

    @router.get("/follows/me/followers")
    async def list_my_followers(limit: int = 100, me: User = Depends(get_current_user)):
        rows = await db.follows.find(
            {"followed_user_id": me.user_id},
            {"_id": 0, "follower_user_id": 1, "created_at": 1},
        ).sort("created_at", -1).to_list(min(limit, 500))
        users = []
        for r in rows:
            u = await _enrich_user(r["follower_user_id"])
            u["since"] = r.get("created_at")
            users.append(u)
        return users

    @router.get("/follows/me/network")
    async def my_network(me: User = Depends(get_current_user)):
        """Compact stats: my following + followers + suggested verified
        providers in the same category (network expansion).
        """
        following_count = await db.follows.count_documents({"follower_user_id": me.user_id})
        followers_count = await db.follows.count_documents({"followed_user_id": me.user_id})
        # Suggestion engine — simple: same category, approved, not me, not already-followed.
        already = await db.follows.find(
            {"follower_user_id": me.user_id},
            {"_id": 0, "followed_user_id": 1},
        ).to_list(1000)
        already_ids = {r["followed_user_id"] for r in already}
        already_ids.add(me.user_id)

        my_profile = await db.provider_profiles.find_one(
            {"user_id": me.user_id},
            {"_id": 0, "category_id": 1, "state": 1},
        ) or {}
        suggestions = []
        if my_profile.get("category_id"):
            cursor = db.provider_profiles.find(
                {
                    "category_id": my_profile["category_id"],
                    "verification_status": "approved",
                    "user_id": {"$nin": list(already_ids)},
                },
                {"_id": 0, "user_id": 1, "business_name": 1, "slug": 1,
                 "logo_url": 1, "city": 1, "state": 1, "rating_avg": 1, "rating_count": 1},
            ).sort("rating_avg", -1).limit(8)
            async for p in cursor:
                suggestions.append({
                    "user_id": p["user_id"],
                    "name": p.get("business_name", ""),
                    "role": "provider",
                    "provider": p,
                })
        return {
            "followers_count": followers_count,
            "following_count": following_count,
            "suggestions": suggestions,
        }

    return router
