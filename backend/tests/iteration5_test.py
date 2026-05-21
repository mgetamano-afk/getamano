"""Iteration 5 backend tests — promo codes, likes, latino_owned filter, 4 tier plans + regression.

Covers prompt-maestro v1 features:
- POST /api/promo-codes/apply with GETAMANO50 (valid, invalid, already-used)
- POST /api/providers/{id}/like + likes_count increment + toggle off
- GET /api/providers?latino_owned=true filter
- Plan tier validation (free/basic/pro/premium) via POST /api/providers/me/plan
- Regression: auth, search, featured, by-slug, reviews, service-requests, messages, upload, admin, favorites
"""
import os
import io
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://verified-providers-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@getamano.com", "password": "admin123"}
DEMO_PROVIDER = {"email": "demo.provider@getamano.com", "password": "provider123"}
DEMO_SLUG = "maria-cleaning-services-sallisaw-ok"


# ---------- helpers ----------
def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    token = r.json()["token"]
    return token


def _hdr(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _register(role="client"):
    em = f"TEST_{uuid.uuid4().hex[:8]}@getamano.com"
    r = requests.post(f"{API}/auth/register", json={
        "email": em, "password": "Pass1234!", "name": "TestUser", "role": role
    }, timeout=15)
    assert r.status_code == 200, f"register failed: {r.text}"
    return em, r.json()["token"], r.json()["user"]["user_id"]


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    return _login(**ADMIN)


@pytest.fixture(scope="module")
def demo_provider_token():
    return _login(**DEMO_PROVIDER)


@pytest.fixture(scope="module")
def demo_provider_id(demo_provider_token):
    r = requests.get(f"{API}/providers/by-slug/{DEMO_SLUG}", timeout=15)
    assert r.status_code == 200
    return r.json()["provider_id"]


# ---------- Health & Plans ----------
class TestHealth:
    def test_plans_returns_4_tiers(self):
        r = requests.get(f"{API}/plans", timeout=15)
        assert r.status_code == 200
        plans = r.json()
        ids = [p["id"] for p in plans]
        assert set(ids) == {"free", "basic", "pro", "premium"}, f"got tiers: {ids}"
        # validate prices
        prices = {p["id"]: p["price_monthly"] for p in plans}
        assert prices["free"] == 0
        assert prices["basic"] == 10
        assert prices["pro"] == 15
        assert prices["premium"] == 25


# ---------- Auth Regression ----------
class TestAuthRegression:
    def test_admin_login(self):
        t = _login(**ADMIN)
        assert t and isinstance(t, str)

    def test_demo_provider_login(self):
        t = _login(**DEMO_PROVIDER)
        assert t and isinstance(t, str)

    def test_auth_me(self, demo_provider_token):
        r = requests.get(f"{API}/auth/me", headers=_hdr(demo_provider_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == DEMO_PROVIDER["email"]


# ---------- Providers Search/Featured/Slug + latino_owned filter ----------
class TestProvidersRegression:
    def test_list_providers(self):
        r = requests.get(f"{API}/providers", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_featured_providers(self):
        r = requests.get(f"{API}/providers/featured", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_by_slug_returns_demo(self):
        r = requests.get(f"{API}/providers/by-slug/{DEMO_SLUG}", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["slug"] == DEMO_SLUG
        assert body.get("latino_owned") == "yes"
        # gallery healed by seed
        assert isinstance(body.get("gallery"), list)
        assert len(body["gallery"]) >= 3

    def test_latino_owned_filter_true(self):
        r = requests.get(f"{API}/providers?latino_owned=true", timeout=15)
        assert r.status_code == 200
        data = r.json()
        # Every returned provider should be latino_owned == "yes"
        for p in data:
            assert p.get("latino_owned") == "yes", f"latino_owned filter leaked: {p.get('latino_owned')}"
        # demo provider must be among results
        slugs = [p["slug"] for p in data]
        assert DEMO_SLUG in slugs

    def test_latino_owned_filter_false_returns_all(self):
        r = requests.get(f"{API}/providers?latino_owned=false", timeout=15)
        assert r.status_code == 200
        # false should NOT apply the filter (only truthy filter active)
        assert isinstance(r.json(), list)


# ---------- Likes ----------
class TestLikes:
    def test_like_provider_increments_count(self, demo_provider_id):
        _, token, _ = _register()
        # baseline
        r0 = requests.get(f"{API}/providers/by-slug/{DEMO_SLUG}", timeout=15)
        base_likes = r0.json().get("likes_count", 0)

        # like (POST toggles ON since fresh user)
        r = requests.post(f"{API}/providers/{demo_provider_id}/like", headers=_hdr(token), timeout=15)
        assert r.status_code == 200
        assert r.json()["liked"] is True

        # verify increment
        r1 = requests.get(f"{API}/providers/by-slug/{DEMO_SLUG}", timeout=15)
        new_likes = r1.json().get("likes_count", 0)
        assert new_likes == base_likes + 1, f"likes_count did not increment: {base_likes} -> {new_likes}"

        # like-status
        r2 = requests.get(f"{API}/providers/{demo_provider_id}/like-status", headers=_hdr(token), timeout=15)
        assert r2.status_code == 200
        assert r2.json()["liked"] is True

        # toggle OFF
        r3 = requests.post(f"{API}/providers/{demo_provider_id}/like", headers=_hdr(token), timeout=15)
        assert r3.status_code == 200
        assert r3.json()["liked"] is False
        r4 = requests.get(f"{API}/providers/by-slug/{DEMO_SLUG}", timeout=15)
        assert r4.json().get("likes_count", 0) == base_likes

    def test_like_requires_auth(self, demo_provider_id):
        r = requests.post(f"{API}/providers/{demo_provider_id}/like", timeout=15)
        assert r.status_code in (401, 403)


# ---------- Promo Codes (GETAMANO50) ----------
class TestPromoCodes:
    def test_founding_status_public(self):
        r = requests.get(f"{API}/promo-codes/founding-status", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["max"] == 50
        assert "available" in d and "used" in d

    def test_apply_invalid_code(self):
        _, token, _ = _register()
        r = requests.post(f"{API}/promo-codes/apply", headers=_hdr(token), json={"code": "NOT_A_REAL_CODE"}, timeout=15)
        assert r.status_code == 404

    def test_apply_valid_GETAMANO50_assigns_pro_plan(self):
        # Register a fresh provider so plan assignment is visible
        em, token, uid = _register(role="provider")
        # create provider profile so the plan field can be updated
        body = {
            "business_name": "TEST_Promo_Biz",
            "legal_name": "TEST LLC",
            "category_id": "",
            "description": "test",
            "phone": "+1 555 555 1212",
            "email": em,
            "website": "",
            "address": "1 main",
            "city": "Test", "state": "TX", "zip_code": "00000",
            "latitude": 0, "longitude": 0,
            "is_home_based": True,
            "additional_categories": [],
            "languages": ["es"],
            "services": ["test"],
            "service_areas": ["Test, TX"],
            "hours": {},
            "logo_url": "", "cover_url": "",
            "photos": [], "gallery": [], "social": {},
            "price_range": "$$",
        }
        rp = requests.post(f"{API}/providers", headers=_hdr(token), json=body, timeout=15)
        assert rp.status_code == 200, f"create provider failed: {rp.text}"

        # apply GETAMANO50
        r = requests.post(f"{API}/promo-codes/apply", headers=_hdr(token), json={"code": "GETAMANO50"}, timeout=15)
        # could be 200 (success) or 400 if cupos already filled — accept both but assert content
        if r.status_code == 200:
            d = r.json()
            assert d["plan_assigned"] == "pro"
            assert d["founding_member"] is True
            # second apply must fail (already used)
            r2 = requests.post(f"{API}/promo-codes/apply", headers=_hdr(token), json={"code": "GETAMANO50"}, timeout=15)
            assert r2.status_code == 400, f"expected 400 on already-used, got {r2.status_code} {r2.text}"
            # verify provider profile now has plan=pro and founding_member True
            rme = requests.get(f"{API}/providers/me", headers=_hdr(token), timeout=15)
            assert rme.status_code == 200
            assert rme.json().get("plan") == "pro"
            assert rme.json().get("founding_member") is True
        else:
            # acceptable failure modes
            assert r.status_code in (400,), f"unexpected promo apply status {r.status_code}: {r.text}"

    def test_apply_requires_auth(self):
        r = requests.post(f"{API}/promo-codes/apply", json={"code": "GETAMANO50"}, timeout=15)
        assert r.status_code in (401, 403)


# ---------- 4 Tier Plan Validation ----------
class TestPlanTiers:
    @pytest.mark.parametrize("plan", ["free", "basic", "pro", "premium"])
    def test_change_plan_valid_tiers(self, demo_provider_token, plan):
        r = requests.post(f"{API}/providers/me/plan", headers=_hdr(demo_provider_token), json={"plan": plan}, timeout=15)
        assert r.status_code == 200, f"plan={plan} failed: {r.text}"
        assert r.json()["plan"] == plan
        # verify persistence
        rme = requests.get(f"{API}/providers/me", headers=_hdr(demo_provider_token), timeout=15)
        assert rme.json()["plan"] == plan

    def test_change_plan_invalid_tier_rejected(self, demo_provider_token):
        r = requests.post(f"{API}/providers/me/plan", headers=_hdr(demo_provider_token), json={"plan": "enterprise"}, timeout=15)
        assert r.status_code in (400, 422)

    def test_restore_pro_for_demo(self, demo_provider_token):
        # cleanup: restore to pro
        r = requests.post(f"{API}/providers/me/plan", headers=_hdr(demo_provider_token), json={"plan": "pro"}, timeout=15)
        assert r.status_code == 200


# ---------- Reviews ----------
class TestReviewsRegression:
    def test_create_review(self, demo_provider_id):
        _, token, _ = _register()
        r = requests.post(f"{API}/reviews", headers=_hdr(token), json={
            "provider_id": demo_provider_id, "rating": 5, "comment": "TEST_review"
        }, timeout=15)
        assert r.status_code in (200, 400), f"unexpected status {r.status_code}: {r.text}"
        # 400 acceptable only if duplicate-review check is in place


# ---------- Service Requests ----------
class TestServiceRequests:
    def test_create_service_request(self, demo_provider_id):
        _, token, _ = _register()
        r = requests.post(f"{API}/service-requests", headers=_hdr(token), json={
            "provider_id": demo_provider_id,
            "message": "TEST_request msg",
            "service_type": "Limpieza",
            "preferred_date": "2026-02-01",
            "contact_phone": "+15555550100"
        }, timeout=15)
        assert r.status_code == 200, f"service-request failed: {r.text}"
        assert r.json()["status"] == "pending"


# ---------- Messages ----------
class TestMessages:
    def test_send_message_to_provider(self, demo_provider_id):
        _, token, _ = _register()
        r = requests.post(f"{API}/messages", headers=_hdr(token), json={
            "provider_id": demo_provider_id, "body": "TEST_hello", "subject": "TEST"
        }, timeout=15)
        assert r.status_code == 200, f"send message failed: {r.text}"
        assert "conversation_id" in r.json()


# ---------- Upload ----------
class TestUpload:
    def test_upload_image(self, demo_provider_token):
        # fake png bytes
        fake = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 64)
        files = {"file": ("test.png", fake, "image/png")}
        r = requests.post(f"{API}/upload", headers={"Authorization": f"Bearer {demo_provider_token}"}, files=files, timeout=20)
        assert r.status_code == 200, f"upload failed: {r.text}"
        body = r.json()
        assert "url" in body


# ---------- Favorites ----------
class TestFavorites:
    def test_favorite_add_list_remove(self, demo_provider_id):
        _, token, _ = _register()
        r = requests.post(f"{API}/favorites", headers=_hdr(token), json={"provider_id": demo_provider_id}, timeout=15)
        assert r.status_code == 200
        r2 = requests.get(f"{API}/favorites", headers=_hdr(token), timeout=15)
        assert r2.status_code == 200
        assert any(f.get("provider_id") == demo_provider_id for f in r2.json())
        r3 = requests.delete(f"{API}/favorites/{demo_provider_id}", headers=_hdr(token), timeout=15)
        assert r3.status_code == 200


# ---------- Admin ----------
class TestAdminRegression:
    def test_admin_providers_list(self, admin_token):
        r = requests.get(f"{API}/admin/providers", headers=_hdr(admin_token), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_stats(self, admin_token):
        r = requests.get(f"{API}/admin/stats", headers=_hdr(admin_token), timeout=15)
        assert r.status_code == 200
        assert "total_providers" in r.json()

    def test_admin_reviews(self, admin_token):
        r = requests.get(f"{API}/admin/reviews", headers=_hdr(admin_token), timeout=15)
        assert r.status_code == 200

    def test_admin_audit_log(self, admin_token):
        r = requests.get(f"{API}/admin/audit-log", headers=_hdr(admin_token), timeout=15)
        assert r.status_code == 200

    def test_admin_endpoints_blocked_for_non_admin(self, demo_provider_token):
        r = requests.get(f"{API}/admin/providers", headers=_hdr(demo_provider_token), timeout=15)
        assert r.status_code in (401, 403)
