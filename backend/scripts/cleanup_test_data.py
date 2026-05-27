"""
Cleanup script for production-bug B2 — Remove all TEST_/iter test data.

Preserves the 3 demo accounts (admin@, demo.provider@, demo.client@) and
cleans every cascading record they reference. Safe to re-run.
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient


PROTECTED_EMAILS = {
    "admin@getamano.com",
    "demo.provider@getamano.com",
    "demo.client@getamano.com",
}


async def main():
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]

    # 1) Find all test users
    test_user_query = {
        "$or": [
            {"email": {"$regex": "@test\\.|^test_|@pytest\\.", "$options": "i"}},
            {"name": {"$regex": "^TestUser", "$options": "i"}},
        ],
        "email": {"$nin": list(PROTECTED_EMAILS)},
    }
    # Need to combine carefully
    test_users = await db.users.find(
        {
            "$and": [
                {"email": {"$nin": list(PROTECTED_EMAILS)}},
                {"$or": [
                    {"email": {"$regex": "@test\\.|^test_|@pytest\\.", "$options": "i"}},
                    {"name": {"$regex": "^TestUser", "$options": "i"}},
                ]},
            ]
        },
        {"_id": 0, "user_id": 1, "email": 1, "name": 1},
    ).to_list(None)
    test_user_ids = [u["user_id"] for u in test_users]
    test_emails = [u["email"] for u in test_users]
    print(f"Test users to delete: {len(test_user_ids)}")

    # 2) Find all test provider profiles
    test_provider_profiles = await db.provider_profiles.find(
        {"$or": [
            {"business_name": {"$regex": "^TEST", "$options": "i"}},
            {"user_id": {"$in": test_user_ids}},
        ]},
        {"_id": 0, "provider_id": 1, "user_id": 1, "business_name": 1},
    ).to_list(None)
    test_provider_ids = [p["provider_id"] for p in test_provider_profiles]
    print(f"Test provider profiles to delete: {len(test_provider_ids)}")

    # 3) Cascade deletes — gigs, reviews, applications, mensajes, conversations,
    #    saved_ecards, story_views, story_likes, stories, banner_shares, posts, etc.
    cascade = {
        "gigs": [
            {"title": {"$regex": "TEST", "$options": "i"}},
            {"title": {"$regex": "iter\\d", "$options": "i"}},
            {"created_by": {"$in": test_user_ids}},
            {"provider_user_id": {"$in": test_user_ids}},
            {"client_id": {"$in": test_user_ids}},
        ],
        "reviews": [
            {"comment": {"$regex": "TEST", "$options": "i"}},
            {"comment": {"$regex": "iter\\d", "$options": "i"}},
            {"user_id": {"$in": test_user_ids}},
            {"client_id": {"$in": test_user_ids}},
            {"provider_id": {"$in": test_provider_ids}},
        ],
        "service_requests": [
            {"client_id": {"$in": test_user_ids}},
            {"provider_user_id": {"$in": test_user_ids}},
            {"provider_id": {"$in": test_provider_ids}},
        ],
        "conversations": [
            {"client_id": {"$in": test_user_ids}},
            {"provider_user_id": {"$in": test_user_ids}},
            {"participant_user_id": {"$in": test_user_ids}},
        ],
        "messages": [{"sender_user_id": {"$in": test_user_ids}}],
        "saved_ecards": [
            {"user_id": {"$in": test_user_ids}},
            {"provider_id": {"$in": test_provider_ids}},
        ],
        "stories": [{"provider_id": {"$in": test_provider_ids}}],
        "story_views": [{"user_id": {"$in": test_user_ids}}],
        "story_likes": [{"user_id": {"$in": test_user_ids}}],
        "banner_shares": [{"provider_id": {"$in": test_provider_ids}}],
        "community_posts": [{"user_id": {"$in": test_user_ids}}],
        "community_likes": [{"user_id": {"$in": test_user_ids}}],
        "community_comments": [{"user_id": {"$in": test_user_ids}}],
        "notifications": [{"user_id": {"$in": test_user_ids}}],
        "calendar_bookings": [
            {"client_id": {"$in": test_user_ids}},
            {"provider_id": {"$in": test_provider_ids}},
        ],
        "ecard_views": [
            {"viewer_user_id": {"$in": test_user_ids}},
            {"provider_id": {"$in": test_provider_ids}},
        ],
        "ecard_shares": [{"provider_id": {"$in": test_provider_ids}}],
        "referrals": [
            {"referrer_user_id": {"$in": test_user_ids}},
            {"referred_user_id": {"$in": test_user_ids}},
        ],
        "subscriptions": [{"provider_id": {"$in": test_provider_ids}}],
        "milestones": [{"user_id": {"$in": test_user_ids}}],
        "verification_attempts": [{"email": {"$in": test_emails}}],
        "otp_codes": [{"email": {"$in": test_emails}}],
        "password_reset_tokens": [{"email": {"$in": test_emails}}],
        "leads": [{"email": {"$in": test_emails}}],
    }

    total_deleted = 0
    for coll, queries in cascade.items():
        if not queries:
            continue
        # Build $or query if multiple
        if len(queries) == 1:
            q = queries[0]
        else:
            q = {"$or": queries}
        try:
            res = await db[coll].delete_many(q)
            if res.deleted_count:
                print(f"  {coll}: -{res.deleted_count}")
            total_deleted += res.deleted_count
        except Exception as e:
            print(f"  {coll}: ERROR — {e}")

    # 4) Finally delete the test users and their provider profiles
    res_p = await db.provider_profiles.delete_many({"provider_id": {"$in": test_provider_ids}})
    print(f"  provider_profiles: -{res_p.deleted_count}")
    res_u = await db.users.delete_many({"user_id": {"$in": test_user_ids}})
    print(f"  users: -{res_u.deleted_count}")
    total_deleted += res_p.deleted_count + res_u.deleted_count

    print(f"\nTotal records purged: {total_deleted}")

    # 5) Confirm protected accounts intact
    for em in PROTECTED_EMAILS:
        u = await db.users.find_one({"email": em}, {"_id": 0, "email": 1, "role": 1, "name": 1})
        print(f"  Preserved: {u}")


if __name__ == "__main__":
    asyncio.run(main())
