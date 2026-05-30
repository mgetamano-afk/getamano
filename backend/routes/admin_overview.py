"""
Admin Overview (V7 Item 3) — extra admin endpoints clustered for the
rebuilt admin dashboard:

  GET  /api/admin/overview           — KPI tiles + recent signups/payments
  GET  /api/admin/founders           — founding-members table
  GET  /api/admin/payments           — placeholder until Stripe is live

This sits alongside the existing inline admin endpoints in server.py
(`/admin/stats`, `/admin/providers/*`, etc.) so we don't duplicate work
— only the V7-new endpoints live here.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends

logger = logging.getLogger(__name__)


def make_router(*, db: Any, User: type, require_admin) -> APIRouter:
    router = APIRouter()

    @router.get("/admin/overview")
    async def admin_overview(_: User = Depends(require_admin)) -> dict:
        now = datetime.now(timezone.utc)
        seven_iso = (now - timedelta(days=7)).isoformat()

        # KPIs
        total_users = await db.users.count_documents({})
        total_providers = await db.provider_profiles.count_documents({"is_active": True})
        verified_providers = await db.provider_profiles.count_documents(
            {"is_active": True, "verification_status": "approved"}
        )
        new_users_7d = await db.users.count_documents({"created_at": {"$gte": seven_iso}})
        new_reviews_7d = await db.reviews.count_documents({"created_at": {"$gte": seven_iso}})
        new_reels_7d = await db.reels.count_documents({"created_at": {"$gte": seven_iso}})
        new_stories_7d = await db.stories.count_documents({"created_at": {"$gte": now - timedelta(days=7)}})

        # Founders progress
        founders = await db.founders_counter.find_one({"_id": "global"}, {"_id": 0}) or {
            "slots_total": 100, "slots_used": 0,
        }

        # Recent signups (last 8)
        recent_signups = await db.users.find(
            {},
            {"_id": 0, "user_id": 1, "name": 1, "email": 1, "role": 1, "created_at": 1},
        ).sort("created_at", -1).limit(8).to_list(8)

        # Recent reels (admin moderation peek)
        recent_reels = await db.reels.find(
            {},
            {"_id": 0, "reel_id": 1, "business_name": 1, "caption": 1, "is_public": 1,
             "likes_count": 1, "views_count": 1, "created_at": 1},
        ).sort("created_at", -1).limit(5).to_list(5)

        # Physical card orders summary
        physical_cards_pending = await db.physical_card_orders.count_documents(
            {"status": {"$in": ["ordered", "printing"]}}
        )

        return {
            "kpis": {
                "total_users": total_users,
                "total_providers": total_providers,
                "verified_providers": verified_providers,
                "new_users_7d": new_users_7d,
                "new_reviews_7d": new_reviews_7d,
                "new_reels_7d": new_reels_7d,
                "new_stories_7d": new_stories_7d,
                "physical_cards_pending": physical_cards_pending,
            },
            "founders": {
                "slots_total": founders.get("slots_total", 100),
                "slots_used": founders.get("slots_used", 0),
                "slots_left": max(0, founders.get("slots_total", 100) - founders.get("slots_used", 0)),
            },
            "recent_signups": recent_signups,
            "recent_reels": recent_reels,
            "generated_at": now.isoformat(),
        }

    @router.get("/admin/founders")
    async def admin_founders(_: User = Depends(require_admin)) -> dict:
        founders = await db.founders_counter.find_one({"_id": "global"}, {"_id": 0}) or {
            "slots_total": 100, "slots_used": 0,
        }
        # We don't store an explicit list of founders; surface the
        # earliest approved providers as a proxy until the founders
        # collection has explicit user_ids in production.
        members = await db.provider_profiles.find(
            {"is_active": True, "verification_status": "approved"},
            {"_id": 0, "provider_id": 1, "user_id": 1, "business_name": 1, "slug": 1,
             "city": 1, "getamano_code": 1, "created_at": 1},
        ).sort("created_at", 1).limit(founders.get("slots_total", 100)).to_list(founders.get("slots_total", 100))
        return {
            "slots_total": founders.get("slots_total", 100),
            "slots_used": founders.get("slots_used", 0),
            "members": members,
        }

    @router.get("/admin/payments")
    async def admin_payments(_: User = Depends(require_admin)) -> dict:
        """Section 89 v7 — Placeholder until Stripe goes live. The actual
        ledger lives in `wallet_transactions` for referrals only.
        """
        recent_referrals = await db.wallet_transactions.find(
            {}, {"_id": 0}
        ).sort("created_at", -1).limit(20).to_list(20)
        return {
            "stripe_live": False,
            "recent_wallet_transactions": recent_referrals,
            "note": "Conecta Stripe para empezar a cobrar y mostrar pagos reales.",
        }

    return router
