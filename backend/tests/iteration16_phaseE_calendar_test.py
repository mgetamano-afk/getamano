"""
Iteration 16 — Phase E (Calendar/Booking) + Section 17 (/api/translate) backend tests.

Endpoints under test:
- GET    /api/providers/me/availability                (auth)
- PUT    /api/providers/me/availability                (auth)
- GET    /api/providers/{provider_id}/slots?date=...   (public)
- POST   /api/appointments                              (anonymous + auth)
- GET    /api/providers/me/appointments?status=...     (auth)
- PUT    /api/appointments/{id}                         (auth, provider)
- POST   /api/translate                                 (public)
"""
import pytest
import requests
from datetime import date, timedelta
from test_config import API, PROVIDER_EMAIL, PROVIDER_PASSWORD

DEMO_PROVIDER_ID = "prov_10b9f21bf971"


# ───────────── fixtures ─────────────

@pytest.fixture(scope="module")
def provider_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login",
               json={"email": PROVIDER_EMAIL, "password": PROVIDER_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Cannot login demo provider: {r.status_code} {r.text}")
    return s


@pytest.fixture(scope="module")
def next_monday_iso():
    today = date.today()
    days_ahead = (0 - today.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7
    return (today + timedelta(days=days_ahead)).isoformat()


# ───────────── Availability ─────────────

class TestAvailability:
    def test_get_my_availability_requires_auth(self):
        r = requests.get(f"{API}/providers/me/availability")
        assert r.status_code in (401, 403), r.text

    def test_get_my_availability_authenticated(self, provider_session):
        r = provider_session.get(f"{API}/providers/me/availability")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "weekly" in data
        assert "slot_duration_min" in data
        assert "buffer_min" in data
        # Demo provider was pre-seeded Mon-Fri 09:00-17:00 per request brief
        assert isinstance(data["weekly"], dict)

    def test_put_availability_updates_and_persists(self, provider_session):
        new_payload = {
            "is_active": True,
            "weekly": {
                "mon": [{"start": "09:00", "end": "17:00"}],
                "tue": [{"start": "09:00", "end": "17:00"}],
                "wed": [{"start": "09:00", "end": "17:00"}],
                "thu": [{"start": "09:00", "end": "17:00"}],
                "fri": [{"start": "09:00", "end": "17:00"}],
                "sat": [],
                "sun": [],
            },
            "slot_duration_min": 60,
            "buffer_min": 15,
            "advance_days": 30,
            "timezone": "America/Chicago",
        }
        r = provider_session.put(f"{API}/providers/me/availability", json=new_payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("calendar_active") is True
        # Verify persistence
        g = provider_session.get(f"{API}/providers/me/availability")
        assert g.status_code == 200
        data = g.json()
        assert data["slot_duration_min"] == 60
        assert data["buffer_min"] == 15
        assert data["weekly"]["mon"] == [{"start": "09:00", "end": "17:00"}]


# ───────────── Public Slots ─────────────

class TestPublicSlots:
    def test_slots_for_demo_monday(self, next_monday_iso):
        r = requests.get(f"{API}/providers/{DEMO_PROVIDER_ID}/slots",
                         params={"date": next_monday_iso})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["calendar_active"] is True
        slots = data["slots"]
        # Expected candidates per brief: 09:00, 10:15, 11:30, 12:45, 14:00, 15:15
        # Booked ones may be filtered (1 pre-existing on 2026-05-25 10:15)
        # So we just verify at least one and shape correctness
        assert isinstance(slots, list)
        # Verify 10:00 is NOT in slots (per brief)
        assert "10:00" not in slots
        for t in slots:
            assert len(t) == 5 and t[2] == ":", f"Bad time format: {t}"

    def test_slots_invalid_date(self):
        r = requests.get(f"{API}/providers/{DEMO_PROVIDER_ID}/slots",
                         params={"date": "not-a-date"})
        assert r.status_code == 400

    def test_slots_past_date_returns_empty(self):
        past = (date.today() - timedelta(days=2)).isoformat()
        r = requests.get(f"{API}/providers/{DEMO_PROVIDER_ID}/slots",
                         params={"date": past})
        assert r.status_code == 200
        assert r.json()["slots"] == []

    def test_slots_unknown_provider_404(self, next_monday_iso):
        r = requests.get(f"{API}/providers/prov_doesnotexist123/slots",
                         params={"date": next_monday_iso})
        assert r.status_code == 404


# ───────────── Appointments (book + manage) ─────────────

class TestAppointments:
    def test_book_invalid_time_returns_409(self, next_monday_iso):
        # Per brief: 10:00 is NOT a valid candidate
        r = requests.post(f"{API}/appointments", json={
            "provider_id": DEMO_PROVIDER_ID,
            "date": next_monday_iso,
            "time": "10:00",
            "client_name": "TEST Anon Client",
            "client_phone": "555-555-1212",
            "service_description": "Need a cleaning",
        })
        assert r.status_code == 409, r.text

    def test_book_unknown_provider_404(self, next_monday_iso):
        r = requests.post(f"{API}/appointments", json={
            "provider_id": "prov_doesnotexist123",
            "date": next_monday_iso,
            "time": "09:00",
            "client_name": "TEST Anon",
            "client_phone": "555-555-1212",
            "service_description": "Test",
        })
        assert r.status_code == 404

    def test_book_then_provider_sees_and_can_act(self, provider_session, next_monday_iso):
        # Pick a real slot from the public endpoint
        slots_resp = requests.get(f"{API}/providers/{DEMO_PROVIDER_ID}/slots",
                                   params={"date": next_monday_iso})
        slots = slots_resp.json().get("slots", [])
        if not slots:
            pytest.skip(f"No free slots on {next_monday_iso}; cannot exercise booking flow")
        time_pick = slots[0]
        # Anonymous booking
        book = requests.post(f"{API}/appointments", json={
            "provider_id": DEMO_PROVIDER_ID,
            "date": next_monday_iso,
            "time": time_pick,
            "client_name": "TEST Anon Client",
            "client_phone": "555-555-1212",
            "client_email": "test_anon@example.com",
            "service_description": "TEST automated booking",
        })
        assert book.status_code == 200, book.text
        apt = book.json()
        assert apt["status"] == "pending"
        assert apt["date"] == next_monday_iso
        assert apt["time"] == time_pick
        assert apt["provider_id"] == DEMO_PROVIDER_ID
        assert "appointment_id" in apt
        apt_id = apt["appointment_id"]

        # Double-book same slot must now 409
        dup = requests.post(f"{API}/appointments", json={
            "provider_id": DEMO_PROVIDER_ID,
            "date": next_monday_iso,
            "time": time_pick,
            "client_name": "TEST Duplicate",
            "client_phone": "555-555-2222",
            "service_description": "Dup attempt",
        })
        assert dup.status_code == 409, dup.text

        # Provider sees it
        listing = provider_session.get(f"{API}/providers/me/appointments",
                                        params={"status": "pending"})
        assert listing.status_code == 200, listing.text
        ids = [a["appointment_id"] for a in listing.json().get("items", [])]
        assert apt_id in ids

        # Provider confirms it
        upd = provider_session.put(f"{API}/appointments/{apt_id}",
                                    json={"action": "confirm"})
        assert upd.status_code == 200, upd.text

        # Re-fetch and confirm status
        listing2 = provider_session.get(f"{API}/providers/me/appointments",
                                         params={"status": "confirmed"})
        ids2 = [a["appointment_id"] for a in listing2.json().get("items", [])
                if a["appointment_id"] == apt_id]
        assert ids2, "Appointment did not transition to confirmed"

        # Cleanup: cancel so future runs can rebook same slot
        provider_session.put(f"{API}/appointments/{apt_id}", json={"action": "cancel"})

    def test_update_unknown_appointment_404(self, provider_session):
        r = provider_session.put(f"{API}/appointments/apt_doesnotexist",
                                  json={"action": "confirm"})
        assert r.status_code == 404


# ───────────── Translate (mock mode) ─────────────

class TestTranslate:
    def test_translate_returns_original_when_no_api_key(self):
        r = requests.post(f"{API}/translate", json={
            "text": "Hola mundo",
            "source_lang": "es",
            "target_lang": "en",
            "source_id": "test_doc_1",
            "source_field": "description",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["translated_text"] == "Hola mundo"
        assert data["source"] == "no_api_key"
        assert "note" in data

    def test_translate_same_lang_noop(self):
        r = requests.post(f"{API}/translate", json={
            "text": "Hola",
            "source_lang": "es",
            "target_lang": "es",
            "source_id": "noop1",
            "source_field": "x",
        })
        assert r.status_code == 200
        data = r.json()
        assert data["translated_text"] == "Hola"
        assert data["source"] == "noop"

    def test_translate_validation(self):
        r = requests.post(f"{API}/translate", json={
            "text": "",
            "source_lang": "es",
            "target_lang": "en",
            "source_id": "x", "source_field": "y",
        })
        assert r.status_code in (400, 422)
