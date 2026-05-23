"""Section 27 — Smart Search (synonyms + fuzzy + bilingual) backend tests."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to frontend/.env at runtime
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass

assert BASE_URL, "REACT_APP_BACKEND_URL not set"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def _get(s, path, **params):
    # naive throttle to avoid rate limiter bursts
    time.sleep(0.15)
    return s.get(f"{BASE_URL}{path}", params=params, timeout=15)


# ─── /api/search/autocomplete ───
class TestAutocomplete:
    def test_limpesa_returns_limpieza_cleaning(self, s):
        r = _get(s, "/api/search/autocomplete", q="limpesa")
        assert r.status_code == 200, r.text
        data = r.json()
        labels = [m["label"] for m in data["matches"]]
        slugs = [m.get("slug") for m in data["matches"]]
        assert "Limpieza" in labels, f"Expected 'Limpieza' in {labels}"
        # category slug should be 'cleaning' for at least one match
        assert "cleaning" in slugs, f"Expected cleaning slug in {slugs}"

    def test_plumer_returns_plomeria(self, s):
        r = _get(s, "/api/search/autocomplete", q="plumer")
        assert r.status_code == 200
        labels = [m["label"] for m in r.json()["matches"]]
        assert "Plomería" in labels, f"Expected Plomería in {labels}"

    def test_tax_returns_impuestos(self, s):
        r = _get(s, "/api/search/autocomplete", q="tax")
        assert r.status_code == 200
        labels = [m["label"] for m in r.json()["matches"]]
        assert "Preparación de impuestos" in labels, f"Got {labels}"

    def test_quinceanera_ascii_returns_match(self, s):
        r = _get(s, "/api/search/autocomplete", q="quinceanera")
        assert r.status_code == 200
        labels = [m["label"] for m in r.json()["matches"]]
        assert "Quinceañeras" in labels, f"Got {labels}"

    def test_single_char_returns_empty(self, s):
        r = _get(s, "/api/search/autocomplete", q="a")
        assert r.status_code == 200
        assert r.json()["matches"] == []

    def test_unknown_token_returns_empty_no_500(self, s):
        r = _get(s, "/api/search/autocomplete", q="xyzzy12345")
        assert r.status_code == 200
        assert r.json()["matches"] == []

    def test_empty_q_returns_empty(self, s):
        r = _get(s, "/api/search/autocomplete", q="")
        assert r.status_code == 200
        assert r.json()["matches"] == []

    def test_special_chars_no_500(self, s):
        # Regex meta-characters should be safely escaped
        for q in ["(", "*", ".*", "++", "$$$", "[abc"]:
            r = _get(s, "/api/search/autocomplete", q=q)
            assert r.status_code == 200, f"{q!r} → {r.status_code} {r.text}"

    def test_response_shape(self, s):
        r = _get(s, "/api/search/autocomplete", q="cleaning")
        data = r.json()
        assert "q" in data and "matches" in data
        assert isinstance(data["matches"], list)
        for m in data["matches"]:
            assert "label" in m
            assert "label_en" in m
            assert "slug" in m  # may be None


# ─── /api/search/alternatives ───
class TestAlternatives:
    def test_quinceniera_suggests_quinceaneras(self, s):
        r = _get(s, "/api/search/alternatives", q="quinceniera")
        assert r.status_code == 200
        alts = r.json()["alternatives"]
        assert "Quinceañeras" in alts, f"Got {alts}"

    def test_unknown_returns_empty_or_list(self, s):
        r = _get(s, "/api/search/alternatives", q="xyzzy12345")
        assert r.status_code == 200
        assert isinstance(r.json()["alternatives"], list)

    def test_empty_q_safe(self, s):
        r = _get(s, "/api/search/alternatives", q="")
        assert r.status_code == 200
        assert r.json()["alternatives"] == []


# ─── /api/providers smart expansion ───
class TestProvidersSmartExpansion:
    def test_limpesa_finds_maria_cleaning(self, s):
        r = _get(s, "/api/providers", q="limpesa")
        assert r.status_code == 200, r.text
        provs = r.json()
        names = [p.get("business_name", "") for p in provs]
        joined = " | ".join(names).lower()
        assert "maria" in joined or "cleaning" in joined or "limpieza" in joined, (
            f"Expected María's Cleaning in {names}"
        )

    def test_plumer_no_500(self, s):
        r = _get(s, "/api/providers", q="plumer")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_special_chars_in_q_no_500(self, s):
        for q in ["(", "*", ".*", "[abc", "++"]:
            r = _get(s, "/api/providers", q=q)
            assert r.status_code == 200, f"{q!r} → {r.status_code} {r.text}"
