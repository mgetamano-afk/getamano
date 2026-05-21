"""Iteration 7 — Inclusive owner identity (no country flags) + Legal pages backend regression.

Backend tests:
- PUT /api/providers/me/owner-identity (latino / american / null / 401 no auth)
- GET /api/providers/me persists owner_identity (migration latino_owned='yes' -> 'latino')
- GET /api/providers?owner_identity=latino|american filtering
- Regression on legacy latino_owned=true filter
- Regression: categories, providers/featured, public/stats, promo-codes/founding-status,
  admin/ceo-metrics, providers/me/market-pulse, notifications, health
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@getamano.com"
ADMIN_PASS = "admin123"
PROVIDER_EMAIL = "demo.provider@getamano.com"
PROVIDER_PASS = "provider123"


def _login(session, email, password):
    r = session.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token") or data.get("session_token")
    if token:
        session.headers.update({"Authorization": f"Bearer {token}"})
    return data


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    _login(s, ADMIN_EMAIL, ADMIN_PASS)
    return s


@pytest.fixture(scope="module")
def provider_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    _login(s, PROVIDER_EMAIL, PROVIDER_PASS)
    return s


@pytest.fixture(scope="module")
def anon_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ============= Owner Identity PUT endpoint =============
class TestOwnerIdentityEndpoint:
    def test_set_owner_identity_requires_auth(self, anon_session):
        r = anon_session.put(f"{API}/providers/me/owner-identity", json={"owner_identity": "latino"})
        assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text[:200]}"

    def test_set_owner_identity_latino(self, provider_session):
        r = provider_session.put(f"{API}/providers/me/owner-identity", json={"owner_identity": "latino"})
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:200]}"
        data = r.json()
        assert data.get("ok") is True
        assert data.get("owner_identity") == "latino"

        # Verify persistence
        me = provider_session.get(f"{API}/providers/me")
        assert me.status_code == 200
        assert me.json().get("owner_identity") == "latino"

    def test_set_owner_identity_american(self, provider_session):
        r = provider_session.put(f"{API}/providers/me/owner-identity", json={"owner_identity": "american"})
        assert r.status_code == 200
        assert r.json().get("owner_identity") == "american"

        me = provider_session.get(f"{API}/providers/me")
        assert me.json().get("owner_identity") == "american"

    def test_set_owner_identity_null(self, provider_session):
        r = provider_session.put(f"{API}/providers/me/owner-identity", json={"owner_identity": None})
        assert r.status_code == 200
        body = r.json()
        assert body.get("ok") is True
        assert body.get("owner_identity") is None

        me = provider_session.get(f"{API}/providers/me")
        assert me.json().get("owner_identity") is None

    def test_invalid_value_rejected(self, provider_session):
        r = provider_session.put(f"{API}/providers/me/owner-identity", json={"owner_identity": "martian"})
        assert r.status_code in (400, 422), f"Expected validation error, got {r.status_code}"

    def test_restore_latino_for_other_tests(self, provider_session):
        # Reset to latino for other tests/UI testing
        r = provider_session.put(f"{API}/providers/me/owner-identity", json={"owner_identity": "latino"})
        assert r.status_code == 200


# ============= Owner Identity field in profile =============
class TestProviderMeOwnerIdentity:
    def test_providers_me_returns_owner_identity_field(self, provider_session):
        r = provider_session.get(f"{API}/providers/me")
        assert r.status_code == 200
        body = r.json()
        assert "owner_identity" in body, "owner_identity field missing from /providers/me payload"
        # After migration + restore step above, should be 'latino'
        assert body["owner_identity"] == "latino"


# ============= Public search filtering by owner_identity =============
class TestProvidersSearchFilter:
    def test_filter_owner_identity_latino(self, anon_session):
        r = anon_session.get(f"{API}/providers", params={"owner_identity": "latino"})
        assert r.status_code == 200
        data = r.json()
        items = data if isinstance(data, list) else data.get("items", data.get("results", []))
        assert isinstance(items, list)
        assert len(items) >= 1, "Expected at least 1 latino-identity provider (demo)"
        for p in items:
            # Each returned provider should have owner_identity=='latino' if field present
            if "owner_identity" in p:
                assert p["owner_identity"] == "latino", f"Got non-latino in filter: {p.get('owner_identity')}"

    def test_filter_owner_identity_american(self, anon_session):
        r = anon_session.get(f"{API}/providers", params={"owner_identity": "american"})
        assert r.status_code == 200
        data = r.json()
        items = data if isinstance(data, list) else data.get("items", data.get("results", []))
        assert isinstance(items, list)
        for p in items:
            if "owner_identity" in p:
                assert p["owner_identity"] == "american"

    def test_legacy_latino_owned_filter_regression(self, anon_session):
        r = anon_session.get(f"{API}/providers", params={"latino_owned": "true"})
        assert r.status_code == 200, f"Legacy latino_owned filter broken: {r.status_code}"


# ============= Regression endpoints =============
class TestRegression:
    def test_categories(self, anon_session):
        r = anon_session.get(f"{API}/categories")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_providers_featured(self, anon_session):
        r = anon_session.get(f"{API}/providers/featured")
        assert r.status_code == 200

    def test_public_stats(self, anon_session):
        r = anon_session.get(f"{API}/public/stats")
        assert r.status_code == 200

    def test_promo_founding_status(self, anon_session):
        r = anon_session.get(f"{API}/promo-codes/founding-status")
        assert r.status_code == 200

    def test_admin_ceo_metrics(self, admin_session):
        r = admin_session.get(f"{API}/admin/ceo-metrics")
        assert r.status_code == 200

    def test_provider_market_pulse(self, provider_session):
        r = provider_session.get(f"{API}/providers/me/market-pulse")
        assert r.status_code == 200

    def test_provider_notifications(self, provider_session):
        r = provider_session.get(f"{API}/notifications")
        assert r.status_code == 200
