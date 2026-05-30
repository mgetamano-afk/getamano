"""
Iteration 44 — Regression suite for backend refactor.

Coverage:
  - Search router (extracted): /api/providers + /api/search/autocomplete + /api/search/alternatives
  - Jobs router  (extracted): /api/gigs CRUD + /api/me/gigs + /api/me/gig-applications
  - SEO   router (extracted): /api/seo/* + /api/sitemap.xml + /api/robots.txt
  - Auth refactor: get_current_user / _extract_session_token / _user_id_from_jwt / _user_id_from_emergent_session
  - Forgot/Reset password regression.

Demo seed (from /app/memory/test_credentials.md):
  admin@getamano.com / admin123
  demo.provider@getamano.com / provider123  (slug: maria-cleaning-services-sallisaw-ok)
  demo.client@getamano.com / client123
"""
from __future__ import annotations

import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend env file (testing host)
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except FileNotFoundError:
        pass
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

CLIENT_CRED = {"email": "demo.client@getamano.com", "password": "client123"}
PROVIDER_CRED = {"email": "demo.provider@getamano.com", "password": "provider123"}

TIMEOUT = 30


# ─── Fixtures ───────────────────────────────────────────────────────────
@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def _login(s, cred):
    r = s.post(f"{BASE_URL}/api/auth/login", json=cred, timeout=TIMEOUT)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:300]}"
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="session")
def client_token(s):
    return _login(s, CLIENT_CRED)


@pytest.fixture(scope="session")
def provider_token(s):
    return _login(s, PROVIDER_CRED)


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


# ─── 1. Search router (refactored) ──────────────────────────────────────
class TestSearchProviders:
    def test_no_filters(self, s):
        r = s.get(f"{BASE_URL}/api/providers", timeout=TIMEOUT)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) > 0, "expected seeded providers"
        # Validate shape: category dict hydrated
        first = data[0]
        assert "business_name" in first
        assert "category" in first  # _attach_categories
        # No mongo _id leakage
        assert "_id" not in first

    def test_filter_category_cleaning(self, s):
        r = s.get(f"{BASE_URL}/api/providers?category=cleaning", timeout=TIMEOUT)
        assert r.status_code == 200
        data = r.json()
        # all results should be cleaning category
        for p in data:
            cat = p.get("category") or {}
            assert (cat.get("slug") == "cleaning") or (cat is None), \
                f"non-cleaning slug: {cat.get('slug')}"

    def test_text_query_english(self, s):
        r = s.get(f"{BASE_URL}/api/providers?q=Cleaning", timeout=TIMEOUT)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_text_query_synonym_limpeza(self, s):
        # Portuguese synonym for limpieza/cleaning — exercises expand_query
        r = s.get(f"{BASE_URL}/api/providers?q=limpeza", timeout=TIMEOUT)
        assert r.status_code == 200
        # Should still find Maria cleaning services
        slugs = [p.get("slug") for p in r.json()]
        assert any("cleaning" in (slug or "") or "maria" in (slug or "") for slug in slugs), \
            f"synonym expansion missed maria; got {slugs[:5]}"

    def test_verified_and_language(self, s):
        r = s.get(f"{BASE_URL}/api/providers?verified=true&language=es", timeout=TIMEOUT)
        assert r.status_code == 200
        for p in r.json():
            assert p.get("verification_status") == "approved"
            assert "es" in (p.get("languages") or [])

    def test_proximity_search(self, s):
        # 35.45, -94.78 ≈ Sallisaw OK; radius_km=200
        r = s.get(
            f"{BASE_URL}/api/providers?lat=35.45&lng=-94.78&radius_km=200",
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        data = r.json()
        assert len(data) > 0
        for p in data:
            assert "distance_km" in p, "proximity search must annotate distance_km"
            assert "distance_miles" in p, "proximity search must annotate distance_miles"
            assert p["distance_km"] <= 200.01
        # Verify sorted ascending by distance
        dists = [p["distance_km"] for p in data]
        assert dists == sorted(dists), f"proximity not sorted: {dists[:5]}"

    def test_has_video_filter(self, s):
        r = s.get(f"{BASE_URL}/api/providers?has_video=true", timeout=TIMEOUT)
        assert r.status_code == 200
        for p in r.json():
            assert p.get("video_url"), "has_video=true returned provider without video_url"

    def test_owner_identity_latino(self, s):
        r = s.get(f"{BASE_URL}/api/providers?owner_identity=latino", timeout=TIMEOUT)
        assert r.status_code == 200
        for p in r.json():
            assert p.get("owner_identity") == "latino"


class TestSearchAutocomplete:
    def test_autocomplete_clean(self, s):
        r = s.get(f"{BASE_URL}/api/search/autocomplete?q=clean", timeout=TIMEOUT)
        assert r.status_code == 200
        body = r.json()
        assert body.get("q") == "clean"
        assert isinstance(body.get("matches"), list)
        # Should map to limpieza canonical and include slug
        slugs = [m.get("slug") for m in body["matches"] if m.get("slug")]
        assert any(s == "cleaning" for s in slugs), f"expected cleaning slug in matches: {body['matches'][:6]}"

    def test_alternatives_unknown(self, s):
        r = s.get(f"{BASE_URL}/api/search/alternatives?q=xyzfoo123", timeout=TIMEOUT)
        assert r.status_code == 200
        body = r.json()
        assert body.get("q") == "xyzfoo123"
        assert isinstance(body.get("alternatives"), list)


# ─── 2. Jobs / Gigs router (refactored) ─────────────────────────────────
class TestGigsCRUD:
    @pytest.fixture(scope="class")
    def created_gig_id(self, s, client_token):
        payload = {
            "title": f"TEST_ Reparación de electricidad {uuid.uuid4().hex[:6]}",
            "description": "Necesito un electricista certificado para revisar el cableado completo de la casa.",
            "category": "Limpieza",
            "city": "Sallisaw",
            "state": "OK",
            "budget_min": 100,
            "budget_max": 400,
        }
        r = s.post(f"{BASE_URL}/api/gigs", json=payload, headers=_bearer(client_token), timeout=TIMEOUT)
        assert r.status_code == 200, f"gig create failed: {r.status_code} {r.text[:300]}"
        data = r.json()
        assert "gig_id" in data
        assert data["status"] == "open"
        assert "_id" not in data
        assert "expires_at_native" not in data
        yield data["gig_id"]
        # Cleanup: close
        s.post(f"{BASE_URL}/api/gigs/{data['gig_id']}/close",
               headers=_bearer(client_token), timeout=TIMEOUT)

    def test_list_gigs(self, s):
        r = s.get(f"{BASE_URL}/api/gigs?limit=5", timeout=TIMEOUT)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) <= 5

    def test_list_gigs_filtered(self, s):
        r = s.get(f"{BASE_URL}/api/gigs?city=Sallisaw&state=OK", timeout=TIMEOUT)
        assert r.status_code == 200

    def test_get_gig_404(self, s):
        r = s.get(f"{BASE_URL}/api/gigs/nonexistent_gigid_xxx", timeout=TIMEOUT)
        assert r.status_code == 404

    def test_get_gig_detail_anonymises(self, s, created_gig_id):
        r = s.get(f"{BASE_URL}/api/gigs/{created_gig_id}", timeout=TIMEOUT)
        assert r.status_code == 200
        data = r.json()
        assert data["gig_id"] == created_gig_id
        # Posted-by display is anonymised (first name only)
        assert "posted_by_display" in data or "posted_by_name" in data
        if "posted_by_display" in data:
            assert " " not in data["posted_by_display"].strip(), \
                f"posted_by_display should be first name only: {data['posted_by_display']}"
        assert "applicant_count" in data

    def test_create_gig_title_too_short(self, s, client_token):
        r = s.post(
            f"{BASE_URL}/api/gigs",
            json={"title": "Hola", "description": "x" * 30, "category": "Limpieza"},
            headers=_bearer(client_token),
            timeout=TIMEOUT,
        )
        assert r.status_code == 400
        assert "6 caracteres" in r.text or "título" in r.text.lower()

    def test_apply_rejects_client(self, s, client_token, created_gig_id):
        r = s.post(
            f"{BASE_URL}/api/gigs/{created_gig_id}/apply",
            json={"message": "x" * 30},
            headers=_bearer(client_token),
            timeout=TIMEOUT,
        )
        assert r.status_code == 403

    def test_apply_message_too_short(self, s, provider_token, created_gig_id):
        r = s.post(
            f"{BASE_URL}/api/gigs/{created_gig_id}/apply",
            json={"message": "hola"},
            headers=_bearer(provider_token),
            timeout=TIMEOUT,
        )
        assert r.status_code == 400
        assert "20" in r.text

    def test_apply_provider_success(self, s, provider_token, created_gig_id):
        r = s.post(
            f"{BASE_URL}/api/gigs/{created_gig_id}/apply",
            json={"message": "Tengo 5 años de experiencia y puedo empezar mañana mismo.",
                  "proposed_price": 250},
            headers=_bearer(provider_token),
            timeout=TIMEOUT,
        )
        # 200 first time, 400 duplicate if test reran
        assert r.status_code in (200, 400), f"{r.status_code} {r.text[:200]}"
        if r.status_code == 200:
            assert r.json().get("ok") is True

    def test_me_gigs(self, s, client_token):
        r = s.get(f"{BASE_URL}/api/me/gigs", headers=_bearer(client_token), timeout=TIMEOUT)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_me_gig_applications(self, s, provider_token):
        r = s.get(f"{BASE_URL}/api/me/gig-applications", headers=_bearer(provider_token), timeout=TIMEOUT)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_close_gig_owner_only(self, s, provider_token, created_gig_id):
        # provider is not owner → 403
        r = s.post(f"{BASE_URL}/api/gigs/{created_gig_id}/close",
                   headers=_bearer(provider_token), timeout=TIMEOUT)
        assert r.status_code == 403

    def test_close_gig_owner_success(self, s, client_token):
        # Create a throwaway gig and close it
        payload = {
            "title": f"TEST_ Cerrar pronto {uuid.uuid4().hex[:6]}",
            "description": "Esta chamba será cerrada por el dueño en la prueba.",
            "category": "Limpieza",
        }
        c = s.post(f"{BASE_URL}/api/gigs", json=payload, headers=_bearer(client_token), timeout=TIMEOUT)
        assert c.status_code == 200
        gid = c.json()["gig_id"]
        r = s.post(f"{BASE_URL}/api/gigs/{gid}/close",
                   headers=_bearer(client_token), timeout=TIMEOUT)
        assert r.status_code == 200
        assert r.json().get("ok") is True


# ─── 3. SEO router (refactored) ─────────────────────────────────────────
class TestSEO:
    def test_seo_cities(self, s):
        r = s.get(f"{BASE_URL}/api/seo/cities", timeout=TIMEOUT)
        assert r.status_code == 200
        body = r.json()
        assert "items" in body and len(body["items"]) > 0
        for item in body["items"]:
            assert "slug" in item and "providers_count" in item

    def test_seo_sectors(self, s):
        r = s.get(f"{BASE_URL}/api/seo/sectors", timeout=TIMEOUT)
        assert r.status_code == 200
        body = r.json()
        assert "sectors" in body and len(body["sectors"]) > 0

    def test_seo_city_sallisaw(self, s):
        r = s.get(f"{BASE_URL}/api/seo/city/sallisaw", timeout=TIMEOUT)
        assert r.status_code == 200
        body = r.json()
        assert body["city"]["slug"] == "sallisaw"
        assert "categories" in body

    def test_seo_city_404(self, s):
        r = s.get(f"{BASE_URL}/api/seo/city/atlantis", timeout=TIMEOUT)
        assert r.status_code == 404

    def test_seo_category_cleaning(self, s):
        r = s.get(f"{BASE_URL}/api/seo/category/cleaning", timeout=TIMEOUT)
        assert r.status_code == 200
        body = r.json()
        assert body["category"]["slug"] == "cleaning"
        assert "cities" in body

    def test_seo_page_cleaning_sallisaw(self, s):
        r = s.get(f"{BASE_URL}/api/seo/page/cleaning/sallisaw", timeout=TIMEOUT)
        assert r.status_code == 200
        body = r.json()
        assert body["category"]["slug"] == "cleaning"
        assert body["city"]["slug"] == "sallisaw"
        assert "providers" in body
        assert "related_cities" in body and len(body["related_cities"]) > 0
        assert "related_categories" in body

    def test_seo_content_cleaning_sallisaw(self, s):
        r = s.get(f"{BASE_URL}/api/seo/content/cleaning/sallisaw", timeout=TIMEOUT)
        assert r.status_code == 200
        body = r.json()
        assert body.get("content") and len(body["content"]) > 20
        assert "generated_at" in body

    def test_sitemap_xml(self, s):
        r = s.get(f"{BASE_URL}/api/sitemap.xml", timeout=TIMEOUT)
        assert r.status_code == 200
        assert "application/xml" in r.headers.get("content-type", "")
        assert "<urlset" in r.text
        assert "<loc>" in r.text
        assert len(r.text) > 1000

    def test_robots_txt(self, s):
        r = s.get(f"{BASE_URL}/api/robots.txt", timeout=TIMEOUT)
        assert r.status_code == 200
        assert "User-agent: *" in r.text
        assert "Sitemap:" in r.text


# ─── 4. Auth refactor: get_current_user paths ───────────────────────────
class TestAuthRefactor:
    def test_login_and_me_bearer(self, client_token):
        # Use a fresh request (no shared cookies) to confirm Bearer path resolves user.
        # NOTE: _extract_session_token prioritises cookie over Bearer; if both are
        # present, the cookie wins. That is intentional/pre-existing behaviour.
        r = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers=_bearer(client_token),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        body = r.json()
        assert body.get("email") == CLIENT_CRED["email"]

    def test_me_no_token_401(self, s):
        # Fresh session, no Authorization header
        fresh = requests.Session()
        r = fresh.get(f"{BASE_URL}/api/auth/me", timeout=TIMEOUT)
        assert r.status_code == 401

    def test_me_invalid_token_401(self, s):
        r = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": "Bearer this.is.not.a.valid.jwt.token"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 401

    def test_me_via_cookie(self, s):
        # Verify _extract_session_token cookie branch works too
        fresh = requests.Session()
        login = fresh.post(f"{BASE_URL}/api/auth/login", json=CLIENT_CRED, timeout=TIMEOUT)
        if login.status_code == 429:
            pytest.skip("login rate-limited; cookie path already exercised by login fixture")
        assert login.status_code == 200
        # Login should set session_token cookie
        if "session_token" in fresh.cookies:
            r = fresh.get(f"{BASE_URL}/api/auth/me", timeout=TIMEOUT)
            assert r.status_code == 200, f"cookie auth failed: {r.status_code} {r.text[:200]}"
            assert r.json().get("email") == CLIENT_CRED["email"]
        else:
            pytest.skip("session_token cookie not set by login (likely SameSite/secure on test host)")


# ─── 5. Forgot / Reset password regression ─────────────────────────────
class TestPasswordReset:
    def test_forgot_password_known_email(self, s):
        r = s.post(
            f"{BASE_URL}/api/auth/forgot-password",
            json={"email": CLIENT_CRED["email"]},
            timeout=TIMEOUT,
        )
        # 200 first time, 429 if rate-limited from a previous run — both prove the endpoint is live.
        assert r.status_code in (200, 429), f"unexpected {r.status_code} {r.text[:200]}"

    def test_forgot_password_unknown_email(self, s):
        r = s.post(
            f"{BASE_URL}/api/auth/forgot-password",
            json={"email": f"nonexistent_{uuid.uuid4().hex[:8]}@example.com"},
            timeout=TIMEOUT,
        )
        assert r.status_code in (200, 429)

    def test_reset_password_invalid_token(self, s):
        r = s.post(
            f"{BASE_URL}/api/auth/reset-password",
            json={"token": "invalid_token_xxx", "new_password": "Newpass!234"},
            timeout=TIMEOUT,
        )
        assert r.status_code in (400, 401, 404, 422)
