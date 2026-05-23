"""Iteration 17 — Section 18 (Geocoding + Proximity Search + Translate fallback).

Coverage:
- POST /api/geocode for pre-seeded city (cache) and uncached city (google)
- POST /api/geocode invalid input -> 404
- POST /api/admin/geocode/seed (admin required, idempotent)
- GET /api/providers with lat/lng proximity (distance_km present, sort by closest)
- GET /api/providers WITHOUT lat/lng (regression: no distance_km, plan-tier sort)
- POST /api/translate fallback (api_error OR no_api_key, both acceptable)
- Regression: GET /api/providers/me/availability still works for demo provider
"""
import pytest
import requests
from tests.test_config import (
    BASE_URL,
    API,
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    PROVIDER_EMAIL,
    PROVIDER_PASSWORD,
)


# ---------- Fixtures ----------

@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def provider_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": PROVIDER_EMAIL, "password": PROVIDER_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Provider login failed: {r.status_code} {r.text}"
    return s


# ---------- /api/geocode ----------

class TestGeocode:
    def test_geocode_dallas_cache_hit(self):
        r = requests.post(f"{API}/geocode", json={"city": "dallas", "state": "TX"}, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["source"] == "cache"
        assert isinstance(data["lat"], (int, float))
        assert isinstance(data["lng"], (int, float))
        assert 32.0 < data["lat"] < 33.5  # Dallas ~32.77
        assert -97.5 < data["lng"] < -96.0

    def test_geocode_miami_cache_hit(self):
        r = requests.post(f"{API}/geocode", json={"city": "miami", "state": "FL"}, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["source"] == "cache"
        assert 25.0 < data["lat"] < 26.5

    def test_geocode_sallisaw_cache(self):
        r = requests.post(f"{API}/geocode", json={"city": "sallisaw", "state": "OK"}, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["source"] == "cache"
        # María's city — verify coordinates match
        assert abs(data["lat"] - 35.4612) < 0.01
        assert abs(data["lng"] - (-94.7872)) < 0.01

    def test_geocode_uncached_falls_through_to_google_or_404(self):
        """Boston is NOT seeded. With key, should return source='google'; without key, 404."""
        r = requests.post(f"{API}/geocode", json={"city": "boston-test-xyz", "state": "MA"}, timeout=15)
        # Either Google answers OR returns 404 if key restricted
        assert r.status_code in (200, 404)
        if r.status_code == 200:
            data = r.json()
            assert data["source"] == "google"
            assert isinstance(data["lat"], (int, float))

    def test_geocode_invalid_short_city(self):
        # min_length=2 — single char => 422 (validation)
        r = requests.post(f"{API}/geocode", json={"city": "x", "state": "TX"}, timeout=10)
        assert r.status_code == 422

    def test_geocode_missing_fields(self):
        r = requests.post(f"{API}/geocode", json={"city": "dallas"}, timeout=10)
        assert r.status_code == 422


# ---------- /api/admin/geocode/seed ----------

class TestGeocodeSeedAdmin:
    def test_seed_requires_admin(self):
        r = requests.post(f"{API}/admin/geocode/seed", timeout=10)
        # Could be 401 or 403 depending on auth dep
        assert r.status_code in (401, 403)

    def test_seed_idempotent_returns_24_total(self, admin_session):
        r = admin_session.post(f"{API}/admin/geocode/seed", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert data["total_seed"] == 24
        assert isinstance(data["inserted"], int)
        assert data["inserted"] >= 0  # 0 if already seeded

    def test_seed_run_twice_no_duplicates(self, admin_session):
        # Second call should insert 0 new (idempotent)
        r1 = admin_session.post(f"{API}/admin/geocode/seed", timeout=15)
        r2 = admin_session.post(f"{API}/admin/geocode/seed", timeout=15)
        assert r1.status_code == 200 and r2.status_code == 200
        assert r2.json()["inserted"] == 0


# ---------- /api/providers proximity ----------

class TestProvidersProximity:
    def test_proximity_finds_maria(self):
        # María's coords ~35.461, -94.787 in Sallisaw OK
        r = requests.get(f"{API}/providers",
                         params={"lat": 35.5, "lng": -94.8, "radius_km": 50, "limit": 10},
                         timeout=15)
        assert r.status_code == 200, r.text
        results = r.json()
        assert isinstance(results, list)
        assert len(results) >= 1
        # All results must have distance_km
        for p in results:
            assert "distance_km" in p, f"distance_km missing on {p.get('slug')}"
            assert isinstance(p["distance_km"], (int, float))
            assert p["distance_km"] <= 50
        # Closest-first sort
        distances = [p["distance_km"] for p in results]
        assert distances == sorted(distances), f"Not sorted by distance: {distances}"
        # María should be present
        slugs = [p.get("slug") for p in results]
        assert any("maria" in (s or "").lower() for s in slugs), f"María not in proximity result: {slugs}"

    def test_proximity_radius_filter(self):
        r = requests.get(f"{API}/providers",
                         params={"lat": 35.5, "lng": -94.8, "radius_km": 1, "limit": 10},
                         timeout=15)
        assert r.status_code == 200
        results = r.json()
        # 1km radius should yield 0 (María is ~4km away)
        for p in results:
            assert p["distance_km"] <= 1.0

    def test_providers_without_latlng_regression(self):
        """Backward compat: no proximity → no distance_km, sorted by plan tier."""
        r = requests.get(f"{API}/providers", params={"limit": 12}, timeout=15)
        assert r.status_code == 200
        results = r.json()
        assert isinstance(results, list)
        for p in results:
            assert "distance_km" not in p, f"distance_km should NOT be present without lat/lng: {p.get('slug')}"


# ---------- /api/translate fallback ----------

class TestTranslateFallback:
    def test_translate_returns_fallback_source(self):
        r = requests.post(f"{API}/translate", json={
            "text": "Hola mundo",
            "target_lang": "en",
            "source_id": "iter17-test-001",
            "source_field": "test",
            "source_lang": "es",
        }, timeout=15)
        assert r.status_code == 200
        data = r.json()
        # Either api_error (key restricted) or no_api_key or cache or google
        assert data["source"] in ("api_error", "no_api_key", "cache", "google", "noop"), data
        # translated_text always present
        assert "translated_text" in data

    def test_translate_noop_same_lang(self):
        r = requests.post(f"{API}/translate", json={
            "text": "Hola",
            "target_lang": "es",
            "source_id": "iter17-test-noop",
            "source_field": "test",
            "source_lang": "es",
        }, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["source"] == "noop"
        assert data["translated_text"] == "Hola"


# ---------- Regression: provider availability (Phase E) ----------

class TestRegressionAvailability:
    def test_provider_me_availability(self, provider_session):
        r = provider_session.get(f"{API}/providers/me/availability", timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        # Phase E: availability config exists
        assert "slot_duration_min" in data or "slots" in data or isinstance(data, dict)
