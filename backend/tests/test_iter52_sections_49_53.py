"""Iteration 52 — Sections 49 (AI Banner), 50 (Verified Reviews), 51 (Chips),
52 (Gallery +tile), 53 (ServiceAreasInput). Backend coverage:
  - POST /api/providers/me/generate-banner  (Section 49)
  - POST /api/reviews  verified-detection branches  (Section 50)
  - GET  /api/providers/by-slug/{slug}  exposes verified/verification_source
"""
import time
import requests
import pytest
from tests.test_config import (
    API,
    PROVIDER_EMAIL,
    PROVIDER_PASSWORD,
    CLIENT_EMAIL,
    CLIENT_PASSWORD,
    EPHEMERAL_TEST_PASSWORD,
)

PROVIDER_ID = "prov_10b9f21bf971"
PROVIDER_SLUG = "maria-cleaning-services-sallisaw-ok"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    # Auth rate-limit can be 429; retry with backoff
    if r.status_code == 429:
        time.sleep(8)
        r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def provider_session():
    return _login(PROVIDER_EMAIL, PROVIDER_PASSWORD)


@pytest.fixture(scope="module")
def client_session():
    return _login(CLIENT_EMAIL, CLIENT_PASSWORD)


# ============ Section 49 — AI Banner Generator ============

class TestBannerGenerator:
    def test_banner_requires_auth(self):
        r = requests.post(f"{API}/providers/me/generate-banner",
                          json={"color": "#2F9D94", "style": "modern"}, timeout=20)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_banner_client_forbidden(self, client_session):
        r = client_session.post(f"{API}/providers/me/generate-banner",
                                json={"color": "#2F9D94", "style": "modern"}, timeout=20)
        assert r.status_code == 403, f"expected 403 for client, got {r.status_code}"

    def test_banner_invalid_style(self, provider_session):
        r = provider_session.post(f"{API}/providers/me/generate-banner",
                                  json={"color": "#2F9D94", "style": "INVALID"}, timeout=30)
        # Pydantic validation -> 422
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text[:200]}"

    def test_banner_generate_modern(self, provider_session):
        """Real AI call. gpt-image-1 may take 15-40s."""
        r = provider_session.post(
            f"{API}/providers/me/generate-banner",
            json={"color": "#2F9D94", "style": "modern", "keywords": None},
            timeout=120,
        )
        assert r.status_code == 200, f"banner gen failed: {r.status_code} {r.text[:400]}"
        data = r.json()
        assert "image_base64" in data
        assert isinstance(data["image_base64"], str)
        assert len(data["image_base64"]) > 1000, "image_base64 too short"
        assert data["mime"] == "image/png"
        assert data["style"] == "modern"
        assert data["color"] == "#2F9D94"
        assert "business_name" in data


# ============ Section 50 — Verified Reviews ============

class TestVerifiedReviews:
    @pytest.fixture
    def fresh_client(self):
        """Sign up a brand-new client so we don't collide with prior reviews."""
        s = requests.Session()
        suffix = str(int(time.time()))[-8:]
        email = f"TEST_iter52_{suffix}@getamano.com"
        password = EPHEMERAL_TEST_PASSWORD
        r = s.post(f"{API}/auth/register", json={
            "email": email, "password": password, "name": f"TEST Iter52 {suffix}", "role": "client"
        }, timeout=20)
        if r.status_code == 429:
            time.sleep(8)
            r = s.post(f"{API}/auth/register", json={
                "email": email, "password": password, "name": f"TEST Iter52 {suffix}", "role": "client"
            }, timeout=20)
        if r.status_code not in (200, 201):
            pytest.skip(f"register failed {r.status_code} {r.text[:200]}")
        # Some auth flows return token directly, others require login
        if r.status_code == 200 and "token" not in r.text and "session" not in r.text.lower():
            r2 = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
            assert r2.status_code == 200, r2.text
        yield s, email
        # cleanup any review made by this fresh client
        try:
            revs = requests.get(f"{API}/providers/by-slug/{PROVIDER_SLUG}", timeout=15).json().get("reviews", [])
            for rv in revs:
                if rv.get("user_name", "").startswith("TEST Iter52"):
                    # try to delete via authenticated user (if endpoint exists; tolerate failures)
                    s.delete(f"{API}/reviews/{rv.get('review_id')}", timeout=10)
        except Exception:
            pass

    def test_review_unverified_no_prior_interaction(self, fresh_client):
        s, email = fresh_client
        r = s.post(f"{API}/reviews", json={
            "provider_id": PROVIDER_ID,
            "rating": 5,
            "comment": "TEST_iter52 unverified review (no interaction)",
        }, timeout=20)
        assert r.status_code == 200, f"create review failed: {r.status_code} {r.text[:200]}"
        data = r.json()
        assert data["verified"] is False, f"expected verified=false, got {data['verified']}"
        assert data["verification_source"] is None, f"expected source=None, got {data['verification_source']}"
        # cleanup
        rid = data["review_id"]
        try:
            s.delete(f"{API}/reviews/{rid}", timeout=10)
        except Exception:
            pass

    def test_review_verified_via_service_request(self, fresh_client):
        s, email = fresh_client
        # Create service request to provider
        sr = s.post(f"{API}/service-requests", json={
            "provider_id": PROVIDER_ID,
            "service_summary": "TEST_iter52 service request for verified review test",
            "preferred_date": "",
            "preferred_time_window": "afternoon",
        }, timeout=20)
        # Tolerant of slight schema differences
        if sr.status_code not in (200, 201):
            # Try variations
            sr = s.post(f"{API}/service-requests", json={
                "provider_id": PROVIDER_ID,
                "summary": "TEST_iter52 service request for verified review test",
                "message": "TEST_iter52 service request for verified review test",
                "preferred_date": "",
                "preferred_time_window": "afternoon",
            }, timeout=20)
        assert sr.status_code in (200, 201), f"service request failed: {sr.status_code} {sr.text[:300]}"

        # Now post a review
        r = s.post(f"{API}/reviews", json={
            "provider_id": PROVIDER_ID,
            "rating": 5,
            "comment": "TEST_iter52 verified via service_request",
        }, timeout=20)
        assert r.status_code == 200, f"review failed: {r.status_code} {r.text[:200]}"
        data = r.json()
        assert data["verified"] is True, f"expected verified=True, got {data['verified']}"
        assert data["verification_source"] == "service_request", \
            f"expected source=service_request, got {data['verification_source']}"

        # cleanup
        rid = data["review_id"]
        try:
            s.delete(f"{API}/reviews/{rid}", timeout=10)
        except Exception:
            pass

    def test_by_slug_exposes_verified_fields(self):
        r = requests.get(f"{API}/providers/by-slug/{PROVIDER_SLUG}", timeout=15)
        assert r.status_code == 200, f"by-slug failed: {r.status_code} {r.text[:200]}"
        data = r.json()
        assert "reviews" in data, "reviews key missing"
        # Reviews array may be empty if all cleaned up; if non-empty, schema must include verified/source
        if data["reviews"]:
            sample = data["reviews"][0]
            assert "verified" in sample, f"review missing 'verified' key: {list(sample.keys())}"
            assert "verification_source" in sample, \
                f"review missing 'verification_source' key: {list(sample.keys())}"
