"""One-shot cleanup script — FIX-02.

Archives obviously-test provider profiles (lowercase nonsense names, missing
city/state, single-word businesses, joke descriptions) so they no longer
appear on the public landing or in /api/providers.

Safe to re-run: only flips `is_active` from True → False. Never deletes data;
admin can restore via the admin queue if needed.
"""
import asyncio
import os
import re
import sys

from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.environ.get("MONGO_URL") or "mongodb://localhost:27017"
DB_NAME = os.environ.get("DB_NAME") or "test_database"


def looks_like_test(p: dict) -> tuple[bool, str]:
    """Returns (is_test, reason)."""
    name = (p.get("business_name") or "").strip()
    desc = (p.get("description") or "").strip().lower()
    city = (p.get("city") or "").strip()
    state = (p.get("state") or "").strip()

    if not name:
        return True, "empty business_name"
    # All-lowercase short single word like "palas", "elyte", "jaz", "test"
    if len(name) <= 10 and name == name.lower() and len(name.split()) <= 2:
        return True, "lowercase low-quality name"
    # Contains TEST/QA/PROMO_TEST
    if re.search(r"\b(test|qa|prueba|asdf|xxxx)\b", name.lower()) or "test_" in name.lower() or "promo_biz" in name.lower():
        return True, "test keyword in name"
    # Joke descriptions
    if desc and any(k in desc for k in ("asdf", "xxxxxx", "qwerty", "limpoipm", "limpioocasas", "arregador")):
        return True, "garbage description tokens"
    # Missing both city AND state
    if not city and not state:
        return True, "missing city and state"
    return False, ""


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    archived = []
    kept = []
    async for p in db.provider_profiles.find({"is_active": True}):
        suspicious, reason = looks_like_test(p)
        if suspicious:
            await db.provider_profiles.update_one(
                {"provider_id": p["provider_id"]},
                {"$set": {"is_active": False, "archived_reason": "test_data_cleanup_may22", "archived_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()}},
            )
            archived.append((p.get("business_name", "?"), reason))
        else:
            kept.append(p.get("business_name", "?"))

    print(f"\nArchived ({len(archived)}):")
    for name, reason in archived:
        print(f"  - {name!r:30}  reason: {reason}")
    print(f"\nKept ({len(kept)}):")
    for name in kept:
        print(f"  - {name!r}")

    # ─── Reviews — strip TEST-prefixed reviews that leaked into public eCards ───
    review_filter = {
        "$or": [
            {"client_name": {"$regex": r"^(TestUser|TEST[_ ]|QA[_ ])", "$options": "i"}},
            {"comment": {"$regex": r"^TEST[_ ]", "$options": "i"}},
            {"comment": {"$regex": r"^(asdf|qwer|xxxx)", "$options": "i"}},
        ],
    }
    reviews_to_archive = await db.reviews.count_documents(review_filter)
    if reviews_to_archive:
        await db.reviews.update_many(
            review_filter,
            {"$set": {"is_hidden": True, "hidden_reason": "test_data_cleanup_may22"}},
        )
    print(f"\nHidden TEST reviews: {reviews_to_archive}")


if __name__ == "__main__":
    sys.exit(asyncio.run(main()) or 0)
