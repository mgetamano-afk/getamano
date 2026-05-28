"""
Iteration 77 — Background auto-refresh + swipe-between-stories.

These are pure frontend behaviors but they depend on backend endpoints
that MUST stay cheap (auto-refresh fires silently every time the user
returns to the tab — flaky/slow endpoints would cause UI jank).

Locks for this iteration:
  1. The refresh-bus targets (already covered by `test_iter75_refresh_endpoints_sla`)
     still meet the <1500ms SLA — re-asserts the contract.
  2. `/stories/by-provider/{user_id}` (powering swipe between stories
     INSIDE the viewer) must stay fast: <800ms, returns a list of
     story dicts with `expires_at`, `image_url`, `story_id`.
"""
import os
import sys
import time

import pytest
import requests

sys.path.insert(0, os.path.dirname(__file__))
from tests.test_config import API  # noqa: E402


def _time(fn):
    t0 = time.perf_counter()
    res = fn()
    return res, (time.perf_counter() - t0) * 1000.0


def test_stories_by_provider_serves_swipe_navigation_fast():
    """The viewer-internal swipe relies on /stories/by-provider/{uid}
    being fast enough that swiping doesn't show empty frames.
    Cap: 800ms cold."""
    # Find an active provider with stories
    r = requests.get(f"{API}/stories/active?limit=1", timeout=10)
    if r.status_code != 200 or not r.json():
        pytest.skip("no active stories")
    provider_uid = r.json()[0]["provider_user_id"]

    (r, ms) = _time(lambda: requests.get(
        f"{API}/stories/by-provider/{provider_uid}", timeout=10,
    ))
    assert r.status_code == 200, r.text[:200]
    items = r.json()
    assert isinstance(items, list)
    assert len(items) >= 1
    for s in items:
        assert "story_id" in s
        assert "image_url" in s
        assert "expires_at" in s
    assert ms < 800, f"slow: {ms:.0f}ms"


def test_active_stories_payload_carries_image_for_hover_preview():
    """Desktop hover preview reads `image_url` + `caption` from the
    /stories/active payload — must be present for non-empty entries."""
    r = requests.get(f"{API}/stories/active?limit=5", timeout=10)
    assert r.status_code == 200
    rows = r.json()
    for row in rows:
        # image_url is required (hover preview can't render without it)
        assert "image_url" in row, f"missing image_url in {row}"
        # caption is optional but the key should exist (even if "")
        assert "caption" in row, f"missing caption key in {row}"


def test_active_stories_carries_created_at_for_pulse_animation():
    """The carousel uses `created_at` to decide whether to pulse the
    tile ring (Section 76). Field must be present and parseable."""
    from datetime import datetime
    r = requests.get(f"{API}/stories/active?limit=5", timeout=10)
    assert r.status_code == 200
    for row in r.json():
        assert "created_at" in row
        # Tolerate ISO with or without Z suffix
        dt = datetime.fromisoformat(row["created_at"].replace("Z", "+00:00"))
        assert dt is not None
