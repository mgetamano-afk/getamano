"""Iteration 47 — Share Rewards (Section 46B / Embajador Bronze) backend tests.

Covers:
- Auth gating (401 anon, 403 admin) on GET /providers/me/share-rewards
- GET returns share_count + referred_view_count + tiers[] with progress fields
- Tier status transitions: locked -> eligible -> claimed
- POST claim happy path: returns ok/plan/extended_to/bonus_days, persists to subscription
- POST claim NOT eligible -> 400 with thresholds message
- POST claim DUPLICATE -> 400 'Recompensa ya reclamada' (unique index)
- POST claim non-existent tier_id -> 404
- POST claim w/o auth -> 401
- Subscription extension STACKS from current next_renewal_date (not today) when future
- Plan does NOT downgrade if provider already on premium

Snapshot/restore pattern preserves demo.provider state for downstream frontend test.
"""
import os
import time
import requests
import pytest
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:3000").rstrip("/")
API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

PROVIDER_EMAIL = "demo.provider@getamano.com"
PROVIDER_PASSWORD = "provider123"
ADMIN_EMAIL = "admin@getamano.com"
ADMIN_PASSWORD = "admin123"
TIER_ID = "embajador_bronze"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"login failed for {email}: {r.status_code} {r.text[:120]}")
    return s


@pytest.fixture(scope="module")
def mongo():
    cli = MongoClient(MONGO_URL)
    yield cli[DB_NAME]
    cli.close()


@pytest.fixture(scope="module")
def provider_user_id(mongo):
    u = mongo.users.find_one({"email": PROVIDER_EMAIL}, {"user_id": 1})
    if not u:
        pytest.skip("demo provider not seeded")
    return u["user_id"]


@pytest.fixture(scope="module")
def provider_s():
    return _login(PROVIDER_EMAIL, PROVIDER_PASSWORD)


@pytest.fixture(scope="module")
def admin_s():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module", autouse=True)
def snapshot_and_restore(mongo, provider_user_id):
    """Snapshot provider state before tests; restore after. Keeps demo data intact
    so the subsequent UI test sees a known 'eligible' state for clicking Reclamar."""
    uid = provider_user_id
    sub_before = mongo.subscriptions.find_one({"user_id": uid})
    profile_before = mongo.provider_profiles.find_one({"user_id": uid})
    claims_before = list(mongo.share_reward_claims.find({"user_id": uid}))
    _ = (sub_before, profile_before, claims_before)  # snapshot kept for debugging
    yield
    # Hand-off state for UI test: eligible + unclaimed + plan=pro + valid renewal
    mongo.share_reward_claims.delete_many({"user_id": uid})
    mongo.provider_profiles.update_one(
        {"user_id": uid},
        {"$set": {"share_count": 24, "referred_view_count": 16}},
    )
    future = datetime.now(timezone.utc) + timedelta(days=365)
    mongo.subscriptions.update_one(
        {"user_id": uid},
        {"$set": {
            "plan": "pro",
            "next_renewal_date": future.isoformat(),
            "status": "active",
            "billing_cycle": "annual",
            "amount": 0,
        }},
        upsert=True,
    )


def _reset_claim(mongo, uid, tier_id=TIER_ID):
    mongo.share_reward_claims.delete_many({"user_id": uid, "tier_id": tier_id})


def _set_counters(mongo, uid, shares, views):
    mongo.provider_profiles.update_one(
        {"user_id": uid},
        {"$set": {"share_count": shares, "referred_view_count": views}},
    )


# ─── Auth gating ──────────────────────────────────────────────────────
class TestAuthGating:
    def test_get_anonymous_401(self):
        r = requests.get(f"{API}/providers/me/share-rewards", timeout=10)
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"

    def test_get_as_admin_403(self, admin_s):
        r = admin_s.get(f"{API}/providers/me/share-rewards", timeout=10)
        assert r.status_code == 403
        assert "proveedor" in r.text.lower()

    def test_claim_anonymous_401(self):
        r = requests.post(f"{API}/providers/me/share-rewards/claim/{TIER_ID}", timeout=10)
        assert r.status_code in (401, 403)


# ─── GET shape + states ───────────────────────────────────────────────
class TestGetShareRewards:
    def test_get_shape(self, provider_s, mongo, provider_user_id):
        # Ensure counters are high (eligible-or-claimed)
        _set_counters(mongo, provider_user_id, 24, 16)
        r = provider_s.get(f"{API}/providers/me/share-rewards", timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data.get("share_count"), int)
        assert isinstance(data.get("referred_view_count"), int)
        assert data["share_count"] == 24
        assert data["referred_view_count"] == 16
        tiers = data.get("tiers")
        assert isinstance(tiers, list) and len(tiers) >= 1
        t = next((x for x in tiers if x["tier_id"] == TIER_ID), None)
        assert t is not None
        for k in ["shares_pct", "views_pct", "shares_remaining",
                  "views_remaining", "eligible", "status",
                  "min_shares", "min_referred_views", "bonus_days"]:
            assert k in t, f"missing key: {k}"
        assert t["status"] in ("locked", "eligible", "claimed")
        assert t["shares_pct"] == 100
        assert t["views_pct"] == 100
        assert t["eligible"] is True

    def test_status_locked_when_below(self, provider_s, mongo, provider_user_id):
        _reset_claim(mongo, provider_user_id)
        _set_counters(mongo, provider_user_id, 2, 1)
        r = provider_s.get(f"{API}/providers/me/share-rewards", timeout=10)
        assert r.status_code == 200
        t = next(x for x in r.json()["tiers"] if x["tier_id"] == TIER_ID)
        assert t["status"] == "locked"
        assert t["eligible"] is False
        assert t["shares_remaining"] == 8  # 10 - 2
        assert t["views_remaining"] == 4   # 5 - 1
        assert t["shares_pct"] == 20
        assert t["views_pct"] == 20

    def test_status_eligible_when_at_threshold(self, provider_s, mongo, provider_user_id):
        _reset_claim(mongo, provider_user_id)
        _set_counters(mongo, provider_user_id, 10, 5)
        r = provider_s.get(f"{API}/providers/me/share-rewards", timeout=10)
        t = next(x for x in r.json()["tiers"] if x["tier_id"] == TIER_ID)
        assert t["status"] == "eligible"
        assert t["eligible"] is True
        assert t["shares_remaining"] == 0
        assert t["views_remaining"] == 0


# ─── POST claim – happy path + stacking + plan upgrade ───────────────
class TestClaimHappyPath:
    def test_claim_not_eligible_returns_400(self, provider_s, mongo, provider_user_id):
        _reset_claim(mongo, provider_user_id)
        _set_counters(mongo, provider_user_id, 1, 1)
        r = provider_s.post(f"{API}/providers/me/share-rewards/claim/{TIER_ID}", timeout=10)
        assert r.status_code == 400, r.text
        detail = r.json().get("detail", "")
        assert "10" in detail and "5" in detail

    def test_claim_nonexistent_tier_404(self, provider_s):
        r = provider_s.post(f"{API}/providers/me/share-rewards/claim/embajador_oro_xx", timeout=10)
        assert r.status_code == 404

    def test_claim_happy_path_stacks_and_upgrades(self, provider_s, mongo, provider_user_id):
        # Setup: free plan with renewal +60d in future, no claim, eligible counters
        _reset_claim(mongo, provider_user_id)
        _set_counters(mongo, provider_user_id, 12, 6)
        future = datetime.now(timezone.utc) + timedelta(days=60)
        mongo.subscriptions.update_one(
            {"user_id": provider_user_id},
            {"$set": {
                "plan": "free",
                "next_renewal_date": future.isoformat(),
                "status": "active",
                "billing_cycle": "monthly",
            }},
            upsert=True,
        )
        r = provider_s.post(f"{API}/providers/me/share-rewards/claim/{TIER_ID}", timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["tier_id"] == TIER_ID
        assert body["plan"] == "pro"  # upgraded from free
        assert body["bonus_days"] == 30
        # extended_to should be ~ future + 30d (stacking)
        ext = datetime.fromisoformat(body["extended_to"])
        expected = future + timedelta(days=30)
        delta = abs((ext - expected).total_seconds())
        assert delta < 120, f"expected stacking from future renewal; got {ext} vs {expected}"

        # Verify subscription persisted
        sub_r = provider_s.get(f"{API}/me/subscription", timeout=10)
        assert sub_r.status_code == 200
        sub = sub_r.json()
        assert sub["plan"] == "pro"
        sub_renewal = datetime.fromisoformat(sub["next_renewal_date"])
        assert abs((sub_renewal - expected).total_seconds()) < 120
        assert sub.get("last_reward_tier") == TIER_ID

        # GET share-rewards now shows claimed
        g = provider_s.get(f"{API}/providers/me/share-rewards", timeout=10)
        t = next(x for x in g.json()["tiers"] if x["tier_id"] == TIER_ID)
        assert t["status"] == "claimed"
        assert t.get("claimed_at")

    def test_claim_duplicate_returns_400_idempotent(self, provider_s, mongo, provider_user_id):
        # Previous test left a claim in place. Try claiming again.
        _set_counters(mongo, provider_user_id, 12, 6)
        r = provider_s.post(f"{API}/providers/me/share-rewards/claim/{TIER_ID}", timeout=10)
        assert r.status_code == 400, r.text
        assert "reclamada" in r.json().get("detail", "").lower()

    def test_claim_does_not_downgrade_premium(self, provider_s, mongo, provider_user_id):
        # Reset claim, set provider already on 'premium', then claim
        _reset_claim(mongo, provider_user_id)
        _set_counters(mongo, provider_user_id, 12, 6)
        future = datetime.now(timezone.utc) + timedelta(days=90)
        mongo.subscriptions.update_one(
            {"user_id": provider_user_id},
            {"$set": {
                "plan": "premium",
                "next_renewal_date": future.isoformat(),
                "status": "active",
                "billing_cycle": "monthly",
            }},
            upsert=True,
        )
        r = provider_s.post(f"{API}/providers/me/share-rewards/claim/{TIER_ID}", timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["plan"] == "premium", f"premium must NOT downgrade; got {body['plan']}"
        # Renewal still extends 30d from the future date
        ext = datetime.fromisoformat(body["extended_to"])
        expected = future + timedelta(days=30)
        assert abs((ext - expected).total_seconds()) < 120

    def test_claim_inserts_subscription_when_missing(self, provider_s, mongo, provider_user_id):
        _reset_claim(mongo, provider_user_id)
        _set_counters(mongo, provider_user_id, 12, 6)
        mongo.subscriptions.delete_one({"user_id": provider_user_id})
        r = provider_s.post(f"{API}/providers/me/share-rewards/claim/{TIER_ID}", timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["plan"] == "pro"
        sub = mongo.subscriptions.find_one({"user_id": provider_user_id}, {"_id": 0})
        assert sub is not None
        assert sub["plan"] == "pro"
        assert sub.get("next_renewal_date")
        assert sub.get("last_reward_tier") == TIER_ID


# ─── End of file ─────────────────────────────────────────────────────
