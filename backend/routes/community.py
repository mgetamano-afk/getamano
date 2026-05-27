"""
Community module — Section 35/36/42.

Holds every `/api/community/*` endpoint (posts feed, likes, follows, stories,
suggested, trending, comments) plus their hydration helpers and validators.

Wired in server.py via:

    from routes.community import make_router as make_community_router
    api_router.include_router(make_community_router(db=db, ...))

The module follows a 3-layer split to keep cyclomatic complexity below the
maintainability threshold:
  1. Module-level Pydantic models + projection constants.
  2. Module-level pure helpers (`_load_*`, `_build_*`, `_hydrate_*`) that
     take `db` as their first argument so they are independently testable.
  3. Module-level `_do_*` handler bodies that take a `deps` SimpleNamespace.
  4. `make_router(...)` — a thin factory that wires the deps + closures.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from types import SimpleNamespace
from typing import Iterable, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, model_validator

# ─── Constants ──────────────────────────────────────────────────────────
POST_MAX_LEN = 500
POST_MIN_LEN = 4
COMMENT_MIN_LEN = 1
COMMENT_MAX_LEN = 300

_USER_PROJECTION = {"_id": 0, "user_id": 1, "name": 1, "picture": 1, "role": 1}
_PROVIDER_PROJECTION_FULL = {
    "_id": 0, "user_id": 1, "slug": 1, "business_name": 1,
    "logo_url": 1, "photo_url": 1, "city": 1, "state": 1,
    "provider_id": 1, "languages": 1, "category_id": 1,
}
_PROVIDER_PROJECTION_SLIM = {
    "_id": 0, "user_id": 1, "slug": 1, "business_name": 1,
    "logo_url": 1, "photo_url": 1,
}


# ─── Pydantic models ────────────────────────────────────────────────────
class NewPostIn(BaseModel):
    content: str = Field(default="", max_length=POST_MAX_LEN)
    image_url: Optional[str] = None

    @model_validator(mode="after")
    def _content_or_image(self):
        self.content = (self.content or "").strip()
        if not self.image_url and len(self.content) < POST_MIN_LEN:
            raise ValueError(
                f"content debe tener al menos {POST_MIN_LEN} caracteres si no hay imagen"
            )
        return self


class NewCommentIn(BaseModel):
    content: str = Field(..., min_length=COMMENT_MIN_LEN, max_length=COMMENT_MAX_LEN)


# ─── Hydration helpers ──────────────────────────────────────────────────
async def _load_users(db, user_ids: Iterable[str]) -> dict:
    cursor = db.users.find({"user_id": {"$in": list(user_ids)}}, _USER_PROJECTION)
    return {u["user_id"]: u for u in await cursor.to_list(500)}


async def _load_providers(db, user_ids: Iterable[str], slim: bool = False) -> dict:
    projection = _PROVIDER_PROJECTION_SLIM if slim else _PROVIDER_PROJECTION_FULL
    cursor = db.provider_profiles.find(
        {"user_id": {"$in": list(user_ids)},
         "is_active": True, "verification_status": "approved"},
        projection,
    )
    return {p["user_id"]: p for p in await cursor.to_list(500)}


async def _load_my_likes(db, user_id: str, post_ids: list[str]) -> set:
    cursor = db.post_likes.find(
        {"user_id": user_id, "post_id": {"$in": post_ids}},
        {"_id": 0, "post_id": 1},
    )
    return {lk["post_id"] async for lk in cursor}


async def _load_my_follows(db, user_id: str) -> set:
    cursor = db.provider_follows.find(
        {"follower_user_id": user_id},
        {"_id": 0, "provider_user_id": 1},
    )
    return {f["provider_user_id"] async for f in cursor}


def _build_post_author(user_id: str, user_doc: dict, prof: Optional[dict]) -> dict:
    user_doc = user_doc or {}
    picture = user_doc.get("picture")
    if prof and not picture:
        picture = prof.get("logo_url") or prof.get("photo_url")
    return {
        "user_id": user_id,
        "name": user_doc.get("name", "Usuario"),
        "picture": picture,
        "role": user_doc.get("role", "client"),
        "slug": prof.get("slug") if prof else None,
        "business_name": prof.get("business_name") if prof else None,
        "city": prof.get("city") if prof else None,
        "state": prof.get("state") if prof else None,
        "is_provider": bool(prof),
    }


def _build_comment_author(user_id: str, user_doc: dict, prof: Optional[dict]) -> dict:
    user_doc = user_doc or {}
    pic_from_prof = (prof.get("logo_url") or prof.get("photo_url")) if prof else None
    return {
        "user_id": user_id,
        "name": user_doc.get("name", "Usuario"),
        "picture": pic_from_prof or user_doc.get("picture"),
        "slug": prof.get("slug") if prof else None,
        "business_name": prof.get("business_name") if prof else None,
        "is_provider": bool(prof),
    }


async def hydrate_posts(db, posts: list[dict], current_user_id: Optional[str] = None) -> list[dict]:
    if not posts:
        return []
    author_ids = list({p["user_id"] for p in posts if p.get("user_id")})
    users = await _load_users(db, author_ids)
    profs = await _load_providers(db, author_ids)
    my_likes: set = set()
    my_follows: set = set()
    if current_user_id:
        my_likes = await _load_my_likes(db, current_user_id, [p["post_id"] for p in posts])
        my_follows = await _load_my_follows(db, current_user_id)
    for p in posts:
        uid = p["user_id"]
        prof = profs.get(uid)
        p["author"] = _build_post_author(uid, users.get(uid, {}), prof)
        p["liked_by_me"] = p["post_id"] in my_likes
        if prof:
            p["author"]["followed_by_me"] = prof["user_id"] in my_follows
    return posts


async def hydrate_comments(db, comments: list[dict]) -> list[dict]:
    if not comments:
        return []
    author_ids = list({c["user_id"] for c in comments if c.get("user_id")})
    users = await _load_users(db, author_ids)
    profs = await _load_providers(db, author_ids, slim=True)
    for c in comments:
        uid = c["user_id"]
        c["author"] = _build_comment_author(uid, users.get(uid, {}), profs.get(uid))
    return comments


# ─── Cursor pagination shape ───────────────────────────────────────────
def _paginated(items: list[dict], limit: int, key: str, *, asc: bool = False) -> dict:
    next_key = "next_after" if asc else "next_before"
    cursor_val = items[-1][key] if len(items) == limit else None
    return {"items": items, next_key: cursor_val}


# ─── Handler bodies ─────────────────────────────────────────────────────
async def _list_posts(deps, limit: int, before: Optional[str], current_user_id: Optional[str], filter: Optional[str] = None):
    limit = max(1, min(limit, 50))
    q: dict = {"is_hidden": {"$ne": True}}
    if before:
        q["created_at"] = {"$lt": before}
    # Section 77 — `?filter=hitos` shows only milestone celebration posts.
    if filter == "hitos":
        q["type"] = "milestone"
    rows = await deps.db.community_posts.find(q, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    rows = await hydrate_posts(deps.db, rows, current_user_id)
    return _paginated(rows, limit, "created_at")


async def _do_create_post(deps, payload: NewPostIn, request: Request, user) -> dict:
    ten_min_ago = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    recent = await deps.db.community_posts.count_documents(
        {"user_id": user.user_id, "created_at": {"$gte": ten_min_ago}}
    )
    if recent >= 5:
        raise HTTPException(status_code=429, detail="Has publicado 5 veces en los últimos 10 minutos. Espera un momento.")
    now = datetime.now(timezone.utc)
    post_id = f"post_{uuid.uuid4().hex[:14]}"
    doc = {
        "post_id": post_id,
        "user_id": user.user_id,
        "content": payload.content.strip(),
        "image_url": payload.image_url,
        "likes_count": 0,
        "comments_count": 0,
        "is_hidden": False,
        "created_at": now.isoformat(),
    }
    await deps.db.community_posts.insert_one(doc)
    doc.pop("_id", None)
    await deps.audit_log(user.user_id, "community.post_created", {"post_id": post_id}, request)
    hydrated = await hydrate_posts(deps.db, [doc], user.user_id)
    return hydrated[0] if hydrated else doc


async def _notify_milestone_reaction(
    deps, *, post: dict, reactor_user_id: str, kind: str, preview: str = ""
) -> None:
    """Section 78 — Smart batched notification for reactions on milestone posts.

    Why this closes the social loop:
      - When someone reacts to your "I unlocked a free month" post, you feel
        the community celebrate with you.
      - The notification CTA brings you back to the app → you see your post,
        scroll the feed, maybe invite more friends. The unlock isn't a
        one-off dopamine — it becomes recurring satisfaction.

    Batching strategy: ONE notification per (post, author) within a 60-min
    window. New reactions update the count + reactor_ids + body. After 60
    min idle, a new notification is created (so the user can get a fresh
    badge if they didn't open the previous one).

    Notification document gains custom fields:
      - notification_key: stable id used for upsert lookup
      - reactors: list of latest reactor user_ids (capped at 10)
      - reactions_count: total reactions in the window
      - last_reaction_at: ISO timestamp, used to compute "freshness"
    """
    author_user_id = post["user_id"]
    if author_user_id == reactor_user_id:
        return  # never notify self

    db = deps.db
    now = datetime.now(timezone.utc)
    sixty_min_ago = (now - timedelta(minutes=60)).isoformat()

    # Look for an existing batched notif for this post in the last 60 min
    notification_key = f"milestone_reaction::{post['post_id']}::{author_user_id}"
    existing = await db.notifications.find_one(
        {"notification_key": notification_key, "created_at": {"$gte": sixty_min_ago}},
        {"_id": 0, "notification_id": 1, "reactions_count": 1, "reactors": 1},
    )

    # Get reactor's display name
    reactor = await db.users.find_one(
        {"user_id": reactor_user_id},
        {"_id": 0, "name": 1},
    ) or {}
    profile = await db.provider_profiles.find_one(
        {"user_id": reactor_user_id},
        {"_id": 0, "business_name": 1, "logo_url": 1},
    ) or {}
    reactor_name = (reactor.get("name") or profile.get("business_name") or "Alguien").split(" ")[0]
    reactor_avatar = profile.get("logo_url")

    if existing:
        # UPSERT: increment count + add reactor (deduped, capped at 10)
        prev_reactors = existing.get("reactors") or []
        new_reactors = prev_reactors
        if reactor_user_id not in [r.get("user_id") for r in prev_reactors]:
            new_reactors = ([{"user_id": reactor_user_id, "name": reactor_name, "avatar": reactor_avatar}] + prev_reactors)[:10]
        new_count = (existing.get("reactions_count") or 1) + 1
        # Build the new "X y N más" body
        emoji = "❤️" if kind == "like" else "💬"
        if new_count == 1:
            body = f"{emoji} {reactor_name} reaccionó a tu hito"
        elif new_count == 2:
            other_name = next((r["name"] for r in new_reactors if r["user_id"] != reactor_user_id), "alguien")
            body = f"{emoji} {reactor_name} y {other_name} reaccionaron a tu hito"
        else:
            body = f"{emoji} {reactor_name} y {new_count - 1} más reaccionaron a tu hito"
        title = "👏 Tu comunidad celebra contigo"
        await db.notifications.update_one(
            {"notification_id": existing["notification_id"]},
            {"$set": {
                "title": title,
                "body": body,
                "reactions_count": new_count,
                "reactors": new_reactors,
                "last_reaction_at": now.isoformat(),
                "last_reaction_kind": kind,
                "is_read": False,
                "preview": preview or None,
            }},
        )
        return

    # No recent batch — create a fresh notification
    emoji = "❤️" if kind == "like" else "💬"
    body = f"{emoji} {reactor_name} reaccionó a tu hito"
    if kind == "comment" and preview:
        body = f"💬 {reactor_name}: \"{preview}\""
    await db.notifications.insert_one({
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "notification_key": notification_key,
        "user_id": author_user_id,
        "category": "community",
        "title": "👏 Tu comunidad celebra contigo",
        "body": body,
        "cta_label": "Ver hito",
        "cta_url": f"/comunidad/post/{post['post_id']}",
        "icon": "heart",
        "priority": "high",
        "is_read": False,
        "dismissed_at": None,
        "reactions_count": 1,
        "reactors": [{"user_id": reactor_user_id, "name": reactor_name, "avatar": reactor_avatar}],
        "last_reaction_at": now.isoformat(),
        "last_reaction_kind": kind,
        "post_id": post["post_id"],
        "milestone_index": post.get("milestone_index"),
        "preview": preview or None,
        "created_at": now.isoformat(),
    })

    # Push + sent.dm (sandbox-safe) — only fire on FIRST reaction of a fresh
    # batch to avoid push fatigue. Subsequent reactions update the in-app
    # notification silently.
    try:
        from routes.push import send_push_to_user
        await send_push_to_user(db, author_user_id, {
            "title": "👏 Reaccionaron a tu hito",
            "body": body,
            "url": f"/comunidad/post/{post['post_id']}",
            "tag": notification_key,  # browser dedupes by tag
            "icon": "/icon-192x192.png",
        })
    except Exception:
        pass


async def _do_toggle_like(deps, post_id: str, user) -> dict:
    post = await deps.db.community_posts.find_one(
        {"post_id": post_id},
        {"_id": 0, "post_id": 1, "user_id": 1, "type": 1, "milestone_index": 1, "milestone_paid_count": 1},
    )
    if not post:
        raise HTTPException(status_code=404, detail="Post no encontrado.")
    existing = await deps.db.post_likes.find_one({"post_id": post_id, "user_id": user.user_id}, {"_id": 0})
    if existing:
        await deps.db.post_likes.delete_one({"post_id": post_id, "user_id": user.user_id})
        await deps.db.community_posts.update_one({"post_id": post_id}, {"$inc": {"likes_count": -1}})
        return {"liked": False}
    await deps.db.post_likes.insert_one({
        "post_id": post_id,
        "user_id": user.user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await deps.db.community_posts.update_one({"post_id": post_id}, {"$inc": {"likes_count": 1}})
    # Section 78 — Notify the author when someone LIKES their milestone post.
    # Smart batching prevents spam if many reactions arrive in quick succession.
    if post.get("type") == "milestone" and post["user_id"] != user.user_id:
        await _notify_milestone_reaction(
            deps, post=post, reactor_user_id=user.user_id, kind="like",
        )
    return {"liked": True}


async def _do_delete_post(deps, post_id: str, request: Request, user) -> dict:
    post = await deps.db.community_posts.find_one({"post_id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post no encontrado.")
    if post["user_id"] != user.user_id and user.role != "admin":
        raise HTTPException(status_code=403, detail="No puedes eliminar este post.")
    await deps.db.community_posts.update_one({"post_id": post_id}, {"$set": {"is_hidden": True}})
    await deps.audit_log(user.user_id, "community.post_deleted", {"post_id": post_id}, request)
    return {"ok": True}


async def _do_stories(deps) -> list[dict]:
    one_day_ago = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    cursor = deps.db.community_posts.aggregate([
        {"$match": {"created_at": {"$gte": one_day_ago}, "is_hidden": {"$ne": True}}},
        {"$sort": {"created_at": -1}},
        {"$group": {"_id": "$user_id", "last_post_at": {"$first": "$created_at"}}},
        {"$limit": 20},
    ])
    user_to_last: dict = {}
    async for row in cursor:
        user_to_last[row["_id"]] = row["last_post_at"]
    if not user_to_last:
        return []
    user_ids = list(user_to_last)
    profs = await deps.db.provider_profiles.find(
        {"user_id": {"$in": user_ids}, "is_active": True,
         "verification_status": "approved", **deps.PUBLIC_GUARD},
        {"_id": 0, "user_id": 1, "slug": 1, "business_name": 1, "logo_url": 1,
         "photo_url": 1, "city": 1, "state": 1, "provider_id": 1},
    ).to_list(50)
    users = await _load_users(deps.db, user_ids)
    out = []
    for p in profs:
        u = users.get(p["user_id"], {})
        out.append({
            "user_id": p["user_id"],
            "slug": p["slug"],
            "business_name": p.get("business_name") or u.get("name", "Proveedor"),
            "picture": p.get("logo_url") or p.get("photo_url") or u.get("picture"),
            "city": p.get("city"),
            "last_post_at": user_to_last.get(p["user_id"]),
        })
    out.sort(key=lambda s: s.get("last_post_at") or "", reverse=True)
    return out


async def _do_suggested(deps, user) -> list[dict]:
    followed = await _load_my_follows(deps.db, user.user_id)
    followed.add(user.user_id)
    profs = await deps.db.provider_profiles.find(
        {
            "is_active": True,
            "verification_status": "approved",
            "user_id": {"$nin": list(followed)},
            "business_name": {"$not": {"$regex": "^TEST_"}},
            **deps.PUBLIC_GUARD,
        },
        {"_id": 0, "provider_id": 1, "user_id": 1, "slug": 1, "business_name": 1,
         "logo_url": 1, "photo_url": 1, "city": 1, "rating_avg": 1, "reviews_count": 1,
         "category_id": 1, "plan": 1},
    ).sort([("rating_avg", -1), ("reviews_count", -1)]).limit(8).to_list(8)
    cats = {c["category_id"]: c for c in await deps.db.categories.find({}, {"_id": 0}).to_list(200)}
    for p in profs:
        cat = cats.get(p.get("category_id"))
        p["main_category"] = (cat or {}).get("name_es") or ""
    return profs


async def _do_follow(deps, provider_user_id: str, user) -> dict:
    if provider_user_id == user.user_id:
        raise HTTPException(status_code=400, detail="No puedes seguirte a ti mismo.")
    target = await deps.db.provider_profiles.find_one({"user_id": provider_user_id}, {"_id": 0, "provider_id": 1})
    if not target:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado.")
    existing = await deps.db.provider_follows.find_one(
        {"follower_user_id": user.user_id, "provider_user_id": provider_user_id},
        {"_id": 0},
    )
    if existing:
        return {"following": True}
    await deps.db.provider_follows.insert_one({
        "follow_id": f"flw_{uuid.uuid4().hex[:14]}",
        "follower_user_id": user.user_id,
        "provider_user_id": provider_user_id,
        "provider_id": target["provider_id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"following": True}


async def _aggregate_trending_categories(deps) -> list[dict]:
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    primary = deps.db.community_posts.aggregate([
        {"$match": {"created_at": {"$gte": week_ago}, "is_hidden": {"$ne": True}}},
        {"$lookup": {"from": "provider_profiles", "localField": "user_id",
                     "foreignField": "user_id", "as": "prof"}},
        {"$unwind": "$prof"},
        {"$group": {"_id": "$prof.category_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 6},
    ])
    cat_counts = [{"category_id": row["_id"], "count": row["count"]}
                  async for row in primary if row["_id"]]
    if cat_counts:
        return cat_counts
    fallback = deps.db.provider_profiles.aggregate([
        {"$match": {"is_active": True, "verification_status": "approved", **deps.PUBLIC_GUARD}},
        {"$group": {"_id": "$category_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 6},
    ])
    return [{"category_id": row["_id"], "count": row["count"]}
            async for row in fallback if row["_id"]]


async def _do_trending(deps) -> list[dict]:
    cat_counts = await _aggregate_trending_categories(deps)
    if not cat_counts:
        return []
    cats = {c["category_id"]: c async for c in deps.db.categories.find(
        {"category_id": {"$in": [c["category_id"] for c in cat_counts]}},
        {"_id": 0},
    )}
    out = []
    for c in cat_counts:
        cat = cats.get(c["category_id"])
        if not cat:
            continue
        out.append({
            "category_id": c["category_id"],
            "name_es": cat.get("name_es"),
            "name_en": cat.get("name_en"),
            "slug": cat.get("slug"),
            "icon": cat.get("icon") or "🔧",
            "count": c["count"],
        })
    return out


async def _do_list_comments(deps, post_id: str, limit: int, before: Optional[str]) -> dict:
    limit = max(1, min(limit, 100))
    post = await deps.db.community_posts.find_one(
        {"post_id": post_id, "is_hidden": {"$ne": True}},
        {"_id": 0, "post_id": 1},
    )
    if not post:
        raise HTTPException(status_code=404, detail="Post no encontrado.")
    q: dict = {"post_id": post_id, "is_hidden": {"$ne": True}}
    if before:
        q["created_at"] = {"$gt": before}
    rows = await deps.db.community_comments.find(q, {"_id": 0}).sort("created_at", 1).limit(limit).to_list(limit)
    rows = await hydrate_comments(deps.db, rows)
    total = await deps.db.community_comments.count_documents(
        {"post_id": post_id, "is_hidden": {"$ne": True}}
    )
    return {"items": rows, "total": total,
            "next_after": rows[-1]["created_at"] if len(rows) == limit else None}


async def _notify_comment(deps, post_owner: str, commenter_user_id: str, comment_id: str, content: str) -> None:
    """Fire a single notification to the post owner (best-effort)."""
    actor = await deps.db.users.find_one({"user_id": commenter_user_id}, {"_id": 0, "name": 1}) or {}
    first = (actor.get("name") or "Alguien").split(" ")[0] or "Alguien"
    await deps.db.notifications.insert_one({
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "notification_key": f"{post_owner}::comment::{comment_id}",
        "user_id": post_owner,
        "role": "provider",
        "category": "community",
        "title": f"💬 {first} comentó tu post",
        "body": content[:120],
        "cta_label": "Ver comentario",
        "cta_url": "/comunidad",
        "icon": "inbox",
        "priority": "medium",
        "is_read": False,
        "dismissed_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


async def _do_create_comment(deps, post_id: str, payload: NewCommentIn, request: Request, user) -> dict:
    post = await deps.db.community_posts.find_one(
        {"post_id": post_id, "is_hidden": {"$ne": True}},
        {"_id": 0, "post_id": 1, "user_id": 1, "type": 1, "milestone_index": 1, "milestone_paid_count": 1},
    )
    if not post:
        raise HTTPException(status_code=404, detail="Post no encontrado.")
    five_min_ago = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    recent = await deps.db.community_comments.count_documents(
        {"user_id": user.user_id, "created_at": {"$gte": five_min_ago}}
    )
    if recent >= 10:
        raise HTTPException(status_code=429, detail="Has comentado mucho en los últimos minutos. Espera un momento.")
    now = datetime.now(timezone.utc)
    comment_id = f"cmt_{uuid.uuid4().hex[:14]}"
    doc = {
        "comment_id": comment_id,
        "post_id": post_id,
        "user_id": user.user_id,
        "content": payload.content.strip(),
        "is_hidden": False,
        "created_at": now.isoformat(),
    }
    await deps.db.community_comments.insert_one(doc)
    doc.pop("_id", None)
    await deps.db.community_posts.update_one({"post_id": post_id}, {"$inc": {"comments_count": 1}})
    await deps.audit_log(
        user.user_id, "community.comment_created",
        {"post_id": post_id, "comment_id": comment_id}, request,
    )
    if post["user_id"] != user.user_id:
        # Section 78 — milestone posts use a batched "X people reacted" notif
        # to drive the recurring social engagement loop. Regular posts keep
        # the original 1:1 comment notification.
        if post.get("type") == "milestone":
            await _notify_milestone_reaction(
                deps, post=post, reactor_user_id=user.user_id, kind="comment",
                preview=payload.content.strip()[:80],
            )
        else:
            await _notify_comment(deps, post["user_id"], user.user_id, comment_id, payload.content.strip())
    hydrated = await hydrate_comments(deps.db, [doc])
    return hydrated[0] if hydrated else doc


async def _do_delete_comment(deps, comment_id: str, request: Request, user) -> dict:
    c = await deps.db.community_comments.find_one({"comment_id": comment_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Comentario no encontrado.")
    if c["user_id"] != user.user_id and user.role != "admin":
        raise HTTPException(status_code=403, detail="No puedes eliminar este comentario.")
    if c.get("is_hidden"):
        return {"ok": True, "already_hidden": True}
    await deps.db.community_comments.update_one({"comment_id": comment_id}, {"$set": {"is_hidden": True}})
    await deps.db.community_posts.update_one({"post_id": c["post_id"]}, {"$inc": {"comments_count": -1}})
    await deps.audit_log(
        user.user_id, "community.comment_deleted",
        {"comment_id": comment_id, "post_id": c["post_id"]}, request,
    )
    return {"ok": True}


# ─── Router factory ─────────────────────────────────────────────────────
def make_router(*, db, audit_log, get_current_user, PUBLIC_GUARD) -> APIRouter:
    """Build and return the community router, capturing deps in a closure."""
    deps = SimpleNamespace(
        db=db, audit_log=audit_log, PUBLIC_GUARD=PUBLIC_GUARD,
    )
    router = APIRouter(prefix="/community", tags=["community"])

    # Posts
    @router.get("/posts")
    async def list_posts(limit: int = 20, before: Optional[str] = None, filter: Optional[str] = None):
        return await _list_posts(deps, limit, before, None, filter=filter)

    @router.get("/posts/feed")
    async def list_posts_authenticated(limit: int = 20, before: Optional[str] = None, filter: Optional[str] = None, user=Depends(get_current_user)):
        return await _list_posts(deps, limit, before, user.user_id, filter=filter)

    @router.post("/posts")
    async def create_post(payload: NewPostIn, request: Request, user=Depends(get_current_user)):
        return await _do_create_post(deps, payload, request, user)

    @router.post("/posts/{post_id}/like")
    async def toggle_post_like(post_id: str, user=Depends(get_current_user)):
        return await _do_toggle_like(deps, post_id, user)

    @router.delete("/posts/{post_id}")
    async def delete_post(post_id: str, request: Request, user=Depends(get_current_user)):
        return await _do_delete_post(deps, post_id, request, user)

    # Stories · Suggested · Trending · Follows
    @router.get("/stories")
    async def stories():
        return await _do_stories(deps)

    @router.get("/suggested")
    async def suggested(user=Depends(get_current_user)):
        return await _do_suggested(deps, user)

    @router.post("/follows/{provider_user_id}")
    async def follow(provider_user_id: str, user=Depends(get_current_user)):
        return await _do_follow(deps, provider_user_id, user)

    @router.delete("/follows/{provider_user_id}")
    async def unfollow(provider_user_id: str, user=Depends(get_current_user)):
        await db.provider_follows.delete_one(
            {"follower_user_id": user.user_id, "provider_user_id": provider_user_id},
        )
        return {"following": False}

    @router.get("/me/follows")
    async def my_follows(user=Depends(get_current_user)):
        rows = await db.provider_follows.find(
            {"follower_user_id": user.user_id},
            {"_id": 0, "provider_user_id": 1},
        ).limit(500).to_list(500)
        return {"items": [r["provider_user_id"] for r in rows], "count": len(rows)}

    @router.get("/trending")
    async def trending():
        return await _do_trending(deps)

    # Comments
    @router.get("/posts/{post_id}/comments")
    async def list_comments(post_id: str, limit: int = 30, before: Optional[str] = None):
        return await _do_list_comments(deps, post_id, limit, before)

    @router.post("/posts/{post_id}/comments")
    async def create_comment(post_id: str, payload: NewCommentIn, request: Request, user=Depends(get_current_user)):
        return await _do_create_comment(deps, post_id, payload, request, user)

    @router.delete("/comments/{comment_id}")
    async def delete_comment(comment_id: str, request: Request, user=Depends(get_current_user)):
        return await _do_delete_comment(deps, comment_id, request, user)

    return router
