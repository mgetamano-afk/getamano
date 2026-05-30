"""
Section 73 — Founder Discount for the first 100 providers (Section 74 update).

Rule: the first ONE HUNDRED (100) providers ever to register on getamano
get ANY paid plan (Básico $10, Pro $15 or Premium $25) **FREE until
December 31, 2027**. After that date, Stripe begins charging the normal
plan price. The free plan is intentionally excluded — only paid plans
participate.

This is a growth incentive to seed the marketplace with quality providers
who are committed to a real paid tier (not free riders).

Persistence shape
─────────────────
Adds the following fields to a `provider_profiles` document at claim time:

    is_founder         : bool           — eligible for the free-until-2027 perk
    founder_position   : int            — 1..100 (capacity gate)
    founder_locked_at  : datetime UTC   — when the slot was claimed
    founder_free_until : str (ISO date) — '2027-12-31' (perk expiry)

Endpoints
─────────
GET  /api/founders/status           — public counter: { slots_total, slots_used,
                                       slots_remaining, free_until }
POST /api/founders/claim            — auth required, called once per
                                       new provider profile creation
                                       (idempotent — second call is a no-op).

Atomicity
─────────
We use a single `find_one_and_update` with `$inc` on a counter doc + a
`$lt` guard so the 101st claim cannot succeed even under racing requests.
This makes the cap a hard limit at the database level.
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pymongo import ReturnDocument

logger = logging.getLogger(__name__)

FOUNDER_TOTAL_SLOTS = 100
FOUNDER_FREE_UNTIL = "2027-12-31"  # Section 74 — perk expires at end of 2027
FOUNDER_COUNTER_KEY = "founders_v1"


async def _counter_doc(db) -> dict:
    """Get-or-create the singleton counter doc.

    Section 74: total bumped from 50 → 100. We also update legacy docs
    where `total=50` so the cap matches the new constant.
    """
    doc = await db.counters.find_one({"_id": FOUNDER_COUNTER_KEY}, {"_id": 0, "used": 1, "total": 1})
    if doc is None:
        await db.counters.insert_one({
            "_id": FOUNDER_COUNTER_KEY,
            "used": 0,
            "total": FOUNDER_TOTAL_SLOTS,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"used": 0}
    # Idempotently bump legacy total=50 docs to the new 100 cap
    if int(doc.get("total", 0)) != FOUNDER_TOTAL_SLOTS:
        await db.counters.update_one(
            {"_id": FOUNDER_COUNTER_KEY},
            {"$set": {"total": FOUNDER_TOTAL_SLOTS}},
        )
    return doc


def build_founders_router(*, db, User, get_current_user) -> APIRouter:
    router = APIRouter()

    @router.get("/founders/status")
    async def status() -> dict:
        """Public: how many founder slots remain. Used by the landing
        page and the provider signup screen to display urgency."""
        c = await _counter_doc(db)
        used = int(c.get("used", 0))
        return {
            "slots_total": FOUNDER_TOTAL_SLOTS,
            "slots_used": used,
            "slots_remaining": max(0, FOUNDER_TOTAL_SLOTS - used),
            "free_until": FOUNDER_FREE_UNTIL,  # Section 74 — frontend copy uses this
        }

    @router.post("/founders/claim")
    async def claim(user: User = Depends(get_current_user)) -> dict:
        """Atomically claim a founder slot for the currently-authenticated
        provider. Idempotent: a second call returns the user's previously
        assigned position rather than burning another slot."""
        profile = await db.provider_profiles.find_one(
            {"user_id": user.user_id},
            {"_id": 0, "provider_id": 1, "is_founder": 1, "founder_position": 1},
        )
        if not profile:
            raise HTTPException(status_code=404, detail="No tienes un perfil de proveedor todavía.")

        # Already claimed → return existing state
        if profile.get("is_founder") and profile.get("founder_position"):
            return {
                "is_founder": True,
                "founder_position": profile["founder_position"],
                "slots_remaining": max(0, FOUNDER_TOTAL_SLOTS - profile["founder_position"]),
            }

        # Atomic claim via find_one_and_update with `$lt` guard
        await _counter_doc(db)  # ensure exists
        claimed = await db.counters.find_one_and_update(
            {"_id": FOUNDER_COUNTER_KEY, "used": {"$lt": FOUNDER_TOTAL_SLOTS}},
            {"$inc": {"used": 1}},
            return_document=ReturnDocument.AFTER,
        )
        if claimed is None:
            return {
                "is_founder": False,
                "founder_position": None,
                "slots_remaining": 0,
                "reason": "sold_out",
            }

        position = int(claimed["used"])
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.provider_profiles.update_one(
            {"user_id": user.user_id},
            {"$set": {
                "is_founder": True,
                "founder_position": position,
                "founder_locked_at": now_iso,
                "founder_free_until": FOUNDER_FREE_UNTIL,  # Section 74
            }},
        )
        logger.info(f"founder #{position} claimed by user_id={user.user_id}")
        return {
            "is_founder": True,
            "founder_position": position,
            "slots_remaining": max(0, FOUNDER_TOTAL_SLOTS - position),
            "free_until": FOUNDER_FREE_UNTIL,
        }

    return router
