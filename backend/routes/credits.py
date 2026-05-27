"""
Commission Credits ledger — Section 71.

Internal accounting of referral commissions earned by providers. Each closed
referral job inserts ONE row here with status='pending'. When the provider's
Stripe subscription renews, a sync job moves these to status='applied' and
optionally writes them as a credit to Stripe's `customer.balance` field.

Until Stripe keys are wired, this ledger is the single source of truth and
the EarningsWidget on AppHome reads from `/api/credits/me/summary`.

Data model — `commission_credits` collection:
  {
    credit_id,
    user_id,                     # the PROVIDER who earned this credit (referrer)
    source: 'referral',          # extensible: future sources (loyalty, refund, etc.)
    source_id,                   # FK to referral_jobs.referral_id
    amount_cents,                # POSITIVE integer cents (USD)
    currency: 'usd',
    status: 'pending'|'applied'|'expired',
    applied_to: None | str,      # Stripe invoice id once applied
    applied_at: ISO | None,
    note,                        # human-readable description shown in UI
    created_at: ISO,
  }

Endpoints (`/api/credits/*`):
  GET    /credits/me/summary           — balance + this-month + last-month + count
  GET    /credits/me                   — full ledger list (paginated)
  POST   /credits/sync-stripe          — admin/cron: push pending → Stripe (no-op without keys)
"""
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel


class CreditRecordIn(BaseModel):
    """Used internally by referral_jobs.complete to record a new credit."""
    user_id: str
    source: str = "referral"
    source_id: str
    amount_cents: int
    note: Optional[str] = None


async def record_commission_credit(
    db,
    *,
    user_id: str,
    source_id: str,
    amount_cents: int,
    note: str = "",
    source: str = "referral",
) -> dict:
    """Append-only ledger write. Idempotent on (source, source_id) pair —
    if a credit already exists for this referral, return the existing row.

    Called by referral_jobs.complete_referral() so the ledger stays in sync
    with the source-of-truth referral data.
    """
    if amount_cents <= 0:
        return {}
    existing = await db.commission_credits.find_one(
        {"source": source, "source_id": source_id, "user_id": user_id},
        {"_id": 0},
    )
    if existing:
        return existing
    doc = {
        "credit_id": f"cc_{uuid.uuid4().hex[:14]}",
        "user_id": user_id,
        "source": source,
        "source_id": source_id,
        "amount_cents": int(amount_cents),
        "currency": "usd",
        "status": "pending",
        "applied_to": None,
        "applied_at": None,
        "note": note or "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.commission_credits.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def _celebrate_applied_credit(db, user_id: str, applied_cents: int, applied_count: int) -> None:
    """Section 71 — When N credits are moved from pending → applied (a Stripe
    invoice received the discount), fire BOTH an in-app notification AND a
    Web Push so the provider gets a "double dopamine" moment:
      1. Stripe receipt arrives in their inbox showing the credit applied.
      2. getamano notification + push celebrates it: "we just gave you $XX off
         this month — thanks for referring allies".

    Reduces churn (justifies the subscription cost mentally) and reinforces
    the referral loop ("oh, getamano really does pay me back").

    Best-effort: never raises. Caller doesn't have to wrap in try/except.
    """
    import uuid as _uuid
    if applied_cents <= 0 or applied_count <= 0:
        return
    amount_label = f"${applied_cents / 100:.2f}"
    title = f"🎉 Te ahorramos {amount_label} este mes"
    body = (
        f"Aplicamos tu crédito por {applied_count} referido{'s' if applied_count != 1 else ''} "
        f"como descuento en tu factura. ¡Gracias por compartir getamano con aliados!"
    )
    cta_url = "/dashboard/provider?tab=red&subtab=earnings"

    # 1. In-app notification (read in the bell dropdown)
    try:
        await db.notifications.insert_one({
            "notification_id": f"notif_{_uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "category": "credits",
            "title": title,
            "body": body,
            "cta_label": "Ver desglose",
            "cta_url": cta_url,
            "icon": "trophy",
            "priority": "high",
            "is_read": False,
            "dismissed_at": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        pass

    # 2. Web Push delivery (works only if the user has subscribed via VAPID)
    try:
        from routes.push import send_push_to_user
        await send_push_to_user(db, user_id, {
            "title": title,
            "body": body,
            "url": cta_url,
            "tag": "credits-applied",
            "icon": "/icon-192x192.png",
        })
    except Exception:
        pass

    # 3. Section 73 — WhatsApp/SMS delivery via sent.dm (sandbox-safe).
    try:
        from integrations.messaging import deliver_notification
        amount_label = f"{applied_cents / 100:.2f}"
        await deliver_notification(
            db,
            user_id=user_id,
            template_name="credit_applied_to_invoice",
            variables={"amount": amount_label, "credits_count": applied_count},
        )
    except Exception:
        pass


async def _mark_credits_applied(
    db,
    *,
    user_id: str,
    credit_ids: list,
    stripe_txn_id: str = "manual",
) -> dict:
    """Mark a set of pending credits as applied (used by both the Stripe sync
    path and the dev-only simulate endpoint). Fires the celebration after.

    Returns {applied_count, applied_cents}.
    """
    if not credit_ids:
        return {"applied_count": 0, "applied_cents": 0}
    now_iso = datetime.now(timezone.utc).isoformat()
    # Sum cents before updating
    pre = await db.commission_credits.aggregate([
        {"$match": {"credit_id": {"$in": credit_ids}, "status": "pending", "user_id": user_id}},
        {"$group": {"_id": None, "total": {"$sum": "$amount_cents"}, "n": {"$sum": 1}}},
    ]).to_list(1)
    applied_cents = int((pre[0] or {}).get("total", 0)) if pre else 0
    applied_count = int((pre[0] or {}).get("n", 0)) if pre else 0
    if applied_count == 0:
        return {"applied_count": 0, "applied_cents": 0}
    await db.commission_credits.update_many(
        {"credit_id": {"$in": credit_ids}, "status": "pending", "user_id": user_id},
        {"$set": {"status": "applied", "applied_to": stripe_txn_id, "applied_at": now_iso}},
    )
    await _celebrate_applied_credit(db, user_id, applied_cents, applied_count)
    return {"applied_count": applied_count, "applied_cents": applied_cents}


def make_router(*, db, User, get_current_user) -> APIRouter:
    router = APIRouter()

    async def _month_window(months_ago: int):
        """Return ISO range [start, end) for the calendar month N months back."""
        now = datetime.now(timezone.utc)
        # First of this month UTC
        first_this = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        # Walk back `months_ago` calendar months
        y, m = first_this.year, first_this.month
        for _ in range(months_ago):
            m -= 1
            if m == 0:
                m = 12
                y -= 1
        start = first_this.replace(year=y, month=m)
        # End = start of next month
        end_m = m + 1
        end_y = y
        if end_m == 13:
            end_m = 1
            end_y += 1
        end = start.replace(year=end_y, month=end_m)
        return start.isoformat(), end.isoformat()

    async def _sum_amount(match: dict) -> int:
        agg = await db.commission_credits.aggregate([
            {"$match": match},
            {"$group": {"_id": None, "total": {"$sum": "$amount_cents"}}},
        ]).to_list(1)
        return int((agg[0] or {}).get("total", 0)) if agg else 0

    @router.get("/credits/me/summary")
    async def my_credit_summary(me: User = Depends(get_current_user)) -> dict:
        """Aggregated balance + month-over-month for the widget on AppHome."""
        uid = me.user_id

        # Pending balance = what will be applied to next invoice
        pending_cents = await _sum_amount({"user_id": uid, "status": "pending"})
        applied_cents = await _sum_amount({"user_id": uid, "status": "applied"})

        # This calendar month earnings (regardless of pending/applied)
        m0_start, m0_end = await _month_window(0)
        this_month_cents = await _sum_amount({
            "user_id": uid,
            "created_at": {"$gte": m0_start, "$lt": m0_end},
        })

        # Last calendar month
        m1_start, m1_end = await _month_window(1)
        last_month_cents = await _sum_amount({
            "user_id": uid,
            "created_at": {"$gte": m1_start, "$lt": m1_end},
        })

        total_count = await db.commission_credits.count_documents({"user_id": uid})

        # Delta % vs last month — None if last month is $0 (avoid div by zero)
        if last_month_cents > 0:
            delta_pct = round(((this_month_cents - last_month_cents) / last_month_cents) * 100, 1)
        else:
            delta_pct = None

        return {
            "currency": "usd",
            "pending_balance_cents": pending_cents,
            "applied_lifetime_cents": applied_cents,
            "this_month_cents": this_month_cents,
            "last_month_cents": last_month_cents,
            "delta_pct": delta_pct,
            "credits_count": total_count,
            # Pretty strings for the UI (avoid frontend re-formatting bugs)
            "pending_balance_label": f"${pending_cents/100:.2f}",
            "this_month_label": f"${this_month_cents/100:.2f}",
            "last_month_label": f"${last_month_cents/100:.2f}",
            # Operational note shown to provider
            "next_action": (
                "Se aplicará automáticamente como descuento en tu próxima factura."
                if pending_cents > 0 else
                "Refiere un trabajo a un aliado y gana 5% cuando lo cierre."
            ),
            "stripe_configured": bool(os.environ.get("STRIPE_SECRET_KEY")),
        }

    @router.get("/credits/me")
    async def my_credits_list(
        me: User = Depends(get_current_user),
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> dict:
        limit = max(1, min(200, limit))
        offset = max(0, offset)
        q = {"user_id": me.user_id}
        if status in ("pending", "applied", "expired"):
            q["status"] = status
        cursor = db.commission_credits.find(q, {"_id": 0}).sort("created_at", -1).skip(offset).limit(limit)
        rows = await cursor.to_list(limit)
        total = await db.commission_credits.count_documents(q)
        return {"items": rows, "total": total, "limit": limit, "offset": offset}

    @router.post("/credits/sync-stripe")
    async def sync_pending_to_stripe(me: User = Depends(get_current_user)) -> dict:
        """Sync pending credits to Stripe customer.balance.

        Behavior:
          - When STRIPE_SECRET_KEY is unset (current state, dev-fallback):
            returns {ok: true, synced: 0, mode: 'dev-fallback'} without touching
            anything. The frontend can still show the pending balance.
          - When configured: for each pending credit, call
            `customer.balance_transactions.create(amount=-cents, currency='usd', description=...)`
            and update the row to status='applied' with the Stripe txn id.

        Admin-only to prevent abuse — but the path is reachable by any user
        for their OWN credits (`me.user_id`). Admins can sync any user via
        a separate path (TBD).
        """
        if not os.environ.get("STRIPE_SECRET_KEY"):
            pending = await db.commission_credits.count_documents({
                "user_id": me.user_id, "status": "pending",
            })
            return {
                "ok": True,
                "synced": 0,
                "pending_count": pending,
                "mode": "dev-fallback",
                "note": "Stripe no está configurado. Los créditos quedan en estado pending hasta que se agregue STRIPE_SECRET_KEY.",
            }

        # Real Stripe sync path — guarded by env var. Imports kept local so
        # the module loads even when stripe SDK isn't installed.
        try:
            import stripe  # type: ignore
        except ImportError:
            raise HTTPException(status_code=500, detail="Stripe SDK not installed.")
        stripe.api_key = os.environ["STRIPE_SECRET_KEY"]

        # Get the user's Stripe customer id
        user_doc = await db.users.find_one(
            {"user_id": me.user_id},
            {"_id": 0, "stripe_customer_id": 1},
        ) or {}
        stripe_customer_id = user_doc.get("stripe_customer_id")
        if not stripe_customer_id:
            raise HTTPException(
                status_code=400,
                detail="Tu cuenta no tiene una suscripción Stripe activa. Suscríbete primero.",
            )

        pending_rows = await db.commission_credits.find(
            {"user_id": me.user_id, "status": "pending"},
            {"_id": 0},
        ).to_list(500)

        synced_ids = []
        for row in pending_rows:
            try:
                # NEGATIVE amount creates a credit on the customer balance.
                txn = stripe.Customer.create_balance_transaction(
                    stripe_customer_id,
                    amount=-int(row["amount_cents"]),
                    currency=row.get("currency", "usd"),
                    description=row.get("note") or f"getamano referral commission ({row['credit_id']})",
                )
                await db.commission_credits.update_one(
                    {"credit_id": row["credit_id"]},
                    {"$set": {
                        "status": "applied",
                        "applied_to": txn.id,
                        "applied_at": datetime.now(timezone.utc).isoformat(),
                    }},
                )
                synced_ids.append(row["credit_id"])
            except Exception:  # noqa: BLE001
                # Keep going — partial sync is better than failing the whole batch.
                continue

        # ONE celebration notification covering the whole batch (not one
        # notification per credit — that would feel spammy).
        applied_cents = 0
        for cid in synced_ids:
            r = await db.commission_credits.find_one({"credit_id": cid}, {"_id": 0, "amount_cents": 1})
            applied_cents += int((r or {}).get("amount_cents", 0))
        if synced_ids:
            await _celebrate_applied_credit(db, me.user_id, applied_cents, len(synced_ids))

        return {
            "ok": True,
            "synced": len(synced_ids),
            "synced_cents": applied_cents,
            "mode": "stripe",
        }

    @router.post("/credits/me/simulate-apply")
    async def simulate_apply(me: User = Depends(get_current_user)) -> dict:
        """DEV-ONLY: simulate applying all pending credits without hitting
        Stripe. Marks them as applied with stripe_txn_id='dev-simulated' and
        fires the celebration notification + push. Disabled in production.

        Useful for:
          - QA-ing the celebration flow before Stripe is configured
          - Demo videos / screenshots
          - Manually clearing the ledger if needed during testing
        """
        if os.environ.get("STRIPE_SECRET_KEY"):
            raise HTTPException(
                status_code=400,
                detail="Simulación deshabilitada en producción. Usa /credits/sync-stripe.",
            )
        pending = await db.commission_credits.find(
            {"user_id": me.user_id, "status": "pending"},
            {"_id": 0, "credit_id": 1},
        ).to_list(500)
        if not pending:
            return {"ok": True, "applied_count": 0, "applied_cents": 0, "note": "No hay créditos pending."}
        result = await _mark_credits_applied(
            db,
            user_id=me.user_id,
            credit_ids=[r["credit_id"] for r in pending],
            stripe_txn_id="dev-simulated",
        )
        return {"ok": True, **result, "mode": "dev-simulated"}

    return router
