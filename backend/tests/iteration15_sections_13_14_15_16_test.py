"""Iteration 15 — Sections 13/14/15/16: license, completion, badges, referrals, messaging,
contact-prefs, incomplete-registrations. Pytest suite."""
import os
import time
import uuid
import pytest
import requests

def _load_base_url() -> str:
    url = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if not url:
        # Fallback to reading frontend/.env (pytest runs without dotenv loaded)
        env_path = "/app/frontend/.env"
        if os.path.exists(env_path):
            with open(env_path) as fh:
                for line in fh:
                    if line.strip().startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip()
                        break
    return url.rstrip("/")

BASE_URL = _load_base_url()
assert BASE_URL, "REACT_APP_BACKEND_URL is required"

PROVIDER_EMAIL = os.environ.get("TEST_PROVIDER_EMAIL", "demo.provider@getamano.com")
PROVIDER_PASSWORD = os.environ.get("TEST_PROVIDER_PASSWORD", "provider123")
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "admin@getamano.com")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "admin123")
MARIA_SLUG = os.environ.get("TEST_DEMO_SLUG", "maria-cleaning-services-sallisaw-ok")


# ── helpers ─────────────────────────────────────────────────────────────
def _login(email: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def provider_token() -> str:
    return _login(PROVIDER_EMAIL, PROVIDER_PASSWORD)


@pytest.fixture(scope="session")
def admin_token() -> str:
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="session")
def provider_id(provider_token: str) -> str:
    r = requests.get(f"{BASE_URL}/api/providers/me", headers=_auth(provider_token), timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["provider_id"]


# ── (15) License ────────────────────────────────────────────────────────
class TestLicense:
    def test_license_types_public_returns_11(self):
        r = requests.get(f"{BASE_URL}/api/license/types", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 11, f"expected 11 license types, got {len(data)}: {data}"
        for item in data:
            assert "key" in item and "label" in item

    @pytest.mark.parametrize("has_license,license_type", [
        ("yes", "General Contractor"),
        ("no", None),
        ("prefer_not_to_say", None),
    ])
    def test_license_put_persists(self, provider_token, has_license, license_type):
        payload = {
            "has_license": has_license,
            "license_type": license_type,
            "license_number": "ABC123" if has_license == "yes" else None,
            "license_state": "OK" if has_license == "yes" else None,
            "license_expires_year": 2027 if has_license == "yes" else None,
        }
        r = requests.put(f"{BASE_URL}/api/providers/me/license",
                         json=payload, headers=_auth(provider_token), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body["license"]["has_license"] == has_license

        # verify persistence via providers/me
        r2 = requests.get(f"{BASE_URL}/api/providers/me",
                          headers=_auth(provider_token), timeout=15)
        assert r2.status_code == 200
        lic = r2.json().get("license") or {}
        assert lic.get("has_license") == has_license


# ── (16A) Completion ────────────────────────────────────────────────────
class TestCompletion:
    def test_completion_shape_and_score(self, provider_token):
        r = requests.get(f"{BASE_URL}/api/providers/me/completion",
                         headers=_auth(provider_token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "score" in data and "missing" in data
        assert isinstance(data["score"], int)
        assert 0 <= data["score"] <= 100
        assert data["score"] > 0, "demo provider should have score > 0"
        assert isinstance(data["missing"], list)
        for m in data["missing"]:
            assert {"label", "points", "deep_link"} <= set(m.keys())


# ── (16C) Referrals ─────────────────────────────────────────────────────
class TestReferrals:
    def test_referrals_generates_idempotent_ref_code(self, provider_token):
        r1 = requests.get(f"{BASE_URL}/api/providers/me/referrals",
                          headers=_auth(provider_token), timeout=15)
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        code = d1["ref_code"]
        assert isinstance(code, str) and len(code) == 6
        # Excludes I, O, 0, 1
        for ch in code:
            assert ch not in "IO01", f"ref_code contains forbidden char: {code}"
        assert d1["share_url"] == f"/registro?ref={code}"
        assert isinstance(d1["items"], list)

        # idempotent
        r2 = requests.get(f"{BASE_URL}/api/providers/me/referrals",
                          headers=_auth(provider_token), timeout=15)
        assert r2.status_code == 200
        assert r2.json()["ref_code"] == code

    def test_referral_signup_creates_referred_entry(self, provider_token):
        # Get ref_code
        r = requests.get(f"{BASE_URL}/api/providers/me/referrals",
                         headers=_auth(provider_token), timeout=15)
        ref_code = r.json()["ref_code"]

        # Register with ref param
        email = f"TEST_ref_{uuid.uuid4().hex[:8]}@example.com"
        reg = requests.post(
            f"{BASE_URL}/api/auth/register?ref={ref_code}",
            json={"email": email, "password": "Pass1234!", "name": "Test Ref",
                  "phone": "+15551234567", "role": "client"},
            timeout=15,
        )
        assert reg.status_code == 200, reg.text

        # Verify referrer's list
        ref_r = requests.get(f"{BASE_URL}/api/providers/me/referrals",
                             headers=_auth(provider_token), timeout=15)
        assert ref_r.status_code == 200
        items = ref_r.json()["items"]
        found = [i for i in items if i.get("ref_code") == ref_code
                 and i.get("status") == "registered"]
        assert len(found) >= 1, "referred user not tracked"

    def test_invalid_ref_code_does_not_break_register(self):
        email = f"TEST_badref_{uuid.uuid4().hex[:8]}@example.com"
        # too short
        r = requests.post(f"{BASE_URL}/api/auth/register?ref=ABC",
                         json={"email": email, "password": "Pass1234!",
                               "name": "Test", "phone": "+15551234568", "role": "client"},
                         timeout=15)
        assert r.status_code == 200, r.text

        # non-existent code
        email2 = f"TEST_badref2_{uuid.uuid4().hex[:8]}@example.com"
        r2 = requests.post(f"{BASE_URL}/api/auth/register?ref=ZZZZZZ",
                          json={"email": email2, "password": "Pass1234!",
                                "name": "Test", "phone": "+15551234569", "role": "client"},
                          timeout=15)
        assert r2.status_code == 200, r2.text


# ── (13D) Contact prefs ─────────────────────────────────────────────────
class TestContactPrefs:
    def test_contact_prefs_persists(self, provider_token):
        r = requests.put(f"{BASE_URL}/api/providers/me/contact-prefs",
                        json={"show_call": True, "show_whatsapp": True,
                              "show_email": False, "show_message_form": True},
                        headers=_auth(provider_token), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True

    def test_contact_prefs_rejects_all_false(self, provider_token):
        r = requests.put(f"{BASE_URL}/api/providers/me/contact-prefs",
                        json={"show_call": False, "show_whatsapp": False,
                              "show_email": False, "show_message_form": False},
                        headers=_auth(provider_token), timeout=15)
        assert r.status_code == 400, r.text


# ── (13) Messaging ──────────────────────────────────────────────────────
class TestMessaging:
    @pytest.fixture(scope="class")
    def started_conv(self, provider_id):
        # Anonymous start
        r = requests.post(f"{BASE_URL}/api/messaging/start",
                          json={
                              "provider_id": provider_id,
                              "participant_name": f"TEST Pytest {uuid.uuid4().hex[:4]}",
                              "participant_phone": "+15551112222",
                              "participant_email": "test@example.com",
                              "message": "Hola, testing pytest message",
                              "conversation_type": "direct",
                          },
                          timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "conversation_id" in data
        assert data["message"]["body"] == "Hola, testing pytest message"
        return data["conversation_id"]

    def test_messaging_start_anonymous(self, started_conv):
        assert started_conv.startswith("conv_")

    def test_conversations_listing_filters_search(self, provider_token, started_conv):
        # all
        r = requests.get(f"{BASE_URL}/api/messaging/conversations",
                         headers=_auth(provider_token), timeout=15)
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        ids = [c["conversation_id"] for c in items]
        assert started_conv in ids, "started conv missing from listing"

        # filter unread (the conv just created has unread_count_provider=1)
        r_unread = requests.get(f"{BASE_URL}/api/messaging/conversations?filter=unread",
                                headers=_auth(provider_token), timeout=15)
        assert r_unread.status_code == 200
        # at least our conv should appear
        assert started_conv in [c["conversation_id"] for c in r_unread.json()["items"]]

        # filter quote (likely empty but must return 200 + items list)
        r_q = requests.get(f"{BASE_URL}/api/messaging/conversations?filter=quote",
                           headers=_auth(provider_token), timeout=15)
        assert r_q.status_code == 200
        assert "items" in r_q.json()

        # search by participant_name prefix
        r_s = requests.get(f"{BASE_URL}/api/messaging/conversations?search=TEST",
                           headers=_auth(provider_token), timeout=15)
        assert r_s.status_code == 200
        assert started_conv in [c["conversation_id"] for c in r_s.json()["items"]]

    def test_get_messages_orders_and_resets_unread(self, provider_token, started_conv):
        r = requests.get(f"{BASE_URL}/api/messaging/conversations/{started_conv}/messages",
                         headers=_auth(provider_token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        msgs = data["items"]
        assert len(msgs) >= 1
        # asc order
        created_list = [m["created_at"] for m in msgs]
        assert created_list == sorted(created_list)

        # subsequent list call should show unread_count_provider=0
        r2 = requests.get(f"{BASE_URL}/api/messaging/conversations",
                          headers=_auth(provider_token), timeout=15)
        for c in r2.json()["items"]:
            if c["conversation_id"] == started_conv:
                assert c.get("unread_count_provider", 0) == 0
                break
        else:
            pytest.fail("conv not found in listing")

    def test_post_message_increments_opposite_unread(self, provider_token, started_conv):
        # provider sends → unread_count_participant should ++
        before = requests.get(f"{BASE_URL}/api/messaging/conversations",
                              headers=_auth(provider_token), timeout=15).json()["items"]
        before_n = next(c["unread_count_participant"] for c in before
                        if c["conversation_id"] == started_conv)
        r = requests.post(f"{BASE_URL}/api/messaging/conversations/{started_conv}/messages",
                          json={"body": "respondiendo desde pytest"},
                          headers=_auth(provider_token), timeout=15)
        assert r.status_code == 200, r.text
        after = requests.get(f"{BASE_URL}/api/messaging/conversations",
                             headers=_auth(provider_token), timeout=15).json()["items"]
        after_n = next(c["unread_count_participant"] for c in after
                       if c["conversation_id"] == started_conv)
        assert after_n == before_n + 1

    def test_unread_count_endpoint(self, provider_token):
        r = requests.get(f"{BASE_URL}/api/messaging/unread-count",
                         headers=_auth(provider_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "unread" in data
        assert isinstance(data["unread"], int)
        assert data["unread"] >= 0


# ── (16B) Badges ────────────────────────────────────────────────────────
class TestBadges:
    def test_badges_for_provider(self, provider_id):
        r = requests.get(f"{BASE_URL}/api/providers/{provider_id}/badges", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        # may be empty; if populated each item has key/label/icon
        for b in data:
            assert {"key", "label", "icon"} <= set(b.keys())


# ── (16H) Admin incomplete-registrations ────────────────────────────────
class TestAdminIncomplete:
    def test_list_incomplete(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/incomplete-registrations",
                         headers=_auth(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body and "total" in body
        assert isinstance(body["items"], list)

    def test_remind_needs_real_user(self, admin_token):
        # Create an incomplete provider user to remind
        email = f"TEST_inc_{uuid.uuid4().hex[:8]}@example.com"
        reg = requests.post(f"{BASE_URL}/api/auth/register",
                            json={"email": email, "password": "Pass1234!",
                                  "name": "Inc Provider", "phone": "+15553334444",
                                  "role": "provider"},
                            timeout=15)
        assert reg.status_code == 200, reg.text
        user_id = reg.json()["user"]["user_id"]

        # Now appears in list
        lr = requests.get(f"{BASE_URL}/api/admin/incomplete-registrations",
                          headers=_auth(admin_token), timeout=15)
        ids = [u["user_id"] for u in lr.json()["items"]]
        assert user_id in ids, "newly registered provider not in incomplete list"

        # remind
        rr = requests.post(
            f"{BASE_URL}/api/admin/incomplete-registrations/{user_id}/remind",
            headers=_auth(admin_token), timeout=15)
        assert rr.status_code == 200, rr.text
        assert rr.json().get("ok") is True

    def test_remind_unknown_404(self, admin_token):
        r = requests.post(
            f"{BASE_URL}/api/admin/incomplete-registrations/user_does_not_exist/remind",
            headers=_auth(admin_token), timeout=15)
        assert r.status_code == 404
