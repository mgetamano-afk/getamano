"""Iteration 6 — getamano rename + new palette + Weekly Market Pulse feature.
Tests:
- Market Pulse endpoint (auth required, returns expected payload keys, has_signal=true for demo provider)
- Notifications include weekly_market_pulse note
- Regression on public/admin/provider endpoints
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://verified-providers-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@getamano.com"
ADMIN_PASS = os.environ.get("TEST_ADMIN_PASSWORD", "admin123")
PROVIDER_EMAIL = "demo.provider@getamano.com"
PROVIDER_PASS = os.environ.get("TEST_PROVIDER_PASSWORD", "provider123")


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


# ============= Market Pulse =============
class TestMarketPulse:
    def test_market_pulse_requires_auth(self, anon_session):
        r = anon_session.get(f"{API}/providers/me/market-pulse")
        assert r.status_code == 401, f"Expected 401 without auth, got {r.status_code}: {r.text[:200]}"

    def test_market_pulse_returns_expected_payload(self, provider_session):
        r = provider_session.get(f"{API}/providers/me/market-pulse")
        assert r.status_code == 200, f"Got {r.status_code}: {r.text[:300]}"
        data = r.json()
        expected_keys = {
            "available", "category_id", "city", "weekly_quotes", "prev_weekly_quotes",
            "delta_quotes_pct", "avg_min", "avg_max", "rate_sample_size",
            "top_budget_range", "has_signal", "category_name", "currency"
        }
        missing = expected_keys - set(data.keys())
        assert not missing, f"Missing keys: {missing}. Got: {list(data.keys())}"
        assert data.get("has_signal") == True  # noqa: E712, f"has_signal expected True, got {data.get('has_signal')}. Payload={data}"
        assert data.get("available") == True  # noqa: E712, f"available expected True, got {data.get('available')}. Payload={data}"
        assert isinstance(data.get("currency"), str) and len(data["currency"]) > 0


# ============= Notifications =============
class TestNotifications:
    def test_notifications_include_weekly_market_pulse(self, provider_session):
        r = provider_session.get(f"{API}/notifications")
        assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
        body = r.json()
        items = body if isinstance(body, list) else body.get("items") or body.get("notifications") or []
        assert items, f"No notifications returned: {body}"
        pulse = [n for n in items if "weekly_market_pulse" in (n.get("notification_key") or n.get("key") or "")]
        assert len(pulse) == 1, f"Expected exactly 1 weekly_market_pulse note, got {len(pulse)}. All keys: {[n.get('notification_key') or n.get('key') for n in items]}"
        note = pulse[0]
        title = note.get("title", "")
        assert title.startswith("📊 Pulso semanal"), f"Title doesn't start with '📊 Pulso semanal': {title!r}"
        assert note.get("category") == "market_pulse", f"Expected category='market_pulse', got {note.get('category')!r}"


# ============= Regression — Public endpoints =============
class TestPublicRegression:
    def test_categories(self, anon_session):
        r = anon_session.get(f"{API}/categories")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) > 0

    def test_providers_featured(self, anon_session):
        r = anon_session.get(f"{API}/providers/featured")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_public_stats(self, anon_session):
        r = anon_session.get(f"{API}/public/stats")
        assert r.status_code == 200
        assert isinstance(r.json(), dict)

    def test_market_range(self, anon_session):
        # Optional: needs query params possibly, let's try without
        r = anon_session.get(f"{API}/market-range")
        # Accept 200 or 422 (missing params) but not 500
        assert r.status_code in (200, 400, 422), f"Got {r.status_code}: {r.text[:200]}"

    def test_promo_founding_status(self, anon_session):
        r = anon_session.get(f"{API}/promo-codes/founding-status")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, dict)

    def test_wall_of_fame_public(self, anon_session):
        r = anon_session.get(f"{API}/community/wall-of-fame")
        assert r.status_code == 200, f"Got {r.status_code}: {r.text[:300]}"


# ============= Regression — Auth =============
class TestAuthRegression:
    def test_admin_login(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
        assert r.status_code == 200, f"{r.status_code}: {r.text[:200]}"

    def test_provider_login(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        r = s.post(f"{API}/auth/login", json={"email": PROVIDER_EMAIL, "password": PROVIDER_PASS})
        assert r.status_code == 200, f"{r.status_code}: {r.text[:200]}"


# ============= Regression — Admin =============
class TestAdminRegression:
    def test_admin_ceo_metrics(self, admin_session):
        r = admin_session.get(f"{API}/admin/ceo-metrics")
        assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
        assert isinstance(r.json(), dict)

    def test_admin_daily_brief(self, admin_session):
        r = admin_session.get(f"{API}/admin/daily-brief")
        assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
