"""routes/admin_catalog.py — admin CRUD for categories, cities and audit log.

Section 91 (V19.3 refactor — extraction round 2).

Extracted from `server.py` lines 2276-2358 (~85 LOC). All endpoints are
admin-only except the public `GET /cities` listing.

Endpoints:
  • POST   /admin/categories              create
  • PUT    /admin/categories/{id}         update
  • DELETE /admin/categories/{id}         delete (refuses if used)
  • GET    /admin/cities                  list
  • POST   /admin/cities                  create
  • DELETE /admin/cities/{id}             delete
  • GET    /cities                        public featured list
  • GET    /admin/audit-log               recent audit entries

Note: `from __future__ import annotations` is intentionally omitted —
FastAPI inspects type hints via `get_type_hints()` at endpoint registration
and runtime closure variables like CategoryIn / CityIn must be evaluated
eagerly (string annotations defer evaluation to module namespace which
doesn't contain these factory-injected models).
"""
import uuid
from datetime import datetime, timezone
from typing import Any, Callable

from fastapi import APIRouter, Depends, HTTPException


def make_router(
    *,
    db: Any,
    User: Any,
    require_admin: Callable[..., Any],
    CategoryIn: Any,
    CityIn: Any,
) -> APIRouter:
    router = APIRouter()

    # ─── Categories ─────────────────────────────────────────────────
    @router.post("/admin/categories")
    async def admin_create_category(payload: CategoryIn, admin: User = Depends(require_admin)):  # type: ignore[valid-type]
        if await db.categories.find_one({"slug": payload.slug}):
            raise HTTPException(status_code=400, detail="Slug already exists")
        doc = {"category_id": f"cat_{uuid.uuid4().hex[:10]}", **payload.model_dump()}
        await db.categories.insert_one(doc)
        await db.audit_logs.insert_one({
            "log_id": f"log_{uuid.uuid4().hex[:10]}", "admin_id": admin.user_id,
            "action": "category:create", "target": doc["category_id"], "note": payload.slug,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        doc.pop("_id", None)
        return doc

    @router.put("/admin/categories/{category_id}")
    async def admin_update_category(category_id: str, payload: CategoryIn, admin: User = Depends(require_admin)):  # type: ignore[valid-type]
        result = await db.categories.update_one({"category_id": category_id}, {"$set": payload.model_dump()})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Not found")
        await db.audit_logs.insert_one({
            "log_id": f"log_{uuid.uuid4().hex[:10]}", "admin_id": admin.user_id,
            "action": "category:update", "target": category_id, "note": payload.slug,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"ok": True}

    @router.delete("/admin/categories/{category_id}")
    async def admin_delete_category(category_id: str, admin: User = Depends(require_admin)):  # type: ignore[valid-type]
        used = await db.provider_profiles.count_documents({"category_id": category_id})
        if used > 0:
            raise HTTPException(status_code=400, detail=f"Used by {used} providers")
        await db.categories.delete_one({"category_id": category_id})
        await db.audit_logs.insert_one({
            "log_id": f"log_{uuid.uuid4().hex[:10]}", "admin_id": admin.user_id,
            "action": "category:delete", "target": category_id, "note": "",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"ok": True}

    # ─── Cities ─────────────────────────────────────────────────────
    @router.get("/admin/cities")
    async def admin_list_cities(_: User = Depends(require_admin)):  # type: ignore[valid-type]
        cities = await db.cities.find({}, {"_id": 0}).sort("featured", -1).to_list(500)
        return cities

    @router.post("/admin/cities")
    async def admin_create_city(payload: CityIn, admin: User = Depends(require_admin)):  # type: ignore[valid-type]
        existing = await db.cities.find_one({"name": payload.name, "state": payload.state})
        if existing:
            raise HTTPException(status_code=400, detail="City already exists")
        doc = {"city_id": f"city_{uuid.uuid4().hex[:10]}", **payload.model_dump()}
        await db.cities.insert_one(doc)
        await db.audit_logs.insert_one({
            "log_id": f"log_{uuid.uuid4().hex[:10]}", "admin_id": admin.user_id,
            "action": "city:create", "target": doc["city_id"], "note": f"{payload.name}, {payload.state}",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        doc.pop("_id", None)
        return doc

    @router.delete("/admin/cities/{city_id}")
    async def admin_delete_city(city_id: str, admin: User = Depends(require_admin)):  # type: ignore[valid-type]
        await db.cities.delete_one({"city_id": city_id})
        await db.audit_logs.insert_one({
            "log_id": f"log_{uuid.uuid4().hex[:10]}", "admin_id": admin.user_id,
            "action": "city:delete", "target": city_id, "note": "",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"ok": True}

    @router.get("/cities")
    async def public_cities():
        return await db.cities.find({"featured": True}, {"_id": 0}).limit(50).to_list(50)

    # ─── Audit log ──────────────────────────────────────────────────
    @router.get("/admin/audit-log")
    async def admin_audit_log(limit: int = 100, _: User = Depends(require_admin)):  # type: ignore[valid-type]
        logs = await db.audit_logs.find({}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
        admin_ids = list({log["admin_id"] for log in logs})
        admins = {u["user_id"]: u for u in await db.users.find({"user_id": {"$in": admin_ids}}, {"_id": 0, "user_id": 1, "name": 1, "email": 1}).to_list(100)}
        for log in logs:
            log["admin"] = admins.get(log["admin_id"])
        return logs

    return router
