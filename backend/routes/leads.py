"""
Leads / Service-Requests router — Section 89 v4 Phase G + refactor (Phase H).

Extracted from `server.py` to keep the monolithic file smaller and
cluster the V4 Lead Pipeline logic in one place. The shape of every
endpoint is preserved exactly so existing frontend / mobile / curl
consumers continue to work without changes.

Endpoints
---------
  POST   /api/service-requests                       — client → provider
  GET    /api/service-requests                       — both sides see their items
  PUT    /api/service-requests/{request_id}/status   — provider transitions
  GET    /api/leads/pipeline                         — provider Kanban summary
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

logger = logging.getLogger(__name__)

PIPELINE_STATUSES = ["new", "contacted", "quoted", "won", "lost"]
LEGACY_STATUS_MAP = {
    "pending": "new", "accepted": "quoted", "declined": "lost", "completed": "won",
}


def make_router(
    *,
    db: Any,
    User: type,
    ServiceRequestIn: type,
    ServiceRequestStatusIn: type,
    get_current_user: Any,
    send_sms: Any,
) -> APIRouter:
    router = APIRouter()

    @router.post("/service-requests")
    async def create_service_request(
        payload: ServiceRequestIn, user: User = Depends(get_current_user)
    ):
        provider = await db.provider_profiles.find_one(
            {"provider_id": payload.provider_id}, {"_id": 0}
        )
        if not provider:
            raise HTTPException(status_code=404, detail="Provider not found")
        if provider["user_id"] == user.user_id:
            raise HTTPException(status_code=400, detail="Cannot request from yourself")
        now = datetime.now(timezone.utc).isoformat()
        req = {
            "request_id": f"req_{uuid.uuid4().hex[:12]}",
            "client_id": user.user_id,
            "client_name": user.name,
            "client_phone": payload.contact_phone or user.phone or "",
            "provider_id": payload.provider_id,
            "provider_user_id": provider["user_id"],
            "business_name": provider["business_name"],
            "slug": provider["slug"],
            "message": payload.message,
            "service_type": payload.service_type or "",
            "preferred_date": payload.preferred_date or "",
            "status": "new",  # Section 89 v4 Phase G — pipeline default
            "created_at": now,
            "updated_at": now,
        }
        await db.service_requests.insert_one(req)
        await db.provider_profiles.update_one(
            {"provider_id": payload.provider_id}, {"$inc": {"contact_clicks": 1}}
        )

        # SMS notify provider
        prov_user = await db.users.find_one(
            {"user_id": provider["user_id"]}, {"_id": 0}
        )
        if prov_user and prov_user.get("phone"):
            send_sms(
                prov_user["phone"],
                f"[getamano] Nueva solicitud de cotización de {user.name}: {payload.message[:120]}",
                event="new_quote_request",
            )

        # Section 89 v4 Phase C — Web Push to provider
        try:
            from routes.push import send_push_to_user
            await send_push_to_user(db, provider["user_id"], {
                "title": "Nueva solicitud de cotización",
                "body": f"{user.name}: {(payload.message or '')[:120]}",
                "icon": "/getamano-logo-mark.png",
                "url": "/dashboard/provider?tab=solicitudes",
                "tag": f"quote_{req['request_id']}",
            })
        except Exception as _e:
            logger.warning(f"push send_push (service_request) failed: {_e}")

        req.pop("_id", None)
        return req

    @router.get("/service-requests")
    async def list_service_requests(user: User = Depends(get_current_user)):
        q = {"$or": [{"client_id": user.user_id}, {"provider_user_id": user.user_id}]}
        return await db.service_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)

    @router.put("/service-requests/{request_id}/status")
    async def update_request_status(
        request_id: str,
        payload: ServiceRequestStatusIn,
        user: User = Depends(get_current_user),
    ):
        req = await db.service_requests.find_one({"request_id": request_id}, {"_id": 0})
        if not req:
            raise HTTPException(status_code=404, detail="Not found")
        if req["provider_user_id"] != user.user_id:
            raise HTTPException(status_code=403, detail="Only the provider can change status")
        new_status = LEGACY_STATUS_MAP.get(payload.status, payload.status)
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.service_requests.update_one(
            {"request_id": request_id},
            {"$set": {"status": new_status, "status_updated_at": now_iso, "updated_at": now_iso}},
        )

        client_user = await db.users.find_one({"user_id": req["client_id"]}, {"_id": 0})
        if client_user and client_user.get("phone"):
            label = {
                "contacted": "te contactó por", "quoted": "envió cotización para",
                "won": "confirmó", "lost": "cerró",
            }.get(new_status)
            if label:
                send_sms(
                    client_user["phone"],
                    f"[getamano] {req['business_name']} {label} tu solicitud.",
                    event=f"request_{new_status}",
                )
        return {"ok": True, "status": new_status}

    @router.get("/leads/pipeline")
    async def lead_pipeline(user: User = Depends(get_current_user)):
        rows = await db.service_requests.find(
            {"provider_user_id": user.user_id}, {"_id": 0},
        ).sort("created_at", -1).limit(500).to_list(500)
        for r in rows:
            r["pipeline_status"] = LEGACY_STATUS_MAP.get(
                r.get("status"), r.get("status") or "new"
            )
            for f in ("created_at", "updated_at", "status_updated_at"):
                v = r.get(f)
                if isinstance(v, datetime):
                    r[f] = v.isoformat()
        buckets = {s: [] for s in PIPELINE_STATUSES}
        for r in rows:
            buckets.setdefault(r["pipeline_status"], []).append(r)
        counts = {s: len(buckets.get(s, [])) for s in PIPELINE_STATUSES}
        return {
            "counts": counts,
            "buckets": buckets,
            "total": sum(counts.values()),
            "won_value_estimate_usd": 0,
        }

    return router
