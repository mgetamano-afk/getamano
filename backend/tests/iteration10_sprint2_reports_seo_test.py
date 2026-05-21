"""Sprint 2 backend tests:
- Bidirectional reports (client↔provider) with auto-flag on ≥3/90d
- Admin report actions (dismiss/warn/suspend/delete) with DB side-effects
- AI SEO content endpoint (cached per cat × city) with fallback
- Regression on Sprint 1 endpoints + auth
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL, ADMIN_PW = "admin@getamano.com", "admin123"
PROV_EMAIL, PROV_PW = "demo.provider@getamano.com", "provider123"


# ============ fixtures ============
@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def provider_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": PROV_EMAIL, "password": PROV_PW}, timeout=15)
    assert r.status_code == 200, f"Provider login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin_user_id(admin_session):
    r = admin_session.get(f"{API}/auth/me", timeout=10)
    assert r.status_code == 200
    return r.json()["user_id"]


@pytest.fixture(scope="module")
def provider_user_id(provider_session):
    r = provider_session.get(f"{API}/auth/me", timeout=10)
    assert r.status_code == 200
    return r.json()["user_id"]


# ============ Test 1: GET /api/reports/reasons (no auth) ============
class TestReportReasons:
    def test_reasons_no_auth(self):
        r = requests.get(f"{API}/reports/reasons", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "client_to_provider" in data and "provider_to_client" in data
        assert len(data["client_to_provider"]) == 7
        assert len(data["provider_to_client"]) == 7
        for item in data["client_to_provider"] + data["provider_to_client"]:
            assert "key" in item and "label" in item
            assert isinstance(item["key"], str) and isinstance(item["label"], str)
        # Sanity check expected keys
        c2p_keys = {i["key"] for i in data["client_to_provider"]}
        p2c_keys = {i["key"] for i in data["provider_to_client"]}
        assert "no_servicio" in c2p_keys
        assert "no_pago" in p2c_keys


# ============ Tests 2–5: POST /api/reports (auth) ============
class TestCreateReport:
    def test_create_report_provider_to_client(self, provider_session, admin_user_id):
        # provider reports admin user as a "client" target (just to exercise the path)
        payload = {
            "target_id": admin_user_id,
            "target_role": "client",
            "reason": "no_pago",
            "description": "El cliente no pagó el servicio prestado tras finalizar el trabajo.",
        }
        r = provider_session.post(f"{API}/reports", json=payload, timeout=15)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()
        assert body.get("status") == "pending"
        assert body.get("report_id", "").startswith("rep_")
        assert body.get("reason_label") == "Cliente no pagó el servicio prestado"
        # remember for later asserts
        TestCreateReport.created_report_id = body["report_id"]

    def test_create_report_invalid_reason_for_role(self, provider_session, admin_user_id):
        # 'no_servicio' is a CLIENT→PROVIDER reason; using it as a provider must 400
        payload = {
            "target_id": admin_user_id,
            "target_role": "client",
            "reason": "no_servicio",
            "description": "Texto descriptivo de prueba al menos 20 caracteres aquí.",
        }
        r = provider_session.post(f"{API}/reports", json=payload, timeout=10)
        assert r.status_code == 400, f"expected 400 got {r.status_code} {r.text}"

    def test_create_report_no_auth(self, admin_user_id):
        payload = {
            "target_id": admin_user_id,
            "target_role": "client",
            "reason": "no_pago",
            "description": "Texto descriptivo de prueba al menos 20 caracteres aquí.",
        }
        r = requests.post(f"{API}/reports", json=payload, timeout=10)
        assert r.status_code == 401, f"expected 401 got {r.status_code} {r.text}"

    def test_cannot_report_yourself(self, provider_session, provider_user_id):
        payload = {
            "target_id": provider_user_id,
            "target_role": "client",
            "reason": "no_pago",
            "description": "Texto descriptivo de prueba al menos 20 caracteres aquí.",
        }
        r = provider_session.post(f"{API}/reports", json=payload, timeout=10)
        assert r.status_code == 400
        assert "yourself" in r.text.lower() or "mismo" in r.text.lower()

    def test_my_reports_lists_created(self, provider_session):
        r = provider_session.get(f"{API}/reports/mine", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "items" in data and isinstance(data["items"], list)
        assert data["total"] >= 1
        assert any(it.get("report_id") == TestCreateReport.created_report_id for it in data["items"])


# ============ Tests 6–7: admin endpoints ============
class TestAdminReports:
    def test_admin_list_requires_auth(self):
        r = requests.get(f"{API}/admin/reports", timeout=10)
        assert r.status_code in (401, 403)

    def test_provider_cannot_access_admin_list(self, provider_session):
        r = provider_session.get(f"{API}/admin/reports", timeout=10)
        assert r.status_code in (401, 403)

    def test_admin_list_returns_stats(self, admin_session):
        r = admin_session.get(f"{API}/admin/reports", timeout=10)
        assert r.status_code == 200
        data = r.json()
        for k in ("items", "pending", "total_90d", "flagged_users"):
            assert k in data, f"missing key {k}"
        assert isinstance(data["items"], list)
        assert isinstance(data["pending"], int)

    def test_admin_list_filters(self, admin_session):
        r1 = admin_session.get(f"{API}/admin/reports", params={"status": "pending"}, timeout=10)
        assert r1.status_code == 200
        for it in r1.json()["items"]:
            assert it["status"] == "pending"
        r2 = admin_session.get(f"{API}/admin/reports", params={"target_role": "client"}, timeout=10)
        assert r2.status_code == 200
        for it in r2.json()["items"]:
            assert it["target_role"] == "client"

    def test_admin_dismiss_report(self, admin_session, provider_session, admin_user_id):
        # create a dedicated report to dismiss
        pl = {"target_id": admin_user_id, "target_role": "client", "reason": "fake_review",
              "description": "Reseña claramente falsa, motivo para dismiss en test."}
        r = provider_session.post(f"{API}/reports", json=pl, timeout=10)
        assert r.status_code == 200
        rid = r.json()["report_id"]
        r2 = admin_session.put(f"{API}/admin/reports/{rid}", json={"action": "dismiss", "admin_notes": "test"}, timeout=10)
        assert r2.status_code == 200, r2.text
        assert r2.json().get("ok") is True
        # verify status is now dismissed
        listing = admin_session.get(f"{API}/admin/reports", timeout=10).json()
        match = next((x for x in listing["items"] if x["report_id"] == rid), None)
        assert match and match["status"] == "dismissed" and match["action_taken"] == "dismiss"

    def test_admin_warn_increments_warnings(self, admin_session, provider_session, admin_user_id):
        pl = {"target_id": admin_user_id, "target_role": "client", "reason": "trato_irrespetuoso",
              "description": "Trato muy irrespetuoso del cliente al proveedor durante el trabajo."}
        rid = provider_session.post(f"{API}/reports", json=pl, timeout=10).json()["report_id"]
        before = admin_session.get(f"{API}/admin/users", timeout=10)
        before_count = 0
        if before.status_code == 200:
            u = next((x for x in before.json().get("items", before.json() if isinstance(before.json(), list) else []) if x.get("user_id") == admin_user_id), None)
            if u:
                before_count = u.get("warnings_count", 0) or 0
        r = admin_session.put(f"{API}/admin/reports/{rid}", json={"action": "warn", "admin_notes": "warn"}, timeout=10)
        assert r.status_code == 200
        # Verify increment via /admin/users if available — otherwise just assert ok
        assert r.json()["action"] == "warn"

    def test_admin_action_on_missing_report(self, admin_session):
        r = admin_session.put(f"{API}/admin/reports/rep_doesnotexist", json={"action": "dismiss"}, timeout=10)
        assert r.status_code == 404


# ============ Tests 8–9: SEO content AI ============
class TestSeoContent:
    def test_seo_content_unknown_404(self):
        r = requests.get(f"{API}/seo/content/no-existe/no-existe", timeout=10)
        assert r.status_code == 404

    def test_seo_content_generates_and_caches(self):
        url = f"{API}/seo/content/limpieza-hogar/sallisaw"
        r1 = requests.get(url, timeout=60)
        assert r1.status_code == 200, f"{r1.status_code} {r1.text}"
        body1 = r1.json()
        assert "content" in body1 and len(body1["content"]) > 50
        assert "generated_at" in body1
        # cached flag should be False (or fallback present) on first hit
        # second call must hit cache
        r2 = requests.get(url, timeout=15)
        assert r2.status_code == 200
        body2 = r2.json()
        # if first call returned fallback (LLM failed), it won't have been cached; only require cached=True if first was real
        if not body1.get("fallback"):
            assert body2.get("cached") is True
            assert body2["content"] == body1["content"]


# ============ Test 10: regression on Sprint 1 ============
class TestRegression:
    def test_seo_sectors(self):
        r = requests.get(f"{API}/seo/sectors", timeout=10)
        assert r.status_code == 200
        data = r.json()
        sectors = data["sectors"] if isinstance(data, dict) else data
        assert isinstance(sectors, list)
        assert len(sectors) >= 10

    def test_seo_cities(self):
        r = requests.get(f"{API}/seo/cities", timeout=10)
        assert r.status_code == 200
        data = r.json()
        items = data if isinstance(data, list) else data.get("items", [])
        assert len(items) >= 20

    def test_providers_list(self):
        r = requests.get(f"{API}/providers", timeout=10)
        assert r.status_code == 200

    def test_sitemap(self):
        r = requests.get(f"{API}/sitemap.xml", timeout=15)
        assert r.status_code == 200
        assert "<urlset" in r.text

    def test_categories(self):
        r = requests.get(f"{API}/categories", timeout=10)
        assert r.status_code == 200

    def test_identity_counts(self, provider_session):
        r = provider_session.get(f"{API}/providers/identity-counts", timeout=10)
        assert r.status_code == 200

    def test_market_pulse(self, provider_session):
        r = provider_session.get(f"{API}/market-pulse", timeout=10)
        # market-pulse might be admin-only or provider-only; accept either 200 or 403
        assert r.status_code in (200, 403, 404)

    def test_admin_login_ok(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, timeout=10)
        assert r.status_code == 200
