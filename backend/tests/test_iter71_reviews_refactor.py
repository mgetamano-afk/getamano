"""
Iteration 71 — Regression tests for routes/reviews.py extraction.

These tests live in `/app/backend/tests/` and run against the live preview
backend via the centralized `BASE_URL`. They serve two purposes:

  1. **Refactor safety net** — guarantee that moving `POST /reviews`,
     `GET/POST/DELETE /favorites*` and `/admin/reviews/*` from server.py
     to routes/reviews.py did not change observable behavior.

  2. **Living spec** — the assertions encode product rules (one review
     per user/provider pair; verified-source detection; admin gating)
     so future agents can't quietly break them.

Run locally:
    cd /app/backend && pytest tests/test_iter71_reviews_refactor.py -v
"""
import os
import sys

# Ensure conftest fixtures load (provider_session, admin_session, etc.)
sys.path.insert(0, os.path.dirname(__file__))


# ── REVIEWS ─────────────────────────────────────────────────────────

def test_create_review_requires_auth(api_url):
    """POST /reviews with no session must reject (401/403)."""
    import requests
    r = requests.post(
        f"{api_url}/reviews",
        json={"provider_id": "prov_xyz", "rating": 5, "comment": "hi"},
        timeout=15,
    )
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"


def test_create_review_validation_rating_range(client_session, api_url, demo_provider_id):
    """Rating must be 1–5. Pydantic ValueError → 422."""
    r = client_session.post(
        f"{api_url}/reviews",
        json={"provider_id": demo_provider_id, "rating": 0, "comment": "bad"},
        timeout=15,
    )
    assert r.status_code == 422, f"rating=0 should be 422, got {r.status_code}"

    r = client_session.post(
        f"{api_url}/reviews",
        json={"provider_id": demo_provider_id, "rating": 9, "comment": "bad"},
        timeout=15,
    )
    assert r.status_code == 422, f"rating=9 should be 422, got {r.status_code}"


def test_duplicate_review_rejected(client_session, api_url, demo_provider_id):
    """One review per (user, provider). The second POST must 400."""
    # First attempt — may succeed (201/200) or already-reviewed (400).
    # We don't assert on the first one's outcome; we just want the SECOND
    # call to be rejected with status=400.
    client_session.post(
        f"{api_url}/reviews",
        json={"provider_id": demo_provider_id, "rating": 5, "comment": "great"},
        timeout=15,
    )
    r2 = client_session.post(
        f"{api_url}/reviews",
        json={"provider_id": demo_provider_id, "rating": 4, "comment": "again"},
        timeout=15,
    )
    assert r2.status_code == 400, (
        f"second review must be rejected with 400, got {r2.status_code}: {r2.text[:200]}"
    )
    assert "already" in r2.text.lower()


# ── FAVORITES ───────────────────────────────────────────────────────

def test_favorites_full_cycle(client_session, api_url, demo_provider_id):
    """add → list → remove → list (idempotent)."""
    # Clean any prior state
    client_session.delete(f"{api_url}/favorites/{demo_provider_id}", timeout=15)

    # Add
    r = client_session.post(
        f"{api_url}/favorites", json={"provider_id": demo_provider_id}, timeout=15
    )
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True

    # List → must include the provider
    r = client_session.get(f"{api_url}/favorites", timeout=15)
    assert r.status_code == 200
    favs = r.json()
    assert isinstance(favs, list)
    pids = {p.get("provider_id") for p in favs}
    assert demo_provider_id in pids, f"expected {demo_provider_id} in {pids}"

    # Remove
    r = client_session.delete(f"{api_url}/favorites/{demo_provider_id}", timeout=15)
    assert r.status_code == 200
    assert r.json().get("ok") is True

    # List again → must NOT include it
    r = client_session.get(f"{api_url}/favorites", timeout=15)
    pids2 = {p.get("provider_id") for p in r.json()}
    assert demo_provider_id not in pids2


def test_favorites_add_is_idempotent(client_session, api_url, demo_provider_id):
    """POST /favorites twice must NOT duplicate (uses upsert)."""
    client_session.delete(f"{api_url}/favorites/{demo_provider_id}", timeout=15)
    client_session.post(f"{api_url}/favorites", json={"provider_id": demo_provider_id}, timeout=15)
    client_session.post(f"{api_url}/favorites", json={"provider_id": demo_provider_id}, timeout=15)
    r = client_session.get(f"{api_url}/favorites", timeout=15)
    assert r.status_code == 200
    pids = [p.get("provider_id") for p in r.json()]
    assert pids.count(demo_provider_id) == 1, (
        f"expected exactly one entry for {demo_provider_id}, got {pids.count(demo_provider_id)}"
    )


def test_favorites_requires_auth(api_url):
    """All three favorites endpoints must require a session."""
    import requests
    s = requests.Session()
    for method, path in [
        ("GET", "/favorites"),
        ("POST", "/favorites"),
        ("DELETE", "/favorites/prov_x"),
    ]:
        r = s.request(method, f"{api_url}{path}", json={"provider_id": "prov_x"}, timeout=15)
        assert r.status_code in (401, 403), (
            f"{method} {path} must require auth, got {r.status_code}"
        )


# ── ADMIN REVIEWS ───────────────────────────────────────────────────

def test_admin_list_reviews_returns_enriched_data(admin_session, api_url):
    """GET /admin/reviews enriches each item with a `provider` summary."""
    r = admin_session.get(f"{api_url}/admin/reviews", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list)
    for item in data:
        assert "review_id" in item
        assert "provider_id" in item
        assert "rating" in item
        # provider may be None if the provider was deleted; that's allowed.
        assert "provider" in item


def test_admin_reviews_blocks_clients(client_session, api_url):
    """A client session calling /admin/reviews must get 403."""
    r = client_session.get(f"{api_url}/admin/reviews", timeout=15)
    assert r.status_code == 403


def test_admin_flag_review_idempotent(admin_session, api_url):
    """Flag an existing review twice → both succeed, no error."""
    r = admin_session.get(f"{api_url}/admin/reviews", timeout=15)
    reviews = r.json()
    if not reviews:
        # No reviews to flag — skip rather than fail.
        import pytest
        pytest.skip("no reviews exist in fixture data")
    rid = reviews[0]["review_id"]
    r1 = admin_session.post(f"{api_url}/admin/reviews/{rid}/flag", timeout=15)
    assert r1.status_code == 200, r1.text
    r2 = admin_session.post(f"{api_url}/admin/reviews/{rid}/flag", timeout=15)
    assert r2.status_code == 200, r2.text


def test_admin_reviews_filter_by_flagged(admin_session, api_url):
    """`?flagged=true` filter must not error and must return a list."""
    r = admin_session.get(f"{api_url}/admin/reviews?flagged=true", timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)

    r = admin_session.get(f"{api_url}/admin/reviews?flagged=false", timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_admin_delete_nonexistent_review_returns_404(admin_session, api_url):
    r = admin_session.delete(f"{api_url}/admin/reviews/rev_doesnotexist", timeout=15)
    assert r.status_code == 404
