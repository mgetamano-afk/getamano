"""routes/admin_providers.py — admin operations on provider profiles.

Section 93 (V19.4 refactor — extraction round 2).

Extracted from `server.py` (admin/providers endpoints + verify with SMS
notification side-effect + stats + PATCH override). ~80 LOC consolidated.

Endpoints:
  • GET   /admin/providers                    list (optional status filter)
  • POST  /admin/providers/{id}/verify        flip verification_status + SMS notify
  • GET   /admin/stats                        platform-wide counts
  • PATCH /admin/providers/{id}               admin override edit

`from __future__ import annotations` intentionally omitted — same
rationale as routes/admin_catalog.py and routes/messages.py: FastAPI
needs to resolve closure-captured Pydantic models at endpoint
registration via `get_type_hints()`.
"""
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from fastapi import APIRouter, Depends, HTTPException


def make_router(
    *,
    db: Any,
    User: Any,
    require_admin: Callable[..., Any],
    VerificationActionIn: Any,
    AdminProviderEditIn: Any,
    send_sms: Callable[..., Any],
) -> APIRouter:
    router = APIRouter()

    @router.get("/admin/providers")
    async def admin_list_providers(status: Optional[str] = None, _: User = Depends(require_admin)):  # type: ignore[valid-type]
        query = {}
        if status:
            query["verification_status"] = status
        providers = await db.provider_profiles.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
        return providers

    @router.post("/admin/providers/{provider_id}/verify")
    async def admin_verify(provider_id: str, payload: VerificationActionIn, admin: User = Depends(require_admin)):  # type: ignore[valid-type]
        result = await db.provider_profiles.update_one(
            {"provider_id": provider_id},
            {"$set": {"verification_status": payload.status, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Provider not found")
        await db.audit_logs.insert_one({
            "log_id": f"log_{uuid.uuid4().hex[:10]}",
            "admin_id": admin.user_id, "action": f"verify:{payload.status}",
            "target": provider_id, "note": payload.note,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        # SMS notify provider on status change
        provider = await db.provider_profiles.find_one({"provider_id": provider_id}, {"_id": 0})
        if provider:
            prov_user = await db.users.find_one({"user_id": provider["user_id"]}, {"_id": 0})
            if prov_user and prov_user.get("phone"):
                label = {
                    "approved": "¡Felicidades! Tu perfil fue verificado por getamano.",
                    "rejected": "Tu solicitud de verificación fue rechazada. Revisa los requisitos.",
                    "needs_info": "Necesitamos más información para verificar tu perfil.",
                    "suspended": "Tu perfil fue suspendido. Contacta soporte.",
                    "in_review": "Tu perfil está siendo revisado por nuestro equipo.",
                    "pending": "Tu perfil está pendiente de revisión.",
                }.get(payload.status, f"Estado actualizado: {payload.status}")
                send_sms(prov_user["phone"], f"[getamano] {label}", event=f"verify_{payload.status}")

            # SECTION 72 — Verification no longer auto-grants a referral reward.
            # The new model (2 paid referees = 1 free month) requires the referee
            # to confirm a PAID subscription, not just verification. This is
            # handled by `mark_referral_paid()` invoked from the Stripe webhook
            # `invoice.payment_succeeded` (or the dev simulate endpoint).

        return {"ok": True}

    @router.get("/admin/stats")
    async def admin_stats(_: User = Depends(require_admin)):  # type: ignore[valid-type]
        total_providers = await db.provider_profiles.count_documents({})
        pending = await db.provider_profiles.count_documents({"verification_status": "pending"})
        approved = await db.provider_profiles.count_documents({"verification_status": "approved"})
        total_users = await db.users.count_documents({})
        total_clients = await db.users.count_documents({"role": "client"})
        total_reviews = await db.reviews.count_documents({})
        return {
            "total_providers": total_providers, "pending_providers": pending,
            "approved_providers": approved, "total_users": total_users,
            "total_clients": total_clients, "total_reviews": total_reviews,
        }

    @router.patch("/admin/providers/{provider_id}")
    async def admin_edit_provider(provider_id: str, payload: AdminProviderEditIn, admin: User = Depends(require_admin)):  # type: ignore[valid-type]
        update = {k: v for k, v in payload.model_dump().items() if v is not None}
        if not update:
            return {"ok": True}
        update["updated_at"] = datetime.now(timezone.utc).isoformat()
        result = await db.provider_profiles.update_one({"provider_id": provider_id}, {"$set": update})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Not found")
        await db.audit_logs.insert_one({
            "log_id": f"log_{uuid.uuid4().hex[:10]}", "admin_id": admin.user_id,
            "action": "provider:edit", "target": provider_id, "note": ",".join(update.keys()),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"ok": True}

    return router
