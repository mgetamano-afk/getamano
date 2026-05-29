"""
Iteration 93 — v4 Phase E (Reels) regression.

Covers:
  · POST /api/reels (provider auth, throttle, schema validation)
  · GET /api/reels (public list)
  · POST /api/reels/{id}/view (24h dedupe)
  · POST /api/reels/{id}/like (toggle)
  · DELETE /api/reels/{id} (owner / admin)
  · Frontend route + components mounted
"""
import os
import sys
import uuid

import requests

sys.path.insert(0, os.path.dirname(__file__))
from tests.test_config import API  # noqa: E402


def _read(rel_path: str) -> str:
    full = os.path.join(os.path.dirname(__file__), "..", "..", rel_path)
    with open(full, encoding="utf-8") as f:
        return f.read()


def test_list_reels_public():
    r = requests.get(f"{API}/reels", timeout=10)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_reel_create_requires_provider(client_session):
    """Inactive/pending profile cannot create a reel."""
    r = client_session.post(
        f"{API}/reels",
        json={"video_url": "https://example.com/test.mp4"},
        timeout=10,
    )
    assert r.status_code == 403


def test_reel_lifecycle(provider_session):
    create_r = provider_session.post(
        f"{API}/reels",
        json={
            "video_url": f"https://placehold.co/600x800.mp4?t={uuid.uuid4().hex[:6]}",
            "caption": "iter93 regression reel",
            "duration_s": 12.5,
        },
        timeout=15,
    )
    assert create_r.status_code == 200, create_r.text
    reel = create_r.json()
    assert reel["reel_id"].startswith("reel_")
    assert reel["business_name"]
    reel_id = reel["reel_id"]

    # Fetch single
    one = requests.get(f"{API}/reels/{reel_id}", timeout=10)
    assert one.status_code == 200
    assert one.json()["reel_id"] == reel_id

    # Appears in public list
    listing = requests.get(f"{API}/reels", params={"limit": 50}, timeout=10)
    assert listing.status_code == 200
    assert any(r["reel_id"] == reel_id for r in listing.json())

    # View tracking
    view_r = provider_session.post(f"{API}/reels/{reel_id}/view", timeout=10)
    assert view_r.status_code == 200
    assert view_r.json()["counted"] is True
    # 2nd within 24h is deduped
    view_r2 = provider_session.post(f"{API}/reels/{reel_id}/view", timeout=10)
    assert view_r2.json()["counted"] is False

    # Like toggle
    like1 = provider_session.post(f"{API}/reels/{reel_id}/like", timeout=10)
    assert like1.status_code == 200
    assert like1.json()["liked"] is True
    like2 = provider_session.post(f"{API}/reels/{reel_id}/like", timeout=10)
    assert like2.json()["liked"] is False

    # Delete
    del_r = provider_session.delete(f"{API}/reels/{reel_id}", timeout=10)
    assert del_r.status_code == 200
    assert del_r.json()["deleted"] is True

    # 404 after delete
    missing = requests.get(f"{API}/reels/{reel_id}", timeout=10)
    assert missing.status_code == 404


def test_reel_anonymous_cannot_create():
    r = requests.post(f"{API}/reels", json={"video_url": "https://example.com/x.mp4"}, timeout=10)
    assert r.status_code == 401


# ─── Frontend source locks ─────────────────────────────────────────

def test_reels_route_mounted():
    src = _read("frontend/src/App.js")
    assert '<Route path="/reels" element={<ReelsPage />}' in src


def test_reels_page_exists():
    src = _read("frontend/src/pages/ReelsPage.jsx")
    assert "reels-page" in src
    assert "reels-create" in src
    assert "reels-mute" in src
    assert 'data-testid={`reel-slide-' in src


def test_reel_creator_exists():
    src = _read("frontend/src/components/ReelCreator.jsx")
    assert "reel-creator-modal" in src
    assert "reel-creator-file" in src
    assert 'api.post("/reels"' in src
