"""Iter39 — Section 35 Monthly Leaderboard tests.
Covers public /api/leaderboard/monthly, provider /api/leaderboard/me,
score formula correctness, caching, exclusions, and access control.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://verified-providers-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("admin@getamano.com", "admin123")
PROVIDER = ("demo.provider@getamano.com", "provider123")
CLIENT = ("demo.client@getamano.com", "client123")


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"login failed for {email}: {r.status_code} {r.text[:200]}")
    return s


@pytest.fixture(scope="module")
def provider_session():
    return _login(*PROVIDER)


@pytest.fixture(scope="module")
def client_session():
    return _login(*CLIENT)


# ─── Public endpoint shape ───────────────────────────────────────────────
class TestLeaderboardMonthlyPublic:
    def test_returns_200_no_auth(self):
        r = requests.get(f"{API}/leaderboard/monthly", timeout=15)
        assert r.status_code == 200, r.text

    def test_top_level_shape(self):
        r = requests.get(f"{API}/leaderboard/monthly", timeout=15)
        data = r.json()
        for k in ("month", "top", "total_ranked", "formula", "caps"):
            assert k in data, f"missing {k}"
        assert isinstance(data["top"], list)
        assert isinstance(data["total_ranked"], int)
        # Month is YYYY-MM
        assert len(data["month"]) == 7 and data["month"][4] == "-"

    def test_formula_weights(self):
        r = requests.get(f"{API}/leaderboard/monthly", timeout=15)
        f = r.json()["formula"]
        assert f["referrals_credited"] == 25
        assert f["reviews_4plus"] == 5
        assert f["gig_applications"] == 1
        assert f["streak_days"] == 2
        assert f["fast_responses"] == 3
        assert f["active_pro_bonus"] == 5
        assert f["completion_bonus"] == 10

    def test_caps(self):
        r = requests.get(f"{API}/leaderboard/monthly", timeout=15)
        caps = r.json()["caps"]
        assert caps["gig_applications"] == 30
        assert caps["streak_days"] == 60
        assert caps["fast_responses"] == 30

    def test_row_has_required_fields(self):
        r = requests.get(f"{API}/leaderboard/monthly", timeout=15)
        rows = r.json()["top"]
        if not rows:
            pytest.skip("no ranked rows")
        row = rows[0]
        for k in ("provider_id", "slug", "business_name", "photo_url", "city", "state",
                  "category_id", "rating", "reviews_count", "plan", "score", "breakdown", "rank"):
            assert k in row, f"missing {k} in row"
        for bk in ("referrals_credited", "reviews_4plus", "gig_applications", "streak_days",
                   "fast_responses", "active_pro_bonus", "completion_bonus"):
            assert bk in row["breakdown"], f"missing breakdown.{bk}"

    def test_no_test_prefix_in_results(self):
        r = requests.get(f"{API}/leaderboard/monthly", timeout=15)
        for row in r.json()["top"]:
            assert not (row.get("business_name") or "").startswith("TEST_"), row

    def test_no_zero_scores(self):
        r = requests.get(f"{API}/leaderboard/monthly", timeout=15)
        for row in r.json()["top"]:
            assert row["score"] > 0, row

    def test_sort_order_score_desc(self):
        r = requests.get(f"{API}/leaderboard/monthly", timeout=15)
        rows = r.json()["top"]
        scores = [r_["score"] for r_ in rows]
        assert scores == sorted(scores, reverse=True), scores

    def test_ranks_are_sequential(self):
        r = requests.get(f"{API}/leaderboard/monthly", timeout=15)
        rows = r.json()["top"]
        for i, row in enumerate(rows, start=1):
            assert row["rank"] == i, f"row {i} has rank {row['rank']}"


# ─── Caching ─────────────────────────────────────────────────────────────
class TestLeaderboardCaching:
    def test_two_consecutive_calls_fast(self):
        # Prime
        requests.get(f"{API}/leaderboard/monthly", timeout=15)
        t0 = time.time()
        r1 = requests.get(f"{API}/leaderboard/monthly", timeout=15)
        t1 = time.time()
        r2 = requests.get(f"{API}/leaderboard/monthly", timeout=15)
        t2 = time.time()
        assert r1.status_code == 200
        assert r2.status_code == 200
        # Round-trip including network can vary; assert under 3s each (cached path)
        assert (t1 - t0) < 3.0, f"first cached call took {t1 - t0:.2f}s"
        assert (t2 - t1) < 3.0, f"second cached call took {t2 - t1:.2f}s"


# ─── Category filter ─────────────────────────────────────────────────────
class TestLeaderboardCategoryFilter:
    def test_known_category_returns_subset(self):
        full = requests.get(f"{API}/leaderboard/monthly", timeout=15).json()
        if not full["top"]:
            pytest.skip("no rows")
        cat_id = full["top"][0]["category_id"]
        if not cat_id:
            pytest.skip("no category on row")
        filt = requests.get(f"{API}/leaderboard/monthly", params={"category_id": cat_id}, timeout=15).json()
        for row in filt["top"]:
            assert row["category_id"] == cat_id

    def test_unknown_category_returns_empty(self):
        r = requests.get(f"{API}/leaderboard/monthly", params={"category_id": "cat_does_not_exist_xyz"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["top"] == []


# ─── María (demo provider) — known seed ──────────────────────────────────
class TestMariaDemoLeaderboard:
    def test_maria_in_top(self):
        r = requests.get(f"{API}/leaderboard/monthly", timeout=15)
        rows = r.json()["top"]
        names = [row["business_name"] for row in rows]
        assert any("María" in n or "Maria" in n for n in names), names

    def test_maria_score_and_breakdown(self):
        r = requests.get(f"{API}/leaderboard/monthly", timeout=15)
        rows = r.json()["top"]
        maria = next((row for row in rows if "María" in row["business_name"] or "Maria" in row["business_name"]), None)
        assert maria is not None
        # As of seed: 2 referrals*25=50 + 5 streak*2=10 + 5 active_pro_bonus = 65
        b = maria["breakdown"]
        assert b["referrals_credited"] >= 2
        assert b["streak_days"] >= 5
        assert b["active_pro_bonus"] == 5
        # Score should match formula exactly
        expected = (b["referrals_credited"] * 25
                    + b["reviews_4plus"] * 5
                    + b["gig_applications"] * 1
                    + b["streak_days"] * 2
                    + b["fast_responses"] * 3
                    + b["active_pro_bonus"]
                    + b["completion_bonus"])
        assert maria["score"] == expected, (maria["score"], expected, b)
        assert maria["rank"] == 1  # only ranked provider


# ─── /leaderboard/me access control ──────────────────────────────────────
class TestLeaderboardMe:
    def test_unauth_401(self):
        r = requests.get(f"{API}/leaderboard/me", timeout=15)
        assert r.status_code in (401, 403), r.status_code

    def test_client_403(self, client_session):
        r = client_session.get(f"{API}/leaderboard/me", timeout=15)
        assert r.status_code == 403, r.text

    def test_provider_maria_ranked(self, provider_session):
        r = provider_session.get(f"{API}/leaderboard/me", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ranked"] is True
        assert "me" in data and data["me"] is not None
        assert data["me"]["rank"] == 1
        assert data["me"]["score"] >= 65
        assert "breakdown" in data["me"]
        # María is #1 so next/podium_target should be None
        assert data["next"] is None
        assert data["podium_target"] is None
        assert isinstance(data["top_10"], list)
        assert data["total_ranked"] >= 1
        # month YYYY-MM
        assert len(data["month"]) == 7

    def test_provider_response_shape(self, provider_session):
        r = provider_session.get(f"{API}/leaderboard/me", timeout=15)
        data = r.json()
        for k in ("ranked", "month", "me", "next", "podium_target", "total_ranked", "top_10"):
            assert k in data, f"missing {k}"


# ─── Demo seed integrity (after the test run) ────────────────────────────
class TestDemoSeedIntact:
    def test_maria_referral_still_credited(self, provider_session):
        r = provider_session.get(f"{API}/providers/me/referrals", timeout=15)
        if r.status_code != 200:
            pytest.skip(f"referrals endpoint returned {r.status_code}")
        data = r.json()
        assert data["credited_months"] >= 1, data

    def test_maria_streak_alive(self, provider_session):
        r = provider_session.get(f"{API}/providers/me/streak", timeout=15)
        if r.status_code != 200:
            pytest.skip(f"streak endpoint returned {r.status_code}")
        data = r.json()
        assert data.get("current_days", 0) >= 5
