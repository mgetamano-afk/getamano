"""
Iteration 37 — Section 34 Activity Streaks (Duolingo-style retention loop).

Covers:
  * GET /api/providers/me/streak — provider-only (401 unauth, 404 non-provider).
  * GET /api/providers/{provider_id}/streak — public; redaction rules.
  * Streak demo seed: demo provider has 5-day alive streak from startup.
  * _badges_for_provider includes streak badge when current>=3 AND alive.
  * best_days monotonicity + idempotency under multiple GETs.

Demo provider (María) is seeded on backend startup with 5 sessions
covering the past 5 UTC days, so the expected current_days=5, best_days=5,
status='alive', next_milestone=7.
"""
import time
import pytest
import requests
from test_config import (
    API,
    PROVIDER_EMAIL, PROVIDER_PASSWORD,
    ADMIN_EMAIL, ADMIN_PASSWORD,
)

DEMO_PROVIDER_ID = "prov_10b9f21bf971"
MILESTONES = (3, 7, 14, 30, 60, 90, 180, 365)


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return s


# ─── Fixtures (module-scoped to minimise /auth/login hits) ───────────────
@pytest.fixture(scope="module")
def provider_session():
    return _login(PROVIDER_EMAIL, PROVIDER_PASSWORD)


@pytest.fixture(scope="module")
def admin_session():
    # Sleep to avoid login rate-limit when run in same suite block
    time.sleep(2)
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


# ════════════════════════════════════════════════════════════════════════
# GET /api/providers/me/streak — authenticated provider
# ════════════════════════════════════════════════════════════════════════
class TestMyStreak:
    REQUIRED_FIELDS = {
        "current_days", "best_days", "best_updated",
        "last_active_date", "status", "next_milestone", "is_demo_data",
    }

    def test_unauthenticated_returns_401(self):
        r = requests.get(f"{API}/providers/me/streak", timeout=15)
        assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"

    def test_non_provider_returns_404(self, admin_session):
        # Admin has no provider_profile → 404
        r = admin_session.get(f"{API}/providers/me/streak", timeout=15)
        assert r.status_code == 404, f"Expected 404 for non-provider, got {r.status_code}: {r.text}"

    def test_demo_provider_returns_seeded_streak(self, provider_session):
        r = provider_session.get(f"{API}/providers/me/streak", timeout=15)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        # Schema
        missing = self.REQUIRED_FIELDS - set(data.keys())
        assert not missing, f"Missing fields: {missing}"
        # Seeded values
        assert data["current_days"] == 5, f"Expected current_days=5, got {data['current_days']}"
        assert data["best_days"] == 5, f"Expected best_days=5, got {data['best_days']}"
        assert data["status"] == "alive", f"Expected status=alive, got {data['status']}"
        assert data["next_milestone"] == 7, f"Expected next_milestone=7, got {data['next_milestone']}"
        # Types
        assert isinstance(data["current_days"], int)
        assert isinstance(data["best_days"], int)
        assert isinstance(data["is_demo_data"], bool)

    def test_no_mongo_id_leak(self, provider_session):
        r = provider_session.get(f"{API}/providers/me/streak", timeout=15)
        assert "_id" not in r.json()

    def test_idempotency_multiple_calls(self, provider_session):
        """Calling 5 times should yield stable response — no counter inflation."""
        results = []
        for _ in range(5):
            r = provider_session.get(f"{API}/providers/me/streak", timeout=15)
            assert r.status_code == 200
            results.append(r.json())
            time.sleep(0.1)
        # All current_days/best_days should be equal across calls
        firsts = (results[0]["current_days"], results[0]["best_days"])
        for d in results[1:]:
            assert (d["current_days"], d["best_days"]) == firsts, \
                f"Counter inflated between calls: {firsts} vs {(d['current_days'], d['best_days'])}"

    def test_next_milestone_logic(self, provider_session):
        r = provider_session.get(f"{API}/providers/me/streak", timeout=15)
        data = r.json()
        nm = data["next_milestone"]
        cd = data["current_days"]
        if cd >= 365:
            assert nm is None
        else:
            # Must be smallest milestone above current
            expected = next((m for m in MILESTONES if m > cd), None)
            assert nm == expected, f"Expected milestone={expected} for current={cd}, got {nm}"


# ════════════════════════════════════════════════════════════════════════
# GET /api/providers/{provider_id}/streak — public eCard
# ════════════════════════════════════════════════════════════════════════
class TestPublicStreak:
    PUBLIC_FIELDS = {"current_days", "best_days", "show_public_badge"}

    def test_demo_provider_public_streak(self):
        r = requests.get(f"{API}/providers/{DEMO_PROVIDER_ID}/streak", timeout=15)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        missing = self.PUBLIC_FIELDS - set(data.keys())
        assert not missing, f"Missing fields: {missing}"
        # Demo seeded → alive 5 days, badge should show
        assert data["current_days"] == 5, f"Expected current_days=5, got {data['current_days']}"
        assert data["best_days"] == 5, f"Expected best_days=5, got {data['best_days']}"
        assert data["show_public_badge"] is True

    def test_public_endpoint_does_not_leak_private_fields(self):
        r = requests.get(f"{API}/providers/{DEMO_PROVIDER_ID}/streak", timeout=15)
        data = r.json()
        # Private fields should not appear in public payload
        for forbidden in ("status", "last_active_date", "next_milestone", "is_demo_data", "best_updated"):
            assert forbidden not in data, f"Public payload leaked '{forbidden}'"

    def test_unknown_provider_returns_404(self):
        r = requests.get(f"{API}/providers/prov_does_not_exist_xyz/streak", timeout=15)
        assert r.status_code == 404

    def test_no_mongo_id_leak(self):
        r = requests.get(f"{API}/providers/{DEMO_PROVIDER_ID}/streak", timeout=15)
        assert "_id" not in r.json()

    def test_public_idempotency(self):
        results = []
        for _ in range(5):
            r = requests.get(f"{API}/providers/{DEMO_PROVIDER_ID}/streak", timeout=15)
            assert r.status_code == 200
            results.append(r.json())
        firsts = results[0]
        for d in results[1:]:
            assert d == firsts, f"Public streak response not stable: {d} vs {firsts}"


# ════════════════════════════════════════════════════════════════════════
# Engagement Badges — /api/providers/{id}/badges streak branch
# ════════════════════════════════════════════════════════════════════════
class TestStreakBadge:
    def test_demo_provider_has_streak_badge(self):
        r = requests.get(f"{API}/providers/{DEMO_PROVIDER_ID}/badges", timeout=15)
        assert r.status_code == 200
        badges = r.json()
        assert isinstance(badges, list)
        streak = next((b for b in badges if b.get("key") == "streak"), None)
        assert streak is not None, f"streak badge missing; got keys={[b.get('key') for b in badges]}"
        # Shape
        assert "label" in streak
        assert "icon" in streak
        assert streak["icon"] == "🔥"
        # Label should contain a digit (count of days)
        assert any(ch.isdigit() for ch in streak["label"])
        # For demo seeded value (5), label should be '5 días seguidos'
        assert "5" in streak["label"]
        assert "días" in streak["label"] or "dia" in streak["label"].lower()


# ════════════════════════════════════════════════════════════════════════
# best_days monotonicity
# ════════════════════════════════════════════════════════════════════════
class TestBestDaysMonotonicity:
    def test_best_days_never_decreases_across_calls(self, provider_session):
        """Multiple GETs should preserve or increase best_days, never drop."""
        r1 = provider_session.get(f"{API}/providers/me/streak", timeout=15)
        b1 = r1.json()["best_days"]
        # Second call
        r2 = provider_session.get(f"{API}/providers/me/streak", timeout=15)
        b2 = r2.json()["best_days"]
        assert b2 >= b1, f"best_days dropped {b1} -> {b2}"

    def test_best_at_least_equals_current_for_alive_streak(self, provider_session):
        r = provider_session.get(f"{API}/providers/me/streak", timeout=15)
        d = r.json()
        assert d["best_days"] >= d["current_days"], (
            f"best_days ({d['best_days']}) < current_days ({d['current_days']})"
        )
