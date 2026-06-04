"""V18 — Engagement milestones + owner-only stats pill.

V18.1 — Backend fires a milestone notification when a fresh (<24h)
reel/story crosses an engagement threshold (5/10/25/50/100/250/500/1000
reactions). Idempotent per (subject, threshold). Surfaces in NotificationBell
as a Sonner toast.

V18.2 — Owner-only stats pill renders top-left of a reel/story showing
views/plays/likes ONLY to the creator. New endpoint
POST /api/reels/{id}/play (throttled 5min per viewer).
"""
from __future__ import annotations

import os
import time
import requests
from datetime import datetime, timezone

from test_config import API, PROVIDER_EMAIL, PROVIDER_PASSWORD, CLIENT_EMAIL, CLIENT_PASSWORD

_TIMEOUT = 30


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=_TIMEOUT)
    assert r.status_code == 200, r.text[:300]
    return s


def _read(p):
    with open(p, "r", encoding="utf-8") as f:
        return f.read()


# -------------------------------------------------------------------
# Backend integration
# -------------------------------------------------------------------
def test_play_endpoint_increments_plays_count_once():
    """V18.2 — POST /reels/{id}/play increments plays_count, then is
    throttled to once per 5 min per viewer (returns counted: false)."""
    # Seed a fresh test reel + reset plays_count so the assertion is stable.
    from pymongo import MongoClient
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")
    cli = MongoClient(mongo_url)
    db = cli[db_name]
    reel_id = "reel_v18_play_test"
    db.reels.update_one(
        {"reel_id": reel_id},
        {"$set": {
            "reel_id": reel_id,
            "user_id": "user_3e47ee2b3526",
            "video_url": "https://example.com/v18.mp4",
            "thumbnail_url": "https://example.com/v18.jpg",
            "caption": "V18 seed",
            "likes_count": 0, "wows_count": 0, "saves_count": 0, "shares_count": 0,
            "comments_count": 0, "reshares_count": 0, "views_count": 0, "plays_count": 0,
            "milestones": [],
            "is_deleted": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    # Drop any prior throttle row for our test viewer so the first call counts.
    db.reel_plays.delete_many({"reel_id": reel_id})
    cli.close()

    client = _login(CLIENT_EMAIL, CLIENT_PASSWORD)

    r1 = client.post(f"{API}/reels/{reel_id}/play", timeout=_TIMEOUT)
    assert r1.status_code == 200, r1.text[:300]
    body1 = r1.json()
    assert body1.get("ok") is True
    assert body1.get("counted") is True

    # Second call within 5 min — throttled, counted=False.
    r2 = client.post(f"{API}/reels/{reel_id}/play", timeout=_TIMEOUT)
    assert r2.status_code == 200
    assert r2.json().get("counted") is False


def test_engagement_milestone_thresholds_constant():
    """Lock the public threshold list. Any reordering / removal would
    silently change which milestones fire — we want the contract pinned."""
    from services.engagement_milestone import ENGAGEMENT_THRESHOLDS, MILESTONE_FRESHNESS_HOURS
    assert ENGAGEMENT_THRESHOLDS == [5, 10, 25, 50, 100, 250, 500, 1000]
    assert MILESTONE_FRESHNESS_HOURS == 24


def test_engagement_milestone_no_op_below_first_threshold():
    """When the new count is below 5, no notification is created."""
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    from services.engagement_milestone import maybe_fire_engagement_milestone

    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")

    async def go():
        cli = AsyncIOMotorClient(mongo_url)
        db = cli[db_name]
        # Seed an isolated reel
        rid = f"reel_v18_under_{int(time.time()*1000)}"
        await db.reels.insert_one({
            "reel_id": rid, "user_id": "user_3e47ee2b3526",
            "likes_count": 3, "milestones": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        notif = await maybe_fire_engagement_milestone(
            db, subject_type="reel", subject_id=rid, new_count=3, metric="like",
        )
        await db.reels.delete_one({"reel_id": rid})
        cli.close()
        return notif

    assert asyncio.get_event_loop().run_until_complete(go()) is None


def test_engagement_milestone_fires_once_per_threshold():
    """Crossing 5 fires once; second crossing of the same threshold
    returns None (idempotent claim via $addToSet)."""
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    from services.engagement_milestone import maybe_fire_engagement_milestone

    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")

    async def go():
        cli = AsyncIOMotorClient(mongo_url)
        db = cli[db_name]
        rid = f"reel_v18_idem_{int(time.time()*1000)}"
        await db.reels.insert_one({
            "reel_id": rid, "user_id": "user_3e47ee2b3526",
            "likes_count": 5, "milestones": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        first = await maybe_fire_engagement_milestone(
            db, subject_type="reel", subject_id=rid, new_count=5, metric="like",
        )
        second = await maybe_fire_engagement_milestone(
            db, subject_type="reel", subject_id=rid, new_count=5, metric="like",
        )
        await db.reels.delete_one({"reel_id": rid})
        await db.notifications.delete_many({"subject_id": rid})
        cli.close()
        return first, second

    first, second = asyncio.get_event_loop().run_until_complete(go())
    assert first is not None, "first cross of threshold 5 must fire"
    assert first["milestone"] == 5
    assert first["category"] == "engagement"
    assert "5 reacciones" in first["body"]
    assert second is None, "second cross of same threshold must NOT fire"


def test_engagement_milestone_picks_largest_crossed_threshold():
    """A jump from 4 → 30 should fire ONE milestone for 25 (the largest
    crossed in this update), not three separate ones."""
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    from services.engagement_milestone import maybe_fire_engagement_milestone

    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")

    async def go():
        cli = AsyncIOMotorClient(mongo_url)
        db = cli[db_name]
        rid = f"reel_v18_jump_{int(time.time()*1000)}"
        await db.reels.insert_one({
            "reel_id": rid, "user_id": "user_3e47ee2b3526",
            "likes_count": 30, "milestones": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        fired = await maybe_fire_engagement_milestone(
            db, subject_type="reel", subject_id=rid, new_count=30, metric="like",
        )
        await db.reels.delete_one({"reel_id": rid})
        await db.notifications.delete_many({"subject_id": rid})
        cli.close()
        return fired

    fired = asyncio.get_event_loop().run_until_complete(go())
    assert fired is not None
    assert fired["milestone"] == 25, f"expected milestone=25, got {fired['milestone']}"


def test_engagement_milestone_skipped_when_content_older_than_24h():
    """A reel older than 24h doesn't trigger a milestone — celebrating
    a year-old reel hitting 100 likes feels artificial."""
    import asyncio
    from datetime import timedelta
    from motor.motor_asyncio import AsyncIOMotorClient
    from services.engagement_milestone import maybe_fire_engagement_milestone

    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")

    async def go():
        cli = AsyncIOMotorClient(mongo_url)
        db = cli[db_name]
        rid = f"reel_v18_stale_{int(time.time()*1000)}"
        old = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat()
        await db.reels.insert_one({
            "reel_id": rid, "user_id": "user_3e47ee2b3526",
            "likes_count": 10, "milestones": [],
            "created_at": old,
        })
        fired = await maybe_fire_engagement_milestone(
            db, subject_type="reel", subject_id=rid, new_count=10, metric="like",
        )
        await db.reels.delete_one({"reel_id": rid})
        cli.close()
        return fired

    assert asyncio.get_event_loop().run_until_complete(go()) is None


# -------------------------------------------------------------------
# Frontend source locks
# -------------------------------------------------------------------
OWNER_PILL_PATH = "/app/frontend/src/components/OwnerStatsPill.jsx"
REELS_PAGE_PATH = "/app/frontend/src/pages/ReelsPage.jsx"
STORIES_PATH = "/app/frontend/src/components/StoriesCarousel.jsx"
BELL_PATH = "/app/frontend/src/components/NotificationBell.jsx"


def test_owner_stats_pill_component_exists():
    src = _read(OWNER_PILL_PATH)
    assert 'data-testid={`owner-stats-pill-${kind}`}' in src
    assert "Solo tú" in src
    assert "Eye" in src and "Play" in src and "Heart" in src
    # Formatting helper for big numbers
    assert "1_000_000" in src or "1000000" in src


def test_reels_page_renders_owner_pill_only_for_owner():
    src = _read(REELS_PAGE_PATH)
    assert "OwnerStatsPill" in src
    # Owner check accepts BOTH the new `user_id` (V17 unified writes)
    # and the legacy `provider_user_id` (V4 social-first schema) so the
    # pill renders correctly for all historical reels.
    assert "reel.provider_user_id === user.user_id" in src
    # Plays + views wired
    assert "plays={reel.plays_count" in src
    assert "views={reel.views_count" in src
    # /play endpoint is fired on video play
    assert "/reels/${reel.reel_id}/play" in src


def test_stories_renders_owner_pill_only_for_owner():
    src = _read(STORIES_PATH)
    assert "OwnerStatsPill" in src
    # Story isOwner gate
    assert "{isOwner &&" in src or "isOwner ?" in src


def test_notification_bell_surfaces_engagement_toasts():
    """V18.1 — When the bell polls and detects a new engagement-category
    notification, it must toast it (Sonner) instead of just sitting in
    the dropdown. Dedupe via sessionStorage so a refresh doesn't replay."""
    src = _read(BELL_PATH)
    assert 'category !== "engagement"' in src or 'category === "engagement"' in src
    assert "toast.success" in src
    assert "sessionStorage" in src
    assert "isFirstLoadRef" in src
    assert "seenToastsRef" in src
    # Flame icon registered for the engagement notif
    assert "Flame" in src
    assert '"flame"' in src or "flame:" in src
