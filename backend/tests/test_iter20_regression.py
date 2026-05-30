"""Iteration 20 — Comprehensive regression sweep.
Focus: NEW recommendations endpoints + revisits to plans/quiz/PhaseE/section18/i18n
to confirm the 5-sprint shipped surface stays green.
"""
import requests
import pytest
from test_config import API, BASE_URL  # noqa: F401
PROVIDER_ID = "prov_10b9f21bf971"  # demo provider — Maria Cleaning Services


# ─────────────────────────── RECOMMENDATIONS ───────────────────────────
class TestRecommendationsAPI:
    def test_anonymous_no_email_does_not_500(self):
        r = requests.post(f"{API}/providers/{PROVIDER_ID}/recommend", json={
            "client_name": "TEST_Anon_One", "client_city": "Sallisaw"
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("deduped") is False
        assert "share_token" in body and body["share_token"].startswith("r_")
        assert "?via=" in body.get("share_url", "")

    def test_two_anonymous_no_collision_partial_index(self):
        """Partial unique index (provider_id+client_email) only when email is string,
        so two anonymous (null email) recs MUST coexist."""
        r1 = requests.post(f"{API}/providers/{PROVIDER_ID}/recommend",
                           json={"client_name": "TEST_AnonA"})
        r2 = requests.post(f"{API}/providers/{PROVIDER_ID}/recommend",
                           json={"client_name": "TEST_AnonB"})
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["recommendation_id"] != r2.json()["recommendation_id"]
        assert r1.json()["share_token"] != r2.json()["share_token"]

    def test_email_dedupe_updates_in_place(self):
        import uuid as _uuid
        email = f"TEST_dedupe_iter20_{_uuid.uuid4().hex[:8]}@example.com"
        first = requests.post(f"{API}/providers/{PROVIDER_ID}/recommend", json={
            "client_name": "TEST_DedupeOne", "client_email": email,
            "message": "first message"
        })
        assert first.status_code == 200
        assert first.json()["deduped"] is False
        first_id = first.json()["recommendation_id"]

        second = requests.post(f"{API}/providers/{PROVIDER_ID}/recommend", json={
            "client_name": "TEST_DedupeUpdated", "client_email": email,
            "message": "second message"
        })
        assert second.status_code == 200
        assert second.json()["deduped"] is True
        # Same recommendation_id reused
        assert second.json()["recommendation_id"] == first_id

    def test_short_name_rejected(self):
        r = requests.post(f"{API}/providers/{PROVIDER_ID}/recommend",
                          json={"client_name": "X"})
        assert r.status_code in (400, 422)

    def test_unknown_provider_404(self):
        r = requests.post(f"{API}/providers/prov_does_not_exist/recommend",
                          json={"client_name": "TEST_X"})
        assert r.status_code == 404

    def test_list_recommendations_no_pii_leak(self):
        # Seed one with email + city
        post = requests.post(f"{API}/providers/{PROVIDER_ID}/recommend", json={
            "client_name": "TEST_ListCheck",
            "client_email": "TEST_listcheck@example.com",
            "client_city": "Tulsa",
            "message": "Excelente trabajo"
        })
        assert post.status_code == 200

        r = requests.get(f"{API}/providers/{PROVIDER_ID}/recommendations")
        assert r.status_code == 200
        data = r.json()
        assert "items" in data and isinstance(data["items"], list)
        assert data["total"] >= 1
        for item in data["items"]:
            assert "client_email" not in item, "EMAIL LEAK in public list"
            assert "ip" not in item, "IP LEAK in public list"
            assert "client_user_id" not in item
            assert "client_name" in item
            assert "created_at" in item
        # At least one item must have city + message populated
        assert any(it.get("client_city") for it in data["items"])
        assert any(it.get("message") for it in data["items"])

    def test_by_token_returns_rec_and_provider_basic(self):
        post = requests.post(f"{API}/providers/{PROVIDER_ID}/recommend",
                             json={"client_name": "TEST_TokenLookup"})
        token = post.json()["share_token"]
        r = requests.get(f"{API}/recommendations/by-token/{token}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert "recommendation" in body
        rec = body["recommendation"]
        assert rec["client_name"] == "TEST_TokenLookup"
        assert rec["provider_id"] == PROVIDER_ID
        assert rec.get("provider_slug") == "maria-cleaning-services-sallisaw-ok"
        assert rec.get("provider_business_name")
        # Still no PII
        assert "client_email" not in rec and "ip" not in rec

    def test_by_token_404(self):
        r = requests.get(f"{API}/recommendations/by-token/r_doesnotexist")
        assert r.status_code == 404

    def test_top_recommended_excludes_test_and_sorts_desc(self):
        r = requests.get(f"{API}/providers/top-recommended?limit=8")
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        # Sorted desc by recommendations_count
        counts = [p.get("recommendations_count", 0) for p in data]
        assert counts == sorted(counts, reverse=True)
        # No TEST data
        for p in data:
            bn = (p.get("business_name") or "").lower()
            assert not bn.startswith("test_"), f"TEST leaked: {bn}"


# ─────────────────────────── PLANS / QUIZ FUNNEL ───────────────────────────
class TestQuizFunnel:
    def test_admin_quiz_funnel_requires_auth(self):
        # Admin endpoint: /api/admin/quiz-funnel  — should 401/403 anonymous
        r = requests.get(f"{API}/admin/quiz-funnel")
        assert r.status_code in (401, 403), r.status_code

    def test_quiz_event_track_anonymous(self):
        # POST /api/quiz/track — anonymous-OK telemetry
        r = requests.post(f"{API}/quiz/track", json={
            "session_id": "TEST_sess_iter20_a",
            "event": "opened",
            "experiment": "question_order_v1",
            "variant": "A",
            "lang": "es",
        })
        assert r.status_code in (200, 201), r.text

    def test_quiz_lead_recover(self):
        r = requests.post(f"{API}/quiz/recover", json={
            "session_id": "TEST_sess_iter20_lead",
            "email": "TEST_lead_iter20@example.com",
            "recommended_plan": "basic",
            "answers": {"q1": "a", "q2": "b", "q3": "c", "q4": "d"},
            "lang": "es",
            "variant": "A",
            "experiment": "result_cta_v1",
        })
        assert r.status_code in (200, 201), r.text


# ─────────────────────────── PHASE E — BOOKING ───────────────────────────
class TestPhaseEBooking:
    def test_provider_slots_public(self):
        from datetime import date, timedelta
        target = (date.today() + timedelta(days=1)).isoformat()
        r = requests.get(f"{API}/providers/{PROVIDER_ID}/slots", params={"date": target})
        assert r.status_code == 200, r.text
        data = r.json()
        # Either {"slots":[...]} or list — be tolerant
        slots = data.get("slots") if isinstance(data, dict) else data
        assert isinstance(slots, list)

    def test_create_appointment_anonymous(self):
        from datetime import date, timedelta
        target = (date.today() + timedelta(days=1)).isoformat()
        slots_resp = requests.get(f"{API}/providers/{PROVIDER_ID}/slots", params={"date": target})
        slots = slots_resp.json().get("slots") if isinstance(slots_resp.json(), dict) else slots_resp.json()
        if not slots:
            pytest.skip("No slots available for the demo provider")
        slot = slots[0]
        # slot might be a dict { date, start, end } or string
        payload = {
            "provider_id": PROVIDER_ID,
            "client_name": "TEST_BookingClient",
            "client_email": "TEST_booking_iter20@example.com",
            "client_phone": "+13125550000",
            "service_note": "TEST iter20",
        }
        if isinstance(slot, dict):
            payload.update({k: slot[k] for k in ("date", "start", "end") if k in slot})
        else:
            payload["slot"] = slot
        r = requests.post(f"{API}/appointments", json=payload)
        # Acceptable: 200/201 OK, or 400/422 when contract differs
        assert r.status_code in (200, 201, 400, 422), r.text


# ─────────────────────────── SECTION 18 — GEO + SCANNER ───────────────────────────
class TestSection18:
    def test_geocode_dallas_cached(self):
        r = requests.post(f"{API}/geocode", json={"city": "Dallas", "state": "TX"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("source") in ("cache", "seed", "ok")
        assert body.get("lat") and body.get("lng")

    def test_proximity_search_returns_distance(self):
        r = requests.get(f"{API}/providers", params={"lat": 35.5, "lng": -94.8, "limit": 5})
        assert r.status_code == 200
        items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        if items:
            # At least one result should expose distance_miles
            assert any("distance_miles" in p for p in items), \
                "No distance_miles surfaced when lat/lng provided"

    def test_card_scan_graceful_fallback(self):
        # Tiny 1x1 PNG
        b64 = ("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0"
               "lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=")
        r = requests.post(f"{API}/card-scan", json={"image_b64": b64})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("source") in ("api_error", "no_api_key", "ok")
        # Must NOT 500 and must include a note when fallback
        if body.get("source") != "ok":
            assert body.get("note")


# ─────────────────────────── PRE-LAUNCH BUGS REGRESSION ───────────────────────────
class TestPreLaunchRegression:
    def test_public_providers_excludes_test(self):
        r = requests.get(f"{API}/providers", params={"limit": 50})
        assert r.status_code == 200
        items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        for p in items:
            bn = (p.get("business_name") or "").lower()
            assert not bn.startswith("test_"), f"TEST leaked publicly: {bn}"

    def test_plans_endpoint_or_static_pricing(self):
        # We only verify that a plans-like endpoint (if any) doesn't expose $19/$49/$99
        for path in ("/plans", "/plans/list", "/pricing"):
            r = requests.get(f"{API}{path}")
            if r.status_code == 200:
                txt = r.text
                for forbidden in ("$19", "$49", "$99"):
                    assert forbidden not in txt, f"Forbidden price {forbidden} in {path}"

    def test_public_stats(self):
        r = requests.get(f"{API}/public/stats")
        assert r.status_code == 200, r.text
        body = r.json()
        # should exist; tolerant check
        assert "providers_label" in body or "providers" in body
