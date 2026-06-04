"""routes/ads.py — Sponsored ads (public + admin CRUD).

Section 94 (V19.4 refactor — extraction round 2).

Extracted from `server.py` (~60 LOC). Carries:

  • GET    /ads                       public list + impression tracking
  • POST   /ads/{ad_id}/click         click tracking
  • GET    /admin/ads                 admin list
  • POST   /admin/ads                 admin create
  • PUT    /admin/ads/{ad_id}         admin update
  • DELETE /admin/ads/{ad_id}         admin delete

`from __future__ import annotations` intentionally omitted — same
rationale as the other extracted routers.
"""
import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from fastapi import APIRouter, Depends


def make_router(
    *,
    db: Any,
    User: Any,
    require_admin: Callable[..., Any],
    AdIn: Any,
) -> APIRouter:
    router = APIRouter()

    def _fire_and_forget_impression(ad_id: str) -> None:
        """Bump the impression counter without blocking the response.
        We can't `await` here because the caller is iterating a sync
        list comprehension — instead we hop on the running loop."""
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(db.ads.update_one({"ad_id": ad_id}, {"$inc": {"impressions_count": 1}}))
        except Exception:  # noqa: BLE001
            pass

    @router.get("/ads")
    async def list_active_ads(category: Optional[str] = None, city: Optional[str] = None):
        q = {"is_active": True}
        items = await db.ads.find(q, {"_id": 0}).to_list(50)
        out = []
        for a in items:
            ct = a.get("category_target") or ""
            ci = a.get("city_target") or ""
            if ct and category and ct != category:
                continue
            if ci and city and ci.lower() != city.lower():
                continue
            out.append(a)
            _fire_and_forget_impression(a["ad_id"])
        return out

    @router.post("/ads/{ad_id}/click")
    async def track_ad_click(ad_id: str):
        await db.ads.update_one({"ad_id": ad_id}, {"$inc": {"clicks_count": 1}})
        return {"ok": True}

    @router.get("/admin/ads")
    async def admin_list_ads(_: User = Depends(require_admin)):  # type: ignore[valid-type]
        return await db.ads.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)

    @router.post("/admin/ads")
    async def admin_create_ad(payload: AdIn, admin: User = Depends(require_admin)):  # type: ignore[valid-type]
        doc = {
            "ad_id": f"ad_{uuid.uuid4().hex[:10]}",
            **payload.model_dump(),
            "impressions_count": 0, "clicks_count": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.ads.insert_one(doc)
        await db.audit_logs.insert_one({
            "log_id": f"log_{uuid.uuid4().hex[:10]}", "admin_id": admin.user_id,
            "action": "ad:create", "target": doc["ad_id"], "note": payload.headline,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        doc.pop("_id", None)
        return doc

    @router.put("/admin/ads/{ad_id}")
    async def admin_update_ad(ad_id: str, payload: AdIn, admin: User = Depends(require_admin)):  # type: ignore[valid-type]
        await db.ads.update_one({"ad_id": ad_id}, {"$set": payload.model_dump()})
        await db.audit_logs.insert_one({
            "log_id": f"log_{uuid.uuid4().hex[:10]}", "admin_id": admin.user_id,
            "action": "ad:update", "target": ad_id, "note": "",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"ok": True}

    @router.delete("/admin/ads/{ad_id}")
    async def admin_delete_ad(ad_id: str, admin: User = Depends(require_admin)):  # type: ignore[valid-type]
        await db.ads.delete_one({"ad_id": ad_id})
        await db.audit_logs.insert_one({
            "log_id": f"log_{uuid.uuid4().hex[:10]}", "admin_id": admin.user_id,
            "action": "ad:delete", "target": ad_id, "note": "",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"ok": True}

    return router
