"""iter-27 May 22 audit fix verification tests."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://verified-providers-2.preview.emergentagent.com").rstrip("/")
PROVIDER_EMAIL = "demo.provider@getamano.com"
PROVIDER_PASSWORD = "provider123"


@pytest.fixture(scope="module")
def provider_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": PROVIDER_EMAIL, "password": PROVIDER_PASSWORD})
    assert r.status_code == 200, f"Provider login failed: {r.status_code} {r.text}"
    return s


# FIX-01 — public/stats returns real DB-driven values
class TestPublicStats:
    def test_public_stats_returns_real_values(self):
        r = requests.get(f"{BASE_URL}/api/public/stats")
        assert r.status_code == 200
        data = r.json()
        assert "providers" in data
        assert "providers_label" in data
        assert "states" in data
        assert "rating" in data
        assert data["providers"] == 1, f"Expected 1 real provider, got {data['providers']}"
        assert data["providers_label"] == "registered"
        assert data["states"] == 1
        assert data["rating"] == 4.9


# FIX-02 — /api/providers list returns only real, no test data
class TestProviderListClean:
    def test_no_test_providers_in_public_list(self):
        r = requests.get(f"{BASE_URL}/api/providers")
        assert r.status_code == 200
        providers = r.json()
        assert isinstance(providers, list)
        names = [p.get("business_name", "") for p in providers]
        forbidden = ["palas", "elyte ja", "jaz limoia", "TEST IT3 Biz"]
        for name in names:
            low = (name or "").lower()
            for bad in forbidden:
                assert bad.lower() not in low, f"Test provider '{name}' leaked into public list"
        # Real provider should be present
        assert any("maría" in n.lower() or "maria" in n.lower() for n in names), \
            f"Real provider María's Cleaning Services missing from list. Got: {names}"


# FIX-02 — validation on POST /api/providers
class TestProviderValidation:
    def _post(self, session, business_name, description=None):
        payload = {
            "business_name": business_name,
            "category_id": "cat_77f9e66f26",
            "city": "Sallisaw",
            "state": "OK",
        }
        if description:
            payload["description"] = description
        return session.post(f"{BASE_URL}/api/providers", json=payload)

    def test_empty_business_name_rejected(self, provider_session):
        r = self._post(provider_session, "")
        assert r.status_code == 400, f"Expected 400 for empty name, got {r.status_code}: {r.text}"
        assert "nombre" in r.text.lower() or "name" in r.text.lower() or "caracteres" in r.text.lower()

    def test_test_underscore_company_rejected(self, provider_session):
        r = self._post(provider_session, "test_company")
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"

    def test_asdf_rejected(self, provider_session):
        r = self._post(provider_session, "asdf")
        assert r.status_code == 400, f"Expected 400 for 'asdf', got {r.status_code}: {r.text}"

    def test_palas_lowercase_short_single_word_rejected(self, provider_session):
        r = self._post(provider_session, "palas")
        assert r.status_code == 400, f"Expected 400 for 'palas', got {r.status_code}: {r.text}"

    def test_valid_name_passes_added_validation(self, provider_session):
        # demo provider already has profile, so we may hit "profile already exists" (400)
        # but it should NOT hit the validation error we added (which has Spanish msg about nombre/mayúsculas).
        r = self._post(provider_session, "Acme Plumbing Services")
        # Either 400 "already exists" or success (200/201).
        if r.status_code == 400:
            body = r.text.lower()
            # must NOT be triggered by name validation
            assert "ya existe" in body or "already exists" in body or "exists" in body, \
                f"Valid name 'Acme Plumbing Services' wrongly rejected by validation: {r.text}"
        else:
            assert r.status_code in (200, 201)
