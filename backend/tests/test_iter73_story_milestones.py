"""
Iteration 73 — Story like milestone notifications + spectacular UI.

Backend feature tested here: when a story crosses 10, 50, or 100 likes,
the owner gets a one-time in-app notification (and Web Push if subscribed).
The `notification_key` is unique per (story, threshold) so retries are
idempotent.

Strategy
────────
Driving a story to 100 likes from this test would mean fabricating 100
real user accounts — too expensive. Instead we:
  1. Verify the `_emit_story_milestone` helper exists with the right
     thresholds (10/50/100).
  2. Verify it is idempotent — calling it twice with the same threshold
     inserts exactly one notification.
  3. Verify it short-circuits on missing data (no story owner) without
     raising.

These checks lock the milestone contract without flooding the DB.
"""
import os
import sys
import uuid
from datetime import datetime, timezone, timedelta

import pytest

sys.path.insert(0, os.path.dirname(__file__))


def _load_env_for_motor():
    env_path = "/app/backend/.env"
    if not os.path.exists(env_path):
        return
    with open(env_path) as f:
        for line in f:
            key, _, val = line.strip().partition("=")
            val = val.strip().strip('"').strip("'")
            if key == "MONGO_URL" and "MONGO_URL" not in os.environ:
                os.environ["MONGO_URL"] = val
            if key == "DB_NAME" and "DB_NAME" not in os.environ:
                os.environ["DB_NAME"] = val


def test_milestone_tiers_definition():
    """Spec lock: only 10/50/100 trigger milestones."""
    # Import path must match the live module
    sys.path.insert(0, "/app/backend")
    from routes.stories import _MILESTONE_TIERS  # noqa: E402

    assert set(_MILESTONE_TIERS.keys()) == {10, 50, 100}
    for n, tier in _MILESTONE_TIERS.items():
        assert "emoji" in tier
        assert "label_es" in tier and tier["label_es"]
        assert "label_en" in tier and tier["label_en"]


def test_emit_story_milestone_is_idempotent_and_writes_notification():
    """Two calls with the same (story, threshold) → exactly one notification."""
    sys.path.insert(0, "/app/backend")
    from routes.stories import _emit_story_milestone  # noqa: E402
    from motor.motor_asyncio import AsyncIOMotorClient
    import asyncio

    _load_env_for_motor()

    async def _run():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        # Ephemeral story doc — never inserted, just shaped.
        story_id = f"sto_test_{uuid.uuid4().hex[:8]}"
        owner_id = f"user_test_{uuid.uuid4().hex[:8]}"
        story_doc = {"provider_user_id": owner_id, "story_id": story_id}

        # Clean any prior state
        await db.notifications.delete_many({
            "notification_key": f"story_milestone:{story_id}:10"
        })

        # First call → writes one notification
        await _emit_story_milestone(db, story_doc, story_id, 10)
        n1 = await db.notifications.count_documents(
            {"notification_key": f"story_milestone:{story_id}:10"}
        )
        assert n1 == 1, f"first emit should insert 1 notification, got {n1}"

        # Second call → idempotent, still exactly one
        await _emit_story_milestone(db, story_doc, story_id, 10)
        n2 = await db.notifications.count_documents(
            {"notification_key": f"story_milestone:{story_id}:10"}
        )
        assert n2 == 1, f"second emit should NOT duplicate, got {n2}"

        # Shape check
        notif = await db.notifications.find_one(
            {"notification_key": f"story_milestone:{story_id}:10"}, {"_id": 0}
        )
        assert notif["user_id"] == owner_id
        assert notif["category"] == "story_milestone"
        assert notif["threshold"] == 10
        assert notif["story_id"] == story_id
        assert notif["is_read"] is False
        assert "🔥" in notif["title"] or "🔥" in notif["body"]

        # Cleanup
        await db.notifications.delete_many({"story_id": story_id})
        client.close()

    asyncio.run(_run())


def test_emit_unknown_threshold_is_a_noop():
    """Calling with a non-tier number does nothing — no exception, no write."""
    sys.path.insert(0, "/app/backend")
    from routes.stories import _emit_story_milestone  # noqa: E402
    from motor.motor_asyncio import AsyncIOMotorClient
    import asyncio

    _load_env_for_motor()

    async def _run():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        story_id = f"sto_test_{uuid.uuid4().hex[:8]}"
        story_doc = {"provider_user_id": "user_x", "story_id": story_id}
        await _emit_story_milestone(db, story_doc, story_id, 7)  # not a tier
        cnt = await db.notifications.count_documents({"story_id": story_id})
        assert cnt == 0
        client.close()

    asyncio.run(_run())


def test_emit_without_owner_is_a_noop():
    """Missing provider_user_id must not crash and must not insert."""
    sys.path.insert(0, "/app/backend")
    from routes.stories import _emit_story_milestone  # noqa: E402
    from motor.motor_asyncio import AsyncIOMotorClient
    import asyncio

    _load_env_for_motor()

    async def _run():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        story_id = f"sto_test_{uuid.uuid4().hex[:8]}"
        await _emit_story_milestone(db, {}, story_id, 10)
        cnt = await db.notifications.count_documents({"story_id": story_id})
        assert cnt == 0
        client.close()

    asyncio.run(_run())
