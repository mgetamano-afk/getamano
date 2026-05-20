"""
Backend integration tests for getmano API.
Covers: auth (register/login/me/logout), categories, providers (search/featured/by-slug/me/CRUD),
reviews, favorites, admin endpoints, plans, and contact-click tracker.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://verified-providers-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@getmano.com"
ADMIN_PASSWORD = "admin123"
PROVIDER_EMAIL = "demo.provider@getmano.com"
PROVIDER_PASSWORD = "provider123"
DEMO_SLUG = "maria-cleaning-services-sallisaw-ok"


# ---------- Session-scoped helpers ----------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def provider_token():
    r = requests.post(f"{API}/auth/login", json={"email": PROVIDER_EMAIL, "password": PROVIDER_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"Provider login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def client_user():
    """Register a fresh client user."""
    email = f"TEST_client_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "Passw0rd!", "name": "TEST Client", "role": "client"
    }, timeout=20)
    assert r.status_code == 200, f"Register failed: {r.status_code} {r.text}"
    return {"email": email, "token": r.json()["token"], "user": r.json()["user"]}


def H(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- Categories ----------
class TestCategories:
    def test_list_categories(self):
        r = requests.get(f"{API}/categories", timeout=15)
        assert r.status_code == 200
        cats = r.json()
        assert isinstance(cats, list)
        assert len(cats) == 12, f"Expected 12 categories, got {len(cats)}"
        slugs = {c["slug"] for c in cats}
        assert "cleaning" in slugs
        for c in cats:
            assert "category_id" in c and "name_es" in c and "name_en" in c
            assert "_id" not in c


# ---------- Auth ----------
class TestAuth:
    def test_login_admin(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["user"]["role"] == "admin"
        assert isinstance(data["token"], str) and len(data["token"]) > 10

    def test_login_provider(self):
        r = requests.post(f"{API}/auth/login", json={"email": PROVIDER_EMAIL, "password": PROVIDER_PASSWORD}, timeout=15)
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "provider"

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_me_with_token(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers=H(admin_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_me_unauthenticated(self):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401

    def test_register_and_logout(self, client_user):
        # me works with new client token
        r = requests.get(f"{API}/auth/me", headers=H(client_user["token"]), timeout=15)
        assert r.status_code == 200
        assert r.json()["role"] == "client"
        # logout (cookie-based; with bearer it still returns ok=True)
        r2 = requests.post(f"{API}/auth/logout", headers=H(client_user["token"]), timeout=15)
        assert r2.status_code == 200
        assert r2.json().get("ok") is True

    def test_register_duplicate_email(self):
        email = f"TEST_dup_{uuid.uuid4().hex[:6]}@example.com"
        p = {"email": email, "password": "Passw0rd!", "name": "Dup", "role": "client"}
        r1 = requests.post(f"{API}/auth/register", json=p, timeout=15)
        assert r1.status_code == 200
        r2 = requests.post(f"{API}/auth/register", json=p, timeout=15)
        assert r2.status_code == 400


# ---------- Providers ----------
class TestProviders:
    def test_featured(self):
        r = requests.get(f"{API}/providers/featured", timeout=15)
        assert r.status_code == 200
        providers = r.json()
        assert isinstance(providers, list)
        assert len(providers) >= 1
        for p in providers:
            assert p["verification_status"] == "approved"
            assert "_id" not in p
            assert "category" in p

    def test_search_no_filters(self):
        r = requests.get(f"{API}/providers", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_search_with_category(self):
        r = requests.get(f"{API}/providers", params={"category": "cleaning"}, timeout=15)
        assert r.status_code == 200
        providers = r.json()
        # demo provider is cleaning
        assert any(p["slug"] == DEMO_SLUG for p in providers), f"Expected demo provider in results, got {[p['slug'] for p in providers]}"

    def test_search_with_verified_and_language(self):
        r = requests.get(f"{API}/providers", params={"verified": "true", "language": "es"}, timeout=15)
        assert r.status_code == 200
        for p in r.json():
            assert p["verification_status"] == "approved"
            assert "es" in p["languages"]

    def test_search_text_query(self):
        r = requests.get(f"{API}/providers", params={"q": "Cleaning"}, timeout=15)
        assert r.status_code == 200
        providers = r.json()
        assert any(p["slug"] == DEMO_SLUG for p in providers)

    def test_provider_by_slug_and_views_increment(self):
        r1 = requests.get(f"{API}/providers/by-slug/{DEMO_SLUG}", timeout=15)
        assert r1.status_code == 200
        p1 = r1.json()
        assert p1["slug"] == DEMO_SLUG
        assert "reviews" in p1 and isinstance(p1["reviews"], list)
        assert "category" in p1
        v1 = p1["views"]

        r2 = requests.get(f"{API}/providers/by-slug/{DEMO_SLUG}", timeout=15)
        assert r2.status_code == 200
        v2 = r2.json()["views"]
        assert v2 >= v1 + 1, f"Views did not increment ({v1} -> {v2})"

    def test_provider_by_slug_404(self):
        r = requests.get(f"{API}/providers/by-slug/does-not-exist-zzz", timeout=15)
        assert r.status_code == 404

    def test_provider_me_existing(self, provider_token):
        r = requests.get(f"{API}/providers/me", headers=H(provider_token), timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body is not None
        assert body["slug"] == DEMO_SLUG

    def test_provider_me_requires_auth(self):
        r = requests.get(f"{API}/providers/me", timeout=15)
        assert r.status_code == 401

    def test_provider_update_me(self, provider_token):
        # Read current
        cur = requests.get(f"{API}/providers/me", headers=H(provider_token), timeout=15).json()
        new_desc = f"Updated description {uuid.uuid4().hex[:6]}"
        payload = {
            "business_name": cur["business_name"],
            "category_id": cur["category_id"],
            "description": new_desc,
            "phone": cur.get("phone", ""),
            "email": cur.get("email", ""),
            "city": cur.get("city", ""),
            "state": cur.get("state", ""),
            "zip_code": cur.get("zip_code", ""),
            "languages": cur.get("languages", ["es", "en"]),
            "services": cur.get("services", []),
            "service_areas": cur.get("service_areas", []),
            "hours": cur.get("hours", {}),
            "social": cur.get("social", {}),
            "price_range": cur.get("price_range", "$$"),
        }
        r = requests.put(f"{API}/providers/me", headers=H(provider_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["description"] == new_desc

    def test_contact_click_increments(self):
        p = requests.get(f"{API}/providers/by-slug/{DEMO_SLUG}", timeout=15).json()
        pid = p["provider_id"]
        before = p["contact_clicks"]
        r = requests.post(f"{API}/providers/{pid}/contact-click", timeout=15)
        assert r.status_code == 200
        after_p = requests.get(f"{API}/providers/by-slug/{DEMO_SLUG}", timeout=15).json()
        assert after_p["contact_clicks"] >= before + 1


# ---------- Reviews ----------
class TestReviews:
    def test_create_review_and_duplicate_rejected(self, client_user):
        # find demo provider id
        p = requests.get(f"{API}/providers/by-slug/{DEMO_SLUG}", timeout=15).json()
        pid = p["provider_id"]
        before_count = p["rating_count"]

        token = client_user["token"]
        payload = {"provider_id": pid, "rating": 5, "comment": "TEST excellent service"}
        r = requests.post(f"{API}/reviews", headers=H(token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["rating"] == 5

        # verify aggregate updated
        p2 = requests.get(f"{API}/providers/by-slug/{DEMO_SLUG}", timeout=15).json()
        assert p2["rating_count"] == before_count + 1

        # duplicate should be rejected
        r2 = requests.post(f"{API}/reviews", headers=H(token), json=payload, timeout=15)
        assert r2.status_code == 400

    def test_review_requires_auth(self):
        r = requests.post(f"{API}/reviews", json={"provider_id": "x", "rating": 5, "comment": ""}, timeout=15)
        assert r.status_code == 401

    def test_review_rating_validation(self, client_user):
        r = requests.post(f"{API}/reviews",
                          headers=H(client_user["token"]),
                          json={"provider_id": "x", "rating": 9, "comment": ""}, timeout=15)
        assert r.status_code == 422


# ---------- Favorites ----------
class TestFavorites:
    def test_favorites_flow(self, client_user):
        p = requests.get(f"{API}/providers/by-slug/{DEMO_SLUG}", timeout=15).json()
        pid = p["provider_id"]
        token = client_user["token"]

        # add
        r1 = requests.post(f"{API}/favorites", headers=H(token), json={"provider_id": pid}, timeout=15)
        assert r1.status_code == 200

        # list
        r2 = requests.get(f"{API}/favorites", headers=H(token), timeout=15)
        assert r2.status_code == 200
        favs = r2.json()
        assert any(f["provider_id"] == pid for f in favs)

        # delete
        r3 = requests.delete(f"{API}/favorites/{pid}", headers=H(token), timeout=15)
        assert r3.status_code == 200

        # list again - should be empty
        r4 = requests.get(f"{API}/favorites", headers=H(token), timeout=15)
        assert r4.status_code == 200
        assert all(f["provider_id"] != pid for f in r4.json())

    def test_favorites_require_auth(self):
        r = requests.get(f"{API}/favorites", timeout=15)
        assert r.status_code == 401


# ---------- Admin ----------
class TestAdmin:
    def test_admin_stats(self, admin_token):
        r = requests.get(f"{API}/admin/stats", headers=H(admin_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        for k in ("total_providers", "pending_providers", "approved_providers",
                  "total_users", "total_clients", "total_reviews"):
            assert k in data
            assert isinstance(data[k], int)
        assert data["total_providers"] >= 1

    def test_admin_list_providers(self, admin_token):
        r = requests.get(f"{API}/admin/providers", headers=H(admin_token), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_list_providers_filter(self, admin_token):
        r = requests.get(f"{API}/admin/providers", headers=H(admin_token),
                         params={"status": "approved"}, timeout=15)
        assert r.status_code == 200
        for p in r.json():
            assert p["verification_status"] == "approved"

    def test_admin_verify_action(self, admin_token):
        # fetch demo provider
        p = requests.get(f"{API}/providers/by-slug/{DEMO_SLUG}", timeout=15).json()
        pid = p["provider_id"]
        # set to in_review then back to approved
        r1 = requests.post(f"{API}/admin/providers/{pid}/verify",
                           headers=H(admin_token),
                           json={"status": "in_review", "note": "TEST"}, timeout=15)
        assert r1.status_code == 200
        admins_list = requests.get(f"{API}/admin/providers",
                                   headers=H(admin_token),
                                   params={"status": "in_review"}, timeout=15).json()
        assert any(x["provider_id"] == pid for x in admins_list)
        r2 = requests.post(f"{API}/admin/providers/{pid}/verify",
                           headers=H(admin_token),
                           json={"status": "approved", "note": "TEST revert"}, timeout=15)
        assert r2.status_code == 200

    def test_admin_requires_admin_role(self, client_user):
        r = requests.get(f"{API}/admin/stats", headers=H(client_user["token"]), timeout=15)
        assert r.status_code == 403

    def test_admin_requires_auth(self):
        r = requests.get(f"{API}/admin/stats", timeout=15)
        assert r.status_code == 401


# ---------- Plans ----------
class TestPlans:
    def test_plans_returns_three(self):
        r = requests.get(f"{API}/plans", timeout=15)
        assert r.status_code == 200
        plans = r.json()
        assert len(plans) == 3
        ids = {p["id"] for p in plans}
        assert ids == {"free", "pro", "premium"}
        for p in plans:
            assert "features_es" in p and "features_en" in p
            assert isinstance(p["features_es"], list) and len(p["features_es"]) > 0


# ---------- Provider creation (separate user) ----------
class TestProviderCreation:
    def test_create_provider_profile_as_new_user(self):
        # register a client, then create a provider profile (server auto-upgrades to provider)
        email = f"TEST_newprov_{uuid.uuid4().hex[:8]}@example.com"
        reg = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Passw0rd!", "name": "TEST New Prov", "role": "client"
        }, timeout=15)
        assert reg.status_code == 200
        token = reg.json()["token"]

        # need a category
        cats = requests.get(f"{API}/categories", timeout=15).json()
        cat_id = cats[0]["category_id"]

        payload = {
            "business_name": f"TEST Biz {uuid.uuid4().hex[:6]}",
            "category_id": cat_id,
            "description": "TEST provider description",
            "phone": "+1 555 000 1111",
            "city": "Dallas", "state": "TX", "zip_code": "75001",
            "languages": ["es", "en"], "services": ["TEST service"],
            "service_areas": ["Dallas, TX"], "hours": {}, "social": {},
            "price_range": "$$",
        }
        r = requests.post(f"{API}/providers", headers=H(token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["verification_status"] == "pending"
        assert body["slug"].startswith("test-biz")

        # duplicate creation should fail
        r2 = requests.post(f"{API}/providers", headers=H(token), json=payload, timeout=15)
        assert r2.status_code == 400
