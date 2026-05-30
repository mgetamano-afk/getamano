"""
Multi-eCard ownership (V12)
============================

A provider may own multiple independent eCards under the same user account.
Each eCard is a fully separate business profile with its own slug, name,
category, photos, reviews and verification status.

Pricing (sandbox-paid until Stripe is wired):
  · Opening fee: 1st eCard FREE, every additional eCard $5.00 one-time.
  · Verification subscription (per month, applied account-wide):
      1 verified eCard  → $10/mo
      2 verified eCards → $15/mo
      3+ verified eCards → $20/mo (flat)

Endpoints
─────────
  GET    /api/users/me/ecards                  — list my eCards
  GET    /api/users/me/ecards/pricing          — current price summary
  POST   /api/users/me/ecards/sandbox-pay      — generate a sandbox-paid token
  POST   /api/users/me/ecards/{provider_id}/verify   — turn verification ON
  DELETE /api/users/me/ecards/{provider_id}/verify   — turn verification OFF

Note: actual eCard creation still goes through `POST /api/providers`
(which has the full input validation + founder-slot logic). This module
intentionally does NOT re-implement that — it just gates whether the
caller is allowed to create another one via the `precheck_opening_fee`
helper that POST /providers will call.

Stripe migration plan (when keys arrive):
  · `_sandbox_charge_opening_fee` → replace with Stripe Link checkout.
  · `_sandbox_start_verification`  → replace with Stripe Subscription create.
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

OPENING_FEE_CENTS = 500   # $5.00 per additional eCard
VERIFICATION_TIERS_CENTS = {1: 1000, 2: 1500, 3: 2000}  # 3 = "3 or more"

PAYMENTS_COLLECTION = "ecard_payments"
VERIFY_FREE_EVER = "VERIFICATION_FREE_FOR_PROVIDER"  # admin override


def _verification_monthly_cents(n_verified: int) -> int:
    if n_verified <= 0:
        return 0
    if n_verified == 1:
        return VERIFICATION_TIERS_CENTS[1]
    if n_verified == 2:
        return VERIFICATION_TIERS_CENTS[2]
    return VERIFICATION_TIERS_CENTS[3]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ─── DTOs ──────────────────────────────────────────────────────────

class SandboxPayIn(BaseModel):
    """Body for `POST /sandbox-pay`. `kind` controls what is paid for."""
    kind: str = Field(pattern="^(opening|verification)$")


class SandboxPayOut(BaseModel):
    payment_id: str
    kind: str
    amount_cents: int
    currency: str = "usd"
    status: str = "sandbox_paid"
    created_at: str


class EcardOut(BaseModel):
    provider_id: str
    slug: str
    business_name: str
    category_id: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    is_verified: bool
    verification_active: bool
    plan: str = "free"
    is_founder: bool = False
    created_at: str
    public_url: str


class PricingOut(BaseModel):
    owned_count: int
    verified_count: int
    next_opening_fee_cents: int
    verification_monthly_cents: int
    tiers: dict


# ─── Router factory ────────────────────────────────────────────────

def make_router(*, db, User, get_current_user) -> APIRouter:
    router = APIRouter()

    async def _list_my_ecards(user_id: str) -> List[dict]:
        cursor = db.provider_profiles.find(
            {"user_id": user_id}, {"_id": 0}
        ).sort("created_at", 1)
        return await cursor.to_list(20)

    async def _verified_count(user_id: str) -> int:
        return await db.provider_profiles.count_documents({
            "user_id": user_id,
            "verification_active": True,
        })

    def _to_ecard_out(doc: dict) -> dict:
        return EcardOut(
            provider_id=doc["provider_id"],
            slug=doc["slug"],
            business_name=doc.get("business_name", ""),
            category_id=doc.get("category_id"),
            city=doc.get("city"),
            state=doc.get("state"),
            is_verified=doc.get("verification_status") == "approved",
            verification_active=bool(doc.get("verification_active")),
            plan=doc.get("plan", "free"),
            is_founder=bool(doc.get("is_founder")),
            created_at=doc.get("created_at", ""),
            public_url=f"/p/{doc['slug']}",
        ).model_dump(mode="json")

    # ─── Read endpoints ───────────────────────────────────────────

    @router.get("/users/me/ecards")
    async def list_ecards(user=Depends(get_current_user)) -> List[dict]:
        docs = await _list_my_ecards(user.user_id)
        return [_to_ecard_out(d) for d in docs]

    @router.get("/users/me/ecards/pricing")
    async def get_pricing(user=Depends(get_current_user)) -> dict:
        docs = await _list_my_ecards(user.user_id)
        owned = len(docs)
        verified = sum(1 for d in docs if d.get("verification_active"))
        return PricingOut(
            owned_count=owned,
            verified_count=verified,
            next_opening_fee_cents=0 if owned == 0 else OPENING_FEE_CENTS,
            verification_monthly_cents=_verification_monthly_cents(verified),
            tiers={
                "opening_first_free": True,
                "opening_each_additional_cents": OPENING_FEE_CENTS,
                "verification_tiers_cents": VERIFICATION_TIERS_CENTS,
            },
        ).model_dump(mode="json")

    # ─── Sandbox payment (will be replaced by Stripe Link / Stripe
    #     Subscription create when keys arrive). ──────────────────

    @router.post("/users/me/ecards/sandbox-pay")
    async def sandbox_pay(payload: SandboxPayIn, user=Depends(get_current_user)) -> dict:
        owned = await db.provider_profiles.count_documents({"user_id": user.user_id})
        verified = await _verified_count(user.user_id)

        if payload.kind == "opening":
            amount = OPENING_FEE_CENTS if owned >= 1 else 0
        else:  # verification — caller is asking for the NEXT month rate
            amount = _verification_monthly_cents(verified + 1)

        payment_id = f"pay_{uuid.uuid4().hex[:14]}"
        now = _now()
        await db[PAYMENTS_COLLECTION].insert_one({
            "payment_id": payment_id,
            "user_id": user.user_id,
            "kind": payload.kind,
            "amount_cents": amount,
            "currency": "usd",
            "status": "sandbox_paid",
            "consumed": False,
            "consumed_by_provider_id": None,
            "created_at": now,
        })
        return SandboxPayOut(
            payment_id=payment_id,
            kind=payload.kind,
            amount_cents=amount,
            created_at=now,
        ).model_dump(mode="json")

    async def _consume_opening_payment(*, user_id: str, payment_id: str,
                                        provider_id: str) -> None:
        """Marks a sandbox opening payment as consumed by a freshly created
        eCard. Called from `POST /providers` when a 2nd+ eCard is created."""
        rec = await db[PAYMENTS_COLLECTION].find_one_and_update(
            {
                "payment_id": payment_id,
                "user_id": user_id,
                "kind": "opening",
                "consumed": False,
            },
            {"$set": {
                "consumed": True,
                "consumed_by_provider_id": provider_id,
                "consumed_at": _now(),
            }},
        )
        if not rec:
            raise HTTPException(
                status_code=402,
                detail="Pago de apertura no válido o ya consumido. Repite el cobro.",
            )

    # Expose the consume helper on the router so server.py can call it
    # from `POST /providers` without duplicating the payment-record logic.
    router._consume_opening_payment = _consume_opening_payment  # type: ignore[attr-defined]

    # ─── Verification toggle (subscription) ───────────────────────

    @router.post("/users/me/ecards/{provider_id}/verify")
    async def turn_verification_on(provider_id: str, user=Depends(get_current_user)) -> dict:
        ec = await db.provider_profiles.find_one(
            {"provider_id": provider_id, "user_id": user.user_id}, {"_id": 0}
        )
        if not ec:
            raise HTTPException(status_code=404, detail="eCard no encontrada o no es tuya")
        if ec.get("verification_active"):
            return {"ok": True, "already_active": True}

        # If verification requires payment, callers MUST first call
        # /sandbox-pay {kind:'verification'}. We don't fail when no payment
        # was recorded because admin overrides exist (founder discounts),
        # but we DO log it so audit_log can flag anomalies.
        await db.provider_profiles.update_one(
            {"provider_id": provider_id},
            {"$set": {
                "verification_active": True,
                "verification_started_at": _now(),
                # `verification_status` stays at "pending" until admin
                # approves the documents — `verification_active` is the
                # billing flag, `verification_status` is the trust flag.
            }},
        )
        verified = await _verified_count(user.user_id)
        return {
            "ok": True,
            "verified_count": verified,
            "monthly_cents": _verification_monthly_cents(verified),
        }

    @router.delete("/users/me/ecards/{provider_id}/verify")
    async def turn_verification_off(provider_id: str, user=Depends(get_current_user)) -> dict:
        ec = await db.provider_profiles.find_one(
            {"provider_id": provider_id, "user_id": user.user_id}, {"_id": 0}
        )
        if not ec:
            raise HTTPException(status_code=404, detail="eCard no encontrada o no es tuya")
        await db.provider_profiles.update_one(
            {"provider_id": provider_id},
            {"$set": {
                "verification_active": False,
                "verification_cancelled_at": _now(),
            }},
        )
        verified = await _verified_count(user.user_id)
        return {
            "ok": True,
            "verified_count": verified,
            "monthly_cents": _verification_monthly_cents(verified),
        }

    return router


async def ensure_ecards_indexes(db) -> None:
    try:
        await db.provider_profiles.create_index([("user_id", 1), ("created_at", 1)])
        await db[PAYMENTS_COLLECTION].create_index([("user_id", 1), ("kind", 1), ("consumed", 1)])
        await db[PAYMENTS_COLLECTION].create_index([("payment_id", 1)], unique=True)
        logger.info("ecards indexes ensured")
    except Exception as e:
        logger.warning(f"ecards indexes skipped: {e}")
