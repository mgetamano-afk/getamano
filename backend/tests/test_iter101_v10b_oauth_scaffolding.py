"""
Iteration 101 — V10b Apple Sign In + Facebook OAuth scaffolding.

The endpoints work in two modes:
  - Configured: APPLE_CLIENT_ID / FACEBOOK_APP_ID env var present →
    actual token verification.
  - Unconfigured: env var missing → 503 with a friendly Spanish error so
    the frontend can fall back to "Próximamente".

These tests run in the unconfigured mode (no real keys in dev), so we
validate the 503 contract plus the GET /auth/oauth-config envelope.
"""
import os
import sys

import requests

sys.path.insert(0, os.path.dirname(__file__))
from tests.test_config import API  # noqa: E402


def _read(rel: str) -> str:
    full = os.path.join(os.path.dirname(__file__), "..", "..", rel)
    with open(full, encoding="utf-8") as f:
        return f.read()


# ─── GET /auth/oauth-config ─────────────────────────────────────
def test_oauth_config_returns_envelope():
    r = requests.get(f"{API}/auth/oauth-config", timeout=10)
    assert r.status_code == 200
    body = r.json()
    for key in ("apple", "facebook", "apple_client_id", "facebook_app_id", "apple_redirect_uri"):
        assert key in body, body
    assert isinstance(body["apple"], bool)
    assert isinstance(body["facebook"], bool)


# ─── POST /auth/apple/session ────────────────────────────────────
def test_apple_session_503_without_keys_or_validates_token():
    """When APPLE_CLIENT_ID is not configured we expect a 503. If keys are
    present we expect a 401 for an obviously-bogus token. Either way the
    endpoint must be wired."""
    r = requests.post(
        f"{API}/auth/apple/session",
        json={"id_token": "obviously-bogus-token"},
        timeout=10,
    )
    if os.environ.get("APPLE_CLIENT_ID"):
        assert r.status_code == 401, r.text
    else:
        assert r.status_code == 503, r.text
        assert "Apple" in r.json().get("detail", "")


def test_apple_session_rejects_missing_id_token():
    r = requests.post(f"{API}/auth/apple/session", json={}, timeout=10)
    # FastAPI validation rejects missing required field
    assert r.status_code == 422, r.text


# ─── POST /auth/facebook/session ─────────────────────────────────
def test_facebook_session_503_without_keys_or_validates_token():
    r = requests.post(
        f"{API}/auth/facebook/session",
        json={"access_token": "obviously-bogus-token"},
        timeout=15,
    )
    if os.environ.get("FACEBOOK_APP_ID"):
        assert r.status_code == 401, r.text
    else:
        assert r.status_code == 503, r.text
        assert "Facebook" in r.json().get("detail", "")


def test_facebook_session_rejects_missing_access_token():
    r = requests.post(f"{API}/auth/facebook/session", json={}, timeout=10)
    assert r.status_code == 422, r.text


# ─── Frontend wiring ────────────────────────────────────────────
def test_social_auth_buttons_component_exists():
    src = _read("frontend/src/components/SocialAuthButtons.jsx")
    assert "AppleSignInButton" in src
    assert "FacebookSignInButton" in src
    assert "/auth/oauth-config" in src
    assert "/auth/apple/session" in src
    assert "/auth/facebook/session" in src


def test_login_page_uses_social_auth_buttons():
    src = _read("frontend/src/pages/Login.jsx")
    assert "AppleSignInButton" in src
    assert "FacebookSignInButton" in src
    # The legacy disabled buttons must be gone
    assert "Apple (próximamente)" not in src
    assert "Facebook (próximamente)" not in src


def test_register_page_uses_social_auth_buttons():
    src = _read("frontend/src/pages/Register.jsx")
    assert "AppleSignInButton" in src
    assert "FacebookSignInButton" in src
    # Unused comingSoon helper must be gone
    assert "comingSoon" not in src
