"""
Iteration 75 — Smart re-fetch / refresh-bus contract guard.

The refresh bus and `useRefreshable` hook are pure frontend, but the
backend endpoints they call must remain healthy and CHEAP — a pull-to-
refresh should be a sub-second round-trip from a 4G phone.

This test file locks the SLA for the endpoints subscribed by:
  · AppHome           → /providers/featured, /jobs, /conversations
  · EarningsWidget    → /credits/me/summary
  · ReferralCard      → /user-referrals/me
  · StoriesCarousel   → /stories/active
  · ComunidadFeed     → /community/posts/feed (auth) or /community/posts

Each endpoint must:
  · Return 200 (or known auth code)
  · Respond in < 1500 ms from our localhost preview backend
  · Return JSON that's already in the shape the React component
    expects (lists, dicts, NOT raw HTML errors)

This catches regressions where a refactor silently breaks one of the
fetches the refresh bus drives.
"""
import os
import sys
import time

import pytest
import requests

sys.path.insert(0, os.path.dirname(__file__))
from tests.test_config import API  # noqa: E402

SLA_MS = 1500


def _time(fn):
    t0 = time.perf_counter()
    res = fn()
    return res, (time.perf_counter() - t0) * 1000.0


@pytest.mark.parametrize("path,allow_auth_codes", [
    ("/providers/featured", set()),
    ("/stories/active?limit=30", set()),
    ("/community/posts?limit=10", set()),
    ("/plans", set()),  # used by ReferralProgressCard upgrade CTA
])
def test_anon_refresh_endpoints_meet_sla(path, allow_auth_codes):
    """Anonymous-accessible refresh targets must be fast and return a list/dict."""
    (r, ms) = _time(lambda: requests.get(f"{API}{path}", timeout=10))
    assert r.status_code in {200} | allow_auth_codes, (
        f"{path} returned {r.status_code}: {r.text[:200]}"
    )
    if r.status_code == 200:
        # Must be JSON-parseable
        body = r.json()
        assert isinstance(body, (list, dict)), (
            f"{path} returned non-JSON-shape body: {type(body)}"
        )
    assert ms < SLA_MS, f"{path} too slow: {ms:.0f}ms > {SLA_MS}ms"


@pytest.mark.parametrize("path", [
    "/conversations",
    "/credits/me/summary",
    "/gigs?limit=3&sort=recent",
    "/community/posts/feed?limit=10",
])
def test_authed_refresh_endpoints_meet_sla(client_session, path):
    """Logged-in refresh targets must be fast and well-shaped."""
    (r, ms) = _time(lambda: client_session.get(f"{API}{path}", timeout=10))
    assert r.status_code == 200, f"{path} returned {r.status_code}: {r.text[:200]}"
    body = r.json()
    assert isinstance(body, (list, dict)), f"{path} returned wrong shape: {type(body)}"
    assert ms < SLA_MS, f"{path} too slow: {ms:.0f}ms > {SLA_MS}ms"


def test_provider_referrals_summary_meets_sla(provider_session):
    """`/user-referrals/me` is provider-only (clients can't earn from it)."""
    (r, ms) = _time(lambda: provider_session.get(f"{API}/user-referrals/me", timeout=10))
    assert r.status_code == 200, r.text[:200]
    body = r.json()
    assert isinstance(body, dict)
    assert ms < SLA_MS, f"too slow: {ms:.0f}ms"
