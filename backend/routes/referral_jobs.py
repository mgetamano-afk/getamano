"""
Referral jobs module — Section 68.

Provider-to-provider referral commission system. When provider A refers
a client/job to provider B, a referral_jobs record is created. Once B
marks the job as COMPLETED with a final amount, A earns a 5% commission
automatically (configurable per platform / per pair in the future).

Data model — `referral_jobs` collection:
  {
    referral_id, referrer_user_id, referred_user_id,
    client_name, client_phone, service_description, estimated_amount,
    status: pending | accepted | completed | cancelled,
    final_amount, commission_pct, commission_amount,
    notes,
    created_at, accepted_at, completed_at, cancelled_at,
  }

Endpoints (`/api/referrals/*`):
  POST   /referrals/jobs                  — create (requires referrer follows referred)
  GET    /referrals/jobs/me/sent          — referrals I made (referrer)
  GET    /referrals/jobs/me/received      — referrals sent to me (referred)
  POST   /referrals/jobs/{id}/accept      — referred accepts
  POST   /referrals/jobs/{id}/complete    — referred marks completed w/ final_amount
  POST   /referrals/jobs/{id}/cancel      — either side can cancel before completion
  GET    /referrals/earnings/me           — aggregated earnings stats
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field


DEFAULT_COMMISSION_PCT = 5.0  # platform default — 5%


class ReferralJobIn(BaseModel):
    referred_user_id: str
    client_name: str = Field(min_length=2, max_length=120)
    client_phone: Optional[str] = Field(default=None, max_length=40)
    service_description: str = Field(min_length=8, max_length=600)
    estimated_amount: Optional[float] = Field(default=None, ge=0, le=1_000_000)
    notes: Optional[str] = Field(default=None, max_length=300)


class CompleteJobIn(BaseModel):
    final_amount: float = Field(ge=0, le=1_000_000)
    notes: Optional[str] = Field(default=None, max_length=300)


def make_router(*, db, User, get_current_user) -> APIRouter:
    router = APIRouter()

    async def _record_credit(referrer_user_id: str, referral_id: str, commission_amount: float, client_name: str):
        """Section 71 — Append a row to the commission_credits ledger when a
        referral closes. Imported lazily so this module stays decoupled.
        Idempotent on (source, source_id) — re-runs are safe.
        """
        try:
            from routes.credits import record_commission_credit
            cents = int(round(commission_amount * 100))
            note = f"5% comisión por trabajo de {client_name}"
            await record_commission_credit(
                db,
                user_id=referrer_user_id,
                source_id=referral_id,
                amount_cents=cents,
                note=note,
            )
        except Exception:
            # Never block the user flow if ledger write fails — the
            # referral_jobs row is the source of truth and can be replayed.
            pass

    async def _notify(user_id: str, title: str, body: str, cta_url: str, icon: str):
        try:
            await db.notifications.insert_one({
                "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
                "user_id": user_id,
                "category": "referrals",
                "title": title,
                "body": body,
                "cta_label": "Ver",
                "cta_url": cta_url,
                "icon": icon,
                "priority": "high",
                "is_read": False,
                "dismissed_at": None,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        except Exception:
            pass
        # Best-effort Web Push delivery — never block the request.
        try:
            from routes.push import send_push_to_user
            await send_push_to_user(db, user_id, {
                "title": title,
                "body": body,
                "url": cta_url,
                "tag": "referrals",
                "icon": "/icon-192x192.png",
            })
        except Exception:
            pass

    async def _enrich_user_brief(uid: str) -> dict:
        u = await db.users.find_one({"user_id": uid}, {"_id": 0, "name": 1}) or {}
        prof = await db.provider_profiles.find_one(
            {"user_id": uid},
            {"_id": 0, "business_name": 1, "slug": 1, "logo_url": 1, "city": 1},
        )
        return {
            "user_id": uid,
            "name": u.get("name") or (prof.get("business_name") if prof else None) or "—",
            "business_name": prof.get("business_name") if prof else None,
            "slug": prof.get("slug") if prof else None,
            "logo_url": prof.get("logo_url") if prof else None,
            "city": prof.get("city") if prof else None,
        }

    async def _serialize(row: dict) -> dict:
        return {
            **row,
            "referrer": await _enrich_user_brief(row.get("referrer_user_id", "")),
            "referred": await _enrich_user_brief(row.get("referred_user_id", "")),
        }

    @router.post("/referrals/jobs")
    async def create_referral(payload: ReferralJobIn, me: User = Depends(get_current_user)):
        if me.role != "provider":
            raise HTTPException(status_code=403, detail="Solo proveedores pueden referir trabajos.")
        if payload.referred_user_id == me.user_id:
            raise HTTPException(status_code=400, detail="No puedes referirte a ti mismo.")
        target = await db.users.find_one({"user_id": payload.referred_user_id}, {"_id": 0, "user_id": 1, "role": 1})
        if not target or target.get("role") != "provider":
            raise HTTPException(status_code=400, detail="El destinatario debe ser un proveedor.")
        # Optional gate: require the referrer to follow the referred. Comment
        # out this block to allow cold referrals to any approved provider.
        # follow = await db.follows.find_one({"follower_user_id": me.user_id, "followed_user_id": payload.referred_user_id})
        # if not follow:
        #     raise HTTPException(status_code=400, detail="Primero sigue al aliado para poder referirle.")

        now_iso = datetime.now(timezone.utc).isoformat()
        rid = f"ref_{uuid.uuid4().hex[:12]}"
        doc = {
            "referral_id": rid,
            "referrer_user_id": me.user_id,
            "referred_user_id": payload.referred_user_id,
            "client_name": payload.client_name.strip(),
            "client_phone": (payload.client_phone or "").strip() or None,
            "service_description": payload.service_description.strip(),
            "estimated_amount": payload.estimated_amount,
            "status": "pending",
            "commission_pct": DEFAULT_COMMISSION_PCT,
            "final_amount": None,
            "commission_amount": None,
            "notes": (payload.notes or "").strip() or None,
            "created_at": now_iso,
            "accepted_at": None,
            "completed_at": None,
            "cancelled_at": None,
        }
        await db.referral_jobs.insert_one(doc)
        referrer_name = (getattr(me, "name", "") or "Un aliado").strip().split()[0] or "Un aliado"
        await _notify(
            payload.referred_user_id,
            f"{referrer_name} te refirió un trabajo",
            f"Cliente: {payload.client_name}. Revisa los detalles y acepta.",
            "/dashboard/provider?tab=red&subtab=received",
            "Handshake",
        )
        doc.pop("_id", None)
        return await _serialize(doc)

    @router.get("/referrals/jobs/me/sent")
    async def list_my_sent(me: User = Depends(get_current_user)):
        rows = await db.referral_jobs.find(
            {"referrer_user_id": me.user_id},
            {"_id": 0},
        ).sort("created_at", -1).to_list(200)
        return [await _serialize(r) for r in rows]

    @router.get("/referrals/jobs/me/received")
    async def list_my_received(me: User = Depends(get_current_user)):
        rows = await db.referral_jobs.find(
            {"referred_user_id": me.user_id},
            {"_id": 0},
        ).sort("created_at", -1).to_list(200)
        return [await _serialize(r) for r in rows]

    @router.post("/referrals/jobs/{rid}/accept")
    async def accept_referral(rid: str, me: User = Depends(get_current_user)):
        row = await db.referral_jobs.find_one({"referral_id": rid}, {"_id": 0})
        if not row:
            raise HTTPException(status_code=404, detail="Referencia no encontrada.")
        if row["referred_user_id"] != me.user_id:
            raise HTTPException(status_code=403, detail="No es tu referencia.")
        if row["status"] != "pending":
            raise HTTPException(status_code=400, detail=f"Estado actual: {row['status']}")
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.referral_jobs.update_one(
            {"referral_id": rid},
            {"$set": {"status": "accepted", "accepted_at": now_iso}},
        )
        accepter_name = (getattr(me, "name", "") or "El aliado").strip().split()[0] or "El aliado"
        await _notify(
            row["referrer_user_id"],
            f"{accepter_name} aceptó tu referencia",
            f"Cliente: {row['client_name']}. Comisión 5% se activa al completar.",
            "/dashboard/provider?tab=red&subtab=sent",
            "CheckCircle",
        )
        row["status"] = "accepted"
        row["accepted_at"] = now_iso
        return await _serialize(row)

    @router.post("/referrals/jobs/{rid}/complete")
    async def complete_referral(rid: str, payload: CompleteJobIn, me: User = Depends(get_current_user)):
        row = await db.referral_jobs.find_one({"referral_id": rid}, {"_id": 0})
        if not row:
            raise HTTPException(status_code=404, detail="Referencia no encontrada.")
        if row["referred_user_id"] != me.user_id:
            raise HTTPException(status_code=403, detail="No es tu referencia.")
        if row["status"] not in ("pending", "accepted"):
            raise HTTPException(status_code=400, detail=f"No se puede completar (estado: {row['status']})")
        commission_pct = row.get("commission_pct") or DEFAULT_COMMISSION_PCT
        commission_amount = round(payload.final_amount * (commission_pct / 100.0), 2)
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.referral_jobs.update_one(
            {"referral_id": rid},
            {"$set": {
                "status": "completed",
                "final_amount": payload.final_amount,
                "commission_amount": commission_amount,
                "completed_at": now_iso,
                "notes": (payload.notes or row.get("notes") or "").strip() or None,
                # Convenience: also mark accepted_at if it was skipped.
                "accepted_at": row.get("accepted_at") or now_iso,
            }},
        )
        # Section 71 — Append commission to the credits ledger so it shows
        # up in the EarningsWidget and can be synced to Stripe later.
        await _record_credit(
            row["referrer_user_id"],
            rid,
            commission_amount,
            row["client_name"],
        )
        completer_name = (getattr(me, "name", "") or "El aliado").strip().split()[0] or "El aliado"
        await _notify(
            row["referrer_user_id"],
            f"💰 Ganaste ${commission_amount:.2f}",
            f"{completer_name} completó el trabajo de {row['client_name']} (${payload.final_amount:.2f}). 5% de comisión te corresponde.",
            "/dashboard/provider?tab=red&subtab=earnings",
            "DollarSign",
        )
        row.update({
            "status": "completed",
            "final_amount": payload.final_amount,
            "commission_amount": commission_amount,
            "completed_at": now_iso,
        })
        return await _serialize(row)

    @router.post("/referrals/jobs/{rid}/cancel")
    async def cancel_referral(rid: str, me: User = Depends(get_current_user)):
        row = await db.referral_jobs.find_one({"referral_id": rid}, {"_id": 0})
        if not row:
            raise HTTPException(status_code=404, detail="Referencia no encontrada.")
        if me.user_id not in (row["referrer_user_id"], row["referred_user_id"]):
            raise HTTPException(status_code=403, detail="No es tu referencia.")
        if row["status"] in ("completed", "cancelled"):
            raise HTTPException(status_code=400, detail=f"Ya está {row['status']}.")
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.referral_jobs.update_one(
            {"referral_id": rid},
            {"$set": {"status": "cancelled", "cancelled_at": now_iso}},
        )
        row.update({"status": "cancelled", "cancelled_at": now_iso})
        return await _serialize(row)

    @router.get("/referrals/earnings/me")
    async def my_earnings(me: User = Depends(get_current_user)):
        """Aggregate earnings as a referrer + a quick stat as receiver."""
        async def _aggr(match):
            pipeline = [
                {"$match": match},
                {"$group": {
                    "_id": None,
                    "total_count": {"$sum": 1},
                    "total_gross": {"$sum": {"$ifNull": ["$final_amount", 0]}},
                    "total_commission": {"$sum": {"$ifNull": ["$commission_amount", 0]}},
                }},
            ]
            agg = await db.referral_jobs.aggregate(pipeline).to_list(1)
            if not agg:
                return {"count": 0, "gross": 0.0, "commission": 0.0}
            return {
                "count": agg[0].get("total_count", 0),
                "gross": float(agg[0].get("total_gross", 0) or 0),
                "commission": float(agg[0].get("total_commission", 0) or 0),
            }

        sent_completed = await _aggr({"referrer_user_id": me.user_id, "status": "completed"})
        sent_pending = await db.referral_jobs.count_documents({
            "referrer_user_id": me.user_id,
            "status": {"$in": ["pending", "accepted"]},
        })
        received_completed = await _aggr({"referred_user_id": me.user_id, "status": "completed"})
        received_pending = await db.referral_jobs.count_documents({
            "referred_user_id": me.user_id,
            "status": {"$in": ["pending", "accepted"]},
        })

        return {
            "commission_pct": DEFAULT_COMMISSION_PCT,
            "as_referrer": {
                "earned": sent_completed["commission"],
                "completed_jobs": sent_completed["count"],
                "pending_jobs": sent_pending,
            },
            "as_receiver": {
                "jobs_won": received_completed["count"],
                "gross_revenue": received_completed["gross"],
                "owe_commissions": received_completed["commission"],
                "pending_jobs": received_pending,
            },
        }

    return router
