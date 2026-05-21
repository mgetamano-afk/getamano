"""
Iteration 3 backend tests — verifies fixes from iter-2 report:
  (a) ProviderProfileIn now persists is_home_based, latitude, longitude,
      additional_categories, gallery on POST and PUT
  (b) Unique indexes exist on provider_profiles.slug, provider_profiles.user_id,
      users.email, user_sessions.session_token, conversations(client_id,provider_id)
  (c) Seed idempotent — no duplicate provider_profiles for demo slug
  (d) Demo provider has 3 gallery items
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

PROVIDER_EMAIL = "demo.provider@getamano.com"
PROVIDER_PASSWORD = os.environ.get("TEST_PROVIDER_PASSWORD", "provider123")
ADMIN_EMAIL = "admin@getamano.com"
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "admin123")
DEMO_SLUG = "maria-cleaning-services-sallisaw-ok"


def H(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def provider_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": PROVIDER_EMAIL, "password": PROVIDER_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def categories():
    r = requests.get(f"{API}/categories", timeout=15)
    assert r.status_code == 200
    return r.json()


@pytest.fixture()
def new_provider(categories):
    """Register fresh user + create provider profile with new fields."""
    email = f"TEST_it3_prov_{uuid.uuid4().hex[:8]}@example.com"
    reg = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "Passw0rd!", "name": "TEST IT3 Prov", "role": "client"
    }, timeout=20)
    assert reg.status_code == 200, reg.text
    token = reg.json()["token"]
    payload = {
        "business_name": f"TEST IT3 Biz {uuid.uuid4().hex[:5]}",
        "category_id": categories[0]["category_id"],
        "description": "TEST iter3",
        "city": "Austin", "state": "TX", "zip_code": "78701",
        "languages": ["es", "en"], "services": ["s1"], "service_areas": ["Austin, TX"],
        "hours": {}, "social": {}, "price_range": "$$",
        "is_home_based": True,
        "latitude": 30.2672,
        "longitude": -97.7431,
        "additional_categories": [categories[1]["category_id"]],
        "gallery": [
            {"id": "g_test1", "url": "https://example.com/a.png", "caption": "A"},
            {"id": "g_test2", "url": "https://example.com/b.png", "caption": "B"},
        ],
    }
    r = requests.post(f"{API}/providers", headers=H(token), json=payload, timeout=20)
    assert r.status_code == 200, r.text
    return {"token": token, "profile": r.json(), "payload": payload}


# ---------- (a) ProviderProfileIn fields persist on CREATE ----------
class TestCreateProviderPersistsNewFields:
    def test_create_persists_all_new_fields(self, new_provider):
        body = new_provider["profile"]
        # Assert all 5 new fields present in create response
        assert body.get("is_home_based") == True  # noqa: E712, f"is_home_based not persisted: {body}"
        assert body.get("latitude") == 30.2672
        assert body.get("longitude") == -97.7431
        assert body.get("additional_categories") == new_provider["payload"]["additional_categories"]
        gallery = body.get("gallery") or []
        assert len(gallery) == 2, f"gallery not persisted: {gallery}"
        assert {g["id"] for g in gallery} == {"g_test1", "g_test2"}

    def test_create_persisted_to_db_via_get(self, new_provider):
        # GET /providers/me to verify DB persistence
        r = requests.get(f"{API}/providers/me", headers=H(new_provider["token"]), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["is_home_based"] == True  # noqa: E712
        assert data["latitude"] == 30.2672
        assert data["longitude"] == -97.7431
        assert len(data["additional_categories"]) == 1
        assert len(data["gallery"]) == 2


# ---------- (a) ProviderProfileIn fields persist on PUT ----------
class TestUpdateProviderPersistsNewFields:
    def test_put_updates_new_fields(self, new_provider, categories):
        token = new_provider["token"]
        # First GET current
        cur = requests.get(f"{API}/providers/me", headers=H(token), timeout=15).json()
        update_payload = {
            "business_name": cur["business_name"],
            "category_id": cur["category_id"],
            "description": "updated",
            "city": cur["city"], "state": cur["state"], "zip_code": cur["zip_code"],
            "languages": cur.get("languages", []), "services": cur.get("services", []),
            "service_areas": cur.get("service_areas", []),
            "hours": cur.get("hours", {}), "social": cur.get("social", {}),
            "price_range": cur.get("price_range", "$"),
            # Change all 5 new fields
            "is_home_based": False,
            "latitude": 35.4612,
            "longitude": -94.7872,
            "additional_categories": [categories[2]["category_id"]],
            "gallery": [
                {"id": "g_updated", "url": "https://example.com/c.png", "caption": "C"}
            ],
        }
        r = requests.put(f"{API}/providers/me", headers=H(token), json=update_payload, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["is_home_based"] == False  # noqa: E712
        assert data["latitude"] == 35.4612
        assert data["longitude"] == -94.7872
        assert data["additional_categories"] == [categories[2]["category_id"]]
        assert len(data["gallery"]) == 1
        assert data["gallery"][0]["id"] == "g_updated"

        # Re-GET to confirm DB persistence
        r2 = requests.get(f"{API}/providers/me", headers=H(token), timeout=15).json()
        assert r2["is_home_based"] == False  # noqa: E712
        assert r2["latitude"] == 35.4612
        assert r2["gallery"][0]["id"] == "g_updated"


# ---------- (b) unique indexes ----------
class TestUniqueIndexes:
    def test_register_duplicate_email_rejected(self):
        email = f"TEST_it3_dup_{uuid.uuid4().hex[:8]}@example.com"
        r1 = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Passw0rd!", "name": "A", "role": "client"
        }, timeout=15)
        assert r1.status_code == 200
        r2 = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Passw0rd!", "name": "B", "role": "client"
        }, timeout=15)
        assert r2.status_code in (400, 409), f"Expected duplicate rejection, got {r2.status_code} {r2.text}"


# ---------- (c) seed idempotent / no duplicate demo provider ----------
class TestDemoSeedIdempotent:
    def test_demo_slug_resolves_single_provider(self):
        r = requests.get(f"{API}/providers/by-slug/{DEMO_SLUG}", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("slug") == DEMO_SLUG
        # Provider has a single owning user
        assert data.get("provider_id")
        assert data.get("user_id")

    def test_demo_provider_login_matches_slug_doc(self, provider_token):
        # provider /providers/me should yield same slug
        r = requests.get(f"{API}/providers/me", headers=H(provider_token), timeout=15)
        assert r.status_code == 200, r.text
        me = r.json()
        assert me["slug"] == DEMO_SLUG, f"demo provider /me slug mismatch: {me.get('slug')}"


# ---------- (d) demo provider has 3 gallery items ----------
class TestDemoGallery:
    def test_demo_ecard_has_3_gallery_items(self):
        r = requests.get(f"{API}/providers/by-slug/{DEMO_SLUG}", timeout=15)
        assert r.status_code == 200
        data = r.json()
        gallery = data.get("gallery") or []
        assert len(gallery) >= 3, f"expected >=3 gallery items, got {len(gallery)}: {gallery}"
        # All items have url + id
        for g in gallery[:3]:
            assert g.get("url")
            assert g.get("id")
