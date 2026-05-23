"""
Community module — Section 35/36/42.

Pilot for the modularisation of server.py. Holds every `/api/community/*`
endpoint (posts feed, likes, follows, stories, suggested, trending,
comments) plus their helpers and validators.

Wired in server.py via:

    from routes.community import make_router as make_community_router
    api_router.include_router(make_community_router(db=db, ...))

A factory function is used (instead of module-level globals) so that
FastAPI captures the real dependencies at endpoint-definition time —
avoiding any circular-import or late-binding pitfalls.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, model_validator

POST_MAX_LEN = 500
POST_MIN_LEN = 4
COMMENT_MIN_LEN = 1
COMMENT_MAX_LEN = 300


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


def make_router(*, db, audit_log, get_current_user, PUBLIC_GUARD) -> APIRouter:
    """Build and return the community router, closing over the shared deps."""
    router = APIRouter(prefix="/community", tags=["community"])

    # ─── Helpers ────────────────────────────────────────────────────────
    async def hydrate_posts(posts: list[dict], current_user_id: Optional[str] = None) -> list[dict]:
        if not posts:
            return []
        author_ids = list({p["user_id"] for p in posts if p.get("user_id")})
        users = {u["user_id"]: u for u in await db.users.find(
            {"user_id": {"$in": author_ids}},
            {"_id": 0, "user_id": 1, "name": 1, "picture": 1, "role": 1},
        ).to_list(500)}
        profs = {p["user_id"]: p for p in await db.provider_profiles.find(
            {"user_id": {"$in": author_ids}, "is_active": True, "verification_status": "approved"},
            {"_id": 0, "user_id": 1, "slug": 1, "business_name": 1, "logo_url": 1, "photo_url": 1, "city": 1, "state": 1, "provider_id": 1, "languages": 1, "category_id": 1},
        ).to_list(500)}
        my_likes: set[str] = set()
        my_follows: set[str] = set()
        if current_user_id:
            my_likes = {lk["post_id"] async for lk in db.post_likes.find(
                {"user_id": current_user_id, "post_id": {"$in": [p["post_id"] for p in posts]}},
                {"_id": 0, "post_id": 1},
            )}
            my_follows = {f["provider_user_id"] async for f in db.provider_follows.find(
                {"follower_user_id": current_user_id},
                {"_id": 0, "provider_user_id": 1},
            )}
        for p in posts:
            u = users.get(p["user_id"], {})
            prof = profs.get(p["user_id"])
            p["author"] = {
                "user_id": p["user_id"],
                "name": u.get("name", "Usuario"),
                "picture": u.get("picture") or (prof.get("logo_url") or prof.get("photo_url") if prof else None),
                "role": u.get("role", "client"),
                "slug": prof.get("slug") if prof else None,
                "business_name": prof.get("business_name") if prof else None,
                "city": prof.get("city") if prof else None,
                "state": prof.get("state") if prof else None,
                "is_provider": bool(prof),
            }
            p["liked_by_me"] = p["post_id"] in my_likes
            if prof:
                p["author"]["followed_by_me"] = prof["user_id"] in my_follows
        return posts

    async def hydrate_comments(comments: list[dict]) -> list[dict]:
        if not comments:
            return []
        author_ids = list({c["user_id"] for c in comments if c.get("user_id")})
        users = {u["user_id"]: u for u in await db.users.find(
            {"user_id": {"$in": author_ids}},
            {"_id": 0, "user_id": 1, "name": 1, "picture": 1, "role": 1},
        ).to_list(500)}
        profs = {p["user_id"]: p for p in await db.provider_profiles.find(
            {"user_id": {"$in": author_ids}, "is_active": True, "verification_status": "approved"},
            {"_id": 0, "user_id": 1, "slug": 1, "business_name": 1, "logo_url": 1, "photo_url": 1},
        ).to_list(500)}
        for c in comments:
            u = users.get(c["user_id"], {})
            prof = profs.get(c["user_id"])
            c["author"] = {
                "user_id": c["user_id"],
                "name": u.get("name", "Usuario"),
                "picture": (prof.get("logo_url") or prof.get("photo_url") if prof else None) or u.get("picture"),
                "slug": prof.get("slug") if prof else None,
                "business_name": prof.get("business_name") if prof else None,
                "is_provider": bool(prof),
            }
        return comments

    # ─── Posts ──────────────────────────────────────────────────────────
    @router.get("/posts")
    async def list_posts(limit: int = 20, before: Optional[str] = None):
        limit = max(1, min(limit, 50))
        q: dict = {"is_hidden": {"$ne": True}}
        if before:
            q["created_at"] = {"$lt": before}
        rows = await db.community_posts.find(q, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
        rows = await hydrate_posts(rows, None)
        return {"items": rows, "next_before": rows[-1]["created_at"] if len(rows) == limit else None}

    @router.get("/posts/feed")
    async def list_posts_authenticated(limit: int = 20, before: Optional[str] = None, user=Depends(get_current_user)):
        limit = max(1, min(limit, 50))
        q: dict = {"is_hidden": {"$ne": True}}
        if before:
            q["created_at"] = {"$lt": before}
        rows = await db.community_posts.find(q, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
        rows = await hydrate_posts(rows, user.user_id)
        return {"items": rows, "next_before": rows[-1]["created_at"] if len(rows) == limit else None}

    @router.post("/posts")
    async def create_post(payload: NewPostIn, request: Request, user=Depends(get_current_user)):
        ten_min_ago = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
        recent = await db.community_posts.count_documents({"user_id": user.user_id, "created_at": {"$gte": ten_min_ago}})
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
        await db.community_posts.insert_one(doc)
        doc.pop("_id", None)
        await audit_log(user.user_id, "community.post_created", {"post_id": post_id}, request)
        hydrated = await hydrate_posts([doc], user.user_id)
        return hydrated[0] if hydrated else doc

    @router.post("/posts/{post_id}/like")
    async def toggle_post_like(post_id: str, user=Depends(get_current_user)):
        post = await db.community_posts.find_one({"post_id": post_id}, {"_id": 0, "post_id": 1, "user_id": 1})
        if not post:
            raise HTTPException(status_code=404, detail="Post no encontrado.")
        existing = await db.post_likes.find_one({"post_id": post_id, "user_id": user.user_id}, {"_id": 0})
        if existing:
            await db.post_likes.delete_one({"post_id": post_id, "user_id": user.user_id})
            await db.community_posts.update_one({"post_id": post_id}, {"$inc": {"likes_count": -1}})
            return {"liked": False}
        await db.post_likes.insert_one({
            "post_id": post_id,
            "user_id": user.user_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        await db.community_posts.update_one({"post_id": post_id}, {"$inc": {"likes_count": 1}})
        return {"liked": True}

    @router.delete("/posts/{post_id}")
    async def delete_post(post_id: str, request: Request, user=Depends(get_current_user)):
        post = await db.community_posts.find_one({"post_id": post_id}, {"_id": 0})
        if not post:
            raise HTTPException(status_code=404, detail="Post no encontrado.")
        if post["user_id"] != user.user_id and user.role != "admin":
            raise HTTPException(status_code=403, detail="No puedes eliminar este post.")
        await db.community_posts.update_one({"post_id": post_id}, {"$set": {"is_hidden": True}})
        await audit_log(user.user_id, "community.post_deleted", {"post_id": post_id}, request)
        return {"ok": True}

    # ─── Stories · Suggested · Trending · Follows ──────────────────────
    @router.get("/stories")
    async def community_stories():
        one_day_ago = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        cursor = db.community_posts.aggregate([
            {"$match": {"created_at": {"$gte": one_day_ago}, "is_hidden": {"$ne": True}}},
            {"$sort": {"created_at": -1}},
            {"$group": {"_id": "$user_id", "last_post_at": {"$first": "$created_at"}}},
            {"$limit": 20},
        ])
        user_ids: list[str] = []
        user_to_last: dict = {}
        async for row in cursor:
            user_ids.append(row["_id"])
            user_to_last[row["_id"]] = row["last_post_at"]
        if not user_ids:
            return []
        profs = await db.provider_profiles.find(
            {"user_id": {"$in": user_ids}, "is_active": True, "verification_status": "approved", **PUBLIC_GUARD},
            {"_id": 0, "user_id": 1, "slug": 1, "business_name": 1, "logo_url": 1, "photo_url": 1, "city": 1, "state": 1, "provider_id": 1},
        ).to_list(50)
        users = {u["user_id"]: u for u in await db.users.find(
            {"user_id": {"$in": user_ids}},
            {"_id": 0, "user_id": 1, "name": 1, "picture": 1},
        ).to_list(50)}
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

    @router.get("/suggested")
    async def community_suggested(user=Depends(get_current_user)):
        followed = {f["provider_user_id"] async for f in db.provider_follows.find(
            {"follower_user_id": user.user_id},
            {"_id": 0, "provider_user_id": 1},
        )}
        followed.add(user.user_id)
        profs = await db.provider_profiles.find(
            {
                "is_active": True,
                "verification_status": "approved",
                "user_id": {"$nin": list(followed)},
                "business_name": {"$not": {"$regex": "^TEST_"}},
                **PUBLIC_GUARD,
            },
            {"_id": 0, "provider_id": 1, "user_id": 1, "slug": 1, "business_name": 1, "logo_url": 1, "photo_url": 1, "city": 1, "rating_avg": 1, "reviews_count": 1, "category_id": 1, "plan": 1},
        ).sort([("rating_avg", -1), ("reviews_count", -1)]).limit(8).to_list(8)
        cats = {c["category_id"]: c for c in await db.categories.find({}, {"_id": 0}).to_list(200)}
        for p in profs:
            cat = cats.get(p.get("category_id"))
            p["main_category"] = (cat or {}).get("name_es") or ""
        return profs

    @router.post("/follows/{provider_user_id}")
    async def follow_provider(provider_user_id: str, user=Depends(get_current_user)):
        if provider_user_id == user.user_id:
            raise HTTPException(status_code=400, detail="No puedes seguirte a ti mismo.")
        target = await db.provider_profiles.find_one({"user_id": provider_user_id}, {"_id": 0, "provider_id": 1})
        if not target:
            raise HTTPException(status_code=404, detail="Proveedor no encontrado.")
        existing = await db.provider_follows.find_one(
            {"follower_user_id": user.user_id, "provider_user_id": provider_user_id},
            {"_id": 0},
        )
        if existing:
            return {"following": True}
        await db.provider_follows.insert_one({
            "follow_id": f"flw_{uuid.uuid4().hex[:14]}",
            "follower_user_id": user.user_id,
            "provider_user_id": provider_user_id,
            "provider_id": target["provider_id"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"following": True}

    @router.delete("/follows/{provider_user_id}")
    async def unfollow_provider(provider_user_id: str, user=Depends(get_current_user)):
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
    async def community_trending():
        week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        cursor = db.community_posts.aggregate([
            {"$match": {"created_at": {"$gte": week_ago}, "is_hidden": {"$ne": True}}},
            {"$lookup": {"from": "provider_profiles", "localField": "user_id", "foreignField": "user_id", "as": "prof"}},
            {"$unwind": "$prof"},
            {"$group": {"_id": "$prof.category_id", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 6},
        ])
        cat_counts = []
        async for row in cursor:
            if row["_id"]:
                cat_counts.append({"category_id": row["_id"], "count": row["count"]})
        if not cat_counts:
            fallback = db.provider_profiles.aggregate([
                {"$match": {"is_active": True, "verification_status": "approved", **PUBLIC_GUARD}},
                {"$group": {"_id": "$category_id", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}},
                {"$limit": 6},
            ])
            async for row in fallback:
                if row["_id"]:
                    cat_counts.append({"category_id": row["_id"], "count": row["count"]})
        if not cat_counts:
            return []
        cats = {c["category_id"]: c async for c in db.categories.find(
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

    # ─── Comments ───────────────────────────────────────────────────────
    @router.get("/posts/{post_id}/comments")
    async def list_comments(post_id: str, limit: int = 30, before: Optional[str] = None):
        limit = max(1, min(limit, 100))
        post = await db.community_posts.find_one({"post_id": post_id, "is_hidden": {"$ne": True}}, {"_id": 0, "post_id": 1})
        if not post:
            raise HTTPException(status_code=404, detail="Post no encontrado.")
        q: dict = {"post_id": post_id, "is_hidden": {"$ne": True}}
        if before:
            q["created_at"] = {"$gt": before}
        rows = await db.community_comments.find(q, {"_id": 0}).sort("created_at", 1).limit(limit).to_list(limit)
        rows = await hydrate_comments(rows)
        total = await db.community_comments.count_documents({"post_id": post_id, "is_hidden": {"$ne": True}})
        return {"items": rows, "total": total, "next_after": rows[-1]["created_at"] if len(rows) == limit else None}

    @router.post("/posts/{post_id}/comments")
    async def create_comment(post_id: str, payload: NewCommentIn, request: Request, user=Depends(get_current_user)):
        post = await db.community_posts.find_one({"post_id": post_id, "is_hidden": {"$ne": True}}, {"_id": 0, "post_id": 1, "user_id": 1})
        if not post:
            raise HTTPException(status_code=404, detail="Post no encontrado.")
        five_min_ago = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        recent = await db.community_comments.count_documents({"user_id": user.user_id, "created_at": {"$gte": five_min_ago}})
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
        await db.community_comments.insert_one(doc)
        doc.pop("_id", None)
        await db.community_posts.update_one({"post_id": post_id}, {"$inc": {"comments_count": 1}})
        await audit_log(user.user_id, "community.comment_created", {"post_id": post_id, "comment_id": comment_id}, request)

        if post["user_id"] != user.user_id:
            post_owner = post["user_id"]
            first = (await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "name": 1}) or {}).get("name", "Alguien").split(" ")[0] or "Alguien"
            await db.notifications.insert_one({
                "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
                "notification_key": f"{post_owner}::comment::{comment_id}",
                "user_id": post_owner,
                "role": "provider",
                "category": "community",
                "title": f"💬 {first} comentó tu post",
                "body": payload.content.strip()[:120],
                "cta_label": "Ver comentario",
                "cta_url": "/comunidad",
                "icon": "inbox",
                "priority": "medium",
                "is_read": False,
                "dismissed_at": None,
                "created_at": now.isoformat(),
            })

        hydrated = await hydrate_comments([doc])
        return hydrated[0] if hydrated else doc

    @router.delete("/comments/{comment_id}")
    async def delete_comment(comment_id: str, request: Request, user=Depends(get_current_user)):
        c = await db.community_comments.find_one({"comment_id": comment_id}, {"_id": 0})
        if not c:
            raise HTTPException(status_code=404, detail="Comentario no encontrado.")
        if c["user_id"] != user.user_id and user.role != "admin":
            raise HTTPException(status_code=403, detail="No puedes eliminar este comentario.")
        if c.get("is_hidden"):
            return {"ok": True, "already_hidden": True}
        await db.community_comments.update_one({"comment_id": comment_id}, {"$set": {"is_hidden": True}})
        await db.community_posts.update_one({"post_id": c["post_id"]}, {"$inc": {"comments_count": -1}})
        await audit_log(user.user_id, "community.comment_deleted", {"comment_id": comment_id, "post_id": c["post_id"]}, request)
        return {"ok": True}

    return router
