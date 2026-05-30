"""
Iteration 99 — V9 user profile E2E integration smoke tests (testing agent).

Validates the request flows main agent listed:
  (a) avatar upload, (b) edit profile (bio/username/instagram),
  (c) photo upload+delete, (d) public/private toggle,
  (e) public /u/:username endpoint (logged-out),
  (f) provider home-service toggle persists,
  (g) eCard reels endpoint always returns [].
"""
import io
import os
import sys
import uuid
import requests

sys.path.insert(0, os.path.dirname(__file__))
from tests.test_config import (  # noqa: E402
    API,
    DEMO_SLUG,
    PROVIDER_EMAIL,
    PROVIDER_PASSWORD,
)


def _png_bytes() -> bytes:
    return bytes.fromhex(
        "89504E470D0A1A0A0000000D49484452000000010000000108020000009077"
        "3DDE0000000C49444154789C63F8FFFFFF3F0005FE02FE5C8C8FE40000000049454E44AE426082"
    )


# ─── (a) Avatar upload ──────────────────────────────────────────
def test_avatar_upload_returns_url(client_session):
    fd = {"file": ("avatar.png", io.BytesIO(_png_bytes()), "image/png")}
    r = client_session.post(f"{API}/users/me/avatar", files=fd, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "avatar_url" in body
    assert body["avatar_url"].startswith("/api/uploads/"), body
    # GET /users/me/profile should reflect it
    me = client_session.get(f"{API}/users/me/profile", timeout=10).json()
    assert me.get("avatar_url") == body["avatar_url"]


# ─── (b) Edit profile (bio + username + instagram) ─────────────
def test_edit_profile_username_bio_instagram(client_session):
    new_username = f"v9e2e_{uuid.uuid4().hex[:6]}"
    new_bio = f"e2e bio {uuid.uuid4().hex[:5]}"
    r = client_session.put(
        f"{API}/users/me/profile",
        json={
            "username": new_username,
            "bio": new_bio,
            "social_links": {"instagram": "@v9user"},
        },
        timeout=10,
    )
    assert r.status_code == 200, r.text
    me = r.json()
    assert me["username"] == new_username.lower()
    assert me["bio"] == new_bio
    assert me["social_links"]["instagram"] == "v9user"


def test_edit_profile_username_conflict_returns_409(client_session, provider_session):
    taken = provider_session.get(f"{API}/users/me/profile", timeout=10).json()["username"]
    r = client_session.put(
        f"{API}/users/me/profile", json={"username": taken}, timeout=10
    )
    assert r.status_code == 409, r.text


# ─── (c) Photo upload + delete lifecycle (already covered) ─────
def test_photo_upload_then_delete(client_session):
    fd = {"file": ("p.png", io.BytesIO(_png_bytes()), "image/png")}
    up = client_session.post(f"{API}/users/me/photos", files=fd, timeout=20)
    assert up.status_code == 200, up.text
    pid = up.json()["id"]
    rm = client_session.delete(f"{API}/users/me/photos/{pid}", timeout=10)
    assert rm.status_code == 200


# ─── (d) public/private toggle ─────────────────────────────────
def test_public_private_toggle(client_session):
    # Set private
    r = client_session.put(
        f"{API}/users/me/profile", json={"is_public": False}, timeout=10
    )
    assert r.status_code == 200
    assert r.json()["is_public"] is False
    # Back to public
    r = client_session.put(
        f"{API}/users/me/profile", json={"is_public": True}, timeout=10
    )
    assert r.json()["is_public"] is True


# ─── (e) Logged-out public profile ─────────────────────────────
def test_public_profile_logged_out_view(client_session):
    me = client_session.get(f"{API}/users/me/profile", timeout=10).json()
    client_session.put(f"{API}/users/me/profile", json={"is_public": True}, timeout=10)
    anon = requests.Session()  # no cookies
    r = anon.get(f"{API}/users/{me['username']}/profile", timeout=10)
    assert r.status_code == 200
    pub = r.json()
    assert pub["username"] == me["username"]
    # Privacy: email/phone must be stripped for non-owners
    assert "email" not in pub
    assert "phone" not in pub


# ─── (f) Provider home service toggle persists ─────────────────
def test_provider_home_service_toggle(provider_session):
    # Fetch current full profile, flip flag, PUT entire payload
    prof_res = provider_session.get(f"{API}/providers/me", timeout=10)
    assert prof_res.status_code == 200, prof_res.text
    prof = prof_res.json()
    payload = {
        "business_name": prof.get("business_name") or "Test Biz",
        "category_id": prof.get("category_id") or "cleaning",
        "offers_home_service": True,
    }
    # Preserve other commonly-required fields if present
    for k in ("city", "state", "country", "description", "phone", "email", "address"):
        if prof.get(k) is not None:
            payload[k] = prof[k]
    r = provider_session.put(f"{API}/providers/me", json=payload, timeout=15)
    assert r.status_code in (200, 204), r.text
    # Public eCard reflects it
    s = requests.get(f"{API}/providers/by-slug/{DEMO_SLUG}", timeout=10)
    assert s.status_code == 200
    assert s.json().get("offers_home_service") is True

    # Restore prior value
    payload["offers_home_service"] = bool(prof.get("offers_home_service") or False)
    provider_session.put(f"{API}/providers/me", json=payload, timeout=15)


# ─── (g) eCard reels endpoint never 404s ───────────────────────
def test_ecard_reels_endpoint_for_demo_slug():
    r = requests.get(f"{API}/providers/by-slug/{DEMO_SLUG}/reels", timeout=10)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ─── (h) Backend health & regression smoke ─────────────────────
def test_search_endpoint_smoke():
    r = requests.get(f"{API}/providers", params={"q": "cleaning"}, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, (list, dict))


def test_provider_ecard_by_slug_renders():
    r = requests.get(f"{API}/providers/by-slug/{DEMO_SLUG}", timeout=10)
    assert r.status_code == 200
    p = r.json()
    assert p.get("slug") == DEMO_SLUG or p.get("public_slug") == DEMO_SLUG or "name" in p


def test_provider_login_works():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": PROVIDER_EMAIL, "password": PROVIDER_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, r.text
