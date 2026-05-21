"""Iteration 8: Verify PUT /api/providers/me persists owner_identity field after bug fix."""
import os
import requests
import pytest

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    # Fallback to frontend .env if process env not set
    try:
        with open('/app/frontend/.env') as f:
            for line in f:
                if line.startswith('REACT_APP_BACKEND_URL='):
                    BASE_URL = line.split('=', 1)[1].strip().rstrip('/')
                    break
    except Exception:
        pass

PROVIDER_EMAIL = "demo.provider@getamano.com"
PROVIDER_PASSWORD = os.environ.get("TEST_PROVIDER_PASSWORD", "provider123")


@pytest.fixture(scope="module")
def provider_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": PROVIDER_EMAIL, "password": PROVIDER_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return s


# Test FIX: PUT /api/providers/me with owner_identity persists
def test_put_providers_me_persists_owner_identity_american(provider_session):
    # GET current profile
    r = provider_session.get(f"{BASE_URL}/api/providers/me", timeout=15)
    assert r.status_code == 200
    profile = r.json()
    business_name = profile.get("business_name")
    category_id = profile.get("category_id")
    assert business_name and category_id

    # PUT with owner_identity=american
    payload = {
        "business_name": business_name,
        "category_id": category_id,
        "owner_identity": "american",
    }
    r = provider_session.put(f"{BASE_URL}/api/providers/me", json=payload, timeout=15)
    assert r.status_code == 200, f"PUT failed: {r.status_code} {r.text}"
    body = r.json()
    assert body.get("owner_identity") == "american", f"Response missing american: {body}"

    # GET again and verify persistence
    r = provider_session.get(f"{BASE_URL}/api/providers/me", timeout=15)
    assert r.status_code == 200
    assert r.json().get("owner_identity") == "american"


def test_put_providers_me_persists_owner_identity_latino(provider_session):
    r = provider_session.get(f"{BASE_URL}/api/providers/me", timeout=15)
    profile = r.json()
    payload = {
        "business_name": profile.get("business_name"),
        "category_id": profile.get("category_id"),
        "owner_identity": "latino",
    }
    r = provider_session.put(f"{BASE_URL}/api/providers/me", json=payload, timeout=15)
    assert r.status_code == 200
    assert r.json().get("owner_identity") == "latino"

    r = provider_session.get(f"{BASE_URL}/api/providers/me", timeout=15)
    assert r.json().get("owner_identity") == "latino"


# Regression: filter still works
def test_filter_owner_identity_latino_returns_providers():
    r = requests.get(f"{BASE_URL}/api/providers", params={"owner_identity": "latino"}, timeout=15)
    assert r.status_code == 200
    data = r.json()
    items = data.get("items", data) if isinstance(data, dict) else data
    assert isinstance(items, list)
    assert len(items) >= 1


def test_filter_owner_identity_american_returns_providers_after_toggle(provider_session):
    # Set demo provider to american first
    r = provider_session.get(f"{BASE_URL}/api/providers/me", timeout=15)
    profile = r.json()
    provider_session.put(f"{BASE_URL}/api/providers/me", json={
        "business_name": profile.get("business_name"),
        "category_id": profile.get("category_id"),
        "owner_identity": "american",
    }, timeout=15)

    r = requests.get(f"{BASE_URL}/api/providers", params={"owner_identity": "american"}, timeout=15)
    assert r.status_code == 200
    data = r.json()
    items = data.get("items", data) if isinstance(data, dict) else data
    assert isinstance(items, list)
    assert any(p.get("owner_identity") == "american" for p in items)

    # Restore to latino
    provider_session.put(f"{BASE_URL}/api/providers/me", json={
        "business_name": profile.get("business_name"),
        "category_id": profile.get("category_id"),
        "owner_identity": "latino",
    }, timeout=15)


def test_providers_featured_ok():
    r = requests.get(f"{BASE_URL}/api/providers/featured", timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# Restore at end
def test_zz_restore_demo_provider_latino(provider_session):
    r = provider_session.get(f"{BASE_URL}/api/providers/me", timeout=15)
    profile = r.json()
    provider_session.put(f"{BASE_URL}/api/providers/me", json={
        "business_name": profile.get("business_name"),
        "category_id": profile.get("category_id"),
        "owner_identity": "latino",
    }, timeout=15)
    r = provider_session.get(f"{BASE_URL}/api/providers/me", timeout=15)
    assert r.json().get("owner_identity") == "latino"
