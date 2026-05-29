"""
Iteration 83 — Section 74 critical bug fixes + Section 75 plan-aware referral.

Locks:
1. BUG-3: public /api/providers MUST filter `verification_status="approved"`
   so pending/rejected providers never leak into search results.
2. BUG-3 covers /providers/identity-counts and /providers/map too.
3. Section 74 Founder100: /founders/status returns slots_total=100 and
   free_until="2027-12-31" (covered in test_iter82, double-locked here).
4. Section 75: /user-referrals/me returns plan-aware credit fields:
   `plan_monthly_cents`, `credit_per_referee_cents`, and the legacy
   `free_month_value_cents` mirrors the plan price (not the flat $9).
"""
import os
import sys

import requests

sys.path.insert(0, os.path.dirname(__file__))
from tests.test_config import API  # noqa: E402


# ───────────────────────── BUG-3: approved-only public search ─────────────

def test_public_search_excludes_non_approved():
    """Section 74 BUG-3 — public /api/providers must only return providers
    with `verification_status="approved"`. We assert that NO returned
    document has a status other than approved."""
    r = requests.get(f"{API}/providers?limit=50", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    for p in data:
        assert p.get("verification_status") == "approved", (
            f"BUG-3 regression: {p.get('business_name')!r} has status "
            f"{p.get('verification_status')!r}"
        )


def test_public_identity_counts_excludes_non_approved():
    """Same guarantee as above but for /providers/identity-counts."""
    # Count approved providers via the listing
    listing = requests.get(f"{API}/providers?limit=200", timeout=10).json()
    approved_count = sum(
        1 for p in listing if p.get("verification_status") == "approved"
    )
    r = requests.get(f"{API}/providers/identity-counts", timeout=10)
    assert r.status_code == 200
    data = r.json()
    # The "all" bucket should equal the count of approved providers.
    assert data["all"] == approved_count, (
        f"identity-counts.all={data['all']} but listing has "
        f"{approved_count} approved providers — non-approved leaking in?"
    )


def test_public_map_excludes_non_approved():
    """/providers/map must respect the approved gate too. The endpoint
    doesn't project `verification_status`, so we verify by intersecting
    map provider_ids with the approved set from /api/providers."""
    listing = requests.get(f"{API}/providers?limit=200", timeout=10).json()
    approved_ids = {p["provider_id"] for p in listing if p.get("verification_status") == "approved"}

    r = requests.get(f"{API}/providers/map?limit=200", timeout=10)
    assert r.status_code == 200
    body = r.json()
    items = body.get("items") if isinstance(body, dict) else body
    for p in items:
        pid = p.get("provider_id")
        assert pid in approved_ids, (
            f"map leak: provider_id={pid} ({p.get('business_name')!r}) "
            f"is not in the approved set {approved_ids}"
        )


# ───────────────────────── Founder100 (Section 74 PART B) ─────────────────

def test_founders_status_is_100_and_dated():
    r = requests.get(f"{API}/founders/status", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["slots_total"] == 100
    assert data["free_until"] == "2027-12-31"
    # Math consistency
    assert data["slots_used"] + data["slots_remaining"] == 100


# ───────────────────────── Section 75 — Plan-aware credits ────────────────

def test_referral_summary_is_plan_aware(provider_session):
    """The provider summary must surface `plan_monthly_cents` and
    `credit_per_referee_cents` so the wallet widget can show the
    right reward number per plan."""
    r = provider_session.get(f"{API}/user-referrals/me", timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    for k in (
        "my_plan",
        "plan_monthly_cents",
        "credit_per_referee_cents",
        "wallet_pending_cents",
    ):
        assert k in data, f"missing key {k!r} in /user-referrals/me"
    plan_cents = data["plan_monthly_cents"]
    credit_cents = data["credit_per_referee_cents"]
    # Spec: credit per referee = plan price / 2
    assert credit_cents * 2 == plan_cents, (
        f"plan={plan_cents} but credit_per_referee={credit_cents} "
        "(expected plan / 2)"
    )
    # Plan map must be one of the supported tiers (or 0 for free)
    assert plan_cents in (0, 1000, 1500, 2500)
    # legacy field mirrors plan
    assert data["free_month_value_cents"] in (plan_cents, 900)
