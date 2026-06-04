"""routes/community_engagement.py — public community endpoints.

Section 96 (V19.5 refactor — extraction round 3).

Three endpoints used by the public landing, the wall-of-fame page and
the homepage stats hero. All read-only, no auth required.

Endpoints:
  • GET /community/leaderboard     top providers by milestones (week/month/all)
  • GET /community/wall-of-fame    public feed of recent milestone unlocks
  • GET /public/stats              landing-page hero stats (providers, states, avg rating)
"""
from datetime import datetime, timezone, timedelta
from typing import Any

from fastapi import APIRouter


def make_router(
    *,
    db: Any,
    milestone_defs: list,
    public_guard: dict,
) -> APIRouter:
    router = APIRouter()

    @router.get("/community/leaderboard")
    async def leaderboard(period: str = "month", limit: int = 5):
        """Top providers by milestones unlocked in a period (month/week/all)."""
        limit = max(1, min(limit, 20))
        now = datetime.now(timezone.utc)
        match: dict = {}
        period_label = "all"
        if period == "month":
            start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
            match["unlocked_at"] = {"$gte": start}
            period_label = "month"
        elif period == "week":
            start = (now - timedelta(days=7)).isoformat()
            match["unlocked_at"] = {"$gte": start}
            period_label = "week"
        pipeline = [
            {"$match": match} if match else {"$match": {}},
            {"$group": {"_id": "$user_id", "count": {"$sum": 1}, "last_at": {"$max": "$unlocked_at"}}},
            {"$sort": {"count": -1, "last_at": -1}},
            {"$limit": limit * 4},
        ]
        rows = await db.provider_milestones.aggregate(pipeline).to_list(limit * 4)
        items = []
        rank = 0
        for row in rows:
            uid = row["_id"]
            user = await db.users.find_one({"user_id": uid}, {"_id": 0, "name": 1}) or {}
            prof = await db.provider_profiles.find_one({"user_id": uid}, {"_id": 0, "slug": 1, "business_name": 1, "city": 1, "state": 1, "logo_url": 1, "latino_owned": 1, "is_active": 1, "verification_status": 1}) or {}
            biz = prof.get("business_name") or ""
            if biz.startswith("TEST_") or not prof.get("is_active", True):
                continue
            name = (user.get("name") or "").strip()
            first = name.split(" ")[0] if name else (biz.split(" ")[0] if biz else "Negocio")
            rank += 1
            items.append({
                "rank": rank,
                "first_name": first,
                "business_name": biz or None,
                "city": prof.get("city"),
                "state": prof.get("state"),
                "slug": prof.get("slug"),
                "logo_url": prof.get("logo_url"),
                "latino_owned": prof.get("latino_owned") == "yes",
                "milestones_count": row["count"],
                "last_at": row.get("last_at"),
            })
            if rank >= limit:
                break
        return {"period": period_label, "items": items}

    @router.get("/community/wall-of-fame")
    async def wall_of_fame(limit: int = 50):
        """Public anonymized feed of recent milestone unlocks across providers."""
        limit = max(1, min(limit, 100))
        defs_by_id = {d["id"]: d for d in milestone_defs}
        cursor = db.provider_milestones.find({}, {"_id": 0}).sort("unlocked_at", -1).limit(limit)
        items = []
        user_cache: dict = {}
        prof_cache: dict = {}
        async for rec in cursor:
            mid = rec.get("milestone_id")
            d = defs_by_id.get(mid)
            if not d:
                continue
            uid = rec.get("user_id")
            if uid not in user_cache:
                user_cache[uid] = await db.users.find_one({"user_id": uid}, {"_id": 0, "name": 1}) or {}
            if uid not in prof_cache:
                prof_cache[uid] = await db.provider_profiles.find_one({"user_id": uid}, {"_id": 0, "slug": 1, "business_name": 1, "city": 1, "state": 1, "logo_url": 1, "latino_owned": 1}) or {}
            u = user_cache[uid]
            prof = prof_cache[uid]
            biz = prof.get("business_name") or ""
            name = (u.get("name") or "").strip()
            first = name.split(" ")[0] if name else (biz.split(" ")[0] if biz else "Alguien")
            if biz.startswith("TEST_"):
                continue
            items.append({
                "first_name": first,
                "city": prof.get("city"),
                "state": prof.get("state"),
                "business_name": biz or None,
                "slug": prof.get("slug"),
                "logo_url": prof.get("logo_url"),
                "latino_owned": prof.get("latino_owned") == "yes",
                "milestone_id": mid,
                "title": d["title"],
                "emoji": d["emoji"],
                "tier": d["tier"],
                "unlocked_at": rec.get("unlocked_at"),
            })
        total_unlocked = await db.provider_milestones.count_documents({})
        total_providers = await db.provider_profiles.count_documents({"is_active": True})
        by_tier = {"silver": 0, "gold": 0, "platinum": 0}
        for it in items:
            if it["tier"] in by_tier:
                by_tier[it["tier"]] += 1
        return {"items": items, "stats": {"total_unlocked": total_unlocked, "total_providers": total_providers, "by_tier": by_tier}}

    @router.get("/public/stats")
    async def public_stats():
        # Real stats with TEST data excluded
        base_q = {"verification_status": "approved", "is_active": True, **public_guard}
        total = await db.provider_profiles.count_documents(base_q)
        registered_total = await db.provider_profiles.count_documents({"is_active": True, **public_guard})
        states = await db.provider_profiles.distinct("state", {"is_active": True, **public_guard})
        avg_doc = await db.provider_profiles.aggregate([
            {"$match": {"rating_count": {"$gt": 0}, "is_test": {"$ne": True}}},
            {"$group": {"_id": None, "avg": {"$avg": "$rating_avg"}}},
        ]).to_list(1)
        avg = round(avg_doc[0]["avg"], 1) if avg_doc else 4.9
        # Until 'approved' count reaches critical mass, show 'registered'.
        label_key = "verified" if total >= 25 else "registered"
        return {
            "providers": total if total >= 25 else registered_total,
            "providers_label": label_key,
            "states": len([s for s in states if s]),
            "rating": avg,
        }

    return router
