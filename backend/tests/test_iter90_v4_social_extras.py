"""
Iteration 90 — extra regression locks for V4 social Phase A+B.

Covers gaps not covered by test_iter89_v4_social.py:
  · Demo provider's portfolio cap of 12 (PORTFOLIO_MAX_ITEMS).
  · /api/providers list exposes non-zero trust signals for the demo provider.
  · /api/gremios returns a list (188+ categories aggregate or empty list).
  · Anonymous: cannot join/leave/like a gremio post (401).
  · Community post hydration carries provider_verified=True & GM-XXXX
    on demo provider posts (for BarrioPage ✓ badge + Contactar CTA).
"""
import os
import sys
import uuid
import requests

sys.path.insert(0, os.path.dirname(__file__))
from tests.test_config import API, DEMO_SLUG  # noqa: E402


# ─── Trust-signal sanity: demo provider has non-zero data ──────────

def test_demo_provider_has_meaningful_trust_signals():
    r = requests.get(f"{API}/providers/by-slug/{DEMO_SLUG}", timeout=15)
    assert r.status_code == 200, r.text
    p = r.json()
    # Per /app/memory/test_credentials.md: verified=true, reviews_count=7,
    # avg_rating=5.0, days_active≈9, GM-1335. We assert these are present
    # and >0 so Trust tile renders a non-zero score on the search card.
    assert (p.get("provider_verified") is True) or (p.get("verification_status") == "approved")
    assert (p.get("reviews_count") or 0) >= 1
    assert (p.get("avg_rating") or 0) >= 1
    assert (p.get("days_active") or 0) >= 1


def test_providers_list_has_at_least_one_verified_with_signals():
    r = requests.get(f"{API}/providers", params={"limit": 25}, timeout=20)
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    verified = [p for p in items if p.get("provider_verified") or p.get("verification_status") == "approved"]
    assert len(verified) >= 1, "expected at least one verified provider on /providers"
    p = verified[0]
    for k in ("portfolio_count", "days_active", "referrals_converted", "avg_rating", "reviews_count"):
        assert k in p, f"{k} missing on /providers verified row"


# ─── /api/gremios shape ────────────────────────────────────────────

def test_gremios_endpoint_returns_array():
    r = requests.get(f"{API}/gremios", timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ─── Anonymous can read but cannot mutate gremios ──────────────────

def test_anonymous_cannot_join_gremio():
    r = requests.post(f"{API}/gremios/limpieza/join", timeout=15)
    assert r.status_code == 401


def test_anonymous_cannot_like_gremio_post():
    # Whether the post-id resolves is irrelevant — auth must reject first.
    r = requests.post(f"{API}/gremios/posts/nonexistent_post/like", timeout=15)
    assert r.status_code == 401


def test_anonymous_can_read_gremio_posts_public():
    r = requests.get(f"{API}/gremios/limpieza/posts", timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ─── Community post hydration: provider_verified + GM code ─────────

def test_gremio_post_hydration_exposes_verified_and_gm_code(provider_session):
    cat = "limpieza"
    # Ensure joined
    provider_session.post(f"{API}/gremios/{cat}/join", timeout=15)
    body = {"content": f"hydration-check {uuid.uuid4().hex[:6]}"}
    pr = provider_session.post(f"{API}/gremios/{cat}/posts", json=body, timeout=15)
    assert pr.status_code == 200, pr.text
    pid = pr.json()["id"]

    lr = provider_session.get(f"{API}/gremios/{cat}/posts", timeout=15)
    assert lr.status_code == 200
    posts = lr.json()
    me_post = next((p for p in posts if p["id"] == pid), None)
    assert me_post is not None
    author = me_post.get("author", {})
    assert author.get("provider_verified") is True, "demo provider should hydrate as verified"
    gm = author.get("getamano_code") or ""
    assert gm.startswith("GM-"), f"expected GM-XXXX code, got {gm!r}"

    # Cleanup: leave gremio (post stays; harmless)
    provider_session.delete(f"{API}/gremios/{cat}/leave", timeout=15)


# ─── Portfolio 12-item hard cap ────────────────────────────────────

def test_portfolio_12_item_hard_cap(provider_session):
    """Soft test — verifies cap behavior without polluting account.
    Strategy: read current count; if <12, top up to 12, attempt #13
    expects 400; cleanup added items.
    """
    list_r = provider_session.get(f"{API}/providers/me/portfolio", timeout=15)
    assert list_r.status_code == 200
    current = list_r.json()
    start_count = len(current)
    if start_count >= 12:
        # Already at cap — directly try adding one more, expect 400
        r = provider_session.post(
            f"{API}/providers/me/portfolio",
            json={"image_url": "https://placehold.co/600?text=over-cap",
                  "caption": "TEST_iter90_overcap"},
            timeout=15,
        )
        assert r.status_code in (400, 409, 422), f"expected reject, got {r.status_code} {r.text[:120]}"
        return

    created_ids = []
    try:
        # Top up to exactly 12
        to_add = 12 - start_count
        for i in range(to_add):
            r = provider_session.post(
                f"{API}/providers/me/portfolio",
                json={
                    "image_url": f"https://placehold.co/600?text=TEST_iter90_{i}",
                    "caption": f"TEST_iter90_{i}_{uuid.uuid4().hex[:6]}",
                },
                timeout=15,
            )
            assert r.status_code == 200, f"top-up #{i} failed: {r.status_code} {r.text[:120]}"
            created_ids.append(r.json()["id"])

        # Attempt 13th — must reject
        over = provider_session.post(
            f"{API}/providers/me/portfolio",
            json={"image_url": "https://placehold.co/600?text=over-cap",
                  "caption": "TEST_iter90_overcap"},
            timeout=15,
        )
        assert over.status_code in (400, 409, 422), (
            f"expected portfolio cap reject; got {over.status_code} {over.text[:120]}"
        )
    finally:
        # Always cleanup test-created items
        for pid in created_ids:
            provider_session.delete(f"{API}/providers/me/portfolio/{pid}", timeout=15)
