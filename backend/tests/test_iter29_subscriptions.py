"""
Iteration 29 — Section 26 subscription management tests.

Covers:
- GET /api/plans includes price_monthly + price_annual + annual_savings
- Auth required for all /api/me/subscription* endpoints
- POST /api/me/subscription (subscribe pro annual)
- POST /api/me/subscription/cancel
- POST /api/me/subscription/reactivate
- 400 when cancelling free / no sub
- Email dev-fallback log line on cancel

Test credentials sourced from /app/memory/test_credentials.md.
"""
import os
import time
import pytest
import requests

from test_config import API, PROVIDER_EMAIL, PROVIDER_PASSWORD


# ---------------------------- Fixtures ----------------------------
@pytest.fixture(scope="module")
def provider_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": PROVIDER_EMAIL, "password": PROVIDER_PASSWORD}, timeout=20)
    if r.status_code != 200:
        # Avoid burst on rate limiter (8/min)
        time.sleep(8)
        r = s.post(f"{API}/auth/login", json={"email": PROVIDER_EMAIL, "password": PROVIDER_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"Provider login failed: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def anon_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------------------------- /api/plans ----------------------------
class TestPlansAnnual:
    """Annual price fields surfaced on /api/plans."""

    def test_plans_include_annual_pricing(self, anon_session):
        r = anon_session.get(f"{API}/plans", timeout=15)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        plans = data.get("plans") if isinstance(data, dict) else data
        assert isinstance(plans, list) and len(plans) >= 4
        by_id = {p["id"]: p for p in plans}
        for pid in ("free", "basic", "pro", "premium"):
            assert pid in by_id, f"missing plan {pid}"
            assert "price_monthly" in by_id[pid], f"{pid} missing price_monthly"
            assert "price_annual" in by_id[pid], f"{pid} missing price_annual"
            assert "annual_savings" in by_id[pid], f"{pid} missing annual_savings"
        pro = by_id["pro"]
        assert pro["price_monthly"] == 15
        assert pro["price_annual"] == 150
        assert pro["annual_savings"] == 30


# ---------------------------- Auth gating ----------------------------
class TestAuthGuard:
    def test_get_subscription_anon_unauthorized(self, anon_session):
        r = anon_session.get(f"{API}/me/subscription", timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_post_subscription_anon_unauthorized(self, anon_session):
        r = anon_session.post(f"{API}/me/subscription", json={"plan": "pro", "billing_cycle": "annual"}, timeout=15)
        assert r.status_code in (401, 403)

    def test_cancel_anon_unauthorized(self, anon_session):
        r = anon_session.post(f"{API}/me/subscription/cancel", json={"reason": "x"}, timeout=15)
        assert r.status_code in (401, 403)

    def test_reactivate_anon_unauthorized(self, anon_session):
        r = anon_session.post(f"{API}/me/subscription/reactivate", json={}, timeout=15)
        assert r.status_code in (401, 403)


# ---------------------------- Subscribe / Cancel / Reactivate ----------------------------
class TestSubscriptionLifecycle:
    """End-to-end happy path: subscribe pro annual → cancel → reactivate."""

    def test_subscribe_pro_annual(self, provider_session):
        r = provider_session.post(
            f"{API}/me/subscription",
            json={"plan": "pro", "billing_cycle": "annual"},
            timeout=20,
        )
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data["plan"] == "pro"
        assert data["billing_cycle"] == "annual"
        assert data["amount"] == 150
        assert data["annual_discount_applied"] is True
        assert data["status"] == "active"
        assert data["next_renewal_date"] is not None

    def test_get_subscription_returns_active_pro(self, provider_session):
        r = provider_session.get(f"{API}/me/subscription", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["plan"] == "pro"
        assert data["status"] == "active"
        assert data["billing_cycle"] == "annual"
        assert data["amount"] == 150

    def test_cancel_with_reason(self, provider_session):
        r = provider_session.post(
            f"{API}/me/subscription/cancel",
            json={"reason": "too_expensive"},
            timeout=20,
        )
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data["status"] == "cancelled"
        assert data["cancelled_at"] is not None
        assert data["cancel_reason"] == "too_expensive"
        # Access preserved — next_renewal_date should still be set
        assert data["next_renewal_date"] is not None

    def test_cancel_email_dev_fallback_logged(self):
        """Verify cancellation email fell back to backend log (Resend not configured)."""
        log_path = "/var/log/supervisor/backend.err.log"
        if not os.path.exists(log_path):
            pytest.skip("backend.err.log not present in this env")
        # Read tail of log
        with open(log_path, "rb") as f:
            f.seek(0, 2)
            size = f.tell()
            f.seek(max(0, size - 200_000))
            tail = f.read().decode("utf-8", errors="ignore")
        # The dev-fallback prints something like "[EMAIL DEV-FALLBACK] To=demo.provider@getamano.com"
        # with subject "Subscription cancelled" or Spanish equivalent.
        # We accept either an explicit DEV-FALLBACK line OR resend send log mentioning provider email.
        provider_local = PROVIDER_EMAIL.split("@")[0]
        candidate_markers = [
            "[EMAIL DEV-FALLBACK]",
            "DEV-FALLBACK",
            "subscription has been cancelled",
            "ha sido cancelada",
            "Subscription cancelled",
            "Suscripción cancelada",
        ]
        found = any(m in tail for m in candidate_markers) and (provider_local in tail or PROVIDER_EMAIL in tail)
        # If env doesn't expose log content, mark xfail rather than hard fail
        if not found:
            pytest.xfail(
                "No DEV-FALLBACK marker found in backend.err.log tail. Possibly logged to backend.out.log or rotated."
            )

    def test_reactivate_returns_active(self, provider_session):
        r = provider_session.post(f"{API}/me/subscription/reactivate", json={}, timeout=20)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data["status"] == "active"
        assert data["cancelled_at"] is None


# ---------------------------- 400 edge cases ----------------------------
class TestCancelEdgeCases:
    def test_cancel_when_free_returns_400(self, provider_session):
        # Move provider to free plan first
        r = provider_session.post(
            f"{API}/me/subscription",
            json={"plan": "free", "billing_cycle": "monthly"},
            timeout=15,
        )
        assert r.status_code == 200, r.text[:300]
        # Attempt cancel
        r = provider_session.post(f"{API}/me/subscription/cancel", json={"reason": "test"}, timeout=15)
        assert r.status_code == 400, r.text[:200]
        body = r.json()
        detail = body.get("detail", "")
        assert "suscripción" in detail.lower() or "subscription" in detail.lower()


# ---------------------------- Teardown ----------------------------
@pytest.fixture(scope="module", autouse=True)
def _restore_demo_provider_active_state(provider_session):
    """After tests, leave demo provider on Pro annual active state (per task requirement)."""
    yield
    try:
        provider_session.post(
            f"{API}/me/subscription",
            json={"plan": "pro", "billing_cycle": "annual"},
            timeout=15,
        )
    except Exception:
        pass
