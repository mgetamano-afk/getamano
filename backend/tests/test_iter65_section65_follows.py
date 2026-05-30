"""
Section 65 — Red de Aliados / Followers system backend tests.

Endpoints under test (all under /api):
  POST   /follows/{user_id}
  DELETE /follows/{user_id}
  GET    /follows/{user_id}/state
  GET    /follows/{user_id}/stats          (PUBLIC)
  GET    /follows/me/following
  GET    /follows/me/followers
  GET    /follows/me/network
"""

import os
import pytest
import requests
from tests.test_config import (
    BASE_URL,
    PROVIDER_EMAIL,
    PROVIDER_PASSWORD,
    CLIENT_EMAIL,
    CLIENT_PASSWORD,
)

# These two seed-user IDs are stable across test runs (idempotent seed)
# and not secret. Kept inline because they're not credentials.
PROVIDER_USER_ID = os.environ.get("TEST_PROVIDER_USER_ID", "user_3e47ee2b3526")
CLIENT_USER_ID = os.environ.get("TEST_CLIENT_USER_ID", "user_3674d6dc5ccc")


def _login(email: str, password: str) -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def client_session():
    return _login(CLIENT_EMAIL, CLIENT_PASSWORD)


@pytest.fixture(scope="module")
def provider_session():
    return _login(PROVIDER_EMAIL, PROVIDER_PASSWORD)


# Ensure a clean starting state — client unfollows provider before tests start
@pytest.fixture(scope="module", autouse=True)
def cleanup(client_session, provider_session):
    client_session.delete(f"{BASE_URL}/api/follows/{PROVIDER_USER_ID}", timeout=20)
    provider_session.delete(f"{BASE_URL}/api/follows/{CLIENT_USER_ID}", timeout=20)
    yield
    client_session.delete(f"{BASE_URL}/api/follows/{PROVIDER_USER_ID}", timeout=20)
    provider_session.delete(f"{BASE_URL}/api/follows/{CLIENT_USER_ID}", timeout=20)


# ---------- F1: POST /follows/{user_id} ----------

class TestFollowEndpoint:
    def test_self_follow_forbidden(self, client_session):
        r = client_session.post(f"{BASE_URL}/api/follows/{CLIENT_USER_ID}", timeout=20)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"

    def test_follow_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/follows/{PROVIDER_USER_ID}", timeout=20)
        assert r.status_code in (401, 403), f"Expected auth error, got {r.status_code}"

    def test_follow_success(self, client_session):
        r = client_session.post(f"{BASE_URL}/api/follows/{PROVIDER_USER_ID}", timeout=20)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        data = r.json()
        assert data["following"] is True
        assert isinstance(data["followers_count"], int)
        assert isinstance(data["following_count"], int)
        assert data["followers_count"] >= 1
        assert data["following_count"] >= 1

    def test_follow_idempotent(self, client_session):
        r1 = client_session.post(f"{BASE_URL}/api/follows/{PROVIDER_USER_ID}", timeout=20)
        f1 = r1.json()["followers_count"]
        r2 = client_session.post(f"{BASE_URL}/api/follows/{PROVIDER_USER_ID}", timeout=20)
        assert r2.status_code == 200
        f2 = r2.json()["followers_count"]
        assert f1 == f2, f"Idempotency broken: counts changed {f1} -> {f2}"
        assert r2.json()["following"] is True


# ---------- F3: GET /follows/{user_id}/state ----------

class TestStateEndpoint:
    def test_state_following_true(self, client_session):
        r = client_session.get(f"{BASE_URL}/api/follows/{PROVIDER_USER_ID}/state", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["following"] is True
        assert data["since"] is not None
        assert "T" in data["since"]  # ISO timestamp
        assert isinstance(data["followers_count"], int)

    def test_state_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/follows/{PROVIDER_USER_ID}/state", timeout=20)
        assert r.status_code in (401, 403)


# ---------- F4: GET /follows/{user_id}/stats (PUBLIC) ----------

class TestStatsEndpoint:
    def test_stats_public_no_auth(self):
        # Anonymous request — no session, no cookie
        r = requests.get(f"{BASE_URL}/api/follows/{PROVIDER_USER_ID}/stats", timeout=20)
        assert r.status_code == 200, f"Public stats failed: {r.status_code} {r.text}"
        data = r.json()
        assert "followers" in data and "following" in data
        assert isinstance(data["followers"], int)
        assert isinstance(data["following"], int)
        assert data["followers"] >= 1  # client followed provider

    def test_stats_unknown_user(self):
        r = requests.get(f"{BASE_URL}/api/follows/user_doesnotexist/stats", timeout=20)
        assert r.status_code == 200  # returns zero counts, not 404
        data = r.json()
        assert data["followers"] == 0
        assert data["following"] == 0


# ---------- F5: GET /follows/me/following ----------

class TestFollowingList:
    def test_my_following_shape(self, client_session):
        r = client_session.get(f"{BASE_URL}/api/follows/me/following", timeout=20)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) >= 1
        prov = next((u for u in rows if u["user_id"] == PROVIDER_USER_ID), None)
        assert prov, f"Provider not found in my following list: {rows}"
        assert prov["role"] == "provider"
        assert prov["provider"] is not None
        p = prov["provider"]
        for key in ("business_name", "slug", "city", "state",
                    "rating_avg", "rating_count", "verification_status"):
            assert key in p, f"Missing key {key} in provider sub-doc: {p}"


# ---------- F6: GET /follows/me/followers ----------

class TestFollowersList:
    def test_provider_sees_client_in_followers(self, provider_session):
        r = provider_session.get(f"{BASE_URL}/api/follows/me/followers", timeout=20)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        ids = [u["user_id"] for u in rows]
        assert CLIENT_USER_ID in ids, f"Client not in provider followers: {ids}"
        carlos = next(u for u in rows if u["user_id"] == CLIENT_USER_ID)
        assert carlos["role"] == "client"
        # client has no provider sub-doc
        assert carlos.get("provider") is None


# ---------- F7: GET /follows/me/network ----------

class TestNetwork:
    def test_network_shape_provider(self, provider_session):
        r = provider_session.get(f"{BASE_URL}/api/follows/me/network", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "followers_count" in data
        assert "following_count" in data
        assert "suggestions" in data
        assert isinstance(data["suggestions"], list)
        assert len(data["suggestions"]) <= 8
        # Suggestions should not include self
        ids = [s["user_id"] for s in data["suggestions"]]
        assert PROVIDER_USER_ID not in ids
        # Each suggestion has provider sub-doc
        for s in data["suggestions"]:
            assert s["role"] == "provider"
            assert s["provider"] is not None

    def test_network_for_client_no_category(self, client_session):
        # Client has no provider_profile/category — suggestions list should be empty
        r = client_session.get(f"{BASE_URL}/api/follows/me/network", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data["suggestions"] == []


# ---------- F2: DELETE /follows/{user_id} ----------

class TestUnfollow:
    def test_unfollow_removes_and_decrements(self, client_session):
        # Ensure follow exists
        client_session.post(f"{BASE_URL}/api/follows/{PROVIDER_USER_ID}", timeout=20)
        before = requests.get(f"{BASE_URL}/api/follows/{PROVIDER_USER_ID}/stats", timeout=20).json()["followers"]
        r = client_session.delete(f"{BASE_URL}/api/follows/{PROVIDER_USER_ID}", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data["following"] is False
        assert data["removed"] == 1
        after = data["followers_count"]
        assert after == before - 1, f"Expected {before-1}, got {after}"

    def test_unfollow_idempotent(self, client_session):
        # Already unfollowed in previous test
        r = client_session.delete(f"{BASE_URL}/api/follows/{PROVIDER_USER_ID}", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data["following"] is False
        assert data["removed"] == 0

    def test_state_after_unfollow(self, client_session):
        r = client_session.get(f"{BASE_URL}/api/follows/{PROVIDER_USER_ID}/state", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data["following"] is False
        assert data["since"] is None
