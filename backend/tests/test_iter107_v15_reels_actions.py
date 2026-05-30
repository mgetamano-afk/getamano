"""
Iteration 107 — V15 Reels actions + metrics + fan-out notifications.

Backend integration tests + frontend source-code locks. Validates:
  · A non-provider user can create a reel (V15 Nota 1.1.2).
  · POST /reels/{id}/wow, /save, /share toggles + counters.
  · GET /reels/{id}/reactions/me returns liked/wowed/saved triple.
  · GET /reels/me/metrics aggregates totals.
  · GET /reels/me/saved lists the user's bookmarked reels.
  · Owner metric fields exist on the reel doc returned by POST /reels.
  · Frontend ships ReelActionMenu + ReelCameraRecorder + hides
    SmartActionHub / QuickActionsFAB on /reels.
"""
import os
import sys
import uuid

import pytest

sys.path.insert(0, os.path.dirname(__file__))
from tests.test_config import API  # noqa: E402


def _read(rel: str) -> str:
    full = os.path.join(os.path.dirname(__file__), "..", "..", rel)
    with open(full, encoding="utf-8") as f:
        return f.read()


@pytest.fixture()
def db():
    from pymongo import MongoClient
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")
    return MongoClient(mongo_url)[db_name]


@pytest.fixture()
def fresh_reel(client_session, db):
    """Create a reel as the demo client (non-provider) and clean it up
    afterwards so we never leave test reels in the feed."""
    payload = {
        "video_url": f"https://example.com/v-{uuid.uuid4().hex[:8]}.mp4",
        "caption": "V15 iter107 test reel",
    }
    r = client_session.post(f"{API}/reels", json=payload, timeout=10)
    assert r.status_code == 200, r.text
    reel = r.json()
    yield reel
    db.reels.delete_one({"reel_id": reel["reel_id"]})
    db.reel_wows.delete_many({"reel_id": reel["reel_id"]})
    db.reel_saves.delete_many({"reel_id": reel["reel_id"]})
    db.reel_shares.delete_many({"reel_id": reel["reel_id"]})
    db.reel_likes.delete_many({"reel_id": reel["reel_id"]})


# ─── Backend ───────────────────────────────────────────────────────

def test_non_provider_user_can_create_reel(fresh_reel):
    """V15 Nota 1.1.2 — verified or not, every logged-in user posts reels."""
    assert fresh_reel["reel_id"].startswith("reel_")
    # `provider_id` is None for a non-provider user (the demo client has no eCard)
    assert "verified" in fresh_reel
    # Metric counters all start at zero
    for k in ("views_count", "likes_count", "wows_count", "saves_count", "shares_count"):
        assert fresh_reel[k] == 0


def test_wow_toggle_round_trip(client_session, fresh_reel):
    rid = fresh_reel["reel_id"]
    a = client_session.post(f"{API}/reels/{rid}/wow", timeout=10).json()
    assert a["wowed"] is True
    b = client_session.post(f"{API}/reels/{rid}/wow", timeout=10).json()
    assert b["wowed"] is False


def test_save_toggle_round_trip(client_session, fresh_reel):
    rid = fresh_reel["reel_id"]
    a = client_session.post(f"{API}/reels/{rid}/save", timeout=10).json()
    assert a["saved"] is True
    b = client_session.post(f"{API}/reels/{rid}/save", timeout=10).json()
    assert b["saved"] is False


def test_share_is_counted_every_call(client_session, fresh_reel, db):
    rid = fresh_reel["reel_id"]
    for _ in range(3):
        r = client_session.post(f"{API}/reels/{rid}/share", timeout=10)
        assert r.status_code == 200, r.text
    doc = db.reels.find_one({"reel_id": rid}, {"_id": 0, "shares_count": 1})
    assert doc["shares_count"] == 3


def test_reactions_me_returns_triple(client_session, fresh_reel):
    rid = fresh_reel["reel_id"]
    client_session.post(f"{API}/reels/{rid}/like", timeout=10)
    client_session.post(f"{API}/reels/{rid}/wow", timeout=10)
    me = client_session.get(f"{API}/reels/{rid}/reactions/me", timeout=10).json()
    assert me["liked"] is True
    assert me["wowed"] is True
    assert me["saved"] is False


def test_me_saved_returns_only_user_saves(client_session, fresh_reel):
    rid = fresh_reel["reel_id"]
    client_session.post(f"{API}/reels/{rid}/save", timeout=10)
    saved = client_session.get(f"{API}/reels/me/saved", timeout=10).json()
    assert any(s["reel_id"] == rid for s in saved)


def test_me_metrics_aggregates_owner_reels(client_session, fresh_reel):
    rid = fresh_reel["reel_id"]
    # Self-likes are allowed for analytics simplicity
    client_session.post(f"{API}/reels/{rid}/like", timeout=10)
    client_session.post(f"{API}/reels/{rid}/wow", timeout=10)
    metrics = client_session.get(f"{API}/reels/me/metrics", timeout=10).json()
    assert metrics["totals"]["reels"] >= 1
    assert metrics["totals"]["likes"] >= 1
    assert metrics["totals"]["wows"] >= 1
    # The fresh reel must appear in the per-reel items.
    assert any(it["reel_id"] == rid for it in metrics["items"])


def test_reels_reject_unauthenticated_wow(fresh_reel):
    import requests
    r = requests.post(f"{API}/reels/{fresh_reel['reel_id']}/wow", timeout=10)
    assert r.status_code in (401, 403)


# ─── Frontend wiring ────────────────────────────────────────────────

def test_reel_action_menu_component_has_5_plus_1_actions():
    src = _read("frontend/src/components/ReelActionMenu.jsx")
    for tid in ("upload", "record", "share", "like", "save", "wow"):
        assert f'data-testid={{`reel-action-${{a.id}}`}}' in src or f'reel-action-{tid}' in src
    # Each action wires the right API path
    for path in ("/reels/${activeReel.reel_id}/wow", "/reels/${activeReel.reel_id}/save",
                 "/reels/${activeReel.reel_id}/share", "/reels/${activeReel.reel_id}/like"):
        assert path in src
    # Bursts for like + wow
    assert "LikeBurst" in src and "WowBurst" in src


def test_reel_camera_recorder_uses_mediarecorder():
    src = _read("frontend/src/components/ReelCameraRecorder.jsx")
    assert "MediaRecorder" in src
    assert "getUserMedia" in src
    # Hard 30s cap
    assert "MAX_DURATION_S = 30" in src
    # V15 fix (iter109): video uploads now go through /reels/upload-video
    # (the legacy /upload endpoint only accepts images).
    assert '"/reels/upload-video"' in src
    assert '"/reels"' in src


def test_reels_page_swaps_in_action_menu_and_drops_old_fab():
    src = _read("frontend/src/pages/ReelsPage.jsx")
    assert "ReelActionMenu" in src
    # Old single "+" floating button was removed
    assert 'data-testid="reels-create"' not in src
    # Metric pills replaced the old action rail
    assert "MetricPill" in src


def test_smart_action_hub_hidden_on_reels_route():
    src = _read("frontend/src/components/SmartActionHub.jsx")
    assert '"/reels"' in src
    assert "hiddenForRoute" in src


def test_quick_actions_fab_hidden_on_reels_route():
    src = _read("frontend/src/components/QuickActionsFAB.jsx")
    assert "/reels" in src
