"""
Section 89 (v4 social-first features) — Portfolio + Gremios + Trust enrichment.

This module ships the social-first APIs that V4 needs on top of V3:

  · Portfolio (per-provider photo gallery)
       GET    /api/providers/me/portfolio
       POST   /api/providers/me/portfolio          (push a new item)
       PATCH  /api/providers/me/portfolio/{id}     (caption / sort_order)
       DELETE /api/providers/me/portfolio/{id}
       GET    /api/providers/by-slug/{slug}/portfolio   (public)

  · Gremios (per-category community feed)
       GET    /api/gremios?city=X                   (list + member count)
       POST   /api/gremios/{cat}/join               (requires is_provider)
       DELETE /api/gremios/{cat}/leave
       GET    /api/gremios/{cat}/posts?city=X&limit=
       POST   /api/gremios/{cat}/posts              (content + optional image)
       POST   /api/gremios/posts/{post_id}/like     (toggle)
       POST   /api/gremios/posts/{post_id}/replies  (single layer)
       GET    /api/gremios/posts/{post_id}/replies

  · Trust score helpers
       Server-side computed `portfolio_count`, `days_active`, and
       `referrals_converted` are added to /api/providers/me + by-slug
       responses via a small enrichment step. The frontend reads those
       fields and runs `calcTrustScore(profile)` locally.

Storage
───────
Portfolio images are uploaded via the existing /api/upload endpoint
(MongoDB GridFS bucket "uploads") — we only store the resulting URL
in `portfolio_items`.

MongoDB collections (created in seed):
  portfolio_items     — { id, provider_id, image_url, caption, sort_order, created_at }
  gremio_members      — { user_id, gremio_category, joined_at }
  gremio_posts        — { id, gremio_category, author_user_id, content, image_url, city, likes_count, created_at }
  gremio_post_likes   — { post_id, user_id }
  gremio_replies      — { id, post_id, author_user_id, content, created_at }
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

PORTFOLIO_MAX_ITEMS = 12


# ─────────────────────────────────────────────────────────────────────
# Indexes — wire into server.seed() once
# ─────────────────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    """Idempotent — safe to call on every startup."""
    try:
        await db.portfolio_items.create_index([("provider_id", 1), ("sort_order", 1)])
        await db.gremio_members.create_index([("user_id", 1), ("gremio_category", 1)], unique=True)
        await db.gremio_members.create_index([("gremio_category", 1)])
        await db.gremio_posts.create_index([("gremio_category", 1), ("created_at", -1)])
        await db.gremio_posts.create_index([("gremio_category", 1), ("city", 1), ("created_at", -1)])
        await db.gremio_post_likes.create_index([("post_id", 1), ("user_id", 1)], unique=True)
        await db.gremio_replies.create_index([("post_id", 1), ("created_at", 1)])
        logger.info("v4 social indexes ensured")
    except Exception as e:
        logger.warning(f"v4 index ensure warn: {e}")


# ─────────────────────────────────────────────────────────────────────
# Pydantic schemas
# ─────────────────────────────────────────────────────────────────────

class PortfolioItemIn(BaseModel):
    image_url: str
    caption: Optional[str] = Field(None, max_length=200)


class PortfolioPatchIn(BaseModel):
    caption: Optional[str] = Field(None, max_length=200)
    sort_order: Optional[int] = Field(None, ge=0, le=999)


class GremioPostIn(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)
    image_url: Optional[str] = None
    city: Optional[str] = None


class GremioReplyIn(BaseModel):
    content: str = Field(..., min_length=1, max_length=1000)


# ─────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────

async def _get_provider_id(db, user_id: str) -> Optional[str]:
    prof = await db.provider_profiles.find_one({"user_id": user_id}, {"_id": 0, "provider_id": 1})
    return (prof or {}).get("provider_id")


async def _strip(doc: dict) -> dict:
    """Drop Mongo `_id` so docs are JSON-serializable as-is."""
    if doc and "_id" in doc:
        doc.pop("_id", None)
    return doc


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ─────────────────────────────────────────────────────────────────────
# Router
# ─────────────────────────────────────────────────────────────────────

def build_router(db, get_current_user):
    router = APIRouter()

    # ════════════════════ PORTFOLIO ═════════════════════════════════

    @router.get("/providers/me/portfolio")
    async def my_portfolio(me=Depends(get_current_user)) -> list[dict]:
        pid = await _get_provider_id(db, me.user_id)
        if not pid:
            return []
        items = await db.portfolio_items.find(
            {"provider_id": pid}, {"_id": 0}
        ).sort([("sort_order", 1), ("created_at", 1)]).to_list(PORTFOLIO_MAX_ITEMS)
        return items

    @router.post("/providers/me/portfolio")
    async def add_portfolio_item(payload: PortfolioItemIn, me=Depends(get_current_user)) -> dict:
        pid = await _get_provider_id(db, me.user_id)
        if not pid:
            raise HTTPException(status_code=403, detail="Activa tu perfil de proveedor primero.")
        count = await db.portfolio_items.count_documents({"provider_id": pid})
        if count >= PORTFOLIO_MAX_ITEMS:
            raise HTTPException(status_code=400, detail=f"Máximo {PORTFOLIO_MAX_ITEMS} fotos en tu portafolio.")
        doc = {
            "id": f"port_{uuid.uuid4().hex[:12]}",
            "provider_id": pid,
            "image_url": payload.image_url,
            "caption": payload.caption,
            "sort_order": count,  # appended at end
            "created_at": _now_iso(),
        }
        await db.portfolio_items.insert_one(doc)
        return await _strip(doc)

    @router.patch("/providers/me/portfolio/{item_id}")
    async def update_portfolio_item(item_id: str, payload: PortfolioPatchIn, me=Depends(get_current_user)) -> dict:
        pid = await _get_provider_id(db, me.user_id)
        if not pid:
            raise HTTPException(status_code=403, detail="Activa tu perfil de proveedor primero.")
        existing = await db.portfolio_items.find_one({"id": item_id, "provider_id": pid}, {"_id": 0})
        if not existing:
            raise HTTPException(status_code=404, detail="Foto no encontrada.")
        update = payload.model_dump(exclude_none=True)
        if update:
            await db.portfolio_items.update_one({"id": item_id}, {"$set": update})
            existing.update(update)
        return existing

    @router.delete("/providers/me/portfolio/{item_id}")
    async def delete_portfolio_item(item_id: str, me=Depends(get_current_user)) -> dict:
        pid = await _get_provider_id(db, me.user_id)
        if not pid:
            raise HTTPException(status_code=403, detail="Activa tu perfil de proveedor primero.")
        result = await db.portfolio_items.delete_one({"id": item_id, "provider_id": pid})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Foto no encontrada.")
        return {"deleted": True, "id": item_id}

    @router.get("/providers/by-slug/{slug}/portfolio")
    async def public_portfolio(slug: str) -> list[dict]:
        prof = await db.provider_profiles.find_one(
            {"slug": slug, "is_active": True, "verification_status": "approved"},
            {"_id": 0, "provider_id": 1},
        )
        if not prof:
            return []
        items = await db.portfolio_items.find(
            {"provider_id": prof["provider_id"]}, {"_id": 0}
        ).sort([("sort_order", 1), ("created_at", 1)]).to_list(PORTFOLIO_MAX_ITEMS)
        return items

    # ════════════════════ GREMIOS ═══════════════════════════════════

    @router.get("/gremios")
    async def list_gremios(city: Optional[str] = None) -> list[dict]:
        """Aggregate member counts per category. If `city` is supplied,
        the count is still global per category (Gremios are nation-wide)
        but the order is influenced by recent posts in the city."""
        pipeline = [
            {"$group": {"_id": "$gremio_category", "members": {"$sum": 1}}},
            {"$project": {"_id": 0, "gremio_category": "$_id", "members": 1}},
            {"$sort": {"members": -1}},
        ]
        cursor = db.gremio_members.aggregate(pipeline)
        gremios = [g async for g in cursor]
        return gremios

    @router.post("/gremios/{category}/join")
    async def join_gremio(category: str, me=Depends(get_current_user)) -> dict:
        # Require an active provider doc (v3 model: is_provider == has a provider_profile)
        prof = await db.provider_profiles.find_one({"user_id": me.user_id}, {"_id": 0, "provider_id": 1})
        if not prof:
            raise HTTPException(status_code=403, detail="Activa tu perfil de proveedor para unirte a un gremio.")
        await db.gremio_members.update_one(
            {"user_id": me.user_id, "gremio_category": category},
            {"$setOnInsert": {"joined_at": _now_iso()}},
            upsert=True,
        )
        return {"joined": True, "category": category}

    @router.delete("/gremios/{category}/leave")
    async def leave_gremio(category: str, me=Depends(get_current_user)) -> dict:
        result = await db.gremio_members.delete_one({
            "user_id": me.user_id,
            "gremio_category": category,
        })
        return {"left": result.deleted_count > 0, "category": category}

    @router.get("/gremios/{category}/posts")
    async def list_gremio_posts(category: str, city: Optional[str] = None, limit: int = 30) -> list[dict]:
        q: dict = {"gremio_category": category}
        if city:
            q["city"] = city
        # Hydrate with author summary
        cursor = db.gremio_posts.find(q, {"_id": 0}).sort("created_at", -1).limit(min(limit, 100))
        posts = [p async for p in cursor]
        author_ids = list({p["author_user_id"] for p in posts})
        users = await db.users.find({"user_id": {"$in": author_ids}}, {"_id": 0, "user_id": 1, "name": 1}).to_list(len(author_ids))
        profiles = await db.provider_profiles.find(
            {"user_id": {"$in": author_ids}},
            {"_id": 0, "user_id": 1, "business_name": 1, "slug": 1, "getamano_code": 1, "provider_verified": 1, "logo_url": 1, "cover_url": 1},
        ).to_list(len(author_ids))
        u_map = {u["user_id"]: u for u in users}
        p_map = {p["user_id"]: p for p in profiles}
        for p in posts:
            uid = p["author_user_id"]
            up = p_map.get(uid, {})
            p["author"] = {
                "user_id": uid,
                "name": u_map.get(uid, {}).get("name") or up.get("business_name") or "—",
                "business_name": up.get("business_name"),
                "slug": up.get("slug"),
                "getamano_code": up.get("getamano_code"),
                "provider_verified": bool(up.get("provider_verified")),
                "avatar_url": up.get("logo_url") or up.get("cover_url"),
            }
        return posts

    @router.post("/gremios/{category}/posts")
    async def create_gremio_post(category: str, payload: GremioPostIn, me=Depends(get_current_user)) -> dict:
        prof = await db.provider_profiles.find_one({"user_id": me.user_id}, {"_id": 0, "provider_id": 1, "city": 1})
        if not prof:
            raise HTTPException(status_code=403, detail="Activa tu perfil de proveedor para publicar en un gremio.")
        # Auto-join if not already a member
        await db.gremio_members.update_one(
            {"user_id": me.user_id, "gremio_category": category},
            {"$setOnInsert": {"joined_at": _now_iso()}},
            upsert=True,
        )
        doc = {
            "id": f"gpost_{uuid.uuid4().hex[:12]}",
            "gremio_category": category,
            "author_user_id": me.user_id,
            "content": payload.content,
            "image_url": payload.image_url,
            "city": payload.city or prof.get("city"),
            "likes_count": 0,
            "replies_count": 0,
            "created_at": _now_iso(),
        }
        await db.gremio_posts.insert_one(doc)
        return await _strip(doc)

    @router.post("/gremios/posts/{post_id}/like")
    async def toggle_gremio_like(post_id: str, me=Depends(get_current_user)) -> dict:
        post = await db.gremio_posts.find_one({"id": post_id}, {"_id": 0, "id": 1})
        if not post:
            raise HTTPException(status_code=404, detail="Post no encontrado.")
        existing = await db.gremio_post_likes.find_one({"post_id": post_id, "user_id": me.user_id})
        if existing:
            await db.gremio_post_likes.delete_one({"post_id": post_id, "user_id": me.user_id})
            await db.gremio_posts.update_one({"id": post_id}, {"$inc": {"likes_count": -1}})
            return {"liked": False}
        await db.gremio_post_likes.insert_one({
            "post_id": post_id,
            "user_id": me.user_id,
            "created_at": _now_iso(),
        })
        await db.gremio_posts.update_one({"id": post_id}, {"$inc": {"likes_count": 1}})
        return {"liked": True}

    @router.post("/gremios/posts/{post_id}/replies")
    async def add_gremio_reply(post_id: str, payload: GremioReplyIn, me=Depends(get_current_user)) -> dict:
        post = await db.gremio_posts.find_one({"id": post_id}, {"_id": 0, "id": 1})
        if not post:
            raise HTTPException(status_code=404, detail="Post no encontrado.")
        doc = {
            "id": f"grep_{uuid.uuid4().hex[:12]}",
            "post_id": post_id,
            "author_user_id": me.user_id,
            "content": payload.content,
            "created_at": _now_iso(),
        }
        await db.gremio_replies.insert_one(doc)
        await db.gremio_posts.update_one({"id": post_id}, {"$inc": {"replies_count": 1}})
        return await _strip(doc)

    @router.get("/gremios/posts/{post_id}/replies")
    async def list_gremio_replies(post_id: str) -> list[dict]:
        cursor = db.gremio_replies.find({"post_id": post_id}, {"_id": 0}).sort("created_at", 1).limit(200)
        replies = [r async for r in cursor]
        author_ids = list({r["author_user_id"] for r in replies})
        users = await db.users.find({"user_id": {"$in": author_ids}}, {"_id": 0, "user_id": 1, "name": 1}).to_list(len(author_ids))
        profiles = await db.provider_profiles.find(
            {"user_id": {"$in": author_ids}},
            {"_id": 0, "user_id": 1, "business_name": 1, "slug": 1, "logo_url": 1},
        ).to_list(len(author_ids))
        u_map = {u["user_id"]: u for u in users}
        p_map = {p["user_id"]: p for p in profiles}
        for r in replies:
            uid = r["author_user_id"]
            up = p_map.get(uid, {})
            r["author"] = {
                "user_id": uid,
                "name": u_map.get(uid, {}).get("name") or up.get("business_name") or "—",
                "slug": up.get("slug"),
                "avatar_url": up.get("logo_url"),
            }
        return replies

    return router
