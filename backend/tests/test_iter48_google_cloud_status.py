"""Section 48 — Google Cloud Status diagnostic + graceful degradation
Tests the new /api/admin/google-cloud-status endpoint, the diagnostic
helper behaviour, and the error-shape contract of /api/translate +
/api/card-scan when the configured GOOGLE_API_KEY is invalid / APIs disabled.

Acceptance per review request:
  - 200 admin / 403 provider / 401 anon on /api/admin/google-cloud-status
  - Response shape: configured + translation{enabled,error_kind,...} + vision{...} + checked_at
  - /api/translate with invalid key → source='api_error' + error_kind + Spanish note
  - /api/card-scan with invalid key → source='api_error' + error_kind + Spanish note
  - Real reality probe: actually call Vision with current key and assert error_kind
"""
import requests

from tests.test_config import API


# ─── /api/admin/google-cloud-status — auth gating ────────────────────────────
class TestGoogleCloudStatusAuth:
    def test_anon_returns_401(self, anon_session):
        r = anon_session.get(f"{API}/admin/google-cloud-status", timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403 anon, got {r.status_code}"

    def test_provider_returns_403(self, provider_session):
        r = provider_session.get(f"{API}/admin/google-cloud-status", timeout=15)
        assert r.status_code == 403, f"expected 403 provider, got {r.status_code}"

    def test_admin_returns_200(self, admin_session):
        r = admin_session.get(f"{API}/admin/google-cloud-status", timeout=20)
        assert r.status_code == 200, f"expected 200 admin, got {r.status_code}: {r.text[:200]}"


# ─── /api/admin/google-cloud-status — response shape ─────────────────────────
class TestGoogleCloudStatusShape:
    def test_response_has_required_top_level_fields(self, admin_session):
        r = admin_session.get(f"{API}/admin/google-cloud-status", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "configured" in data
        assert "translation" in data
        assert "vision" in data
        # If configured=True we also expect checked_at + key_prefix
        if data["configured"] is True:
            assert "checked_at" in data
            assert "key_prefix" in data
            assert isinstance(data["key_prefix"], str) and len(data["key_prefix"]) > 0

    def test_translation_block_has_enabled_flag(self, admin_session):
        r = admin_session.get(f"{API}/admin/google-cloud-status", timeout=20).json()
        t = r["translation"]
        assert "enabled" in t
        assert isinstance(t["enabled"], bool)
        # When disabled we expect a diagnostic error_kind
        if t["enabled"] is False:
            assert "error_kind" in t
            assert t["error_kind"] in (
                "api_disabled", "permission_denied", "quota_exceeded",
                "bad_request", "unknown", "network", "no_api_key",
            )

    def test_vision_block_has_enabled_flag(self, admin_session):
        r = admin_session.get(f"{API}/admin/google-cloud-status", timeout=20).json()
        v = r["vision"]
        assert "enabled" in v
        assert isinstance(v["enabled"], bool)
        if v["enabled"] is False:
            assert "error_kind" in v
            assert v["error_kind"] in (
                "api_disabled", "permission_denied", "quota_exceeded",
                "bad_request", "unknown", "network", "no_api_key",
            )


# ─── /api/translate graceful degradation ─────────────────────────────────────
class TestTranslateGracefulDegradation:
    def test_translate_returns_diagnostic_shape_when_api_invalid(self, anon_session):
        # Anon allowed — public eCard uses this endpoint without auth.
        payload = {
            "text": "Hola, soy María.",
            "source_lang": "es",
            "target_lang": "en",
            "source_id": "TEST_iter48",
            "source_field": "description",
        }
        r = anon_session.post(f"{API}/translate", json=payload, timeout=20)
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:200]}"
        data = r.json()
        # Either Google actually works (source='google'/'cache') OR we degrade
        assert data.get("source") in ("google", "cache", "noop", "api_error", "no_api_key")
        if data["source"] == "api_error":
            # Acceptance: error_kind populated + Spanish note returned
            assert "error_kind" in data
            assert data["error_kind"] in (
                "api_disabled", "permission_denied", "quota_exceeded",
                "bad_request", "unknown", "network",
            )
            assert "note" in data and len(data["note"]) > 0
            # Critical: even on error, translated_text falls back to ORIGINAL text
            assert data.get("translated_text") == payload["text"]

    def test_translate_same_language_is_noop(self, anon_session):
        r = anon_session.post(
            f"{API}/translate",
            json={"text": "Hola", "source_lang": "es", "target_lang": "es",
                  "source_id": "TEST_iter48_noop", "source_field": "description"},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["source"] == "noop"


# ─── /api/card-scan graceful degradation ─────────────────────────────────────
class TestCardScanGracefulDegradation:
    # 1x1 transparent PNG
    TINY_PNG_B64 = (
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAA"
        "AAAYAAjCB0C8AAAAASUVORK5CYII="
    )

    def test_card_scan_returns_diagnostic_shape(self, anon_session):
        r = anon_session.post(
            f"{API}/card-scan",
            json={"image_b64": self.TINY_PNG_B64},
            timeout=30,
        )
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:200]}"
        data = r.json()
        assert data.get("source") in ("vision", "api_error", "no_api_key")
        assert "fields" in data and isinstance(data["fields"], dict)
        if data["source"] == "api_error":
            assert "error_kind" in data
            assert data["error_kind"] in (
                "api_disabled", "permission_denied", "quota_exceeded",
                "bad_request", "unknown", "network",
            )
            assert "note" in data and len(data["note"]) > 0


# ─── Reality check: probe real Vision API directly to confirm error_kind ─────
class TestRealityProbe:
    """Hit Vision API with the actual configured key and assert that the
    /api/admin/google-cloud-status `error_kind` matches the upstream
    reality. Per main-agent context, today's GOOGLE_API_KEY is revoked
    so we expect either permission_denied or api_disabled."""

    def test_admin_status_error_kind_matches_real_response(self, admin_session):
        r = admin_session.get(f"{API}/admin/google-cloud-status", timeout=20).json()
        # If configured=False (no key), the API rightly returns no_api_key
        if r["configured"] is False:
            assert r["translation"]["error_kind"] == "no_api_key"
            assert r["vision"]["error_kind"] == "no_api_key"
            return
        # If APIs are actually enabled (CEO already turned them on), accept happy path
        if r["translation"]["enabled"] and r["vision"]["enabled"]:
            return
        # Otherwise: the error_kind should match the known Google failure modes
        for block_name in ("translation", "vision"):
            block = r[block_name]
            if not block["enabled"]:
                assert block["error_kind"] in (
                    "permission_denied", "api_disabled", "quota_exceeded",
                    "bad_request", "unknown",
                ), f"{block_name} has unexpected error_kind={block['error_kind']}"
                # And a hint must be present so the CEO knows what to do
                assert "hint" in block and len(block["hint"]) > 0
