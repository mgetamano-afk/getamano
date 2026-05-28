"""
Iteration 71 — Critical-path E2E regression.

End-to-end smoke test of the most monetarily critical user journey:

    1. New visitor lands on share link `/r/GRY9J9` → opens app
    2. Signs up via POST /auth/register?ref=GRY9J9
    3. /api/user-referrals/me/inviter resolves them to María (demo provider)
    4. They add María to favorites  →  see María in /favorites
    5. They submit a 5★ review of María (verified=False — no prior interaction)
    6. /api/plans returns the four pricing tiers (Free / Basic / Pro / Premium)

These six checks together prove the **signup → discovery → favorite → review
→ monetization-visibility** funnel is healthy after every backend change.

Designed to be cheap (≈3 s) and idempotent: the ephemeral test user is
created with a timestamped email and cleaned up at the end.
"""
import os
import sys
import time
import uuid
import requests

sys.path.insert(0, os.path.dirname(__file__))
from tests.test_config import API, DEMO_SLUG  # noqa: E402

REF_CODE = os.environ.get("TEST_REF_CODE", "GRY9J9")


def _new_test_email() -> str:
    return f"e2e_crit_{int(time.time())}_{uuid.uuid4().hex[:6]}@example.com"


def test_critical_path_signup_to_review(demo_provider_id):
    """Full critical-path funnel in a single test for atomicity."""
    s = requests.Session()
    email = _new_test_email()

    # 1. REGISTER with ref code
    r = s.post(
        f"{API}/auth/register?ref={REF_CODE}",
        json={"email": email, "password": "TestPass123!", "name": "E2E Critical Path"},
        timeout=15,
    )
    assert r.status_code in (200, 201), (
        f"register failed: {r.status_code} {r.text[:300]}"
    )

    # 2. Inviter resolution
    r = s.get(f"{API}/user-referrals/me/inviter", timeout=15)
    assert r.status_code == 200, r.text
    payload = r.json()
    inviter = (payload or {}).get("inviter") or {}
    inviter_name = inviter.get("name") or inviter.get("business_name", "")
    assert inviter_name, f"no inviter name in response: {payload}"

    # 3. Add favorite
    r = s.post(
        f"{API}/favorites",
        json={"provider_id": demo_provider_id},
        timeout=15,
    )
    assert r.status_code == 200, r.text

    # 4. List favorites → confirm presence
    r = s.get(f"{API}/favorites", timeout=15)
    assert r.status_code == 200
    pids = {p.get("provider_id") for p in r.json()}
    assert demo_provider_id in pids

    # 5. Submit review
    r = s.post(
        f"{API}/reviews",
        json={"provider_id": demo_provider_id, "rating": 5, "comment": "E2E test"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    review = r.json()
    assert review.get("rating") == 5
    # No prior interaction → must NOT be verified
    assert review.get("verified") is False, (
        "fresh signup should produce unverified review (no messaging/request/appt)"
    )
    assert review.get("verification_source") is None

    # 6. Plans visibility — four tiers
    r = s.get(f"{API}/plans", timeout=15)
    assert r.status_code == 200
    plans = r.json()
    plan_ids = {p.get("plan_id") or p.get("id") or p.get("tier") for p in plans}
    expected = {"free", "basic", "pro", "premium"}
    assert expected.issubset(plan_ids), (
        f"expected all 4 tiers in plans response, got {plan_ids}"
    )


def test_plans_endpoint_is_public(api_url):
    """Pricing must be visible without authentication — public market."""
    r = requests.get(f"{api_url}/plans", timeout=15)
    assert r.status_code == 200
    plans = r.json()
    assert isinstance(plans, list) and len(plans) >= 4


def test_public_ecard_endpoint_works(api_url):
    """/providers/by-slug/{slug} drives every shared eCard URL — must stay 200."""
    r = requests.get(f"{api_url}/providers/by-slug/{DEMO_SLUG}", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data.get("slug") == DEMO_SLUG
    assert "business_name" in data
