"""
Iteration 4 backend tests — exercises iteration-3 endpoints:
  - Service requests (POST/GET/PUT status)
  - Admin reviews moderation (list/flag/delete + rating recompute)
  - Admin categories CRUD (+ delete-blocked-when-used)
  - Admin cities (CRUD + public featured filter)
  - Admin audit log
  - Admin provider PATCH override
  - Twilio log-only mode — db.sms_log entries with status='log_only'
  - Regression: orphaned PUT /api/users/me (missing decorator?)
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@getamano.com"
ADMIN_PASSWORD = "admin123"
PROVIDER_EMAIL = "demo.provider@getamano.com"
PROVIDER_PASSWORD = "provider123"
DEMO_SLUG = "maria-cleaning-services-sallisaw-ok"


def H(token):
    return {"Authorization": f"Bearer {token}"}


# ============ FIXTURES ============
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def provider_token():
    r = requests.post(f"{API}/auth/login", json={"email": PROVIDER_EMAIL, "password": PROVIDER_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def provider_info(provider_token):
    r = requests.get(f"{API}/providers/me", headers=H(provider_token), timeout=15)
    assert r.status_code == 200
    return r.json()


@pytest.fixture()
def client_token():
    """Register a fresh client + patch a phone number directly in DB so SMS log-only fires
       (PUT /api/users/me is missing — see TestUsersMeRegression)."""
    email = f"TEST_it4_cli_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "Passw0rd!", "name": "TEST IT4 Client", "role": "client"
    }, timeout=20)
    assert r.status_code == 200, r.text
    # Set phone directly via mongo so reply/request-status SMS notifications target a valid number
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    async def patch_phone():
        c = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        await c[os.environ.get("DB_NAME", "test_database")].users.update_one(
            {"email": email.lower()}, {"$set": {"phone": "+15551110000"}})
    asyncio.run(patch_phone())
    return r.json()["token"]


@pytest.fixture(scope="session")
def categories():
    r = requests.get(f"{API}/categories", timeout=15)
    assert r.status_code == 200
    return r.json()


# ============ SERVICE REQUESTS ============
class TestServiceRequests:
    def test_create_service_request(self, client_token, provider_info):
        r = requests.post(f"{API}/service-requests", headers=H(client_token), json={
            "provider_id": provider_info["provider_id"],
            "message": "Quiero cotizar limpieza profunda para 3BR",
            "service_type": "deep_cleaning",
            "contact_phone": "+15551112222",
            "preferred_date": "2026-02-10",
        }, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "pending"
        assert data["provider_id"] == provider_info["provider_id"]
        assert data["request_id"].startswith("req_")
        assert data["business_name"]

    def test_self_request_denied(self, provider_token, provider_info):
        r = requests.post(f"{API}/service-requests", headers=H(provider_token), json={
            "provider_id": provider_info["provider_id"], "message": "self"
        }, timeout=15)
        assert r.status_code == 400

    def test_unknown_provider_404(self, client_token):
        r = requests.post(f"{API}/service-requests", headers=H(client_token), json={
            "provider_id": "nope_xx", "message": "hello"
        }, timeout=15)
        assert r.status_code == 404

    def test_unauth_rejected(self, provider_info):
        r = requests.post(f"{API}/service-requests", json={
            "provider_id": provider_info["provider_id"], "message": "hi"
        }, timeout=15)
        assert r.status_code in (401, 403)

    def test_list_visible_to_client_and_provider(self, client_token, provider_token, provider_info):
        # client creates a request
        c = requests.post(f"{API}/service-requests", headers=H(client_token), json={
            "provider_id": provider_info["provider_id"], "message": "ping"
        }, timeout=15)
        assert c.status_code == 200
        rid = c.json()["request_id"]
        # client GET
        rc = requests.get(f"{API}/service-requests", headers=H(client_token), timeout=15)
        assert rc.status_code == 200
        assert any(x["request_id"] == rid for x in rc.json())
        # provider GET
        rp = requests.get(f"{API}/service-requests", headers=H(provider_token), timeout=15)
        assert rp.status_code == 200
        assert any(x["request_id"] == rid for x in rp.json())

    def test_status_transition_provider_only(self, client_token, provider_token, provider_info):
        c = requests.post(f"{API}/service-requests", headers=H(client_token), json={
            "provider_id": provider_info["provider_id"], "message": "status test"
        }, timeout=15)
        rid = c.json()["request_id"]
        # client cannot change status
        bad = requests.put(f"{API}/service-requests/{rid}/status", headers=H(client_token),
                           json={"status": "accepted"}, timeout=15)
        assert bad.status_code == 403
        # provider can
        ok = requests.put(f"{API}/service-requests/{rid}/status", headers=H(provider_token),
                          json={"status": "accepted"}, timeout=15)
        assert ok.status_code == 200
        # verify persisted
        rp = requests.get(f"{API}/service-requests", headers=H(provider_token), timeout=15).json()
        found = next(x for x in rp if x["request_id"] == rid)
        assert found["status"] == "accepted"

    def test_status_enum_validated(self, client_token, provider_token, provider_info):
        c = requests.post(f"{API}/service-requests", headers=H(client_token), json={
            "provider_id": provider_info["provider_id"], "message": "enum"
        }, timeout=15)
        rid = c.json()["request_id"]
        r = requests.put(f"{API}/service-requests/{rid}/status", headers=H(provider_token),
                         json={"status": "garbage"}, timeout=15)
        assert r.status_code in (400, 422)


# ============ ADMIN REVIEWS ============
class TestAdminReviews:
    def test_admin_list_reviews(self, admin_token):
        r = requests.get(f"{API}/admin/reviews", headers=H(admin_token), timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)

    def test_non_admin_blocked(self, client_token):
        r = requests.get(f"{API}/admin/reviews", headers=H(client_token), timeout=15)
        assert r.status_code == 403

    def test_flag_and_filter_and_delete_recomputes_rating(self, admin_token, client_token, provider_info):
        # create a review as client
        rev = requests.post(f"{API}/reviews", headers=H(client_token), json={
            "provider_id": provider_info["provider_id"], "rating": 2, "comment": "TEST flag/del"
        }, timeout=15)
        assert rev.status_code == 200, rev.text
        review_id = rev.json()["review_id"]

        # flag it
        f = requests.post(f"{API}/admin/reviews/{review_id}/flag", headers=H(admin_token), timeout=15)
        assert f.status_code == 200

        # filter flagged=true contains it
        lf = requests.get(f"{API}/admin/reviews?flagged=true", headers=H(admin_token), timeout=15).json()
        assert any(x["review_id"] == review_id for x in lf)

        # capture rating before delete
        pre = requests.get(f"{API}/providers/by-slug/{provider_info['slug']}", timeout=15).json()
        pre_count = pre.get("rating_count", 0)

        # delete review
        d = requests.delete(f"{API}/admin/reviews/{review_id}", headers=H(admin_token), timeout=15)
        assert d.status_code == 200

        # rating_count should be decremented
        post = requests.get(f"{API}/providers/by-slug/{provider_info['slug']}", timeout=15).json()
        assert post["rating_count"] == max(0, pre_count - 1), (pre_count, post["rating_count"])


# ============ ADMIN CATEGORIES ============
class TestAdminCategories:
    @pytest.fixture()
    def temp_category(self, admin_token):
        slug = f"test-cat-{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/admin/categories", headers=H(admin_token), json={
            "slug": slug, "name_es": "Prueba", "name_en": "Test", "icon": "Sparkles", "color": "#000"
        }, timeout=15)
        assert r.status_code == 200, r.text
        cat = r.json()
        yield cat
        requests.delete(f"{API}/admin/categories/{cat['category_id']}", headers=H(admin_token), timeout=15)

    def test_create_category(self, temp_category):
        assert temp_category["category_id"].startswith("cat_")

    def test_duplicate_slug_rejected(self, admin_token, temp_category):
        r = requests.post(f"{API}/admin/categories", headers=H(admin_token), json={
            "slug": temp_category["slug"], "name_es": "x", "name_en": "x"
        }, timeout=15)
        assert r.status_code == 400

    def test_update_category(self, admin_token, temp_category):
        r = requests.put(f"{API}/admin/categories/{temp_category['category_id']}",
                         headers=H(admin_token), json={
                             "slug": temp_category["slug"], "name_es": "Renombrado", "name_en": "Renamed"
                         }, timeout=15)
        assert r.status_code == 200

    def test_delete_used_category_blocked(self, admin_token, provider_info):
        # try delete a category that's actually used by demo provider
        r = requests.delete(f"{API}/admin/categories/{provider_info['category_id']}",
                            headers=H(admin_token), timeout=15)
        assert r.status_code == 400


# ============ ADMIN CITIES ============
class TestAdminCities:
    @pytest.fixture()
    def temp_city(self, admin_token):
        r = requests.post(f"{API}/admin/cities", headers=H(admin_token), json={
            "name": f"TestCity_{uuid.uuid4().hex[:5]}", "state": "ZZ", "featured": True
        }, timeout=15)
        assert r.status_code == 200, r.text
        c = r.json()
        yield c
        requests.delete(f"{API}/admin/cities/{c['city_id']}", headers=H(admin_token), timeout=15)

    def test_admin_list(self, admin_token, temp_city):
        r = requests.get(f"{API}/admin/cities", headers=H(admin_token), timeout=15)
        assert r.status_code == 200
        assert any(x["city_id"] == temp_city["city_id"] for x in r.json())

    def test_non_admin_blocked(self, client_token):
        r = requests.get(f"{API}/admin/cities", headers=H(client_token), timeout=15)
        assert r.status_code == 403

    def test_public_cities_featured_only(self, temp_city):
        r = requests.get(f"{API}/cities", timeout=15)
        assert r.status_code == 200
        items = r.json()
        # all returned must be featured
        assert all(c.get("featured") is True for c in items)
        # our created featured city is included
        assert any(c["city_id"] == temp_city["city_id"] for c in items)


# ============ ADMIN AUDIT LOG ============
class TestAdminAuditLog:
    def test_audit_log_after_action(self, admin_token):
        # produce one log via category create+delete
        slug = f"audit-cat-{uuid.uuid4().hex[:6]}"
        c = requests.post(f"{API}/admin/categories", headers=H(admin_token), json={
            "slug": slug, "name_es": "A", "name_en": "A"
        }, timeout=15)
        cid = c.json()["category_id"]
        requests.delete(f"{API}/admin/categories/{cid}", headers=H(admin_token), timeout=15)

        r = requests.get(f"{API}/admin/audit-log?limit=50", headers=H(admin_token), timeout=15)
        assert r.status_code == 200
        logs = r.json()
        assert isinstance(logs, list) and len(logs) >= 1
        # most recent should be the delete or create above
        assert any(log["target"] == cid for log in logs)
        # admin enrichment
        for log in logs[:5]:
            assert "admin" in log
            if log.get("admin"):
                assert "email" in log["admin"]

    def test_non_admin_blocked(self, client_token):
        r = requests.get(f"{API}/admin/audit-log", headers=H(client_token), timeout=15)
        assert r.status_code == 403


# ============ ADMIN PATCH PROVIDER ============
class TestAdminProviderPatch:
    def test_patch_updates_field_and_logs(self, admin_token, provider_info):
        new_name = f"PATCH_{uuid.uuid4().hex[:4]}"
        r = requests.patch(f"{API}/admin/providers/{provider_info['provider_id']}",
                           headers=H(admin_token), json={"business_name": new_name}, timeout=15)
        assert r.status_code == 200
        # verify via GET
        g = requests.get(f"{API}/providers/by-slug/{provider_info['slug']}", timeout=15).json()
        assert g["business_name"] == new_name
        # restore
        requests.patch(f"{API}/admin/providers/{provider_info['provider_id']}",
                       headers=H(admin_token), json={"business_name": provider_info["business_name"]}, timeout=15)

    def test_patch_404_unknown(self, admin_token):
        r = requests.patch(f"{API}/admin/providers/nope_xx", headers=H(admin_token),
                           json={"business_name": "x"}, timeout=15)
        assert r.status_code == 404


# ============ TWILIO LOG-ONLY MODE ============
def _mongo_db():
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    return client[os.environ.get("DB_NAME", "test_database")]


def _ensure_demo_user_phone():
    """Demo provider's User doc lacks a phone in seed; SMS only fires when
       users.phone is set. Patch it directly via mongo for the test, then leave it."""
    import asyncio
    async def go():
        db = _mongo_db()
        await db.users.update_one({"email": "demo.provider@getamano.com"},
                                  {"$set": {"phone": "+15559990000"}})
    asyncio.run(go())


def _count_sms(event):
    import asyncio
    async def go():
        db = _mongo_db()
        return await db.sms_log.count_documents({"event": event, "status": "log_only"})
    return asyncio.run(go())


class TestTwilioLogOnly:
    """Verify db.sms_log entries with status='log_only' fire on key events.
       send_sms() only fires when User.phone is set; we patch the demo user
       once so log-only inserts can be observed in db.sms_log."""

    @classmethod
    def setup_class(cls):
        _ensure_demo_user_phone()

    def test_sms_log_on_new_message(self, client_token, provider_info):
        before = _count_sms("new_message_to_provider")
        r = requests.post(f"{API}/messages", headers=H(client_token), json={
            "provider_id": provider_info["provider_id"], "body": "hello SMS test"
        }, timeout=15)
        assert r.status_code == 200, r.text
        time.sleep(0.6)
        after = _count_sms("new_message_to_provider")
        assert after > before, f"sms_log new_message_to_provider not incremented ({before}->{after})"

    def test_sms_log_on_message_reply(self, client_token, provider_token, provider_info):
        # start convo
        r = requests.post(f"{API}/messages", headers=H(client_token), json={
            "provider_id": provider_info["provider_id"], "body": "thread"
        }, timeout=15)
        conv_id = r.json()["conversation_id"]
        before = _count_sms("message_reply")
        # provider replies — should SMS the client (client has phone from fixture)
        rep = requests.post(f"{API}/messages/{conv_id}/reply", headers=H(provider_token),
                            json={"body": "reply!"}, timeout=15)
        assert rep.status_code == 200
        time.sleep(0.6)
        after = _count_sms("message_reply")
        assert after > before, f"sms_log message_reply not incremented ({before}->{after})"

    def test_sms_log_on_quote(self, client_token, provider_info):
        before = _count_sms("new_quote_request")
        r = requests.post(f"{API}/service-requests", headers=H(client_token), json={
            "provider_id": provider_info["provider_id"], "message": "quote sms test"
        }, timeout=15)
        assert r.status_code == 200
        time.sleep(0.6)
        after = _count_sms("new_quote_request")
        assert after > before

    def test_sms_log_on_request_status(self, client_token, provider_token, provider_info):
        # client creates, provider accepts → client should get SMS
        c = requests.post(f"{API}/service-requests", headers=H(client_token), json={
            "provider_id": provider_info["provider_id"], "message": "status sms test"
        }, timeout=15)
        rid = c.json()["request_id"]
        before = _count_sms("request_accepted")
        u = requests.put(f"{API}/service-requests/{rid}/status", headers=H(provider_token),
                         json={"status": "accepted"}, timeout=15)
        assert u.status_code == 200
        time.sleep(0.6)
        after = _count_sms("request_accepted")
        assert after > before

    def test_sms_log_on_verify(self, admin_token, provider_info):
        before_pending = _count_sms("verify_pending")
        before_approved = _count_sms("verify_approved")
        r = requests.post(f"{API}/admin/providers/{provider_info['provider_id']}/verify",
                          headers=H(admin_token), json={"status": "approved", "note": "ok"}, timeout=15)
        assert r.status_code == 200
        time.sleep(0.6)
        after_approved = _count_sms("verify_approved")
        assert after_approved > before_approved, "verify SMS log not recorded"
        # restore
        requests.post(f"{API}/admin/providers/{provider_info['provider_id']}/verify",
                      headers=H(admin_token), json={"status": "approved", "note": "kept"}, timeout=15)

    def test_sms_log_status_is_log_only(self):
        """All recent sms_log entries should have status='log_only' since Twilio creds are blank."""
        import asyncio
        async def go():
            db = _mongo_db()
            recent = await db.sms_log.find({}, {"_id": 0}).sort("created_at", -1).to_list(20)
            return recent
        recent = asyncio.run(go())
        assert recent, "sms_log empty after triggering events"
        for r in recent:
            assert r.get("status") == "log_only", f"Unexpected status: {r}"


# ============ REGRESSION: PUT /users/me missing decorator ============
class TestUsersMeRegression:
    def test_put_users_me_route_exists(self, client_token):
        r = requests.put(f"{API}/users/me", headers=H(client_token),
                         json={"name": "Renamed"}, timeout=10)
        # Expect 200 if route exists; 404/405 means decorator missing.
        assert r.status_code not in (404, 405), \
            f"PUT /api/users/me missing — server.py:985 update_user has no @api_router.put decorator (got {r.status_code})"
