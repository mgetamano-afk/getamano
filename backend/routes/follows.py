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

from fastapi import APIRouter, Depends, HTTPException


def make_router(*, db, User, get_current_user, get_optional_user=None) -> APIRouter:
    router = APIRouter()

    async def _ensure_indexes() -> None:
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
        target = await db.users.find_one({"user_id": user_id}, {"_id": 0, "user_id": 1, "name": 1})
        if not target:
            raise HTTPException(status_code=404, detail="Usuario no encontrado.")
        now_iso = datetime.now(timezone.utc).isoformat()
        upsert_res = await db.follows.update_one(
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
        # Section 67 — Emit a notification to the followed user (only on
        # first follow, never on idempotent re-follow).
        if upsert_res.upserted_id is not None:
            follower_name = (getattr(me, "name", "") or "Alguien").strip().split()[0] or "Alguien"
            title = f"{follower_name} te empezó a seguir"
            body = "Tienes un nuevo seguidor en tu red. ¡Devuélvele el follow!"
            cta_url = "/dashboard/provider"
            try:
                await db.notifications.insert_one({
                    "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
                    "notification_key": f"follow:{me.user_id}->{user_id}",
                    "user_id": user_id,
                    "category": "follow",
                    "title": title,
                    "body": body,
                    "cta_label": "Ver perfil",
                    "cta_url": cta_url,
                    "icon": "UserPlus",
                    "priority": "medium",
                    "is_read": False,
                    "dismissed_at": None,
                    "created_at": now_iso,
                    "meta": {"follower_user_id": me.user_id},
                })
            except Exception:
                pass  # never fail the follow if notification write fails
            # Best-effort Web Push — Section 68.
            try:
                from routes.push import send_push_to_user
                await send_push_to_user(db, user_id, {
                    "title": title,
                    "body": body,
                    "url": cta_url,
                    "tag": "follow",
                    "icon": "/icon-192x192.png",
                })
            except Exception:
                pass
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

    @router.get("/follows/me/feed")
    async def my_feed(limit: int = 30, me: User = Depends(get_current_user)):
        """Personalized feed: recent events from the users I follow.

        Aggregates from multiple sources:
          · stories created by followed providers (last 7 days)
          · banner_shares published by followed providers
          · community_posts authored by followed users
          · saved_ecards/reviews from followed providers — surface activity
        Sorted by created_at desc. Empty if I follow nobody yet.
        """
        following_rows = await db.follows.find(
            {"follower_user_id": me.user_id},
            {"_id": 0, "followed_user_id": 1},
        ).to_list(1000)
        followed_ids = [r["followed_user_id"] for r in following_rows]
        if not followed_ids:
            return []

        # Resolve provider_ids for followed providers
        provs = await db.provider_profiles.find(
            {"user_id": {"$in": followed_ids}},
            {"_id": 0, "user_id": 1, "provider_id": 1, "business_name": 1, "slug": 1, "logo_url": 1},
        ).to_list(len(followed_ids))
        by_uid = {p["user_id"]: p for p in provs}
        provider_ids = [p["provider_id"] for p in provs]

        events = []

        # Community posts from followed users
        try:
            posts = await db.community_posts.find(
                {"user_id": {"$in": followed_ids}, "is_hidden": {"$ne": True}},
                {"_id": 0},
            ).sort("created_at", -1).limit(limit).to_list(limit)
            for p in posts:
                author = by_uid.get(p.get("user_id")) or {}
                events.append({
                    "kind": "post",
                    "id": p.get("post_id"),
                    "created_at": p.get("created_at"),
                    "actor_name": author.get("business_name") or p.get("author_name") or "Alguien",
                    "actor_avatar": author.get("logo_url") or p.get("author_avatar"),
                    "actor_slug": author.get("slug"),
                    "summary_es": "publicó en la comunidad",
                    "summary_en": "posted in community",
                    "body_excerpt": (p.get("body") or "")[:140],
                    "media": (p.get("media") or [None])[0] if isinstance(p.get("media"), list) else None,
                    "url": f"/comunidad?post={p.get('post_id')}",
                })
        except Exception:
            pass

        # Stories from followed providers (active or recent)
        if provider_ids:
            try:
                stories = await db.stories.find(
                    {"provider_id": {"$in": provider_ids}},
                    {"_id": 0},
                ).sort("created_at", -1).limit(20).to_list(20)
                for s in stories:
                    prof = next((p for p in provs if p.get("provider_id") == s.get("provider_id")), {})
                    events.append({
                        "kind": "story",
                        "id": s.get("story_id"),
                        "created_at": s.get("created_at"),
                        "actor_name": prof.get("business_name") or "Proveedor",
                        "actor_avatar": prof.get("logo_url"),
                        "actor_slug": prof.get("slug"),
                        "summary_es": "publicó una historia",
                        "summary_en": "posted a story",
                        "media": s.get("media_url"),
                        "url": f"/p/{prof.get('slug')}",
                    })
            except Exception:
                pass

            try:
                banners = await db.banner_shares.find(
                    {"provider_id": {"$in": provider_ids}, "visibility": {"$ne": "hidden"}},
                    {"_id": 0},
                ).sort("created_at", -1).limit(10).to_list(10)
                for b in banners:
                    prof = next((p for p in provs if p.get("provider_id") == b.get("provider_id")), {})
                    events.append({
                        "kind": "banner",
                        "id": b.get("share_id"),
                        "created_at": b.get("created_at"),
                        "actor_name": prof.get("business_name") or "Proveedor",
                        "actor_avatar": prof.get("logo_url"),
                        "actor_slug": prof.get("slug"),
                        "summary_es": "creó un nuevo banner",
                        "summary_en": "made a new banner",
                        "media": b.get("image_url"),
                        "url": "/galeria-banners",
                    })
            except Exception:
                pass

        # Sort by created_at desc and trim. Normalize datetime → iso string so
        # mixed types (datetime + str) don't break the comparison.
        def _ts_key(e):
            ts = e.get("created_at")
            if hasattr(ts, "isoformat"):
                return ts.isoformat()
            return str(ts or "")
        events.sort(key=_ts_key, reverse=True)
        # Cast any datetime fields to iso so the response is JSON-serializable.
        for e in events:
            ts = e.get("created_at")
            if hasattr(ts, "isoformat"):
                e["created_at"] = ts.isoformat()
        return events[:limit]

    return router
