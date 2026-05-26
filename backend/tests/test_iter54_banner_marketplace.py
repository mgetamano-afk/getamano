"""Iteration 54 — Marketplace de Banners.

Endpoints under test (all prefixed /api):
- POST /banners/publish   (provider only; 403 for clients; max 5 per provider, oldest auto-deleted)
- GET  /banners/public    (sort=popular|recent, style filter, pagination)
- GET  /banners/me        (provider's own banners)
- DELETE /banners/{share_id}  (owner or admin; 403 otherwise; cascades likes)
- POST /banners/{share_id}/like        (toggle; 400 own banner; 404 missing)
- GET  /banners/{share_id}/like-state
- POST /banners/{share_id}/view        (no auth, fire-and-forget)
"""
from __future__ import annotations

import time

import pytest
import requests

from tests.test_config import API

# ---------- Module fixtures ----------

PIXEL_URL = "/api/files/test-pixel.png"  # placeholder URL is fine — endpoint only persists metadata


@pytest.fixture(scope="module")
def published_share_ids():
    """Track share_ids created in this run so we can clean them up at the end."""
    created: list[str] = []
    yield created
    # Cleanup at module teardown — delete each via admin session to be safe
    try:
        s = requests.Session()
        r = s.post(
            f"{API}/auth/login",
            json={"email": "admin@getamano.com", "password": "admin123"},
            timeout=15,
        )
        if r.status_code == 200:
            for sid in created:
                try:
                    s.delete(f"{API}/banners/{sid}", timeout=10)
                except Exception:
                    pass
    except Exception:
        pass


# ---------- Auth / role gating ----------


class TestBannerPublishAuth:
    def test_publish_requires_auth(self):
        r = requests.post(
            f"{API}/banners/publish",
            json={"image_url": PIXEL_URL, "style": "modern", "color": "#112233"},
            timeout=15,
        )
        assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"

    def test_client_cannot_publish(self, client_session):
        r = client_session.post(
            f"{API}/banners/publish",
            json={"image_url": PIXEL_URL, "style": "modern", "color": "#112233"},
            timeout=15,
        )
        assert r.status_code == 403


# ---------- Public listing ----------


class TestBannerPublic:
    def test_list_public_default_sort_popular(self):
        r = requests.get(f"{API}/banners/public", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "items" in data and isinstance(data["items"], list)
        assert "limit" in data and "offset" in data
        items = data["items"]
        assert len(items) >= 1, "Expected at least 1 seeded demo banner"
        # validate shape
        first = items[0]
        for key in ("share_id", "provider_id", "style", "color", "image_url", "likes"):
            assert key in first, f"Missing key {key} in banner item"
        # popular: pinned first
        pinned_flags = [bool(b.get("pinned")) for b in items]
        # if any pinned exists, the first must be pinned
        if any(pinned_flags):
            assert pinned_flags[0] is True, "Pinned banner should come first in 'popular'"

    def test_list_sort_recent(self):
        r = requests.get(f"{API}/banners/public", params={"sort": "recent"}, timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        # sort=recent should be strictly desc by created_at
        timestamps = [b.get("created_at", "") for b in items]
        assert timestamps == sorted(timestamps, reverse=True), "recent sort should be desc by created_at"

    def test_filter_by_style(self):
        r = requests.get(f"{API}/banners/public", params={"style": "festive"}, timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        for b in items:
            assert b["style"] == "festive"

    def test_pagination_limit_capped_at_60(self):
        r = requests.get(f"{API}/banners/public", params={"limit": 999, "offset": 0}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["limit"] == 60

    def test_pagination_offset_skips(self):
        r1 = requests.get(f"{API}/banners/public", params={"limit": 1, "offset": 0}, timeout=15)
        r2 = requests.get(f"{API}/banners/public", params={"limit": 1, "offset": 1}, timeout=15)
        assert r1.status_code == r2.status_code == 200
        items1 = r1.json()["items"]
        items2 = r2.json()["items"]
        if items1 and items2:
            assert items1[0]["share_id"] != items2[0]["share_id"], "Offset should advance the cursor"


# ---------- Provider own banners ----------


class TestBannerMe:
    def test_provider_me_lists_own(self, provider_session):
        r = provider_session.get(f"{API}/banners/me", timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) >= 1
        # All banners should belong to demo.provider's provider_id
        provider_ids = {b["provider_id"] for b in rows}
        assert len(provider_ids) == 1, f"Expected single provider_id, got {provider_ids}"

    def test_client_me_returns_empty_or_403(self, client_session):
        r = client_session.get(f"{API}/banners/me", timeout=15)
        # backend returns [] for non-provider role
        assert r.status_code == 200
        assert r.json() == []


# ---------- Like flow ----------


class TestBannerLike:
    def test_like_state_anon_unauthorized(self):
        # need an existing share_id
        list_r = requests.get(f"{API}/banners/public", timeout=15)
        share_id = list_r.json()["items"][0]["share_id"]
        r = requests.get(f"{API}/banners/{share_id}/like-state", timeout=15)
        assert r.status_code in (401, 403)

    def test_provider_cannot_like_own_banner(self, provider_session):
        # demo.provider owns all seeded banners
        list_r = requests.get(f"{API}/banners/public", timeout=15)
        share_id = list_r.json()["items"][0]["share_id"]
        r = provider_session.post(f"{API}/banners/{share_id}/like", timeout=15)
        assert r.status_code == 400, f"Expected 400 self-like, got {r.status_code}: {r.text[:200]}"

    def test_client_like_toggle(self, client_session):
        # Pick a share_id not yet liked by demo.client
        list_r = requests.get(f"{API}/banners/public", params={"sort": "recent"}, timeout=15)
        items = list_r.json()["items"]
        assert items, "No banners to like"
        # find one with 0 likes preferably to avoid disturbing the demo.client's existing like
        target = next((b for b in items if b.get("likes", 0) == 0), items[-1])
        share_id = target["share_id"]

        # Check current like state
        state_before = client_session.get(f"{API}/banners/{share_id}/like-state", timeout=15)
        assert state_before.status_code == 200
        already_liked = bool(state_before.json().get("liked"))

        # First toggle
        r1 = client_session.post(f"{API}/banners/{share_id}/like", timeout=15)
        assert r1.status_code == 200
        d1 = r1.json()
        assert d1["liked"] is (not already_liked)
        assert isinstance(d1["likes"], int)

        # like-state should match
        state_mid = client_session.get(f"{API}/banners/{share_id}/like-state", timeout=15)
        assert state_mid.json()["liked"] is d1["liked"]

        # Second toggle reverts
        r2 = client_session.post(f"{API}/banners/{share_id}/like", timeout=15)
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["liked"] is already_liked
        # likes count should equal d1["likes"] ± 1 (back to baseline)
        assert abs(d2["likes"] - d1["likes"]) == 1

    def test_like_nonexistent_banner_404(self, client_session):
        r = client_session.post(f"{API}/banners/bsh_doesnotexist/like", timeout=15)
        assert r.status_code == 404


# ---------- View counter ----------


class TestBannerView:
    def test_view_no_auth_ok(self):
        list_r = requests.get(f"{API}/banners/public", timeout=15)
        share_id = list_r.json()["items"][0]["share_id"]
        r = requests.post(f"{API}/banners/{share_id}/view", timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_view_nonexistent_silently_ok(self):
        # update_one with no match still returns 200 ok=True (fire-and-forget design)
        r = requests.post(f"{API}/banners/bsh_neverexisted/view", timeout=15)
        assert r.status_code == 200


# ---------- DELETE / unpublish ----------


class TestBannerDelete:
    def test_client_cannot_delete_others_banner(self, client_session):
        list_r = requests.get(f"{API}/banners/public", timeout=15)
        share_id = list_r.json()["items"][0]["share_id"]
        r = client_session.delete(f"{API}/banners/{share_id}", timeout=15)
        assert r.status_code == 403

    def test_admin_can_delete_then_recreate(self, admin_session, provider_session, published_share_ids):
        # Have provider publish a fresh one (will auto-delete oldest non-pinned since at cap of 5)
        publish = provider_session.post(
            f"{API}/banners/publish",
            json={
                "image_url": PIXEL_URL,
                "style": "minimal",
                "color": "#abcdef",
                "keywords": "TEST_iter54_delete",
            },
            timeout=15,
        )
        assert publish.status_code == 200, f"publish failed: {publish.text[:200]}"
        share_id = publish.json()["share_id"]
        published_share_ids.append(share_id)
        assert publish.json()["likes"] == 0
        assert publish.json()["style"] == "minimal"

        # Admin delete
        r = admin_session.delete(f"{API}/banners/{share_id}", timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True

        # Confirm gone from public listing
        time.sleep(0.5)
        list_r = requests.get(f"{API}/banners/public", params={"limit": 60}, timeout=15)
        share_ids = [b["share_id"] for b in list_r.json()["items"]]
        assert share_id not in share_ids

    def test_delete_nonexistent_returns_404(self, admin_session):
        r = admin_session.delete(f"{API}/banners/bsh_neverexisted_xyz", timeout=15)
        assert r.status_code == 404


# ---------- Publish max-5 rotation ----------


class TestBannerPublishCap:
    def test_publish_at_cap_rotates_oldest_non_pinned(self, provider_session, published_share_ids):
        """When provider has 5 banners, publishing a 6th must succeed AND
        delete the oldest non-pinned one."""
        # Snapshot current banners
        before = provider_session.get(f"{API}/banners/me", timeout=15).json()
        assert len(before) >= 1
        before_ids = {b["share_id"] for b in before}

        # Publish a new one
        r = provider_session.post(
            f"{API}/banners/publish",
            json={
                "image_url": PIXEL_URL,
                "style": "warm",
                "color": "#ffaa00",
                "keywords": "TEST_iter54_cap",
            },
            timeout=15,
        )
        assert r.status_code == 200, r.text[:200]
        new_share_id = r.json()["share_id"]
        published_share_ids.append(new_share_id)

        after = provider_session.get(f"{API}/banners/me", timeout=15).json()
        after_ids = {b["share_id"] for b in after}
        assert new_share_id in after_ids
        # Total should never exceed 5 (it can be == 5 if rotation happened, or +1 if previously < 5)
        assert len(after) <= 5, f"Provider exceeded cap: {len(after)} banners"
        if len(before) == 5:
            # One should have been auto-removed (the oldest non-pinned)
            removed = before_ids - after_ids
            assert len(removed) == 1, f"Expected exactly 1 rotation, removed={removed}"

    def test_invalid_style_rejected(self, provider_session):
        r = provider_session.post(
            f"{API}/banners/publish",
            json={"image_url": PIXEL_URL, "style": "neon_disco", "color": "#000000"},
            timeout=15,
        )
        assert r.status_code == 422
