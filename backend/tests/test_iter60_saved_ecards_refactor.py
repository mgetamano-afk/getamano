"""
Iteration 60 — Section 63 backend refactor regression test.

Validates that all 5 /api/saved-ecards/* endpoints still work after being
extracted from server.py into routes/saved_ecards.py.

Endpoints under test:
  PUT    /api/saved-ecards
  DELETE /api/saved-ecards/{provider_id}
  PUT    /api/saved-ecards/{provider_id}/note
  GET    /api/saved-ecards/me/state/{provider_id}
  GET    /api/saved-ecards/me  (with ?filter=bookmark|like|all)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    BASE_URL = "https://verified-providers-2.preview.emergentagent.com"

CLIENT_EMAIL = "demo.client@getamano.com"
CLIENT_PASSWORD = "client123"
PROVIDER_ID = "prov_10b9f21bf971"  # demo.provider seed


@pytest.fixture(scope="module")
def client_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": CLIENT_EMAIL, "password": CLIENT_PASSWORD},
               timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    # cookie session_token expected
    return s


# --- baseline: clean any pre-existing save ---
def test_00_cleanup_existing(client_session):
    r = client_session.delete(f"{BASE_URL}/api/saved-ecards/{PROVIDER_ID}", timeout=15)
    assert r.status_code == 200
    assert "ok" in r.json()


# --- PUT /saved-ecards (create) ---
def test_01_upsert_bookmark(client_session):
    payload = {"provider_id": PROVIDER_ID, "save_type": "bookmark",
               "personal_note": "TEST_iter60 first save"}
    r = client_session.put(f"{BASE_URL}/api/saved-ecards", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("provider_id") == PROVIDER_ID
    assert data.get("save_type") == "bookmark"
    assert data.get("personal_note") == "TEST_iter60 first save"
    assert "save_id" in data


# --- GET /saved-ecards/me/state/{provider_id} ---
def test_02_get_state_after_save(client_session):
    r = client_session.get(f"{BASE_URL}/api/saved-ecards/me/state/{PROVIDER_ID}", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data.get("save_type") == "bookmark"
    assert data.get("personal_note") == "TEST_iter60 first save"


# --- PUT /saved-ecards (update to like) ---
def test_03_upsert_change_to_like(client_session):
    payload = {"provider_id": PROVIDER_ID, "save_type": "like"}
    r = client_session.put(f"{BASE_URL}/api/saved-ecards", json=payload, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data.get("save_type") == "like"


# --- PUT /saved-ecards/{provider_id}/note ---
def test_04_update_note_only(client_session):
    r = client_session.put(
        f"{BASE_URL}/api/saved-ecards/{PROVIDER_ID}/note",
        json={"personal_note": "TEST_iter60 updated note"}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("ok") is True
    assert data.get("personal_note") == "TEST_iter60 updated note"

    # verify via state
    s = client_session.get(f"{BASE_URL}/api/saved-ecards/me/state/{PROVIDER_ID}", timeout=15).json()
    assert s.get("personal_note") == "TEST_iter60 updated note"


# --- GET /saved-ecards/me filters ---
def test_05_list_me_all(client_session):
    r = client_session.get(f"{BASE_URL}/api/saved-ecards/me", timeout=15)
    assert r.status_code == 200
    rows = r.json()
    assert isinstance(rows, list)
    pids = [row.get("provider_id") for row in rows]
    assert PROVIDER_ID in pids
    row = next(row for row in rows if row.get("provider_id") == PROVIDER_ID)
    assert "provider" in row
    assert row["provider"].get("provider_id") == PROVIDER_ID
    assert "business_name" in row["provider"]


def test_06_list_me_filter_like(client_session):
    r = client_session.get(f"{BASE_URL}/api/saved-ecards/me?filter=like", timeout=15)
    assert r.status_code == 200
    rows = r.json()
    pids = [row.get("provider_id") for row in rows]
    assert PROVIDER_ID in pids  # current state is "like"


def test_07_list_me_filter_bookmark_excludes_like(client_session):
    r = client_session.get(f"{BASE_URL}/api/saved-ecards/me?filter=bookmark", timeout=15)
    assert r.status_code == 200
    rows = r.json()
    pids = [row.get("provider_id") for row in rows]
    assert PROVIDER_ID not in pids  # only "like" entry exists, not bookmark


# --- DELETE ---
def test_08_delete(client_session):
    r = client_session.delete(f"{BASE_URL}/api/saved-ecards/{PROVIDER_ID}", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data.get("ok") is True
    assert data.get("removed") == 1

    # verify state cleared
    s = client_session.get(f"{BASE_URL}/api/saved-ecards/me/state/{PROVIDER_ID}", timeout=15).json()
    assert s.get("save_type") is None


# --- 404 path: invalid provider ---
def test_09_save_invalid_provider_404(client_session):
    r = client_session.put(f"{BASE_URL}/api/saved-ecards",
                           json={"provider_id": "prov_doesnotexist_xyz",
                                 "save_type": "bookmark"}, timeout=15)
    assert r.status_code == 404


# --- 404 path: update note for not-saved provider ---
def test_10_update_note_404_when_not_saved(client_session):
    r = client_session.put(f"{BASE_URL}/api/saved-ecards/{PROVIDER_ID}/note",
                           json={"personal_note": "won't stick"}, timeout=15)
    assert r.status_code == 404


# --- Auth gate: unauthenticated call should 401 ---
def test_11_unauthed_blocked():
    r = requests.get(f"{BASE_URL}/api/saved-ecards/me", timeout=15)
    assert r.status_code in (401, 403)


# --- Regression sanity: health/ping & a couple of other endpoints ---
def test_12_categories_listing():
    r = requests.get(f"{BASE_URL}/api/categories", timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_13_search_providers():
    r = requests.get(f"{BASE_URL}/api/providers/search", timeout=15)
    assert r.status_code in (200, 404)


def test_14_stories_feed_loads():
    r = requests.get(f"{BASE_URL}/api/community/stories", timeout=15)
    assert r.status_code in (200, 401, 404)
