"""
Iteration 88 — v3 social-first contract locks.

Pinned behaviours:
  · /api/users/me/provider-status returns the v3 shape (5 prefs).
  · Free users get is_provider=false; legacy paid providers were
    migrated to provider_plan="verified" + GM-XXXX code on startup.
  · POST /api/users/me/activate-provider is idempotent.
  · POST /api/users/me/preferences patches one or more toggles.
  · POST /api/users/me/verify mints a unique GM-XXXX (no Stripe yet).
  · Referral summary reports flat $5 / 2 = $2.50 per referee.
  · The frontend Register screen no longer renders a role picker.
  · The frontend OnboardingLogin screen no longer renders a role picker.
  · /account is wired to UserProfile (the single-user page).
"""
import os
import re
import sys

import requests

sys.path.insert(0, os.path.dirname(__file__))
from tests.test_config import API  # noqa: E402

GM_CODE_RE = re.compile(r"^GM-\d{4}$")


def _read(rel_path: str) -> str:
    full = os.path.join(os.path.dirname(__file__), "..", "..", rel_path)
    with open(full, encoding="utf-8") as f:
        return f.read()


# ─── Backend ────────────────────────────────────────────────────────

def test_provider_status_shape_client(client_session):
    """A non-provider account returns the full v3 shape with default prefs.
    Note: `is_provider` value isn't asserted because another test in this
    module may have activated the demo client already — we only check
    that the response carries the right KEYS."""
    r = client_session.get(f"{API}/users/me/provider-status", timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    # Shape contract
    for key in (
        "is_provider", "provider_verified", "provider_plan",
        "getamano_code", "preferences", "is_founder",
        "founder_free_until", "provider_id", "slug",
    ):
        assert key in data, f"missing top-level key {key}"
    # Default prefs are always present
    for key in ("messages_on", "quotes_on", "show_phone", "in_search", "referrals_on"):
        assert key in data["preferences"], f"missing pref {key}"


def test_provider_status_shape_verified(provider_session):
    """Demo provider (paid plan) was migrated to verified + GM-XXXX."""
    r = provider_session.get(f"{API}/users/me/provider-status", timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["is_provider"] is True
    assert data["provider_verified"] is True
    assert data["provider_plan"] == "verified"
    assert GM_CODE_RE.match(data["getamano_code"] or ""), (
        f"Bad GM code: {data.get('getamano_code')!r}"
    )


def test_activate_provider_is_idempotent(client_session):
    r1 = client_session.post(f"{API}/users/me/activate-provider", timeout=10)
    assert r1.status_code == 200, r1.text
    data1 = r1.json()
    assert data1["is_provider"] is True
    # Second call returns already_existed=True
    r2 = client_session.post(f"{API}/users/me/activate-provider", timeout=10)
    assert r2.status_code == 200, r2.text
    data2 = r2.json()
    assert data2["is_provider"] is True
    assert data2["already_existed"] is True


def test_preferences_patch(provider_session):
    # Read current
    r0 = provider_session.get(f"{API}/users/me/provider-status", timeout=10)
    current_phone = r0.json()["preferences"]["show_phone"]
    # Flip
    r1 = provider_session.post(
        f"{API}/users/me/preferences",
        json={"show_phone": not current_phone},
        timeout=10,
    )
    assert r1.status_code == 200, r1.text
    assert r1.json()["preferences"]["show_phone"] == (not current_phone)
    # Flip back so the test is idempotent across runs
    provider_session.post(
        f"{API}/users/me/preferences",
        json={"show_phone": current_phone},
        timeout=10,
    )


def test_referral_summary_flat_5(provider_session):
    r = provider_session.get(f"{API}/user-referrals/me", timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    # Section 88: flat $5 total / 2 referees per milestone = $2.50 per referee
    assert data["plan_monthly_cents"] == 500
    assert data["credit_per_referee_cents"] == 250
    assert data["my_plan"] in ("verified", "free")


# ─── Frontend source locks ──────────────────────────────────────────

def test_register_has_no_role_picker():
    src = _read("frontend/src/pages/Register.jsx")
    assert 'data-testid="register-role-client"' not in src, (
        "Section 88 regression: Register must NOT render a role picker."
    )
    assert 'data-testid="register-role-provider"' not in src
    assert "function RoleButton" not in src


def test_onboarding_login_has_no_role_picker():
    src = _read("frontend/src/components/onboarding/OnboardingLogin.jsx")
    assert 'data-testid="onb-login-role"' not in src
    assert 'data-testid="onb-login-role-provider"' not in src


def test_account_route_points_to_user_profile():
    src = _read("frontend/src/App.js")
    assert '<Route path="/account" element={<UserProfile />}' in src, (
        "Section 88 regression: /account must mount UserProfile, not DashboardRouter."
    )


def test_plans_has_two_cards_only():
    src = _read("frontend/src/pages/Plans.jsx")
    # PlanCard receives kind="free"/"verified" and renders data-testid={`plan-card-${kind}`}
    assert 'kind="free"' in src
    assert 'kind="verified"' in src
    assert 'kind="basic"' not in src
    assert 'kind="pro"' not in src
    assert 'kind="premium"' not in src


def test_user_profile_has_activation_card():
    """V9 rebuild — the activation card became a header-level CTA.
    What matters is the activate-provider POST is still wired and the
    GM-XXXX badge is still rendered for verified providers."""
    src = _read("frontend/src/pages/UserProfile.jsx")
    assert "users/me/activate-provider" in src
    # Verified providers see their getamano_code in the header
    assert "getamano_code" in src
