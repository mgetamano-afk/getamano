"""
Iteration 19 — Tests for new backend features:
  (1) POST /api/translate (TTL cache write) — no 500
  (2) POST /api/card-scan (graceful Vision API fallback) — never 500
  (3) translation_cache TTL index expires_at_1 / expireAfterSeconds=0
  (4) Regression: /api/providers excludes TEST; /api/public/stats has providers_label
"""
import os
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://verified-providers-2.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ------- Translate TTL cache write -------
class TestTranslateTTL:
    def test_translate_no_500(self, api):
        r = api.post(
            f"{BASE_URL}/api/translate",
            json={
                "text": "test ttl",
                "source_lang": "es",
                "target_lang": "en",
                "source_id": "ttl_test",
                "source_field": "x",
            },
        )
        assert r.status_code != 500, f"500 received: {r.text}"
        # accept 200 even when source=api_error (graceful)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        body = r.json()
        # The endpoint should return translated_text + source
        assert "source" in body, f"source missing: {body}"

    def test_ttl_index_exists(self):
        client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=4000)
        db = client[DB_NAME]
        if "translation_cache" not in db.list_collection_names():
            pytest.skip("translation_cache collection not present")
        idx = db.translation_cache.index_information()
        # expected: expires_at_1 with TTL=0
        ttl_idx = idx.get("expires_at_1")
        assert ttl_idx is not None, f"expires_at_1 not found. Got: {list(idx.keys())}"
        assert ttl_idx.get("expireAfterSeconds") == 0, f"expireAfterSeconds!=0: {ttl_idx}"


# ------- Card scan endpoint -------
class TestCardScan:
    def test_card_scan_no_500(self, api):
        # 1x1 transparent PNG b64
        png_b64 = (
            "data:image/png;base64,"
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgAAIAAAUAAeImBZsAAAAASUVORK5CYII="
        )
        r = api.post(f"{BASE_URL}/api/card-scan", json={"image_b64": png_b64})
        assert r.status_code != 500, f"500 received: {r.text}"
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        body = r.json()
        assert "source" in body, f"missing 'source' key in response: {body}"
        # Acceptable sources per spec: no_api_key, api_error, ok
        assert body["source"] in ("no_api_key", "api_error", "ok"), f"unexpected source: {body['source']}"
        # Should include a note for graceful fallback (when not ok)
        if body["source"] in ("no_api_key", "api_error"):
            assert "note" in body, "graceful response should include 'note'"

    def test_card_scan_empty_b64(self, api):
        # The endpoint should not crash even if image_b64 missing/empty
        r = api.post(f"{BASE_URL}/api/card-scan", json={"image_b64": ""})
        assert r.status_code != 500, f"500 with empty b64: {r.text}"
        # 200 with error source, or 400 are both acceptable graceful behavior
        assert r.status_code in (200, 400, 422), f"unexpected status: {r.status_code} {r.text}"


# ------- Regression -------
class TestRegression:
    def test_public_providers_excludes_test(self, api):
        r = api.get(f"{BASE_URL}/api/providers")
        assert r.status_code == 200
        data = r.json()
        rows = data if isinstance(data, list) else (data.get("items") or data.get("providers") or [])
        for p in rows:
            assert p.get("is_test") is not True, f"TEST provider leaked: {p.get('business_name')}"

    def test_public_stats_has_providers_label(self, api):
        r = api.get(f"{BASE_URL}/api/public/stats")
        assert r.status_code == 200
        body = r.json()
        assert "providers_label" in body, f"providers_label missing: {body}"
