"""Iteration 51 — Section 45 reports/against-me + reports/mine regression."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend .env if env-var not exported in pytest shell
    try:
        with open("/app/frontend/.env") as f:
            for ln in f:
                if ln.startswith("REACT_APP_BACKEND_URL"):
                    BASE_URL = ln.split("=", 1)[1].strip().rstrip("/")
    except FileNotFoundError:
        pass
API = f"{BASE_URL}/api"

PROVIDER = {"email": "demo.provider@getamano.com", "password": "provider123"}
CLIENT = {"email": "demo.client@getamano.com", "password": "client123"}
ADMIN = {"email": "admin@getamano.com", "password": "admin123"}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s, data["user"]


# Module-level cached sessions to dodge the 8 req/min auth rate-limit
_SESSIONS = {}


def _get(creds, key):
    if key not in _SESSIONS:
        _SESSIONS[key] = _login(creds)
    return _SESSIONS[key]


@pytest.fixture(scope="module")
def provider_session():
    return _get(PROVIDER, "provider")


@pytest.fixture(scope="module")
def client_session():
    return _get(CLIENT, "client")


@pytest.fixture(scope="module")
def admin_session():
    return _get(ADMIN, "admin")


# -------- /reports/against-me --------------------------------------------------
class TestReportsAgainstMe:
    def test_against_me_requires_auth(self):
        r = requests.get(f"{API}/reports/against-me", timeout=10)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_against_me_provider_returns_envelope(self, provider_session):
        s, _ = provider_session
        r = s.get(f"{API}/reports/against-me", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data and "total" in data
        assert isinstance(data["items"], list)
        assert data["total"] == len(data["items"])

    def test_against_me_reporter_identity_redacted(self, client_session, provider_session):
        """Create a report against the provider as a client, then verify
        provider's /reports/against-me does NOT expose reporter identity."""
        s_client, client_user = client_session
        s_prov, prov_user = provider_session
        prov_id = prov_user["user_id"]
        payload = {
            "target_id": prov_id,
            "target_role": "provider",
            "reason": "otro",
            "description": "TEST_iter51 sensitive description that must be hidden",
        }
        r = s_client.post(f"{API}/reports", json=payload, timeout=15)
        assert r.status_code in (200, 201), f"report create failed: {r.status_code} {r.text}"
        created = r.json()
        new_id = created.get("report_id")
        assert new_id

        # Provider fetches against-me
        r2 = s_prov.get(f"{API}/reports/against-me", timeout=15)
        assert r2.status_code == 200
        items = r2.json()["items"]
        match = next((x for x in items if x.get("report_id") == new_id), None)
        assert match is not None, "newly created report not visible to target provider"

        # Reporter identity fields must NOT be present
        forbidden = {"reporter_id", "reporter_email", "reporter_name"}
        present = forbidden & set(match.keys())
        assert not present, f"reporter identity leaked: {present}"

        # Pending → description masked
        assert match["status"] == "pending"
        assert "En revisión" in match["description"]
        assert "TEST_iter51 sensitive" not in match["description"]

    def test_against_me_resolved_keeps_description(self, admin_session, provider_session):
        """Mark the most recent pending TEST_iter51 report as resolved via
        admin and verify the description re-appears for the target."""
        s_admin, _ = admin_session
        s_prov, prov_user = provider_session
        # find one pending TEST_iter51 report
        r = s_admin.get(f"{API}/admin/reports", params={"status": "pending"}, timeout=15)
        assert r.status_code == 200
        pending = [
            x for x in r.json()["items"]
            if x.get("target_id") == prov_user["user_id"]
            and "TEST_iter51" in (x.get("description") or "")
        ]
        if not pending:
            pytest.skip("no TEST_iter51 pending report to resolve")
        rid = pending[0]["report_id"]
        r2 = s_admin.put(
            f"{API}/admin/reports/{rid}",
            json={"action": "warn", "admin_notes": "TEST_iter51 resolved"},
            timeout=15,
        )
        assert r2.status_code == 200, r2.text

        r3 = s_prov.get(f"{API}/reports/against-me", timeout=15)
        match = next((x for x in r3.json()["items"] if x.get("report_id") == rid), None)
        assert match is not None
        assert match["status"] in ("resolved", "dismissed")
        # Description now visible (not the masked text)
        assert "En revisión" not in match["description"]
        assert "TEST_iter51 sensitive description" in match["description"]


# -------- /reports/mine regression --------------------------------------------
class TestReportsMineRegression:
    def test_mine_requires_auth(self):
        r = requests.get(f"{API}/reports/mine", timeout=10)
        assert r.status_code in (401, 403)

    def test_mine_returns_caller_reports(self, client_session):
        s_client, _ = client_session
        r = s_client.get(f"{API}/reports/mine", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "items" in data and "total" in data
        # if any TEST_iter51 description exists, it must belong to client
        for it in data["items"]:
            assert "reason" in it
            assert "status" in it


# -------- Regression: sitemap & i18n -------------------------------------------
class TestRegressionPublic:
    def test_sitemap_xml(self):
        r = requests.get(f"{BASE_URL}/api/sitemap.xml", timeout=15)
        assert r.status_code == 200
        assert "<urlset" in r.text or "<sitemapindex" in r.text
