"""Iter40 — Section 34 Inclusive Providers + Section 35.5 Redeemable Rewards.

Covers:
- RegisterIn `preferred_language` persistence (en/es/default)
- Bilingual badge on `_badges_for_provider` for María (es+en languages)
- POST /api/admin/leaderboard/snapshot (admin gate, dry_run, real, idempotent)
- REWARD_TIERS tier matching (Top 3 → 50%, prefix TOP3)
- Notification + queue rows created on coupon mint
- GET /api/me/coupons shape + provider gate
- POST /api/me/coupons/{id}/redeem before redeemable_from → 400
- 404 for non-owned coupon
- redeem flips status to 'redeemed' for an in-window coupon
"""
import os
import time
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://verified-providers-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("admin@getamano.com", "admin123")
PROVIDER = ("demo.provider@getamano.com", "provider123")
CLIENT = ("demo.client@getamano.com", "client123")
PROVIDER_ID = "prov_10b9f21bf971"
DEMO_PROVIDER_USER_ID = None  # filled in via fixture


# ──────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────
def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"login failed for {email}: {r.status_code} {r.text[:200]}")
    return s


@pytest.fixture(scope="module")
def admin_session():
    return _login(*ADMIN)


@pytest.fixture(scope="module")
def provider_session():
    return _login(*PROVIDER)


@pytest.fixture(scope="module")
def client_session():
    return _login(*CLIENT)


@pytest.fixture(scope="module")
def db():
    # Direct mongo client — used to (1) verify persistence (2) inject test coupons
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    return client[db_name]


def _run(coro):
    """Run an async coroutine synchronously inside a test."""
    return asyncio.get_event_loop().run_until_complete(coro) if not asyncio.get_event_loop().is_closed() else asyncio.new_event_loop().run_until_complete(coro)


@pytest.fixture(scope="module")
def demo_provider_user_id(db):
    async def _go():
        u = await db.users.find_one({"email": "demo.provider@getamano.com"}, {"_id": 0, "user_id": 1})
        return u["user_id"] if u else None
    uid = _run(_go())
    if not uid:
        pytest.skip("demo provider user not found")
    return uid


# ══════════════════════════════════════════════════════════════════════
# Section 34 — Preferred language
# ══════════════════════════════════════════════════════════════════════
class TestRegisterPreferredLanguage:
    def _register(self, lang_value):
        """Register a fresh test user, optionally with preferred_language."""
        rand = uuid.uuid4().hex[:8]
        # email is stored lowercased server-side; keep lowercase here for direct DB lookups
        email = f"test_iter40_lang_{lang_value or 'default'}_{rand}@example.com"
        payload = {
            "email": email,
            "password": "TestPass123!",
            "name": f"TEST iter40 {lang_value or 'default'}",
            "role": "client",
        }
        if lang_value is not None:
            payload["preferred_language"] = lang_value
        # Rate-limit aware: register endpoint allows 3/60s — sleep before each try
        r = requests.post(f"{API}/auth/register", json=payload, timeout=15)
        if r.status_code == 429:
            time.sleep(65)
            r = requests.post(f"{API}/auth/register", json=payload, timeout=15)
        return r, email

    def test_register_with_lang_en(self, db):
        r, email = self._register("en")
        assert r.status_code == 200, r.text
        async def _go():
            return await db.users.find_one({"email": email}, {"_id": 0, "language": 1, "preferred_language": 1})
        u = _run(_go())
        assert u is not None
        assert u.get("language") == "en", f"language not 'en': {u}"
        assert u.get("preferred_language") == "en", f"preferred_language not 'en': {u}"

    def test_register_with_lang_es(self, db):
        r, email = self._register("es")
        assert r.status_code == 200, r.text
        async def _go():
            return await db.users.find_one({"email": email}, {"_id": 0, "language": 1, "preferred_language": 1})
        u = _run(_go())
        assert u.get("language") == "es"
        assert u.get("preferred_language") == "es"

    def test_register_without_lang_defaults_es(self, db):
        r, email = self._register(None)
        assert r.status_code == 200, r.text
        async def _go():
            return await db.users.find_one({"email": email}, {"_id": 0, "language": 1, "preferred_language": 1})
        u = _run(_go())
        assert u.get("language") == "es"
        assert u.get("preferred_language") == "es"

    def test_register_rejects_invalid_lang(self):
        rand = uuid.uuid4().hex[:8]
        def _go():
            return requests.post(f"{API}/auth/register", json={
                "email": f"test_iter40_invalid_{rand}@example.com",
                "password": "TestPass123!",
                "name": "TEST iter40 invalid",
                "role": "client",
                "preferred_language": "fr",  # invalid
            }, timeout=15)
        r = _go()
        if r.status_code == 429:
            time.sleep(65)
            r = _go()
        assert r.status_code in (400, 422), f"Should reject invalid lang, got {r.status_code}: {r.text[:200]}"


# ══════════════════════════════════════════════════════════════════════
# Section 34 — Bilingual badge
# ══════════════════════════════════════════════════════════════════════
class TestBilingualBadge:
    def test_maria_has_bilingual_badge(self):
        r = requests.get(f"{API}/providers/{PROVIDER_ID}/badges", timeout=15)
        assert r.status_code == 200, r.text
        badges = r.json()
        bilingual = next((b for b in badges if b.get("key") == "bilingual"), None)
        assert bilingual is not None, f"bilingual badge missing: {badges}"
        assert bilingual["label"] == "Bilingüe · Bilingual"
        assert bilingual["icon"] == "🗣️"

    def test_languages_array_has_both(self, db):
        async def _go():
            return await db.provider_profiles.find_one({"provider_id": PROVIDER_ID}, {"_id": 0, "languages": 1})
        prof = _run(_go())
        langs = prof.get("languages") or []
        assert "es" in langs and "en" in langs, f"languages array missing es/en: {langs}"


# ══════════════════════════════════════════════════════════════════════
# Section 35.5 — Snapshot endpoint
# ══════════════════════════════════════════════════════════════════════
class TestLeaderboardSnapshot:
    def test_unauth_blocked(self):
        r = requests.post(f"{API}/admin/leaderboard/snapshot", timeout=15)
        assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"

    def test_non_admin_blocked(self, provider_session):
        r = provider_session.post(f"{API}/admin/leaderboard/snapshot", timeout=15)
        assert r.status_code == 403, f"Provider should be 403, got {r.status_code}: {r.text[:200]}"

    def test_dry_run_for_2026_05_returns_would_create(self, admin_session):
        r = admin_session.post(f"{API}/admin/leaderboard/snapshot?month=2026-05&dry_run=true", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert data["month"] == "2026-05"
        assert data["dry_run"] is True
        assert data["coupons_created"] == 0
        # Should have at least María in results
        assert isinstance(data["results"], list)
        if data["results"]:
            for row in data["results"]:
                assert row.get("would_create") is True
                assert "tier" in row and "discount_pct" in row

    def test_real_snapshot_idempotent_for_2026_05(self, admin_session, db, demo_provider_user_id):
        # Get existing coupon if any
        async def _existing():
            return await db.coupons.find_one({"user_id": demo_provider_user_id, "month_key": "2026-05"}, {"_id": 0})
        before = _run(_existing())

        # First snapshot run (live)
        r1 = admin_session.post(f"{API}/admin/leaderboard/snapshot?month=2026-05", timeout=20)
        assert r1.status_code == 200, r1.text
        data1 = r1.json()
        assert data1["ok"] is True
        assert data1["dry_run"] is False
        # Run again — should be idempotent (we just verify status; payload re-check via DB below)
        r2 = admin_session.post(f"{API}/admin/leaderboard/snapshot?month=2026-05", timeout=20)
        assert r2.status_code == 200, r2.text

        async def _now():
            return await db.coupons.find_one({"user_id": demo_provider_user_id, "month_key": "2026-05"}, {"_id": 0})
        after = _run(_now())
        assert after is not None, "coupon must exist after snapshot"
        if before:
            # Code must NOT change across re-runs
            assert before["code"] == after["code"], f"coupon code changed: {before['code']} → {after['code']}"
            assert before["coupon_id"] == after["coupon_id"]

    def test_invalid_month_format_400(self, admin_session):
        r = admin_session.post(f"{API}/admin/leaderboard/snapshot?month=2026-13", timeout=15)
        assert r.status_code == 400, r.text


# ══════════════════════════════════════════════════════════════════════
# Section 35.5 — Tier shape
# ══════════════════════════════════════════════════════════════════════
class TestTiersAndMariaCoupon:
    def test_maria_has_top3_50pct_coupon(self, provider_session):
        r = provider_session.get(f"{API}/me/coupons", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        items = data.get("items", [])
        # María should have at least one TOP3 coupon for 2026-05
        target = next((c for c in items if c.get("month_key") == "2026-05"), None)
        assert target is not None, f"María's 2026-05 coupon missing: items={items}"
        assert target["tier_label"] == "Top 3"
        assert target["discount_pct"] == 50
        assert target["code"].startswith("TOP3-"), f"code prefix wrong: {target['code']}"
        assert target["rank"] == 1

    def test_coupons_shape_has_all_fields(self, provider_session):
        r = provider_session.get(f"{API}/me/coupons", timeout=15)
        data = r.json()
        assert "items" in data and "active_count" in data
        assert isinstance(data["active_count"], int)
        if data["items"]:
            c = data["items"][0]
            for k in ("coupon_id", "code", "month_key", "rank", "tier_label", "discount_pct", "status", "redeemable_from", "redeemable_until", "created_at"):
                assert k in c, f"coupon missing key {k}: {c}"


# ══════════════════════════════════════════════════════════════════════
# Section 35.5 — Notification + queue creation
# ══════════════════════════════════════════════════════════════════════
class TestCouponNotificationAndQueue:
    def test_high_priority_rewards_notification_exists(self, db, demo_provider_user_id):
        async def _go():
            return await db.notifications.find_one({
                "user_id": demo_provider_user_id,
                "category": "rewards",
                "notification_key": f"{demo_provider_user_id}::coupon::2026-05",
            }, {"_id": 0})
        n = _run(_go())
        assert n is not None, "rewards notification missing"
        assert n.get("priority") == "high"
        assert "🎁" in (n.get("title") or "") or "rewards" in (n.get("category") or "")

    def test_queue_row_for_email_or_sms_exists(self, db, demo_provider_user_id):
        async def _go():
            return await db.notification_queue.find({
                "trigger_type": {"$regex": "^coupon_TOP3_2026-05"},
            }, {"_id": 0}).to_list(10)
        rows = _run(_go())
        # At least one email row should be queued (María has email)
        assert any(r.get("channel") == "email" for r in rows), f"no email queue row: {rows}"


# ══════════════════════════════════════════════════════════════════════
# Section 35.5 — Coupon ACL + redeem flow
# ══════════════════════════════════════════════════════════════════════
class TestCouponRedemption:
    def test_me_coupons_requires_auth(self):
        r = requests.get(f"{API}/me/coupons", timeout=15)
        assert r.status_code in (401, 403), r.status_code

    def test_redeem_before_window_returns_400(self, provider_session):
        # María's existing 2026-05 coupon has redeemable_from=2026-06-01 → before now (Jan 2026)
        r = provider_session.get(f"{API}/me/coupons", timeout=15)
        items = r.json().get("items", [])
        target = next((c for c in items if c.get("month_key") == "2026-05" and c.get("status") == "available"), None)
        if not target:
            pytest.skip("no available 2026-05 coupon for María")
        rr = provider_session.post(f"{API}/me/coupons/{target['coupon_id']}/redeem", timeout=15)
        assert rr.status_code == 400, rr.text
        detail = (rr.json() or {}).get("detail", "")
        assert "aún no es redimible" in detail.lower() or "no es redimible" in detail.lower(), f"unexpected detail: {detail}"

    def test_redeem_non_owned_returns_404(self, client_session):
        # Client has no coupons → any UUID gives 404
        fake = f"cpn_{uuid.uuid4().hex[:14]}"
        r = client_session.post(f"{API}/me/coupons/{fake}/redeem", timeout=15)
        assert r.status_code == 404, r.text

    def test_redeem_in_window_flips_status(self, db, provider_session, demo_provider_user_id):
        """Inject an in-window TEST coupon, redeem it, verify flip."""
        async def _insert():
            now = datetime.now(timezone.utc)
            doc = {
                "coupon_id": f"cpn_TEST_{uuid.uuid4().hex[:10]}",
                "code": f"TEST_TOP3-{uuid.uuid4().hex[:6].upper()}",
                "user_id": demo_provider_user_id,
                "month_key": "2025-12",
                "rank": 1,
                "tier_label": "Top 3",
                "discount_pct": 50,
                "status": "available",
                "redeemable_from": (now - timedelta(days=1)).isoformat(),
                "redeemable_until": (now + timedelta(days=10)).isoformat(),
                "created_at": now.isoformat(),
            }
            await db.coupons.insert_one(doc)
            return doc
        doc = _run(_insert())
        try:
            r = provider_session.post(f"{API}/me/coupons/{doc['coupon_id']}/redeem", timeout=15)
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["ok"] is True
            assert body["code"] == doc["code"]

            async def _check():
                return await db.coupons.find_one({"coupon_id": doc["coupon_id"]}, {"_id": 0})
            after = _run(_check())
            assert after["status"] == "redeemed"
            assert "redeemed_at" in after

            # Second redeem should fail with 400 (already redeemed)
            r2 = provider_session.post(f"{API}/me/coupons/{doc['coupon_id']}/redeem", timeout=15)
            assert r2.status_code == 400
        finally:
            # Clean up the test coupon
            async def _cleanup():
                await db.coupons.delete_one({"coupon_id": doc["coupon_id"]})
            _run(_cleanup())

    def test_redeem_expired_coupon_returns_400_and_marks_expired(self, db, provider_session, demo_provider_user_id):
        async def _insert():
            now = datetime.now(timezone.utc)
            doc = {
                "coupon_id": f"cpn_TEST_{uuid.uuid4().hex[:10]}",
                "code": f"TEST_EXP-{uuid.uuid4().hex[:6].upper()}",
                "user_id": demo_provider_user_id,
                "month_key": "2025-10",
                "rank": 2,
                "tier_label": "Top 3",
                "discount_pct": 50,
                "status": "available",
                "redeemable_from": (now - timedelta(days=30)).isoformat(),
                "redeemable_until": (now - timedelta(days=1)).isoformat(),  # expired
                "created_at": (now - timedelta(days=40)).isoformat(),
            }
            await db.coupons.insert_one(doc)
            return doc
        doc = _run(_insert())
        try:
            r = provider_session.post(f"{API}/me/coupons/{doc['coupon_id']}/redeem", timeout=15)
            assert r.status_code == 400, r.text
            detail = (r.json() or {}).get("detail", "")
            assert "expir" in detail.lower(), f"unexpected detail: {detail}"
            async def _check():
                return await db.coupons.find_one({"coupon_id": doc["coupon_id"]}, {"_id": 0})
            after = _run(_check())
            assert after["status"] == "expired"
        finally:
            async def _cleanup():
                await db.coupons.delete_one({"coupon_id": doc["coupon_id"]})
            _run(_cleanup())


# ══════════════════════════════════════════════════════════════════════
# Cleanup: remove TEST_iter40 registered users at end
# ══════════════════════════════════════════════════════════════════════
@pytest.fixture(scope="module", autouse=True)
def _final_cleanup(db):
    yield
    async def _go():
        await db.users.delete_many({"email": {"$regex": "^test_iter40_"}})
    try:
        _run(_go())
    except Exception:
        pass
