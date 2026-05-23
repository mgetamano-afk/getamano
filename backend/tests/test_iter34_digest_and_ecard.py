"""
Iteration 34 — Section 32 (eCard redesign) + Weekly Gig Digest.

Backend coverage:
  1) GET /api/providers/me/weekly-digest
     - 403 for non-providers (admin & client)
     - 200 for provider with shape: available/total_count/gigs/category_name/city/state/business_name/provider_name
     - When no matching gigs: {available: false, reason: 'no_matching_gigs'}
  2) POST /api/admin/digest/send-weekly
     - 403 for non-admin
     - 200 for admin: {ok:true, sent, skipped, total, results[]}
     - Each result entry has user_id/email/subject and (since RESEND_API_KEY is unset)
       sent=false reason=no_api_key
     - Subject contains '💼', category, city
     - Backend stderr log contains '[EMAIL DEV-FALLBACK]' line
  3) Regression: POST /api/providers/{id}/like still works (used by floating header)
"""
import os
import sys
import time
import subprocess

import pytest
import requests

sys.path.insert(0, os.path.dirname(__file__))
from test_config import (  # noqa: E402
    API,
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    PROVIDER_EMAIL,
    PROVIDER_PASSWORD,
    DEMO_SLUG,
)

CLIENT_EMAIL = os.environ.get("TEST_CLIENT_EMAIL", "demo.client@getamano.com")
CLIENT_PWD = os.environ.get("TEST_CLIENT_PASSWORD", "client123")
BACKEND_LOG = "/var/log/supervisor/backend.err.log"


def _login(email: str, password: str) -> requests.Session:
    s = requests.Session()
    for _ in range(3):
        r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=10)
        if r.status_code == 200:
            return s
        if r.status_code == 429:
            time.sleep(12)
            continue
        r.raise_for_status()
    raise AssertionError(f"login failed for {email}")


@pytest.fixture(scope="module")
def provider_session():
    return _login(PROVIDER_EMAIL, PROVIDER_PASSWORD)


@pytest.fixture(scope="module")
def admin_session():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def client_session():
    return _login(CLIENT_EMAIL, CLIENT_PWD)


# ------------------------- /providers/me/weekly-digest -------------------------

class TestWeeklyDigestEndpoint:
    """Provider-only preview endpoint."""

    def test_forbids_admin(self, admin_session):
        r = admin_session.get(f"{API}/providers/me/weekly-digest", timeout=10)
        assert r.status_code == 403, r.text

    def test_forbids_client(self, client_session):
        r = client_session.get(f"{API}/providers/me/weekly-digest", timeout=10)
        assert r.status_code == 403, r.text

    def test_requires_auth(self):
        r = requests.get(f"{API}/providers/me/weekly-digest", timeout=10)
        assert r.status_code in (401, 403)

    def test_provider_gets_digest_shape(self, provider_session):
        r = provider_session.get(f"{API}/providers/me/weekly-digest", timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "available" in body
        if body["available"]:
            # Required keys when there are matching gigs
            for k in ("gigs", "total_count", "category_name", "city", "business_name"):
                assert k in body, f"missing key {k} in digest response"
            assert isinstance(body["gigs"], list)
            assert isinstance(body["total_count"], int)
            assert body["total_count"] >= len(body["gigs"])
            # Private fields must be stripped from the public preview
            assert "email" not in body
            assert "user_id" not in body
            # Each gig should expose the fields the dashboard widget uses
            for g in body["gigs"]:
                assert "gig_id" in g
                assert "title" in g
                assert "budget_label" in g
                assert "is_urgent" in g
        else:
            assert body.get("reason") == "no_matching_gigs"


# ------------------------- /admin/digest/send-weekly -------------------------

class TestAdminSendWeeklyDigest:
    """Admin-triggered fan-out — RESEND_API_KEY unset → dev-fallback log only."""

    def test_forbids_provider(self, provider_session):
        r = provider_session.post(f"{API}/admin/digest/send-weekly", timeout=20)
        assert r.status_code == 403, r.text

    def test_forbids_client(self, client_session):
        r = client_session.post(f"{API}/admin/digest/send-weekly", timeout=20)
        assert r.status_code == 403, r.text

    def test_admin_send_returns_results(self, admin_session):
        r = admin_session.post(f"{API}/admin/digest/send-weekly", timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert "sent" in body and "skipped" in body and "total" in body
        assert isinstance(body.get("results"), list)
        # We know the demo provider matches → at least one result
        assert body["total"] >= 1, f"expected ≥1 eligible provider, got {body}"
        demo = [r for r in body["results"] if r.get("email") == PROVIDER_EMAIL]
        assert len(demo) >= 1, f"demo provider not in results: {body['results']}"
        entry = demo[0]
        # Without RESEND_API_KEY → sent=false reason=no_api_key
        assert entry.get("sent") is False
        assert entry.get("reason") == "no_api_key"
        # Subject must be the localized Spanish digest line
        subject = entry.get("subject", "")
        assert "💼" in subject, f"subject missing briefcase emoji: {subject!r}"
        assert "Limpieza" in subject, f"subject missing category: {subject!r}"
        assert "Sallisaw" in subject, f"subject missing city: {subject!r}"
        # user_id should be present
        assert entry.get("user_id"), "user_id missing in result entry"

    def test_dev_fallback_log_emitted(self, admin_session):
        """After triggering send, the backend stderr log must show [EMAIL DEV-FALLBACK]."""
        # Trigger fresh send so we know the log line is recent
        admin_session.post(f"{API}/admin/digest/send-weekly", timeout=30)
        time.sleep(1.0)
        if not os.path.exists(BACKEND_LOG):
            pytest.skip(f"{BACKEND_LOG} not present in this environment")
        # Tail the log and look for the marker (the implementation logs to stderr)
        try:
            out = subprocess.check_output(
                ["tail", "-n", "400", BACKEND_LOG], timeout=5
            ).decode("utf-8", errors="ignore")
        except subprocess.SubprocessError as e:
            pytest.skip(f"could not tail backend log: {e}")
        assert "[EMAIL DEV-FALLBACK]" in out, "dev-fallback log line not found in backend stderr"
        # And it should be tied to our digest subject
        assert "💼" in out and "Limpieza" in out, "dev-fallback log present but missing digest subject markers"


# ------------------------- Provider like endpoint (Section 32 header) -------------------------

class TestProviderLikeEndpoint:
    """The floating header POSTs to /providers/{id}/like — verify it still answers."""

    def test_like_toggle_roundtrip(self, client_session):
        # Discover the demo provider's id from the public-by-slug route
        r = requests.get(f"{API}/providers/by-slug/{DEMO_SLUG}", timeout=10)
        assert r.status_code == 200, f"could not load demo provider: {r.status_code} {r.text[:200]}"
        prov = r.json()
        provider_id = prov.get("provider_id") or prov.get("id")
        assert provider_id, f"no provider_id in response: {list(prov.keys())}"
        # Like (toggle endpoint — requires auth)
        r1 = client_session.post(f"{API}/providers/{provider_id}/like", json={"liked": True}, timeout=10)
        assert r1.status_code in (200, 201), r1.text
        assert "liked" in r1.json()
        # Toggle back
        r2 = client_session.post(f"{API}/providers/{provider_id}/like", json={"liked": False}, timeout=10)
        assert r2.status_code in (200, 201), r2.text
        assert "liked" in r2.json()
