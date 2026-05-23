"""
Iteration 38 — Section 34.5 Streak reminder fan-out (daily 7pm habit loop).

Covers:
  * GET /api/providers/me/streak/preferences — provider-only, default opt_out=False
  * POST /api/providers/me/streak/preferences — toggle opt_out, idempotent, 403 non-provider
  * POST /api/admin/streaks/send-reminders — admin-only, scans, queues at_risk
  * Idempotency: re-running fan-out only queues ONCE per (user, UTC date)
  * Skip logic: alive+today / opt_out / current_days<3 all skipped
  * Notification payload shape (in-app + SMS queue + email queue) + category='streaks'
  * /api/notifications includes category='streaks' alongside 'gigs' and 'referrals'

Test isolation strategy: instead of mutating demo provider seed (María at 5/alive),
we create a synthetic TEST_* provider with a manually inserted streaks doc in
at_risk state (current=4, last_active_date=yesterday). Full cleanup at end.
"""
import os
import time
import uuid
import bcrypt
import pytest
import requests
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient
from test_config import (
    API,
    ADMIN_EMAIL, ADMIN_PASSWORD,
    PROVIDER_EMAIL, PROVIDER_PASSWORD,
)

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

mongo = MongoClient(MONGO_URL)
sync_db = mongo[DB_NAME]


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def provider_session():
    return _login(PROVIDER_EMAIL, PROVIDER_PASSWORD)


@pytest.fixture(scope="module")
def admin_session():
    time.sleep(2)
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def client_session():
    time.sleep(2)
    s = requests.Session()
    r = s.post(f"{API}/auth/login",
               json={"email": "demo.client@getamano.com", "password": "client123"},
               timeout=20)
    assert r.status_code == 200, r.text
    return s


# ─── Synthetic test provider with at_risk streak ────────────────────────
@pytest.fixture(scope="module")
def test_at_risk_provider():
    """Seed a synthetic provider with current_days=4 + last_active=yesterday
    so the fan-out picks them up as `at_risk`. Cleaned up at module teardown."""
    uid = f"TEST_uid_{uuid.uuid4().hex[:10]}"
    pid = f"TEST_prov_{uuid.uuid4().hex[:10]}"
    email = f"TEST_streak_{uuid.uuid4().hex[:6]}@example.com"
    phone = "+15555550199"
    now = datetime.now(timezone.utc)
    yesterday = (now.date() - timedelta(days=1)).isoformat()

    pwd_hash = bcrypt.hashpw(b"testpass123", bcrypt.gensalt()).decode()
    sync_db.users.insert_one({
        "user_id": uid,
        "email": email,
        "name": "Test At Risk",
        "phone": phone,
        "role": "provider",
        "password_hash": pwd_hash,
        "email_verified": True,
        "created_at": now.isoformat(),
    })
    sync_db.provider_profiles.insert_one({
        "user_id": uid,
        "provider_id": pid,
        "display_name": "Test At Risk Provider",
        "created_at": now.isoformat(),
    })
    # Insert 4 consecutive sessions ending yesterday (current_days=4)
    # _collect_activity_dates uses `created_at` (not activity_date), so we
    # MUST stamp each session with a real datetime on that calendar day.
    for i in range(4):
        day_dt = now - timedelta(days=i + 1)
        sync_db.sessions.insert_one({
            "session_id": f"TEST_sess_{uuid.uuid4().hex[:10]}",
            "user_id": uid,
            "provider_id": pid,
            "activity_date": day_dt.date().isoformat(),
            "created_at": day_dt.isoformat(),
        })
    # Manually insert streaks doc so the admin scan picks it up
    sync_db.streaks.insert_one({
        "user_id": uid,
        "provider_id": pid,
        "current_days": 4,
        "best_days": 4,
        "last_active_date": yesterday,
        "best_set_at": now.isoformat(),
        "updated_at": now.isoformat(),
    })

    yield {"user_id": uid, "provider_id": pid, "email": email, "phone": phone}

    # Teardown
    sync_db.users.delete_one({"user_id": uid})
    sync_db.provider_profiles.delete_one({"user_id": uid})
    sync_db.sessions.delete_many({"user_id": uid})
    sync_db.streaks.delete_one({"user_id": uid})
    sync_db.notifications.delete_many({"user_id": uid})
    sync_db.notification_queue.delete_many({
        "$or": [{"recipient_email": email}, {"recipient_phone": phone}]
    })


# ════════════════════════════════════════════════════════════════════════
# GET / POST /providers/me/streak/preferences
# ════════════════════════════════════════════════════════════════════════
class TestStreakPreferences:
    def test_get_pref_provider_default_false(self, provider_session):
        # Reset to known state first
        provider_session.post(f"{API}/providers/me/streak/preferences", json={"opt_out": False}, timeout=15)
        r = provider_session.get(f"{API}/providers/me/streak/preferences", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "opt_out" in data
        assert data["opt_out"] is False

    def test_get_pref_unauthenticated_401(self):
        r = requests.get(f"{API}/providers/me/streak/preferences", timeout=15)
        assert r.status_code in (401, 403)

    def test_get_pref_non_provider_403(self, client_session):
        r = client_session.get(f"{API}/providers/me/streak/preferences", timeout=15)
        assert r.status_code == 403

    def test_post_pref_toggle_on(self, provider_session):
        r = provider_session.post(f"{API}/providers/me/streak/preferences",
                                  json={"opt_out": True}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data == {"ok": True, "opt_out": True}
        # Verify persisted
        g = provider_session.get(f"{API}/providers/me/streak/preferences", timeout=15).json()
        assert g["opt_out"] is True

    def test_post_pref_idempotent(self, provider_session):
        # Calling twice with same value returns same shape
        r1 = provider_session.post(f"{API}/providers/me/streak/preferences",
                                   json={"opt_out": True}, timeout=15)
        r2 = provider_session.post(f"{API}/providers/me/streak/preferences",
                                   json={"opt_out": True}, timeout=15)
        assert r1.status_code == r2.status_code == 200
        assert r1.json() == r2.json() == {"ok": True, "opt_out": True}

    def test_post_pref_toggle_off_restores(self, provider_session):
        r = provider_session.post(f"{API}/providers/me/streak/preferences",
                                  json={"opt_out": False}, timeout=15)
        assert r.status_code == 200
        assert r.json() == {"ok": True, "opt_out": False}
        # Verify
        g = provider_session.get(f"{API}/providers/me/streak/preferences", timeout=15).json()
        assert g["opt_out"] is False

    def test_post_pref_non_provider_403(self, client_session):
        r = client_session.post(f"{API}/providers/me/streak/preferences",
                                json={"opt_out": True}, timeout=15)
        assert r.status_code == 403


# ════════════════════════════════════════════════════════════════════════
# POST /admin/streaks/send-reminders
# ════════════════════════════════════════════════════════════════════════
class TestAdminSendReminders:
    def test_non_admin_403(self, provider_session):
        r = provider_session.post(f"{API}/admin/streaks/send-reminders", timeout=20)
        assert r.status_code == 403

    def test_unauthenticated_401(self):
        r = requests.post(f"{API}/admin/streaks/send-reminders", timeout=20)
        assert r.status_code in (401, 403)

    def test_admin_scan_returns_expected_shape(self, admin_session, test_at_risk_provider):
        r = admin_session.post(f"{API}/admin/streaks/send-reminders", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("ok", "queued", "skipped", "scanned"):
            assert k in data, f"Missing key {k} in {data}"
        assert data["ok"] is True
        assert isinstance(data["queued"], int)
        assert isinstance(data["skipped"], int)
        assert isinstance(data["scanned"], int)
        # scanned must include at least our synthetic + María
        assert data["scanned"] >= 2

    def test_at_risk_user_gets_queued(self, admin_session, test_at_risk_provider):
        uid = test_at_risk_provider["user_id"]
        # Clear any previous notification for this user
        sync_db.notifications.delete_many({"user_id": uid})
        sync_db.notification_queue.delete_many({
            "$or": [
                {"recipient_email": test_at_risk_provider["email"]},
                {"recipient_phone": test_at_risk_provider["phone"]},
            ]
        })
        r = admin_session.post(f"{API}/admin/streaks/send-reminders", timeout=30)
        assert r.status_code == 200
        # Verify in-app notification was created
        notif = sync_db.notifications.find_one({"user_id": uid, "category": "streaks"})
        assert notif is not None, "Expected in-app streak notification"
        assert notif["category"] == "streaks"
        assert notif["priority"] == "high"
        assert "racha de 4 días" in notif["title"]
        assert "🔥" in notif["title"]
        assert notif["cta_url"] == "/dashboard/provider#streak"
        assert "Test" in notif["body"]  # first name appears
        # notification_key follows the {uid}::streak_reminder::{date} pattern
        today_iso = datetime.now(timezone.utc).date().isoformat()
        assert notif["notification_key"] == f"{uid}::streak_reminder::{today_iso}"

    def test_sms_and_email_queue_rows_created(self, admin_session, test_at_risk_provider):
        # Run twice safely — idempotency on notification_key prevents duplicate in-app,
        # but SMS/email queue rows are insert-on-fire. We assert at least one of each.
        sms_rows = list(sync_db.notification_queue.find({
            "recipient_phone": test_at_risk_provider["phone"],
            "channel": "sms",
        }))
        email_rows = list(sync_db.notification_queue.find({
            "recipient_email": test_at_risk_provider["email"],
            "channel": "email",
        }))
        assert len(sms_rows) >= 1, "Expected SMS queue row"
        assert len(email_rows) >= 1, "Expected email queue row"
        assert sms_rows[0]["trigger_type"] == "streak_reminder_4d"
        assert email_rows[0]["trigger_type"] == "streak_reminder_4d"

    def test_idempotency_second_call_skips(self, admin_session, test_at_risk_provider):
        """Re-running the fan-out must NOT create a second in-app notification
        for the same user on the same UTC date."""
        uid = test_at_risk_provider["user_id"]
        # Ensure first call has queued one already
        admin_session.post(f"{API}/admin/streaks/send-reminders", timeout=30)
        before_count = sync_db.notifications.count_documents({
            "user_id": uid, "category": "streaks"
        })
        # Run again
        r = admin_session.post(f"{API}/admin/streaks/send-reminders", timeout=30)
        assert r.status_code == 200
        after_count = sync_db.notifications.count_documents({
            "user_id": uid, "category": "streaks"
        })
        assert after_count == before_count, \
            f"Idempotency violated: in-app count went {before_count}->{after_count}"

    def test_opt_out_user_is_skipped(self, admin_session, test_at_risk_provider):
        """Setting streak_reminders_opt_out=true must skip user even if at_risk."""
        uid = test_at_risk_provider["user_id"]
        # Clear today's notif so we can detect a fresh queue attempt
        sync_db.notifications.delete_many({"user_id": uid, "category": "streaks"})
        sync_db.users.update_one(
            {"user_id": uid},
            {"$set": {"streak_reminders_opt_out": True}},
        )
        r = admin_session.post(f"{API}/admin/streaks/send-reminders", timeout=30)
        assert r.status_code == 200
        # No new notification should be created for opted-out user
        notif = sync_db.notifications.find_one({"user_id": uid, "category": "streaks"})
        assert notif is None, "Opted-out user should be skipped"
        # Restore
        sync_db.users.update_one(
            {"user_id": uid},
            {"$set": {"streak_reminders_opt_out": False}},
        )

    def test_low_streak_skipped(self, admin_session):
        """Users with current_days<3 must be skipped — they're not scanned at all
        because the admin query filters {current_days: {$gte: 3}}."""
        uid = f"TEST_low_{uuid.uuid4().hex[:8]}"
        pid = f"TEST_lp_{uuid.uuid4().hex[:8]}"
        now = datetime.now(timezone.utc)
        sync_db.streaks.insert_one({
            "user_id": uid,
            "provider_id": pid,
            "current_days": 2,
            "best_days": 2,
            "last_active_date": (now.date() - timedelta(days=1)).isoformat(),
            "updated_at": now.isoformat(),
        })
        try:
            r = admin_session.post(f"{API}/admin/streaks/send-reminders", timeout=30)
            assert r.status_code == 200
            notif = sync_db.notifications.find_one({"user_id": uid})
            assert notif is None, "current_days<3 user should never be touched"
        finally:
            sync_db.streaks.delete_one({"user_id": uid})


# ════════════════════════════════════════════════════════════════════════
# /api/notifications merge includes category='streaks'
# ════════════════════════════════════════════════════════════════════════
class TestNotificationsMerge:
    def test_notifications_endpoint_surfaces_streak_category(self, provider_session):
        """The /api/notifications endpoint must include category='streaks' in
        its merge set so that streak reminders surface in the bell icon. We
        verify this by inserting a synthetic streak notification for the
        demo provider directly into db.notifications and asserting it shows
        up via the API."""
        # Find María's user_id
        u = sync_db.users.find_one({"email": PROVIDER_EMAIL}, {"user_id": 1})
        assert u, "Demo provider not found"
        uid = u["user_id"]
        nkey = f"TEST_iter38_merge_{uuid.uuid4().hex[:8]}"
        now_iso = datetime.now(timezone.utc).isoformat()
        sync_db.notifications.insert_one({
            "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
            "notification_key": nkey,
            "user_id": uid,
            "role": "provider",
            "category": "streaks",
            "title": "🔥 TEST iter38 streak merge",
            "body": "Synthetic for category-merge test",
            "cta_label": "Open",
            "cta_url": "/dashboard/provider#streak",
            "icon": "trophy",
            "priority": "high",
            "is_read": False,
            "dismissed_at": None,
            "created_at": now_iso,
        })
        try:
            rn = provider_session.get(f"{API}/notifications", timeout=20)
            assert rn.status_code == 200, rn.text
            data = rn.json()
            assert "items" in data
            cats = {it.get("category") for it in data["items"]}
            assert "streaks" in cats, f"Expected 'streaks' in categories, got {cats}"
            streak_items = [it for it in data["items"] if it.get("category") == "streaks"]
            assert any("TEST iter38" in it.get("title", "") for it in streak_items)
        finally:
            sync_db.notifications.delete_one({"notification_key": nkey})


# ════════════════════════════════════════════════════════════════════════
# Demo provider seed integrity guard — María must NOT be disturbed
# ════════════════════════════════════════════════════════════════════════
class TestDemoSeedIntact:
    def test_demo_provider_streak_remains_alive(self, provider_session):
        r = provider_session.get(f"{API}/providers/me/streak", timeout=20)
        assert r.status_code == 200
        data = r.json()
        # María must still be alive with current_days>=5 (seed didn't get wiped)
        assert data["status"] == "alive", f"Demo provider streak broken: {data}"
        assert data["current_days"] >= 5
        assert data["best_days"] >= 5
