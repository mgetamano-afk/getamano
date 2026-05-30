"""
Iteration 98 — V9 user profile + Part 2 eCard reels + Part 3 identidad + Part 4C home service.
"""
import os
import sys
import io
import uuid

import requests

sys.path.insert(0, os.path.dirname(__file__))
from tests.test_config import API, DEMO_SLUG  # noqa: E402


def _read(rel_path: str) -> str:
    full = os.path.join(os.path.dirname(__file__), "..", "..", rel_path)
    with open(full, encoding="utf-8") as f:
        return f.read()


# ─── Part 2: /providers/by-slug/{slug}/reels ───────────────────────

def test_provider_reels_by_slug_returns_array():
    r = requests.get(f"{API}/providers/by-slug/{DEMO_SLUG}/reels", timeout=10)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_provider_reels_unknown_slug_returns_empty():
    r = requests.get(f"{API}/providers/by-slug/this-slug-does-not-exist/reels", timeout=10)
    assert r.status_code == 200
    assert r.json() == []


# ─── Part 3: Identidad section removed from provider dashboard ────

def test_identidad_section_removed():
    src = _read("frontend/src/pages/ProviderDashboard.jsx")
    # No clickable buttons for owner_identity left
    assert 'data-testid="form-owner-identity-' not in src
    # The actual visible section header for the picker is gone (the
    # only remaining mention is the V9 Part 3 removal note in code
    # comments, which is allowed).
    assert 'Identidad del negocio (opcional)' not in src


# ─── Part 4C: offers_home_service field & badge ───────────────────

def test_offers_home_service_in_model():
    src = _read("backend/server.py")
    assert "offers_home_service: bool = False" in src


def test_offers_home_service_toggle_in_dashboard():
    src = _read("frontend/src/pages/ProviderDashboard.jsx")
    assert "offers_home_service" in src
    assert "form-offers-home-service" in src


def test_search_card_renders_home_service_badge():
    src = _read("frontend/src/components/SearchResultCard.jsx")
    assert "offers_home_service" in src
    assert "result-card-home-service-" in src


# ─── Part 1: User profile endpoints ────────────────────────────────

def test_get_my_profile(client_session):
    r = client_session.get(f"{API}/users/me/profile", timeout=10)
    assert r.status_code == 200
    p = r.json()
    for k in ("user_id", "full_name", "username", "is_public", "is_provider"):
        assert k in p, f"missing key: {k}"
    # Auto-generated username
    assert p["username"] and len(p["username"]) >= 3


def test_update_my_profile(client_session):
    new_bio = f"hello v9 {uuid.uuid4().hex[:5]}"
    r = client_session.put(
        f"{API}/users/me/profile",
        json={"bio": new_bio, "city": "Chicago", "social_links": {"instagram": "@test"}},
        timeout=10,
    )
    assert r.status_code == 200
    p = r.json()
    assert p["bio"] == new_bio
    assert p["city"] == "Chicago"
    assert p["social_links"]["instagram"] == "test"  # @ stripped


def test_username_uniqueness(client_session, provider_session):
    # Pick the provider's current username
    me = provider_session.get(f"{API}/users/me/profile", timeout=10).json()
    taken = me["username"]
    r = client_session.get(f"{API}/users/username-available", params={"username": taken}, timeout=10)
    assert r.status_code == 200
    assert r.json()["available"] is False

    # A fresh random one
    fresh = f"v9_{uuid.uuid4().hex[:8]}"
    r2 = client_session.get(f"{API}/users/username-available", params={"username": fresh}, timeout=10)
    assert r2.json()["available"] is True


def test_user_photos_lifecycle(client_session):
    # Upload one photo (tiny PNG)
    png = bytes.fromhex(
        "89504E470D0A1A0A0000000D49484452000000010000000108020000009077"
        "3DDE0000000C49444154789C63F8FFFFFF3F0005FE02FE5C8C8FE40000000049454E44AE426082"
    )
    fd = {"file": ("test.png", io.BytesIO(png), "image/png")}
    up = client_session.post(f"{API}/users/me/photos", files=fd, timeout=20)
    assert up.status_code == 200, up.text
    photo = up.json()
    assert photo["id"].startswith("uph_")
    assert photo["image_url"].startswith("/api/uploads/")
    pid = photo["id"]

    # List
    lst = client_session.get(f"{API}/users/me/photos", timeout=10)
    assert lst.status_code == 200
    assert any(p["id"] == pid for p in lst.json())

    # Delete (cleanup)
    rm = client_session.delete(f"{API}/users/me/photos/{pid}", timeout=10)
    assert rm.status_code == 200
    assert rm.json()["deleted"] is True


def test_public_profile_by_username(client_session):
    me = client_session.get(f"{API}/users/me/profile", timeout=10).json()
    # Ensure I am public
    client_session.put(f"{API}/users/me/profile", json={"is_public": True}, timeout=10)
    r = requests.get(f"{API}/users/{me['username']}/profile", timeout=10)
    assert r.status_code == 200
    pub = r.json()
    assert pub["username"] == me["username"]
    # Private fields stripped for non-owners
    assert "email" not in pub
    assert "phone" not in pub


def test_public_profile_private_user(client_session):
    me = client_session.get(f"{API}/users/me/profile", timeout=10).json()
    client_session.put(f"{API}/users/me/profile", json={"is_public": False}, timeout=10)
    r = requests.get(f"{API}/users/{me['username']}/profile", timeout=10)
    assert r.status_code == 200
    pub = r.json()
    assert pub["is_public"] is False
    # Photos / reels should be empty for private
    photos = requests.get(f"{API}/users/{me['username']}/photos", timeout=10).json()
    assert photos == []
    # Reset to public
    client_session.put(f"{API}/users/me/profile", json={"is_public": True}, timeout=10)


def test_public_profile_not_found():
    r = requests.get(f"{API}/users/no_such_user_99999/profile", timeout=10)
    assert r.status_code == 404


# ─── Frontend source locks ─────────────────────────────────────────

def test_user_profile_page_v9_structure():
    src = _read("frontend/src/pages/UserProfile.jsx")
    for tid in (
        "user-profile-page",
        "user-profile-header",
        "user-profile-tabs",
        "user-profile-photos-tab",
        "user-profile-about-tab",
        "user-profile-edit",
        "user-profile-delete-account",
    ):
        assert f'data-testid="{tid}"' in src, f"missing {tid}"
    # Tab buttons use a dynamic template literal
    assert 'data-testid={`user-profile-tab-' in src


def test_public_user_profile_route_mounted():
    src = _read("frontend/src/App.js")
    assert '<Route path="/u/:username" element={<PublicUserProfile />}' in src


def test_ecard_handles_reels_softly():
    src = _read("frontend/src/pages/ProviderECard.jsx")
    # Defensive try/catch on reels fetch (V9 Part 2 fix)
    assert "/reels" in src
    assert "setReels" in src
