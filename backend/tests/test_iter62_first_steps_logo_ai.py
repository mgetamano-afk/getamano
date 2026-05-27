"""Section 64 — First Steps onboarding panel backend tests.

Covers:
  F1. POST /api/providers/me/generate-logo  (auth=provider, rate-limit 10/day)
  F2. POST /api/providers/me/save-ai-image  (auth=provider, target=logo|banner)
  F3. Regression: /providers/me/generate-banner, /upload, PUT /providers/me

Notes:
  - AI image generation can take 10-30s. Tests use a generous timeout.
  - The save endpoint is fast (<2s). We POST a small valid PNG (base64) so
    that we don't depend on the AI generator success for storage testing.
"""
import base64
import io
import os
import time

import pytest
import requests

from tests.test_config import API


# tiny 1x1 transparent PNG (valid file)
_TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63N"
    "QAAAAASUVORK5CYII="
)
# Pad so > min_length=100 in pydantic
_VALID_PNG_B64 = _TINY_PNG_B64 + "A" * 200  # base64 padding extra; backend just decodes


def _decode_safe_png_b64() -> str:
    """Return a base64 string that:
       - is > 100 chars (pydantic min_length)
       - decodes to valid bytes (any bytes — backend only checks decode succeeds + size)
    """
    raw = base64.b64decode(_TINY_PNG_B64)
    # Repeat raw bytes to make it bigger than ~75 bytes but small
    big = raw * 10
    return base64.b64encode(big).decode()


# ---------------- F1 — generate-logo ----------------
class TestGenerateLogo:
    def test_unauthenticated_returns_401(self):
        r = requests.post(
            f"{API}/providers/me/generate-logo",
            json={"color": "#2F9D94", "style": "icon"},
            timeout=10,
        )
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}: {r.text[:200]}"

    def test_client_role_forbidden(self, client_session):
        r = client_session.post(
            f"{API}/providers/me/generate-logo",
            json={"color": "#2F9D94", "style": "icon"},
            timeout=15,
        )
        assert r.status_code == 403

    def test_invalid_style_rejected(self, provider_session):
        r = provider_session.post(
            f"{API}/providers/me/generate-logo",
            json={"color": "#2F9D94", "style": "rainbow"},
            timeout=15,
        )
        assert r.status_code == 422, f"expected 422 got {r.status_code}: {r.text[:200]}"

    def test_provider_generates_logo(self, provider_session):
        """Hit the AI endpoint with provider auth. AI can take ~20s.
        Accept 200 (success) or 502 (upstream AI provider failure).
        Skip on 429 (rate-limit hit from prior runs)."""
        r = provider_session.post(
            f"{API}/providers/me/generate-logo",
            json={"color": "#2F9D94", "style": "icon", "keywords": "cleaning sparkle"},
            timeout=60,
        )
        if r.status_code == 429:
            pytest.skip("rate-limit hit (10/day) — already exercised")
        if r.status_code == 502:
            pytest.skip(f"upstream AI provider returned 502: {r.text[:200]}")
        assert r.status_code == 200, f"unexpected {r.status_code}: {r.text[:300]}"
        data = r.json()
        assert "image_base64" in data and isinstance(data["image_base64"], str)
        assert len(data["image_base64"]) > 1000  # real image
        assert data.get("mime") == "image/png"
        assert data.get("style") == "icon"
        assert data.get("color") == "#2F9D94"
        # Verify base64 decodes
        try:
            raw = base64.b64decode(data["image_base64"])
            assert len(raw) > 1000
        except Exception as e:
            pytest.fail(f"image_base64 not valid b64: {e}")


# ---------------- F2 — save-ai-image ----------------
class TestSaveAiImage:
    def test_unauthenticated_returns_401(self):
        r = requests.post(
            f"{API}/providers/me/save-ai-image",
            json={"image_base64": _decode_safe_png_b64(), "mime": "image/png", "target": "logo"},
            timeout=10,
        )
        assert r.status_code in (401, 403)

    def test_client_role_forbidden(self, client_session):
        r = client_session.post(
            f"{API}/providers/me/save-ai-image",
            json={"image_base64": _decode_safe_png_b64(), "mime": "image/png", "target": "logo"},
            timeout=15,
        )
        assert r.status_code == 403

    def test_invalid_target_rejected(self, provider_session):
        r = provider_session.post(
            f"{API}/providers/me/save-ai-image",
            json={"image_base64": _decode_safe_png_b64(), "mime": "image/png", "target": "cover"},
            timeout=15,
        )
        assert r.status_code == 422

    def test_invalid_base64_rejected(self, provider_session):
        r = provider_session.post(
            f"{API}/providers/me/save-ai-image",
            json={"image_base64": "!!!not-base64!!!" + "x" * 200, "mime": "image/png", "target": "logo"},
            timeout=15,
        )
        # Either Pydantic 422 (min_length) or backend 400 (invalid b64). Accept either.
        assert r.status_code in (400, 422), f"expected 400/422 got {r.status_code}"

    def test_save_logo_assigns_logo_url(self, provider_session):
        # First snapshot the current logo_url
        prev = provider_session.get(f"{API}/providers/me", timeout=15)
        assert prev.status_code == 200
        prev_logo = prev.json().get("logo_url")

        r = provider_session.post(
            f"{API}/providers/me/save-ai-image",
            json={"image_base64": _decode_safe_png_b64(), "mime": "image/png", "target": "logo"},
            timeout=30,
        )
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:300]}"
        data = r.json()
        assert "url" in data and data["url"].startswith("/api/files/")
        assert "file_id" in data and len(data["file_id"]) > 10
        assert data.get("target") == "logo"

        # Verify profile was updated
        nxt = provider_session.get(f"{API}/providers/me", timeout=15)
        assert nxt.status_code == 200
        assert nxt.json().get("logo_url") == data["url"]

        # Restore previous logo to avoid disturbing dependent tests / demo data
        if prev_logo and prev_logo != data["url"]:
            provider_session.put(
                f"{API}/providers/me",
                json={"logo_url": prev_logo},
                timeout=15,
            )

    def test_save_banner_assigns_banner_url(self, provider_session):
        prev = provider_session.get(f"{API}/providers/me", timeout=15)
        prev_banner = prev.json().get("banner_url")

        r = provider_session.post(
            f"{API}/providers/me/save-ai-image",
            json={"image_base64": _decode_safe_png_b64(), "mime": "image/png", "target": "banner"},
            timeout=30,
        )
        assert r.status_code == 200
        data = r.json()
        assert data.get("target") == "banner"
        assert data["url"].startswith("/api/files/")

        nxt = provider_session.get(f"{API}/providers/me", timeout=15).json()
        assert nxt.get("banner_url") == data["url"]

        if prev_banner and prev_banner != data["url"]:
            provider_session.put(
                f"{API}/providers/me",
                json={"banner_url": prev_banner},
                timeout=15,
            )


# ---------------- F3 — regressions ----------------
class TestRegressionExistingEndpoints:
    def test_generate_banner_still_works(self, provider_session):
        r = provider_session.post(
            f"{API}/providers/me/generate-banner",
            json={"color": "#2F9D94", "style": "modern", "keywords": "professional"},
            timeout=60,
        )
        if r.status_code == 429:
            pytest.skip("rate-limit hit on generate-banner (5/day)")
        if r.status_code == 502:
            pytest.skip(f"upstream AI provider 502: {r.text[:200]}")
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:300]}"
        d = r.json()
        assert "image_base64" in d and len(d["image_base64"]) > 1000

    def test_upload_multipart_works(self, provider_session):
        png_bytes = base64.b64decode(_TINY_PNG_B64)
        files = {"file": ("tiny.png", io.BytesIO(png_bytes), "image/png")}
        # The /upload endpoint may require special handling — drop Content-Type so requests sets boundary
        s = provider_session
        # Temporarily strip JSON content-type
        ct = s.headers.pop("Content-Type", None)
        try:
            r = s.post(f"{API}/upload", files=files, timeout=30)
        finally:
            if ct:
                s.headers["Content-Type"] = ct
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:300]}"
        data = r.json()
        assert "url" in data
        assert data["url"].startswith("/api/files/") or data["url"].startswith("http")

    def test_put_providers_me_partial_logo_url_known_bug(self, provider_session):
        """BUG: ProviderProfileIn requires business_name + category_id (no defaults).
        Sending only {logo_url} returns 422 — this BREAKS the MediaChooser Upload
        mode flow which does PUT /providers/me with only {logo_url} after /upload."""
        r = provider_session.put(f"{API}/providers/me", json={"logo_url": "/api/files/test.png"}, timeout=15)
        # Documenting the bug — currently returns 422.
        assert r.status_code == 422, f"expected 422 (bug), got {r.status_code}"

    def test_put_providers_me_with_required_fields(self, provider_session):
        """When required fields are also sent, PUT succeeds."""
        prev = provider_session.get(f"{API}/providers/me", timeout=15).json()
        payload = {
            "business_name": prev.get("business_name") or "Maria",
            "category_id": prev.get("category_id") or "",
            "logo_url": prev.get("logo_url") or "",
        }
        r = provider_session.put(f"{API}/providers/me", json=payload, timeout=15)
        assert r.status_code == 200


# ---------------- Regression — Section 61/62 ----------------
class TestPreviousRegressions:
    def test_services_slug_redirects_or_resolves(self):
        # /services/:slug should resolve to provider on the API by-slug lookup
        r = requests.get(f"{API}/providers/by-slug/maria-cleaning-services-sallisaw-ok", timeout=15)
        assert r.status_code == 200
        assert r.json().get("slug") == "maria-cleaning-services-sallisaw-ok"

    def test_share_url_format_is_p_slug(self):
        # eCard share URL should be /p/{slug} (front-end concern, but verify slug field exists)
        r = requests.get(f"{API}/providers/by-slug/maria-cleaning-services-sallisaw-ok", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d.get("slug"), "provider must expose slug for /p/{slug} share URL"
