"""
Section 88 (v3 social-first) — Single-user model + verified $10/mo + GM code.

This module ships everything the v3 strategic pivot needs that is NOT
already in server.py:

  · GET  /api/users/me/provider-status
       Reports {is_provider, provider_verified, getamano_code, provider_plan,
                preferences{...}}. Used by Account page + Dashboard.

  · POST /api/users/me/activate-provider
       Idempotent: flips is_provider=true on the calling user. If the
       user already has a provider_profiles doc, leaves it alone; if not,
       returns a hint so the FE can route them to /provider/onboarding.

  · POST /api/users/me/preferences
       Saves the 5 boolean toggles from the dashboard preferences panel
       (messages_on, quotes_on, show_phone, in_search, referrals_on).
       Optimistic — returns the persisted dict so the FE can confirm.

  · POST /api/users/me/verify
       Marks the user as `provider_verified=true`, generates a unique
       `getamano_code` of the form `GM-XXXX` (1000–9999), sets
       `provider_plan='verified'`. Stripe wiring is intentionally absent
       in Phase 1 (user choice 4b) — when Stripe keys land we'll gate
       this behind a real subscription. For now the test flow just sets
       the bit so we can ship the UI today.

Migration (one-time idempotent, runs on startup via server.seed()):
  · For every existing provider on plan ∈ {basic, pro, premium, premium_plus}
    we flip them to provider_plan='verified' + provider_verified=true
    and stamp a GM-XXXX code if they don't have one.
  · Free-plan providers keep provider_plan='free'.

Section 88 — referral economy.
  The plan-aware $5/$7.50/$12.50 milestone math from Section 75 is
  replaced by a FLAT-PER-CONVERSION model (user choice 3a@$5):
     ·  $2 when the referee activates "Vende tus servicios" (is_provider=true)
     ·  $3 when the referee has been provider_verified=true for 30 days
     ·  Total per conversion = $5
  The legacy milestone handler in routes/user_referrals.py is updated
  alongside this module — see commits there.
"""

from __future__ import annotations

import secrets
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────

VERIFIED_PLAN_KEY = "verified"          # provider_plan value
FREE_PLAN_KEY = "free"
GM_CODE_PREFIX = "GM-"

# Default preference dict — used as the starter for new providers and as
# a fallback when a partial document is fetched.
DEFAULT_PREFERENCES = {
    "messages_on": True,
    "quotes_on": True,
    "show_phone": False,
    "in_search": True,
    "referrals_on": False,
}


# ─────────────────────────────────────────────────────────────────────
# Public helpers
# ─────────────────────────────────────────────────────────────────────

async def generate_unique_gm_code(db, max_attempts: int = 25) -> str:
    """Generate an unused `GM-XXXX` code (XXXX = 4 random digits).

    We use cryptographically-strong `secrets.randbelow` so the codes
    don't reveal the size of the platform AND can't be guessed by
    timing attacks. Collision risk is ~1% per attempt at 100 codes
    used; we retry up to `max_attempts` and fall back to the next
    sequential 4-digit number if we somehow blow past that.
    """
    for _ in range(max_attempts):
        candidate = f"{GM_CODE_PREFIX}{secrets.randbelow(9000) + 1000}"
        clash = await db.provider_profiles.find_one(
            {"getamano_code": candidate}, {"_id": 0, "provider_id": 1}
        )
        if not clash:
            return candidate
    # Fallback — pick the next sequential 4-digit number, scanning from
    # 1000 upward. Slow but guarantees uniqueness even if the namespace
    # is 90% full.
    for n in range(1000, 10000):
        candidate = f"{GM_CODE_PREFIX}{n}"
        clash = await db.provider_profiles.find_one(
            {"getamano_code": candidate}, {"_id": 0, "provider_id": 1}
        )
        if not clash:
            return candidate
    raise RuntimeError("GM code namespace exhausted")


async def run_v3_migration(db) -> None:
    """One-time startup migration to align legacy docs with the v3 model.

    Idempotent — safe to run on every boot.

    1. Every provider on a paid legacy plan (basic/pro/premium/premium_plus)
       gets:
         · provider_plan = 'verified'
         · provider_verified = True
         · getamano_code = GM-XXXX (if missing)
    2. Every other provider gets:
         · provider_plan = 'free' (if missing)
         · provider_verified = False (if missing)
       and we DO NOT mint a code for them.
    3. Every provider doc with no `preferences` map gets DEFAULT_PREFERENCES.
    """
    legacy_paid = {"basic", "pro", "premium", "premium_plus"}
    paid_filter = {"$or": [
        {"plan": {"$in": list(legacy_paid)}},
        {"provider_plan": {"$in": list(legacy_paid)}},
    ]}

    # Step 1 — promote paid providers to verified
    cursor = db.provider_profiles.find(
        paid_filter,
        {"_id": 0, "provider_id": 1, "user_id": 1, "plan": 1, "getamano_code": 1},
    )
    promoted = 0
    async for prov in cursor:
        update = {
            "provider_plan": VERIFIED_PLAN_KEY,
            "provider_verified": True,
        }
        if not prov.get("getamano_code"):
            update["getamano_code"] = await generate_unique_gm_code(db)
        await db.provider_profiles.update_one(
            {"provider_id": prov["provider_id"]},
            {"$set": update, "$setOnInsert": {}},
        )
        promoted += 1
    if promoted:
        logger.info(f"v3 migration: promoted {promoted} legacy paid providers to verified")

    # Step 2 — default free providers to provider_plan='free' + provider_verified=False
    await db.provider_profiles.update_many(
        {"provider_plan": {"$exists": False}},
        {"$set": {"provider_plan": FREE_PLAN_KEY, "provider_verified": False}},
    )
    await db.provider_profiles.update_many(
        {"provider_verified": {"$exists": False}},
        {"$set": {"provider_verified": False}},
    )

    # Step 3 — backfill preferences map for any provider missing it
    await db.provider_profiles.update_many(
        {"preferences": {"$exists": False}},
        {"$set": {"preferences": DEFAULT_PREFERENCES.copy()}},
    )

    logger.info("v3 migration: complete")


# ─────────────────────────────────────────────────────────────────────
# API schemas
# ─────────────────────────────────────────────────────────────────────

class PreferencesIn(BaseModel):
    messages_on: Optional[bool] = None
    quotes_on: Optional[bool] = None
    show_phone: Optional[bool] = None
    in_search: Optional[bool] = None
    referrals_on: Optional[bool] = None


# ─────────────────────────────────────────────────────────────────────
# Router factory
# ─────────────────────────────────────────────────────────────────────

def build_router(db, get_current_user):
    """Returns an APIRouter wired to the live db + auth dependency."""
    router = APIRouter()

    # ─── GET /users/me/provider-status ─────────────────────────────
    @router.get("/users/me/provider-status")
    async def provider_status(me=Depends(get_current_user)) -> dict:
        """Used by the Account page to decide whether to render the
        "¿Ofreces algún servicio?" CTA card or the "Ver mi panel" link.
        Always returns a complete dict, even for non-providers."""
        prof = await db.provider_profiles.find_one(
            {"user_id": me.user_id},
            {
                "_id": 0,
                "provider_id": 1,
                "slug": 1,
                "provider_plan": 1,
                "provider_verified": 1,
                "getamano_code": 1,
                "preferences": 1,
                "is_founder": 1,
                "founder_free_until": 1,
            },
        )
        if not prof:
            return {
                "is_provider": False,
                "provider_verified": False,
                "provider_plan": None,
                "getamano_code": None,
                "preferences": DEFAULT_PREFERENCES.copy(),
                "is_founder": False,
                "founder_free_until": None,
                "provider_id": None,
                "slug": None,
            }
        prefs = prof.get("preferences") or DEFAULT_PREFERENCES.copy()
        # Merge defaults so the FE never has to null-check fields
        merged_prefs = {**DEFAULT_PREFERENCES, **prefs}
        return {
            "is_provider": True,
            "provider_verified": bool(prof.get("provider_verified")),
            "provider_plan": prof.get("provider_plan") or FREE_PLAN_KEY,
            "getamano_code": prof.get("getamano_code"),
            "preferences": merged_prefs,
            "is_founder": bool(prof.get("is_founder")),
            "founder_free_until": prof.get("founder_free_until"),
            "provider_id": prof.get("provider_id"),
            "slug": prof.get("slug"),
        }

    # ─── POST /users/me/activate-provider ──────────────────────────
    @router.post("/users/me/activate-provider")
    async def activate_provider(me=Depends(get_current_user)) -> dict:
        """Flip is_provider=true. The FE then routes the user to
        /provider/onboarding to actually fill out their eCard.

        Idempotent — if the user already has a provider doc we just
        report back the current state.
        """
        existing = await db.provider_profiles.find_one(
            {"user_id": me.user_id},
            {"_id": 0, "provider_id": 1, "slug": 1, "provider_plan": 1, "verification_status": 1},
        )
        if existing:
            return {
                "is_provider": True,
                "already_existed": True,
                "provider_id": existing["provider_id"],
                "slug": existing.get("slug"),
                "needs_onboarding": existing.get("verification_status") in (None, "pending")
                                    and not existing.get("slug"),
            }

        # No provider doc yet — create a STUB so subsequent calls find it
        # and so the existing /provider/onboarding flow can hydrate it.
        # We intentionally do NOT generate a slug or business_name here;
        # the 6-step wizard does that on completion.
        now_iso = datetime.now(timezone.utc).isoformat()
        provider_id = f"prov_pending_{me.user_id[-12:]}"
        stub = {
            "provider_id": provider_id,
            "user_id": me.user_id,
            "slug": None,
            "verification_status": "pending",
            "is_active": False,         # invisible until they finish the wizard
            "plan": FREE_PLAN_KEY,
            "provider_plan": FREE_PLAN_KEY,
            "provider_verified": False,
            "preferences": DEFAULT_PREFERENCES.copy(),
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        await db.provider_profiles.insert_one(stub)
        logger.info(f"v3 activate-provider: stub created for user_id={me.user_id}")
        return {
            "is_provider": True,
            "already_existed": False,
            "provider_id": provider_id,
            "slug": None,
            "needs_onboarding": True,
        }

    # ─── POST /users/me/preferences ────────────────────────────────
    @router.post("/users/me/preferences")
    async def update_preferences(payload: PreferencesIn, me=Depends(get_current_user)) -> dict:
        """Partial update of the provider preferences map. Only keys
        present in the payload (and not None) are written, so the FE
        can patch one toggle at a time."""
        prof = await db.provider_profiles.find_one(
            {"user_id": me.user_id},
            {"_id": 0, "provider_id": 1, "preferences": 1},
        )
        if not prof:
            raise HTTPException(status_code=403, detail="Solo proveedores pueden modificar preferencias.")
        current = {**DEFAULT_PREFERENCES, **(prof.get("preferences") or {})}
        for key, value in payload.model_dump(exclude_none=True).items():
            current[key] = bool(value)
        await db.provider_profiles.update_one(
            {"provider_id": prof["provider_id"]},
            {"$set": {"preferences": current, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        return {"preferences": current}

    # ─── POST /users/me/verify ─────────────────────────────────────
    @router.post("/users/me/verify")
    async def verify_provider(me=Depends(get_current_user)) -> dict:
        """Phase 1: mark the provider as verified WITHOUT charging.
        Stripe wiring will replace this body once we have keys.

        Idempotent — re-calling returns the existing code.
        """
        prof = await db.provider_profiles.find_one(
            {"user_id": me.user_id},
            {"_id": 0, "provider_id": 1, "provider_verified": 1, "getamano_code": 1},
        )
        if not prof:
            raise HTTPException(status_code=404, detail="Activa tu perfil de proveedor primero.")

        if prof.get("provider_verified") and prof.get("getamano_code"):
            return {
                "provider_verified": True,
                "getamano_code": prof["getamano_code"],
                "already_verified": True,
            }

        code = prof.get("getamano_code") or await generate_unique_gm_code(db)
        await db.provider_profiles.update_one(
            {"provider_id": prof["provider_id"]},
            {"$set": {
                "provider_verified": True,
                "provider_plan": VERIFIED_PLAN_KEY,
                "getamano_code": code,
                "verified_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        logger.info(f"v3 verify: provider {prof['provider_id']} verified with {code}")
        return {
            "provider_verified": True,
            "getamano_code": code,
            "already_verified": False,
        }

    return router
