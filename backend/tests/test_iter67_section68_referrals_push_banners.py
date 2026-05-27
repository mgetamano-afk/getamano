"""
Section 68 — Iteration 67 backend tests.

Covers:
  - Referral commissions (B1–B7)
  - Web Push subscribe / public-key / unsubscribe / list (C1–C4)
  - Banners endpoints refactored to routes/banners.py (A1)
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")

PROV1 = ("demo.provider@getamano.com", "provider123")     # María
PROV2 = ("demo.provider2@getamano.com", "provider123")    # Roberto
CLIENT = ("demo.client@getamano.com", "client123")


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    me = s.get(f"{BASE_URL}/api/auth/me", timeout=20)
    assert me.status_code == 200, me.text
    return s, me.json()


@pytest.fixture(scope="module")
def maria():
    return _login(*PROV1)


@pytest.fixture(scope="module")
def roberto():
    return _login(*PROV2)


@pytest.fixture(scope="module")
def carlos():
    return _login(*CLIENT)


# ────────── A1 — Banners refactor ──────────
class TestBannersRefactor:
    def test_public_banners(self):
        r = requests.get(f"{BASE_URL}/api/banners/public", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body, (list, dict))

    def test_banner_of_the_week(self):
        r = requests.get(f"{BASE_URL}/api/banners/banner-of-the-week", timeout=15)
        assert r.status_code in (200, 204)

    def test_me_banner_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/banners/me", timeout=15)
        assert r.status_code in (401, 403)

    def test_me_banner_authed(self, maria):
        s, _ = maria
        r = s.get(f"{BASE_URL}/api/banners/me", timeout=15)
        assert r.status_code == 200


# ────────── C — Push (C1–C4) ──────────
class TestPush:
    def test_public_key_anon(self):
        r = requests.get(f"{BASE_URL}/api/push/public-key", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "public_key" in body
        assert 80 <= len(body["public_key"]) <= 100, len(body["public_key"])

    def test_subscribe_requires_auth(self):
        r = requests.post(
            f"{BASE_URL}/api/push/subscribe",
            json={
                "endpoint": "https://fcm.googleapis.com/fcm/send/anon-no-auth",
                "keys": {"p256dh": "x" * 40, "auth": "y" * 16},
            },
            timeout=15,
        )
        assert r.status_code in (401, 403)

    def test_subscribe_and_idempotent(self, maria):
        s, _ = maria
        endpoint = f"https://fcm.googleapis.com/fcm/send/test-{uuid.uuid4().hex[:8]}"
        payload = {
            "endpoint": endpoint,
            "keys": {"p256dh": "BPLAY" + "x" * 80, "auth": "QUFB" + "x" * 20},
            "user_agent": "pytest-fake-ua",
        }
        r1 = s.post(f"{BASE_URL}/api/push/subscribe", json=payload, timeout=15)
        assert r1.status_code == 200, r1.text
        assert r1.json().get("ok") is True
        r2 = s.post(f"{BASE_URL}/api/push/subscribe", json=payload, timeout=15)
        assert r2.status_code == 200
        # list and assert only one entry per endpoint
        listing = s.get(f"{BASE_URL}/api/push/me", timeout=15).json()
        assert sum(1 for x in listing if x.get("endpoint") == endpoint) == 1
        # cleanup
        u = s.post(f"{BASE_URL}/api/push/unsubscribe", json={"endpoint": endpoint}, timeout=15)
        assert u.status_code == 200
        assert u.json().get("ok") is True
        assert u.json().get("matched") in (1,)

    def test_list_me_active_only(self, maria):
        s, _ = maria
        endpoint = f"https://fcm.googleapis.com/fcm/send/active-{uuid.uuid4().hex[:8]}"
        s.post(f"{BASE_URL}/api/push/subscribe", json={
            "endpoint": endpoint, "keys": {"p256dh": "p" * 40, "auth": "a" * 16}
        }, timeout=15)
        listing = s.get(f"{BASE_URL}/api/push/me", timeout=15)
        assert listing.status_code == 200
        eps = [x["endpoint"] for x in listing.json()]
        assert endpoint in eps
        s.post(f"{BASE_URL}/api/push/unsubscribe", json={"endpoint": endpoint}, timeout=15)
        listing = s.get(f"{BASE_URL}/api/push/me", timeout=15).json()
        assert endpoint not in [x["endpoint"] for x in listing]


# ────────── B — Referrals (B1–B7) ──────────
class TestReferrals:
    def test_b1_self_referral_rejected(self, maria):
        s, me = maria
        r = s.post(f"{BASE_URL}/api/referrals/jobs", json={
            "referred_user_id": me["user_id"],
            "client_name": "TestSelf",
            "service_description": "self-referral should fail boom",
        }, timeout=15)
        assert r.status_code == 400, r.text

    def test_b1_referred_must_be_provider(self, maria, carlos):
        s, _ = maria
        _, carlos_me = carlos
        r = s.post(f"{BASE_URL}/api/referrals/jobs", json={
            "referred_user_id": carlos_me["user_id"],
            "client_name": "TestClientTarget",
            "service_description": "Should reject — client is not provider",
        }, timeout=15)
        assert r.status_code == 400, r.text

    def test_b1_b2_create_then_b3_accept_then_b4_complete(self, maria, roberto):
        s_m, me_m = maria
        s_r, me_r = roberto

        # B1 CREATE
        r = s_m.post(f"{BASE_URL}/api/referrals/jobs", json={
            "referred_user_id": me_r["user_id"],
            "client_name": "TEST_Cliente Pytest",
            "client_phone": "555-0100",
            "service_description": "TEST referral pytest flow",
            "estimated_amount": 300,
        }, timeout=15)
        assert r.status_code == 200, r.text
        doc = r.json()
        rid = doc["referral_id"]
        assert doc["status"] == "pending"
        assert doc["commission_pct"] == 5.0
        assert doc["referrer"]["user_id"] == me_m["user_id"]
        assert doc["referred"]["user_id"] == me_r["user_id"]

        # B2 notification was inserted (best-effort check) — query notifications for receiver
        notif = s_r.get(f"{BASE_URL}/api/notifications/me", timeout=15)
        if notif.status_code == 200:
            titles = [n.get("title", "") for n in notif.json()]
            assert any("refirió" in t for t in titles), titles[:5]

        # B3 ACCEPT (referred only)
        # Forbidden by referrer
        rfail = s_m.post(f"{BASE_URL}/api/referrals/jobs/{rid}/accept", timeout=15)
        assert rfail.status_code in (400, 403)

        racc = s_r.post(f"{BASE_URL}/api/referrals/jobs/{rid}/accept", timeout=15)
        assert racc.status_code == 200, racc.text
        assert racc.json()["status"] == "accepted"
        assert racc.json()["accepted_at"]

        # B4 COMPLETE
        rcomp = s_r.post(f"{BASE_URL}/api/referrals/jobs/{rid}/complete",
                         json={"final_amount": 400}, timeout=15)
        assert rcomp.status_code == 200, rcomp.text
        body = rcomp.json()
        assert body["status"] == "completed"
        assert body["final_amount"] == 400
        assert body["commission_amount"] == 20.0  # 5% of 400

        # B6 cancel after completion -> 400
        rcan = s_r.post(f"{BASE_URL}/api/referrals/jobs/{rid}/cancel", timeout=15)
        assert rcan.status_code == 400, rcan.text

    def test_b5_earnings_maria(self, maria):
        s, _ = maria
        r = s.get(f"{BASE_URL}/api/referrals/earnings/me", timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["commission_pct"] == 5.0
        ar = body["as_referrer"]
        # María must have at least 1 completed referral worth ≥ 12.50 commission
        assert ar["completed_jobs"] >= 1, body
        assert ar["earned"] >= 12.50, body

    def test_b6_cancel_before_completion(self, maria, roberto):
        s_m, _ = maria
        s_r, me_r = roberto
        r = s_m.post(f"{BASE_URL}/api/referrals/jobs", json={
            "referred_user_id": me_r["user_id"],
            "client_name": "TEST_Cancelable",
            "service_description": "TEST referral to cancel",
        }, timeout=15)
        rid = r.json()["referral_id"]
        # referred cancels (allowed)
        rcan = s_r.post(f"{BASE_URL}/api/referrals/jobs/{rid}/cancel", timeout=15)
        assert rcan.status_code == 200, rcan.text
        assert rcan.json()["status"] == "cancelled"

    def test_b7_lists_sent_and_received(self, maria, roberto):
        s_m, me_m = maria
        s_r, me_r = roberto
        sent = s_m.get(f"{BASE_URL}/api/referrals/jobs/me/sent", timeout=15)
        recv = s_r.get(f"{BASE_URL}/api/referrals/jobs/me/received", timeout=15)
        assert sent.status_code == 200
        assert recv.status_code == 200
        sent_l = sent.json()
        recv_l = recv.json()
        assert isinstance(sent_l, list) and isinstance(recv_l, list)
        # Roberto must be the referred in at least one of María's sent items
        targets = [x.get("referred_user_id") for x in sent_l]
        assert me_r["user_id"] in targets
        # Sorted desc by created_at
        if len(sent_l) >= 2:
            assert sent_l[0]["created_at"] >= sent_l[1]["created_at"]
        # Enriched objects
        assert "business_name" in sent_l[0]["referred"]
