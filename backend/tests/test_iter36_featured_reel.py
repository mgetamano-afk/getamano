"""Iteration 36 — Section 33 Featured Providers Reel + Engagement Badges.

Tests:
  * GET /api/providers/featured-reel — schema, paid-plan filtering, sort.
  * GET /api/providers/{id}/badges — engagement badges include referral pills.
"""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://verified-providers-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

PAID_PLANS = {"basic", "pro", "premium"}
PLAN_TIER = {"premium": 1, "pro": 2, "basic": 3}

REQUIRED_REEL_FIELDS = {
    "provider_id", "slug", "business_name", "photo_url", "main_category",
    "category_slug", "city", "state", "rating", "reviews_count", "likes_count",
    "is_online", "verified", "plan", "referrals_credited",
}


# ───────── /api/providers/featured-reel ─────────
class TestFeaturedReel:
    def test_returns_200_and_list(self):
        r = requests.get(f"{API}/providers/featured-reel", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)

    def test_at_least_one_paid_provider_in_dev_env(self):
        r = requests.get(f"{API}/providers/featured-reel", timeout=15)
        assert r.status_code == 200
        data = r.json()
        # Demo provider María should be there (plan=pro)
        assert len(data) >= 1, "Expected at least demo provider in reel"

    def test_capped_at_20(self):
        r = requests.get(f"{API}/providers/featured-reel", timeout=15)
        data = r.json()
        assert len(data) <= 20

    def test_schema_fields_present(self):
        r = requests.get(f"{API}/providers/featured-reel", timeout=15)
        data = r.json()
        for item in data:
            missing = REQUIRED_REEL_FIELDS - set(item.keys())
            assert not missing, f"Missing fields in reel item: {missing}"

    def test_only_paid_plans_returned(self):
        r = requests.get(f"{API}/providers/featured-reel", timeout=15)
        data = r.json()
        for item in data:
            assert item["plan"] in PAID_PLANS, f"Non-paid plan leaked: {item['plan']}"

    def test_sort_by_plan_tier_then_rating(self):
        r = requests.get(f"{API}/providers/featured-reel", timeout=15)
        data = r.json()
        if len(data) < 2:
            return  # Nothing to test
        prev_key = None
        for item in data:
            tier = PLAN_TIER.get(item["plan"], 99)
            key = (tier, -(item.get("rating") or 0), -(item.get("reviews_count") or 0))
            if prev_key is not None:
                assert key >= prev_key, f"Sort order broken: {key} < {prev_key}"
            prev_key = key

    def test_demo_provider_shows_pro_plan_and_referrals(self):
        r = requests.get(f"{API}/providers/featured-reel", timeout=15)
        data = r.json()
        maria = next((p for p in data if p.get("provider_id") == "prov_10b9f21bf971"), None)
        assert maria is not None, "Demo provider not present in reel"
        assert maria["plan"] in PAID_PLANS
        # Demo provider has at least 1 credited referral from iter35 test seeding
        assert maria["referrals_credited"] >= 1
        assert maria["verified"] is True
        assert isinstance(maria["likes_count"], int)
        assert isinstance(maria["is_online"], bool)
        # Slug should match canonical eCard URL
        assert maria["slug"] == "maria-cleaning-services-sallisaw-ok"

    def test_no_mongo_id_leaks(self):
        r = requests.get(f"{API}/providers/featured-reel", timeout=15)
        data = r.json()
        for item in data:
            assert "_id" not in item, "MongoDB ObjectId leaked in response"


# ───────── /api/providers/{id}/badges ─────────
class TestEngagementBadges:
    def test_returns_200_list(self):
        r = requests.get(f"{API}/providers/prov_10b9f21bf971/badges", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_demo_provider_has_referrer_badge(self):
        r = requests.get(f"{API}/providers/prov_10b9f21bf971/badges", timeout=15)
        badges = r.json()
        keys = {b["key"] for b in badges}
        # Should have at least one engagement badge (referrer because 1 credited)
        assert "referrer" in keys or "top_referrer" in keys, f"Expected referral badge, got {keys}"

    def test_badge_shape(self):
        r = requests.get(f"{API}/providers/prov_10b9f21bf971/badges", timeout=15)
        badges = r.json()
        for b in badges:
            assert "key" in b
            assert "label" in b
            assert "icon" in b
            assert isinstance(b["label"], str)

    def test_unknown_provider_404(self):
        r = requests.get(f"{API}/providers/prov_does_not_exist_xyz/badges", timeout=15)
        assert r.status_code == 404

    def test_referrer_badge_has_count(self):
        r = requests.get(f"{API}/providers/prov_10b9f21bf971/badges", timeout=15)
        badges = r.json()
        ref = next((b for b in badges if b["key"] in ("referrer", "top_referrer")), None)
        assert ref is not None
        # Label should contain at least one digit (count)
        assert any(ch.isdigit() for ch in ref["label"])
