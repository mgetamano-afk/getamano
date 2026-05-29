"""
Iteration 82 — Founder Discount API contract.

Locks:
1. /founders/status is public, returns 50/0/50 when empty.
2. /founders/claim requires auth, returns 404 if no provider profile.
3. Claim is idempotent — calling twice for the same provider gives the
   same position without burning a second slot.
4. The counter never exceeds the 50 cap (we don't drive it to 51 here —
   that's a load-test concern — but we verify the `slots_remaining`
   math is consistent across calls).
5. /auth/set-role validates role ∈ {client, provider} (422 otherwise).
"""
import os
import sys
import uuid

import requests

sys.path.insert(0, os.path.dirname(__file__))
from tests.test_config import API  # noqa: E402


def test_founders_status_is_public():
    r = requests.get(f"{API}/founders/status", timeout=10)
    assert r.status_code == 200
    data = r.json()
    for k in ("slots_total", "slots_used", "slots_remaining"):
        assert k in data
    assert data["slots_total"] == 50
    assert isinstance(data["slots_used"], int)
    assert data["slots_used"] + data["slots_remaining"] == 50


def test_founders_claim_requires_auth():
    r = requests.post(f"{API}/founders/claim", timeout=10)
    assert r.status_code in (401, 403)


def test_founders_claim_idempotent(provider_session):
    """Calling claim twice for the same provider must return the same
    `founder_position` (no slot burned on the second call)."""
    r1 = provider_session.post(f"{API}/founders/claim", timeout=10)
    assert r1.status_code == 200, r1.text
    body1 = r1.json()
    assert body1["is_founder"] is True
    pos = body1["founder_position"]
    assert isinstance(pos, int) and 1 <= pos <= 50

    r2 = provider_session.post(f"{API}/founders/claim", timeout=10)
    assert r2.status_code == 200
    body2 = r2.json()
    assert body2["founder_position"] == pos, "second claim burned a slot"


def test_set_role_accepts_only_client_or_provider(client_session):
    """`/auth/set-role` must be the strict gate."""
    r = client_session.post(f"{API}/auth/set-role", json={"role": "client"}, timeout=10)
    assert r.status_code == 200
    assert r.json()["role"] == "client"

    r = client_session.post(f"{API}/auth/set-role", json={"role": "provider"}, timeout=10)
    assert r.status_code == 200

    for bad in ("admin", "superuser", "", "owner"):
        r = client_session.post(f"{API}/auth/set-role", json={"role": bad}, timeout=10)
        assert r.status_code == 422, f"bad role {bad!r} got {r.status_code}"


def test_founders_claim_404_when_no_provider_profile(client_session):
    """A client user (no provider profile) trying to claim → 404."""
    # Reset client back to "client" first (the previous test may have flipped them)
    client_session.post(f"{API}/auth/set-role", json={"role": "client"}, timeout=10)
    r = client_session.post(f"{API}/founders/claim", timeout=10)
    # A client without a provider profile should hit the 404 guard.
    assert r.status_code == 404, r.text
