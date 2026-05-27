"""
Banners module — Section 68 refactor.

All `/api/banners/*` endpoints extracted from server.py. Provides the
public banner gallery, banner-of-the-week hero pick, publish/unpublish,
like toggle, and view counter. Image generation lives elsewhere
(server.py `/providers/me/generate-banner`); this module only manages
the *published* banner_shares collection.

Endpoints (all `/api/banners/*`):
  GET    /banners/banner-of-the-week
  POST   /banners/publish                  (auth: provider)
  GET    /banners/public                   (filter + paginated)
  GET    /banners/me                       (auth: provider)
  DELETE /banners/{share_id}               (auth: owner or admin)
  POST   /banners/{share_id}/like          (auth)
  GET    /banners/{share_id}/like-state    (auth)
  POST   /banners/{share_id}/view          (public)
"""

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field


class BannerPublishIn(BaseModel):
    image_url: str = Field(..., min_length=4, max_length=600)
    style: Literal["modern", "festive", "professional", "minimal", "warm"]
    color: str = Field(..., min_length=4, max_length=9)
    keywords: Optional[str] = Field(default=None, max_length=200)


def make_router(*, db, User, get_current_user) -> APIRouter:
    router = APIRouter()

    @router.get("/banners/banner-of-the-week")
    async def banner_of_the_week():
        """Most-liked public banner from the last 7 days (with all-time fallback)."""
        week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        pipeline = [
            {"$match": {"is_public": True, "created_at": {"$gte": week_ago}, "likes": {"$gt": 0}}},
            {"$sort": {"likes": -1, "created_at": -1}},
            {"$limit": 1},
            {"$project": {"_id": 0}},
        ]
        rows = await db.banner_shares.aggregate(pipeline).to_list(1)
        if not rows:
            rows = await db.banner_shares.find(
                {"is_public": True},
                {"_id": 0},
            ).sort([("likes", -1), ("created_at", -1)]).limit(1).to_list(1)
        if not rows:
            return None
        return rows[0]

    @router.post("/banners/publish")
    async def publish_banner(payload: BannerPublishIn, user: User = Depends(get_current_user)):
        if user.role != "provider":
            raise HTTPException(status_code=403, detail="Solo proveedores pueden publicar banners.")
        profile = await db.provider_profiles.find_one(
            {"user_id": user.user_id},
            {"_id": 0, "provider_id": 1, "slug": 1, "business_name": 1, "logo_url": 1,
             "category_id": 1, "city": 1, "state": 1, "verification_status": 1, "plan": 1},
        )
        if not profile:
            raise HTTPException(status_code=404, detail="Sin perfil de proveedor.")

        # Cap at 5 published banners per provider — auto-evict oldest non-pinned
        existing_count = await db.banner_shares.count_documents({"provider_id": profile["provider_id"]})
        if existing_count >= 5:
            oldest = await db.banner_shares.find_one(
                {"provider_id": profile["provider_id"], "pinned": {"$ne": True}},
                {"_id": 0, "share_id": 1},
                sort=[("created_at", 1)],
            )
            if oldest:
                await db.banner_shares.delete_one({"share_id": oldest["share_id"]})
                await db.banner_likes.delete_many({"share_id": oldest["share_id"]})

        now_iso = datetime.now(timezone.utc).isoformat()
        share_id = f"bsh_{uuid.uuid4().hex[:12]}"
        doc = {
            "share_id": share_id,
            "provider_id": profile["provider_id"],
            "provider_user_id": user.user_id,
            "provider_slug": profile.get("slug"),
            "business_name": profile.get("business_name"),
            "logo_url": profile.get("logo_url"),
            "category_id": profile.get("category_id"),
            "city": profile.get("city"),
            "state": profile.get("state"),
            "verified": profile.get("verification_status") == "approved",
            "plan": profile.get("plan") or "free",
            "image_url": payload.image_url,
            "style": payload.style,
            "color": payload.color,
            "keywords": payload.keywords,
            "likes": 0,
            "views": 0,
            "is_public": True,
            "pinned": False,
            "created_at": now_iso,
        }
        await db.banner_shares.insert_one(doc)
        return {k: v for k, v in doc.items() if k != "_id"}

    @router.get("/banners/public")
    async def list_public_banners(
        style: Optional[Literal["modern", "festive", "professional", "minimal", "warm"]] = None,
        sort: Literal["popular", "recent"] = "popular",
        limit: int = 24,
        offset: int = 0,
    ):
        limit = max(1, min(60, limit))
        offset = max(0, offset)
        query: dict = {"is_public": True}
        if style:
            query["style"] = style
        if sort == "popular":
            cursor = db.banner_shares.find(query, {"_id": 0}).sort([("pinned", -1), ("likes", -1), ("created_at", -1)])
        else:
            cursor = db.banner_shares.find(query, {"_id": 0}).sort([("created_at", -1)])
        rows = await cursor.skip(offset).limit(limit).to_list(limit)
        return {
            "items": rows,
            "limit": limit,
            "offset": offset,
            "next_offset": offset + len(rows) if len(rows) == limit else None,
        }

    @router.get("/banners/me")
    async def my_published_banners(user: User = Depends(get_current_user)):
        if user.role != "provider":
            return []
        rows = await db.banner_shares.find(
            {"provider_user_id": user.user_id},
            {"_id": 0},
        ).sort("created_at", -1).to_list(20)
        return rows

    @router.delete("/banners/{share_id}")
    async def unpublish_banner(share_id: str, user: User = Depends(get_current_user)):
        existing = await db.banner_shares.find_one({"share_id": share_id}, {"_id": 0, "provider_user_id": 1})
        if not existing:
            raise HTTPException(status_code=404, detail="Banner no encontrado.")
        if user.role != "admin" and existing["provider_user_id"] != user.user_id:
            raise HTTPException(status_code=403, detail="No puedes eliminar este banner.")
        await db.banner_shares.delete_one({"share_id": share_id})
        await db.banner_likes.delete_many({"share_id": share_id})
        return {"ok": True}

    @router.post("/banners/{share_id}/like")
    async def toggle_banner_like(share_id: str, user: User = Depends(get_current_user)):
        banner = await db.banner_shares.find_one({"share_id": share_id}, {"_id": 0, "provider_user_id": 1, "is_public": 1})
        if not banner or not banner.get("is_public"):
            raise HTTPException(status_code=404, detail="Banner no encontrado o no es público.")
        if banner["provider_user_id"] == user.user_id:
            raise HTTPException(status_code=400, detail="No puedes dar like a tu propio banner.")
        existing = await db.banner_likes.find_one({"share_id": share_id, "user_id": user.user_id}, {"_id": 0})
        if existing:
            await db.banner_likes.delete_one({"share_id": share_id, "user_id": user.user_id})
            await db.banner_shares.update_one({"share_id": share_id}, {"$inc": {"likes": -1}})
            liked = False
        else:
            await db.banner_likes.insert_one({
                "share_id": share_id,
                "user_id": user.user_id,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            await db.banner_shares.update_one({"share_id": share_id}, {"$inc": {"likes": 1}})
            liked = True
        fresh = await db.banner_shares.find_one({"share_id": share_id}, {"_id": 0, "likes": 1})
        return {"liked": liked, "likes": (fresh or {}).get("likes", 0)}

    @router.get("/banners/{share_id}/like-state")
    async def get_banner_like_state(share_id: str, user: User = Depends(get_current_user)):
        existing = await db.banner_likes.find_one(
            {"share_id": share_id, "user_id": user.user_id},
            {"_id": 0},
        )
        return {"liked": bool(existing)}

    @router.post("/banners/{share_id}/view")
    async def track_banner_view(share_id: str):
        """Fire-and-forget public view counter. No auth required."""
        await db.banner_shares.update_one(
            {"share_id": share_id, "is_public": True},
            {"$inc": {"views": 1}},
        )
        return {"ok": True}

    return router
