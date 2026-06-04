"""routes/likes.py — Provider likes (heart / favorite).

Section 95 (V19.5 refactor — extraction round 3).

The smallest, lowest-coupled extraction in the codebase: 2 endpoints,
zero models, zero custom helpers.

Endpoints:
  • POST /providers/{provider_id}/like         toggle (idempotent)
  • GET  /providers/{provider_id}/like-status  am I liking this provider?

`from __future__ import annotations` intentionally omitted (consistent
with the rest of round 2/3 extractions).
"""
from datetime import datetime, timezone
from typing import Any, Callable

from fastapi import APIRouter, Depends


def make_router(
    *,
    db: Any,
    User: Any,
    get_current_user: Callable[..., Any],
) -> APIRouter:
    router = APIRouter()

    @router.post("/providers/{provider_id}/like")
    async def toggle_like(provider_id: str, user: User = Depends(get_current_user)):  # type: ignore[valid-type]
        existing = await db.likes.find_one({"user_id": user.user_id, "provider_id": provider_id})
        if existing:
            await db.likes.delete_one({"user_id": user.user_id, "provider_id": provider_id})
            await db.provider_profiles.update_one({"provider_id": provider_id}, {"$inc": {"likes_count": -1}})
            return {"liked": False}
        await db.likes.insert_one({
            "user_id": user.user_id, "provider_id": provider_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        await db.provider_profiles.update_one({"provider_id": provider_id}, {"$inc": {"likes_count": 1}})
        return {"liked": True}

    @router.get("/providers/{provider_id}/like-status")
    async def like_status(provider_id: str, user: User = Depends(get_current_user)):  # type: ignore[valid-type]
        liked = bool(await db.likes.find_one({"user_id": user.user_id, "provider_id": provider_id}))
        return {"liked": liked}

    return router
