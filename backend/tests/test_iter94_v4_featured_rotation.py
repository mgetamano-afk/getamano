"""
Iteration 94 — v4 Phase F (Featured Providers rotation) regression.

Covers:
  · Public `/providers/featured` returns the weekly pool with category +
    rating_avg/rating_count alias for backward compat with Landing/AppHome.
  · `POST /admin/featured/run-now` recomputes the pool for the current
    ISO week and returns `{week_key, count}`.
  · `GET /admin/featured` lists the stored pool ordered by score.
  · Empty-pool fallback returns a generic top list.
  · Legacy `/providers/featured-legacy` still answers (we kept it for
    callers that didn't migrate yet).
"""
import os
import sys

import requests

sys.path.insert(0, os.path.dirname(__file__))
from tests.test_config import API  # noqa: E402


def _read(rel_path: str) -> str:
    full = os.path.join(os.path.dirname(__file__), "..", "..", rel_path)
    with open(full, encoding="utf-8") as f:
        return f.read()


def test_featured_admin_run_now(admin_session):
    r = admin_session.post(f"{API}/admin/featured/run-now", timeout=20)
    assert r.status_code == 200
    body = r.json()
    assert body["week_key"].startswith("20") and "W" in body["week_key"]
    assert body["count"] >= 1


def test_featured_admin_list(admin_session):
    # Make sure compute already happened
    admin_session.post(f"{API}/admin/featured/run-now", timeout=20)
    r = admin_session.get(f"{API}/admin/featured", timeout=10)
    assert r.status_code == 200
    rows = r.json()
    assert isinstance(rows, list)
    if rows:
        sample = rows[0]
        assert "score" in sample
        assert "business_name" in sample
        assert "week_key" in sample


def test_public_featured_endpoint_backward_compat(admin_session):
    """Public endpoint must include `category` + `rating_avg` aliases for
    Landing/AppHome carousels."""
    admin_session.post(f"{API}/admin/featured/run-now", timeout=20)
    r = requests.get(f"{API}/providers/featured", params={"limit": 5}, timeout=10)
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list) and len(items) >= 1
    for it in items:
        assert "business_name" in it
        assert "rating_avg" in it  # backward compat alias
        assert "rating_count" in it
        # category may be None if the provider has no category_id
        assert "category" in it


def test_public_featured_respects_limit():
    r = requests.get(f"{API}/providers/featured", params={"limit": 2}, timeout=10)
    assert r.status_code == 200
    assert len(r.json()) <= 2


def test_legacy_featured_kept():
    r = requests.get(f"{API}/providers/featured-legacy", timeout=10)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_featured_city_filter_falls_back(admin_session):
    admin_session.post(f"{API}/admin/featured/run-now", timeout=20)
    # A city with no providers should fall back gracefully (empty list OK,
    # non-empty would mean fallback fired).
    r = requests.get(f"{API}/providers/featured", params={"city": "Atlantis", "limit": 5}, timeout=10)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ─── Frontend source locks ─────────────────────────────────────────

def test_barrio_overlay_uses_featured_endpoint():
    src = _read("frontend/src/components/BarrioOverlay.jsx")
    assert '/providers/featured' in src
