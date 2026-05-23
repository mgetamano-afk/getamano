"""
Iteration 45 — Exit-intent lead capture + admin inbox tests.

Endpoints under test:
  POST   /api/leads/capture        (public)
  GET    /api/admin/leads          (admin only)
  PATCH  /api/admin/leads/{id}     (admin only)
"""
import requests
import pytest
import time
from tests.test_config import API

# Run-unique offset prevents duplicate-detection across re-runs
_RUN_OFFSET = int(time.time()) % 10000


def _capture(payload):
    return requests.post(f"{API}/leads/capture", json=payload, timeout=15)



def _unique_phone(seed: int) -> str:
    # 415-555-XXXX with run-unique seed → fresh phone every run
    tail = (seed + _RUN_OFFSET) % 10000
    return f"4155{tail:04d}{seed % 100:02d}"


# ============================================================
# PUBLIC CAPTURE — happy path + validation
# ============================================================
class TestCapturePublic:
    def test_capture_valid_payload(self):
        r = _capture({
            "name": "TEST_Lucia Garcia",
            "phone": _unique_phone(1001),
            "city": "Sallisaw",
            "state": "OK",
            "service": "limpieza",
            "preferred_channel": "whatsapp",
            "lang": "es",
            "source": "exit_intent",
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body.get("duplicate") is False
        assert body["lead_id"].startswith("lead_")

    def test_capture_invalid_phone_short(self):
        # 7 chars passes pydantic min_length=7 but only 7 digits → 400 from custom validator
        r = _capture({"name": "TEST_Bad", "phone": "1234567", "lang": "en"})
        assert r.status_code == 400, r.text
        detail = (r.json().get("detail") or "").lower()
        assert "tel" in detail or "phone" in detail or "inv" in detail

    def test_capture_phone_too_short_pydantic(self):
        # Less than 7 chars → pydantic 422 (this is the strict less-than-10-digits case too)
        r = _capture({"name": "TEST_Bad2", "phone": "12345", "lang": "en"})
        assert r.status_code in (400, 422)

    def test_capture_short_name_rejected(self):
        # pydantic min_length=2 → 422
        r = _capture({"name": "A", "phone": _unique_phone(1002)})
        assert r.status_code in (400, 422), r.text

    def test_capture_duplicate_within_24h(self):
        phone = _unique_phone(1003)
        r1 = _capture({"name": "TEST_DupeUser", "phone": phone, "lang": "es"})
        assert r1.status_code == 200
        lead_id_1 = r1.json()["lead_id"]
        # Second call with same phone → must return duplicate:true and SAME lead_id
        r2 = _capture({"name": "TEST_DupeUser2", "phone": phone, "lang": "es"})
        assert r2.status_code == 200
        body = r2.json()
        assert body["duplicate"] is True
        assert body["lead_id"] == lead_id_1, "duplicate must reuse existing lead_id"

    def test_capture_sms_en(self):
        # Stored correctly with sms+en — verify via admin listing
        phone = _unique_phone(1004)
        r = _capture({
            "name": "TEST_John Smith",
            "phone": phone,
            "preferred_channel": "sms",
            "lang": "en",
            "service": "lawn care",
        })
        assert r.status_code == 200
        pytest.shared_sms_en_phone = phone  # type: ignore[attr-defined]


# ============================================================
# ADMIN LISTING — auth + filters + shape
# ============================================================
class TestAdminLeadsList:
    def test_admin_leads_requires_auth(self):
        r = requests.get(f"{API}/admin/leads", timeout=15)
        assert r.status_code in (401, 403)

    def test_admin_leads_ok(self, admin_session):
        r = admin_session.get(f"{API}/admin/leads", timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body
        assert isinstance(body["items"], list)
        # every row must have message_body, sms_link, wa_link
        assert len(body["items"]) > 0, "expect at least the manually-created leads"
        for lead in body["items"]:
            assert "message_body" in lead and lead["message_body"]
            assert "sms_link" in lead and lead["sms_link"].startswith("sms:+")
            assert "wa_link" in lead and lead["wa_link"].startswith("https://wa.me/")
            assert "?body=" in lead["sms_link"]
            assert "?text=" in lead["wa_link"]
            # wa.me must NOT have leading +
            wa_after = lead["wa_link"].split("https://wa.me/")[1]
            assert not wa_after.startswith("+"), f"wa.me link must not have +: {lead['wa_link']}"
        # counts
        counts = body["counts"]
        for k in ("total", "pending", "contacted", "converted", "lost"):
            assert k in counts and isinstance(counts[k], int)

    def test_admin_leads_filter_status_pending(self, admin_session):
        r = admin_session.get(f"{API}/admin/leads", params={"status": "pending"}, timeout=15)
        assert r.status_code == 200
        for lead in r.json()["items"]:
            assert lead["status"] == "pending"

    def test_admin_leads_filter_channel_whatsapp(self, admin_session):
        r = admin_session.get(f"{API}/admin/leads", params={"channel": "whatsapp"}, timeout=15)
        assert r.status_code == 200
        for lead in r.json()["items"]:
            assert lead["preferred_channel"] == "whatsapp"

    def test_message_body_spanish_content(self, admin_session):
        r = admin_session.get(f"{API}/admin/leads", timeout=15)
        es_lead = next((l for l in r.json()["items"] if l["lang"] == "es"), None)
        assert es_lead is not None, "expected at least one Spanish lead"
        assert "¡Hola" in es_lead["message_body"]
        assert "getamano.us" in es_lead["message_body"]

    def test_message_body_english_content(self, admin_session):
        r = admin_session.get(f"{API}/admin/leads", timeout=15)
        en_lead = next((l for l in r.json()["items"] if l["lang"] == "en"), None)
        assert en_lead is not None, "expected at least one English lead"
        assert en_lead["message_body"].startswith("Hi ")
        assert "getamano.us" in en_lead["message_body"]


# ============================================================
# ADMIN PATCH — status transitions + edge cases
# ============================================================
class TestAdminLeadsPatch:
    def _create_lead(self, seed):
        r = _capture({
            "name": f"TEST_Patch_{seed}",
            "phone": _unique_phone(seed),
            "lang": "es",
        })
        assert r.status_code == 200
        return r.json()["lead_id"]

    def test_patch_requires_auth(self):
        r = requests.patch(f"{API}/admin/leads/lead_nonexistent",
                           json={"status": "contacted"}, timeout=15)
        assert r.status_code in (401, 403)

    def test_patch_set_contacted(self, admin_session):
        lead_id = self._create_lead(2001)
        r = admin_session.patch(f"{API}/admin/leads/{lead_id}",
                                json={"status": "contacted"}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "contacted"
        assert data["contacted_at"] is not None
        # verify persistence
        list_r = admin_session.get(f"{API}/admin/leads", params={"status": "contacted"})
        assert any(l["lead_id"] == lead_id for l in list_r.json()["items"])

    def test_patch_set_converted(self, admin_session):
        lead_id = self._create_lead(2002)
        r = admin_session.patch(f"{API}/admin/leads/{lead_id}",
                                json={"status": "converted"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "converted"
        assert r.json()["converted_at"] is not None

    def test_patch_nonexistent_returns_404(self, admin_session):
        r = admin_session.patch(f"{API}/admin/leads/lead_doesnotexist_xyz",
                                json={"status": "contacted"}, timeout=15)
        assert r.status_code == 404

    def test_patch_empty_payload_returns_400(self, admin_session):
        lead_id = self._create_lead(2003)
        r = admin_session.patch(f"{API}/admin/leads/{lead_id}", json={}, timeout=15)
        assert r.status_code == 400
        assert "Nada que actualizar" in r.json().get("detail", "")


# ============================================================
# EDGE CASES — long strings, special chars
# ============================================================
class TestEdgeCases:
    def test_long_service_string(self):
        # service max 120 — try at edge
        r = _capture({
            "name": "TEST_LongSvc",
            "phone": _unique_phone(3001),
            "service": "a" * 120,
            "lang": "es",
        })
        assert r.status_code == 200

    def test_service_over_max_rejected(self):
        r = _capture({
            "name": "TEST_OverLong",
            "phone": _unique_phone(3002),
            "service": "a" * 121,
        })
        assert r.status_code in (400, 422)

    def test_special_chars_in_name_and_city(self, admin_session):
        # Make sure URL-encoding in the deep links works for accented chars
        phone = _unique_phone(3003)
        r = _capture({
            "name": "TEST_José Ñuñez",
            "phone": phone,
            "city": "São Paulo",
            "service": "jardinería & limpieza",
            "lang": "es",
        })
        assert r.status_code == 200
        # confirm admin listing returns a properly URL-encoded deep link
        list_r = admin_session.get(f"{API}/admin/leads", timeout=15)
        match = next((l for l in list_r.json()["items"] if l["phone"].endswith(phone[-7:])), None)
        assert match is not None
        # %C3%B1 = ñ encoded
        assert "%C3" in match["sms_link"] or "%C3" in match["wa_link"]
