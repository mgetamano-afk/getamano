"""
Featured Providers (weekly rotation) — Section 89 v4 Phase F
==============================================================

Every Monday after 06:00 UTC we pick the top providers by a composite
score (Trust Score + recent activity + reviews this week) and store
them as the "Featured" pool for the upcoming ISO week. The Barrio
"Destacados esta semana" strip reads from this pool first, then falls
back to the generic /api/providers list if the pool is empty.

Collections
-----------
`featured_providers`:
  { week_key (ISO yyyy-Www), provider_id, user_id, slug,
    business_name, logo_url, city, state, getamano_code,
    provider_verified, score, computed_at }

Index: (week_key, score desc)

Algorithm
---------
score = trust_lite + reviews_last_7d * 6 + activity_last_7d * 3
trust_lite = verified*25 + portfolio_count*1.5 (cap 15)
             + reviews_count*1 (cap 20) + avg_rating*4 (cap 20)
             + referrals_converted*2 (cap 10) + days_active/180*10 (cap 10)
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

logger = logging.getLogger(__name__)


def current_week_key(now: Optional[datetime] = None) -> str:
    """ISO yyyy-Www string for the current UTC week."""
    n = now or datetime.now(timezone.utc)
    y, w, _ = n.isocalendar()
    return f"{y}-W{w:02d}"


def _trust_lite(p: dict) -> float:
    score = 0.0
    if p.get("provider_verified"):
        score += 25
    score += min(15, (p.get("portfolio_count", 0) or 0) * 1.5)
    score += min(20, p.get("reviews_count", 0) or 0)
    score += min(20, (p.get("avg_rating", 0) or 0) * 4)
    score += min(10, (p.get("referrals_converted", 0) or 0) * 2)
    score += min(10, (p.get("days_active", 0) or 0) / 180 * 10)
    return score


async def _compute_signals_for_provider(db, prof: dict) -> dict:
    """Compute the dynamic Trust Score + this-week activity signals for
    one provider. Returns a dict ready to enter the scoring formula.
    """
    user_id = prof["user_id"]
    provider_id = prof["provider_id"]
    now = datetime.now(timezone.utc)
    seven_days_ago = (now - timedelta(days=7)).isoformat()

    # Static trust signals
    portfolio_count = await db.portfolio_items.count_documents({"provider_id": provider_id})
    referrals_converted = await db.referrals.count_documents(
        {"referrer_user_id": user_id, "status": "paid"}
    )
    avg_rating = float(prof.get("rating_avg") or 0)
    reviews_count = int(prof.get("rating_count") or 0)

    # Dynamic weekly signals
    reviews_last_7d = await db.reviews.count_documents({
        "provider_id": provider_id, "created_at": {"$gte": seven_days_ago},
    })
    activity_last_7d = (
        await db.stories.count_documents({
            "provider_user_id": user_id, "created_at": {"$gte": now - timedelta(days=7)},
        })
        + await db.reels.count_documents({
            "provider_user_id": user_id, "created_at": {"$gte": seven_days_ago},
        })
    )

    # days_active
    days_active = 0
    if prof.get("created_at"):
        try:
            cd = datetime.fromisoformat(str(prof["created_at"]).replace("Z", "+00:00"))
            days_active = max(0, (now - cd).days)
        except Exception:
            days_active = 0

    return {
        "provider_verified": bool(prof.get("provider_verified")),
        "portfolio_count": portfolio_count,
        "referrals_converted": referrals_converted,
        "avg_rating": avg_rating,
        "reviews_count": reviews_count,
        "days_active": days_active,
        "reviews_last_7d": reviews_last_7d,
        "activity_last_7d": activity_last_7d,
    }


async def compute_featured_for_week(db, week_key: str, limit: int = 24) -> int:
    """Recompute the featured pool for `week_key`. Returns the count
    inserted. Existing rows for the same week are wiped first so the
    job is idempotent across re-runs.
    """
    profs = await db.provider_profiles.find(
        {
            "is_active": True,
            "verification_status": {"$in": ["approved", "verified"]},
        },
        {
            "_id": 0, "provider_id": 1, "user_id": 1, "slug": 1,
            "business_name": 1, "logo_url": 1, "city": 1, "state": 1,
            "getamano_code": 1, "provider_verified": 1,
            "rating_avg": 1, "rating_count": 1, "created_at": 1,
            "cover_url": 1,
        },
    ).to_list(2000)

    scored = []
    for p in profs:
        sig = await _compute_signals_for_provider(db, p)
        score = _trust_lite(sig) + sig["reviews_last_7d"] * 6 + sig["activity_last_7d"] * 3
        scored.append({
            "week_key": week_key,
            "provider_id": p["provider_id"],
            "user_id": p["user_id"],
            "slug": p.get("slug"),
            "business_name": p.get("business_name"),
            "logo_url": p.get("logo_url"),
            "cover_url": p.get("cover_url"),
            "city": p.get("city"),
            "state": p.get("state"),
            "getamano_code": p.get("getamano_code"),
            "provider_verified": bool(p.get("provider_verified")),
            "score": round(score, 2),
            "avg_rating": sig["avg_rating"],
            "reviews_count": sig["reviews_count"],
            "portfolio_count": sig["portfolio_count"],
            "referrals_converted": sig["referrals_converted"],
            "days_active": sig["days_active"],
            "computed_at": datetime.now(timezone.utc).isoformat(),
        })

    scored.sort(key=lambda x: x["score"], reverse=True)
    top = scored[:limit]
    await db.featured_providers.delete_many({"week_key": week_key})
    if top:
        await db.featured_providers.insert_many(top)
    return len(top)


def make_router(*, db, User, get_current_user, require_admin) -> APIRouter:
    router = APIRouter()

    @router.get("/providers/featured")
    async def featured_providers(
        city: Optional[str] = None,
        limit: int = 8,
        week: Optional[str] = None,
    ) -> list:
        """Public — current week's featured pool. Optional `city` narrows
        the pool to a single locality. Falls back to a generic top list
        when the pool is empty.

        Backward-compat: rows include `rating_avg`/`rating_count` aliases
        so legacy consumers (`AppHome`, `Landing`) keep working, and we
        attach the `category` object expected by those pages.
        """
        wk = week or current_week_key()
        q: dict = {"week_key": wk}
        if city:
            q["city"] = {"$regex": f"^{city}$", "$options": "i"}
        rows = await db.featured_providers.find(q, {"_id": 0}).sort("score", -1).limit(limit).to_list(limit)
        if not rows:
            fb_q: dict = {"is_active": True}
            if city:
                fb_q["city"] = {"$regex": f"^{city}$", "$options": "i"}
            rows = await db.provider_profiles.find(fb_q, {"_id": 0}).sort(
                [("rating_avg", -1), ("rating_count", -1)]
            ).limit(limit).to_list(limit)

        # Hydrate `category` (legacy field) + alias `rating_*` for the
        # AppHome / Landing carousels.
        cats = {c["category_id"]: c for c in await db.categories.find({}, {"_id": 0}).to_list(200)}
        # Map provider_id → category_id from the source profiles when
        # rows came from the featured pool (which strips category_id).
        if rows and "category_id" not in rows[0]:
            ids = [r["provider_id"] for r in rows]
            srcs = await db.provider_profiles.find(
                {"provider_id": {"$in": ids}},
                {"_id": 0, "provider_id": 1, "category_id": 1, "rating_avg": 1, "rating_count": 1},
            ).to_list(len(ids))
            by_id = {s["provider_id"]: s for s in srcs}
            for r in rows:
                src = by_id.get(r["provider_id"], {})
                r["category_id"] = src.get("category_id")
                r["rating_avg"] = src.get("rating_avg", r.get("avg_rating", 0))
                r["rating_count"] = src.get("rating_count", r.get("reviews_count", 0))
        for r in rows:
            r["category"] = cats.get(r.get("category_id"))
        return rows

    @router.post("/admin/featured/run-now")
    async def admin_run_featured_now(_: User = Depends(require_admin)) -> dict:
        """Force-recompute the featured pool for the CURRENT ISO week.
        Admin-only escape hatch — also used by the iter94 test suite."""
        wk = current_week_key()
        count = await compute_featured_for_week(db, wk)
        return {"week_key": wk, "count": count}

    @router.get("/admin/featured")
    async def admin_list_featured(week: Optional[str] = None, _: User = Depends(require_admin)) -> list:
        wk = week or current_week_key()
        return await db.featured_providers.find(
            {"week_key": wk}, {"_id": 0}
        ).sort("score", -1).to_list(50)

    return router


async def ensure_featured_indexes(db) -> None:
    try:
        await db.featured_providers.create_index([("week_key", 1), ("score", -1)])
        await db.featured_providers.create_index([("week_key", 1), ("city", 1)])
        logger.info("featured providers indexes ensured")
    except Exception as e:
        logger.warning(f"featured providers indexes skipped: {e}")
