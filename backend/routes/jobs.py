"""
Jobs / Chambas module — Section 30 extracted from server.py.

Holds the gigs marketplace endpoints:
  - GET    /gigs                       (public list, filters)
  - GET    /gigs/{gig_id}              (public detail)
  - POST   /gigs                       (client posts a new gig)
  - POST   /gigs/{gig_id}/close        (owner closes)
  - POST   /gigs/{gig_id}/apply        (provider applies)
  - GET    /gigs/{gig_id}/applications (owner views applicants)
  - GET    /me/gigs                    (gigs I posted)
  - GET    /me/gig-applications        (gigs I applied to)

Plus two helpers that fan out notifications when activity happens:
  _fanout_new_gig_notifications  — pings matching providers about new gigs
  _notify_gig_owner_new_applicant — pings the gig owner when someone applies

Wired in server.py via `make_router(db=db, audit_log=..., get_current_user=...)`.
"""
from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone, timedelta
from types import SimpleNamespace
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from pymongo.errors import DuplicateKeyError

logger = logging.getLogger(__name__)

GIG_TITLE_MIN_LEN = 6
GIG_DESC_MIN_LEN = 20
GIG_APPLICATION_MSG_MIN_LEN = 20
GIG_TTL_DAYS = 30
GIG_FANOUT_CAP = 200
GIG_BANNED_TITLE_WORDS = r"\b(test|qa|asdf)\b"


# ─── Pydantic models ───────────────────────────────────────────────────
class GigIn(BaseModel):
    title: str
    description: str
    category: str            # ES canonical (e.g. "Limpieza"), drives discovery
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None
    city: Optional[str] = None
    state: Optional[str] = None
    is_urgent: Optional[bool] = False


class GigApplicationIn(BaseModel):
    message: str
    proposed_price: Optional[float] = None


# ─── Pure helpers ──────────────────────────────────────────────────────
def _gig_public(g: dict) -> dict:
    """Strip Mongo internals + denormalised fields before returning to clients."""
    return {k: v for k, v in g.items() if k not in ("_id", "expires_at_native")}


def _validate_gig_payload(payload: GigIn) -> tuple[str, str]:
    """Return cleaned (title, description) or raise HTTPException."""
    title = (payload.title or "").strip()
    desc = (payload.description or "").strip()
    if len(title) < GIG_TITLE_MIN_LEN:
        raise HTTPException(status_code=400, detail="El título debe tener al menos 6 caracteres.")
    if len(desc) < GIG_DESC_MIN_LEN:
        raise HTTPException(status_code=400, detail="Describe la chamba con al menos 20 caracteres.")
    if re.search(GIG_BANNED_TITLE_WORDS, title.lower()):
        raise HTTPException(status_code=400, detail="Título no válido.")
    mn, mx = payload.budget_min, payload.budget_max
    if (mn is not None and mn < 0) or (mx is not None and mx < 0):
        raise HTTPException(status_code=400, detail="El presupuesto no puede ser negativo.")
    if mn is not None and mx is not None and mn > mx:
        raise HTTPException(status_code=400, detail="El presupuesto mínimo no puede ser mayor que el máximo.")
    return title, desc


def _build_list_query(category: Optional[str], city: Optional[str], state: Optional[str]) -> dict:
    """Build the Mongo query for the public gigs feed."""
    q: dict = {"status": "open"}
    if category:
        q["category"] = {"$regex": f"^{re.escape(category)}$", "$options": "i"}
    if city:
        q["city"] = {"$regex": f"^{re.escape(city)}$", "$options": "i"}
    if state:
        q["state"] = {"$regex": f"^{re.escape(state)}$", "$options": "i"}
    return q


async def _attach_applicant_counts(db, docs: list[dict]) -> None:
    if not docs:
        return
    gig_ids = [d["gig_id"] for d in docs]
    pipe = [
        {"$match": {"gig_id": {"$in": gig_ids}}},
        {"$group": {"_id": "$gig_id", "count": {"$sum": 1}}},
    ]
    counts = {row["_id"]: row["count"] async for row in db.gig_applications.aggregate(pipe)}
    for d in docs:
        d["applicant_count"] = counts.get(d["gig_id"], 0)


# ─── Notification fan-out ──────────────────────────────────────────────
async def _resolve_category_id_by_name(db, category: str) -> Optional[str]:
    cat = await db.categories.find_one(
        {"$or": [
            {"name_es": {"$regex": f"^{re.escape(category)}$", "$options": "i"}},
            {"name_en": {"$regex": f"^{re.escape(category)}$", "$options": "i"}},
        ]},
        {"_id": 0, "category_id": 1},
    )
    return cat.get("category_id") if cat else None


async def _fanout_new_gig_notifications(db, gig: dict) -> int:
    """Section 30 — Notify nearby/in-category providers about a new chamba.

    Idempotent: notification_key includes the gig_id so re-running won't double-insert.
    """
    try:
        gig_id = gig.get("gig_id")
        category = (gig.get("category") or "").strip()
        if not gig_id or not category:
            return 0
        category_id = await _resolve_category_id_by_name(db, category)
        if not category_id:
            return 0
        match = {
            "category_id": category_id,
            "is_active": True,
            "verification_status": "approved",
            "user_id": {"$ne": gig.get("created_by")},
            "business_name": {"$not": {"$regex": "^TEST_"}},
        }
        gig_city = (gig.get("city") or "").strip()
        if gig_city:
            match["city"] = {"$regex": f"^{re.escape(gig_city)}$", "$options": "i"}
        targets = await db.provider_profiles.find(
            match, {"_id": 0, "user_id": 1},
        ).limit(GIG_FANOUT_CAP).to_list(GIG_FANOUT_CAP)
        if not targets:
            return 0
        return await _insert_gig_fanout_notifications(db, gig, targets, category, gig_city)
    except Exception as e:
        logger.warning("_fanout_new_gig_notifications failed: %s", e)
        return 0


async def _insert_gig_fanout_notifications(
    db, gig: dict, targets: list[dict], category: str, gig_city: str,
) -> int:
    city_label = gig_city or "tu zona"
    title_es = f"💼 Nueva chamba en {city_label}"
    body_es = f"{category} · {gig.get('title', '')[:80]}"
    now_iso = datetime.now(timezone.utc).isoformat()
    inserted = 0
    for tgt in targets:
        user_id = tgt.get("user_id")
        if not user_id:
            continue
        key = f"{user_id}::new_gig::{gig['gig_id']}"
        existing = await db.notifications.find_one({"notification_key": key}, {"_id": 0})
        if existing:
            continue
        await db.notifications.insert_one({
            "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
            "notification_key": key,
            "user_id": user_id,
            "role": "provider",
            "category": "gigs",
            "title": title_es,
            "body": body_es,
            "cta_label": "Ver chamba",
            "cta_url": "/empleos",
            "icon": "trophy",
            "priority": "high" if gig.get("is_urgent") else "medium",
            "is_read": False,
            "dismissed_at": None,
            "created_at": now_iso,
        })
        inserted += 1
    return inserted


async def _notify_gig_owner_new_applicant(db, gig: dict, applicant_profile: Optional[dict]) -> bool:
    """Section 30 — Ping the gig owner when a new provider applies."""
    try:
        gig_id = gig.get("gig_id")
        owner_id = gig.get("created_by")
        if not gig_id or not owner_id:
            return False
        biz = (applicant_profile or {}).get("business_name") or "Un proveedor"
        key = f"{owner_id}::gig_applicant::{gig_id}"
        count = await db.gig_applications.count_documents({"gig_id": gig_id})
        title_short = gig.get("title", "")[:60]
        body = (
            f"{biz} aplicó a “{title_short}”" if count <= 1
            else f"{count} aplicantes en tu chamba “{title_short[:50]}”"
        )
        now_iso = datetime.now(timezone.utc).isoformat()
        existing = await db.notifications.find_one({"notification_key": key}, {"_id": 0})
        if existing:
            await db.notifications.update_one(
                {"notification_key": key},
                {"$set": {"body": body, "is_read": False, "updated_at": now_iso}},
            )
        else:
            await db.notifications.insert_one({
                "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
                "notification_key": key,
                "user_id": owner_id,
                "role": "client",
                "category": "gigs",
                "title": "🙋 Nuevo aplicante a tu chamba",
                "body": body,
                "cta_label": "Ver aplicaciones",
                "cta_url": "/empleos",
                "icon": "inbox",
                "priority": "high",
                "is_read": False,
                "dismissed_at": None,
                "created_at": now_iso,
            })
        return True
    except Exception as e:
        logger.warning("_notify_gig_owner_new_applicant failed: %s", e)
        return False


# ─── Handler bodies ────────────────────────────────────────────────────
async def _do_list_gigs(deps, category: Optional[str], city: Optional[str],
                        state: Optional[str], limit: int) -> list[dict]:
    q = _build_list_query(category, city, state)
    docs = await deps.db.gigs.find(q, {"_id": 0, "expires_at_native": 0}) \
        .sort([("is_urgent", -1), ("created_at", -1)]) \
        .limit(max(1, min(limit, 100))).to_list(100)
    await _attach_applicant_counts(deps.db, docs)
    return docs


async def _do_get_gig(deps, gig_id: str) -> dict:
    g = await deps.db.gigs.find_one({"gig_id": gig_id}, {"_id": 0, "expires_at_native": 0})
    if not g:
        raise HTTPException(status_code=404, detail="Chamba no encontrada.")
    # Anonymize the poster identity for the public view
    if g.get("posted_by_name"):
        g["posted_by_display"] = g["posted_by_name"].split()[0] if " " in g["posted_by_name"] else g["posted_by_name"]
    g["applicant_count"] = await deps.db.gig_applications.count_documents({"gig_id": gig_id})
    return g


async def _do_create_gig(deps, payload: GigIn, request: Request, user) -> dict:
    title, desc = _validate_gig_payload(payload)
    now = datetime.now(timezone.utc)
    gig_id = f"gig_{uuid.uuid4().hex[:12]}"
    expires = now + timedelta(days=GIG_TTL_DAYS)
    doc = {
        "gig_id": gig_id,
        "title": title,
        "description": desc,
        "category": (payload.category or "").strip() or "Otros",
        "budget_min": payload.budget_min,
        "budget_max": payload.budget_max,
        "city": (payload.city or "").strip() or None,
        "state": (payload.state or "").strip() or None,
        "is_urgent": bool(payload.is_urgent),
        "status": "open",
        "created_by": user.user_id,
        "posted_by_name": user.name or user.email,
        "created_at": now.isoformat(),
        "expires_at_native": expires,
        "expires_at": expires.isoformat(),
    }
    await deps.db.gigs.insert_one(doc)
    await deps.audit_log(user.user_id, "gig.created", {"gig_id": gig_id, "category": doc["category"]}, request)
    fanout = await _fanout_new_gig_notifications(deps.db, doc)
    if fanout:
        logger.info("gig %s: fanout notified %d providers", gig_id, fanout)
    return _gig_public(doc)


async def _do_close_gig(deps, gig_id: str, request: Request, user) -> dict:
    g = await deps.db.gigs.find_one({"gig_id": gig_id}, {"_id": 0, "created_by": 1, "status": 1})
    if not g:
        raise HTTPException(status_code=404, detail="Chamba no encontrada.")
    if g["created_by"] != user.user_id and user.role != "admin":
        raise HTTPException(status_code=403, detail="No puedes cerrar esta chamba.")
    if g.get("status") != "open":
        return {"ok": True, "already_closed": True}
    await deps.db.gigs.update_one(
        {"gig_id": gig_id},
        {"$set": {"status": "closed", "closed_at": datetime.now(timezone.utc).isoformat()}},
    )
    await deps.audit_log(user.user_id, "gig.closed", {"gig_id": gig_id}, request)
    return {"ok": True}


async def _do_apply_to_gig(deps, gig_id: str, payload: GigApplicationIn,
                           request: Request, user) -> dict:
    if user.role != "provider":
        raise HTTPException(status_code=403, detail="Solo proveedores pueden aplicar a chambas.")
    msg = (payload.message or "").strip()
    if len(msg) < GIG_APPLICATION_MSG_MIN_LEN:
        raise HTTPException(status_code=400, detail="Tu mensaje debe tener al menos 20 caracteres.")
    g = await deps.db.gigs.find_one({"gig_id": gig_id}, {"_id": 0, "status": 1, "created_by": 1})
    if not g:
        raise HTTPException(status_code=404, detail="Chamba no encontrada.")
    if g.get("status") != "open":
        raise HTTPException(status_code=400, detail="Esta chamba ya no está abierta.")
    if g.get("created_by") == user.user_id:
        raise HTTPException(status_code=400, detail="No puedes aplicar a tu propia chamba.")

    profile = await deps.db.provider_profiles.find_one(
        {"user_id": user.user_id},
        {"_id": 0, "provider_id": 1, "business_name": 1, "slug": 1},
    )
    now = datetime.now(timezone.utc).isoformat()
    try:
        await deps.db.gig_applications.insert_one({
            "application_id": f"gigapp_{uuid.uuid4().hex[:12]}",
            "gig_id": gig_id,
            "provider_id": user.user_id,
            "provider_business_name": profile.get("business_name") if profile else (user.name or "Proveedor"),
            "provider_slug": profile.get("slug") if profile else None,
            "message": msg,
            "proposed_price": payload.proposed_price,
            "status": "pending",
            "created_at": now,
        })
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail="Ya aplicaste a esta chamba.")
    await deps.audit_log(user.user_id, "gig.application_sent", {"gig_id": gig_id}, request)
    full_gig = await deps.db.gigs.find_one({"gig_id": gig_id}, {"_id": 0})
    if full_gig:
        await _notify_gig_owner_new_applicant(deps.db, full_gig, profile)
    return {"ok": True, "applied_at": now}


async def _do_list_gig_applications(deps, gig_id: str, user) -> list[dict]:
    g = await deps.db.gigs.find_one({"gig_id": gig_id}, {"_id": 0, "created_by": 1})
    if not g:
        raise HTTPException(status_code=404, detail="Chamba no encontrada.")
    if g["created_by"] != user.user_id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Solo el dueño puede ver las aplicaciones.")
    return await deps.db.gig_applications.find(
        {"gig_id": gig_id}, {"_id": 0},
    ).sort("created_at", -1).to_list(200)


async def _do_my_gigs(deps, user) -> list[dict]:
    return await deps.db.gigs.find(
        {"created_by": user.user_id}, {"_id": 0, "expires_at_native": 0},
    ).sort("created_at", -1).to_list(50)


async def _do_my_gig_applications(deps, user) -> list[dict]:
    apps = await deps.db.gig_applications.find(
        {"provider_id": user.user_id}, {"_id": 0},
    ).sort("created_at", -1).to_list(100)
    if apps:
        gig_ids = [a["gig_id"] for a in apps]
        gigs_by_id = {
            g["gig_id"]: g for g in await deps.db.gigs.find(
                {"gig_id": {"$in": gig_ids}}, {"_id": 0, "expires_at_native": 0},
            ).to_list(200)
        }
        for a in apps:
            a["gig"] = gigs_by_id.get(a["gig_id"])
    return apps


# ─── Router factory ────────────────────────────────────────────────────
def make_router(*, db, audit_log, get_current_user) -> APIRouter:
    deps = SimpleNamespace(db=db, audit_log=audit_log)
    router = APIRouter(tags=["jobs"])

    @router.get("/gigs")
    async def list_gigs(
        category: Optional[str] = None,
        city: Optional[str] = None,
        state: Optional[str] = None,
        limit: int = 24,
    ):
        return await _do_list_gigs(deps, category, city, state, limit)

    @router.get("/gigs/{gig_id}")
    async def get_gig(gig_id: str):
        return await _do_get_gig(deps, gig_id)

    @router.post("/gigs")
    async def create_gig(payload: GigIn, request: Request, user=Depends(get_current_user)):
        return await _do_create_gig(deps, payload, request, user)

    @router.post("/gigs/{gig_id}/close")
    async def close_gig(gig_id: str, request: Request, user=Depends(get_current_user)):
        return await _do_close_gig(deps, gig_id, request, user)

    @router.post("/gigs/{gig_id}/apply")
    async def apply_to_gig(gig_id: str, payload: GigApplicationIn,
                           request: Request, user=Depends(get_current_user)):
        return await _do_apply_to_gig(deps, gig_id, payload, request, user)

    @router.get("/gigs/{gig_id}/applications")
    async def list_gig_applications(gig_id: str, user=Depends(get_current_user)):
        return await _do_list_gig_applications(deps, gig_id, user)

    @router.get("/me/gigs")
    async def my_gigs(user=Depends(get_current_user)):
        return await _do_my_gigs(deps, user)

    @router.get("/me/gig-applications")
    async def my_gig_applications(user=Depends(get_current_user)):
        return await _do_my_gig_applications(deps, user)

    return router
