"""Section 64 (iter 63) — FIX VERIFICATION for MediaChooser Upload-mode.

New endpoint:  POST /api/providers/me/upload-asset
  - multipart fields:  file (UploadFile, image only, ≤10MB)
                       target (Form: 'logo' | 'banner')
  - auth: provider
  - returns: {url, file_id, target}
  - side-effect: saves to storage AND updates provider profile in ONE round-trip
    (no PUT /providers/me required).

Also regresses:
  * F1 generate-logo + F2 save-ai-image (iter 62)
  * /providers/by-slug, share URL slug field
"""
import base64
import io

import pytest
import requests

from tests.test_config import API


# Tiny but valid 1x1 PNG bytes (encoded once)
_TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63N"
    "QAAAAASUVORK5CYII="
)
_TINY_PNG = base64.b64decode(_TINY_PNG_B64)


# Helper to build a multipart file payload
def _png_files(name="TEST_logo.png", content_type="image/png"):
    return {"file": (name, io.BytesIO(_TINY_PNG), content_type)}


def _strip_json_ct(session):
    """requests.Session() with multipart needs no 'Content-Type' header so that
    requests can set the boundary automatically."""
    return session.headers.pop("Content-Type", None)


def _restore_ct(session, ct):
    if ct:
        session.headers["Content-Type"] = ct


# ============= POST /providers/me/upload-asset =============

class TestUploadAssetAuthAndRole:
    def test_unauthenticated_returns_401_or_403(self):
        s = requests.Session()
        r = s.post(
            f"{API}/providers/me/upload-asset",
            files=_png_files(),
            data={"target": "logo"},
            timeout=15,
        )
        assert r.status_code in (401, 403), f"got {r.status_code}: {r.text[:200]}"

    def test_client_role_forbidden(self, client_session):
        ct = _strip_json_ct(client_session)
        try:
            r = client_session.post(
                f"{API}/providers/me/upload-asset",
                files=_png_files(),
                data={"target": "logo"},
                timeout=15,
            )
        finally:
            _restore_ct(client_session, ct)
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text[:200]}"


class TestUploadAssetValidation:
    def test_non_image_rejected(self, provider_session):
        ct = _strip_json_ct(provider_session)
        try:
            files = {"file": ("TEST.txt", io.BytesIO(b"hello plaintext"), "text/plain")}
            r = provider_session.post(
                f"{API}/providers/me/upload-asset",
                files=files,
                data={"target": "logo"},
                timeout=15,
            )
        finally:
            _restore_ct(provider_session, ct)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:200]}"

    def test_invalid_target_rejected(self, provider_session):
        ct = _strip_json_ct(provider_session)
        try:
            r = provider_session.post(
                f"{API}/providers/me/upload-asset",
                files=_png_files(),
                data={"target": "cover"},  # only logo|banner allowed
                timeout=15,
            )
        finally:
            _restore_ct(provider_session, ct)
        # Literal validation -> 422
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text[:200]}"

    def test_oversize_rejected(self, provider_session):
        """Send a >10MB payload — should 400/413."""
        ct = _strip_json_ct(provider_session)
        big_blob = b"\x89PNG\r\n\x1a\n" + (b"x" * (11 * 1024 * 1024))  # 11MB w/ PNG magic
        try:
            files = {"file": ("TEST_big.png", io.BytesIO(big_blob), "image/png")}
            r = provider_session.post(
                f"{API}/providers/me/upload-asset",
                files=files,
                data={"target": "logo"},
                timeout=60,
            )
        finally:
            _restore_ct(provider_session, ct)
        # 400 (manual size check) or 413 (server-level) acceptable
        assert r.status_code in (400, 413), f"expected 400/413, got {r.status_code}: {r.text[:200]}"


class TestUploadAssetHappyPath:
    """The core fix: a single multipart POST persists file + updates provider
    profile in one round-trip — no PUT /providers/me needed (which used to 422)."""

    def test_upload_logo_updates_profile(self, provider_session):
        # Snapshot existing logo to restore later
        prev = provider_session.get(f"{API}/providers/me", timeout=15)
        assert prev.status_code == 200
        prev_logo = prev.json().get("logo_url")

        ct = _strip_json_ct(provider_session)
        try:
            r = provider_session.post(
                f"{API}/providers/me/upload-asset",
                files=_png_files(name="TEST_iter63_logo.png"),
                data={"target": "logo"},
                timeout=30,
            )
        finally:
            _restore_ct(provider_session, ct)

        assert r.status_code == 200, f"got {r.status_code}: {r.text[:300]}"
        data = r.json()
        # Response shape
        assert "url" in data and data["url"].startswith("/api/files/"), data
        assert "file_id" in data and len(data["file_id"]) > 10
        assert data.get("target") == "logo"

        # Profile MUST be updated in the SAME round-trip (the fix!)
        nxt = provider_session.get(f"{API}/providers/me", timeout=15)
        assert nxt.status_code == 200
        assert nxt.json().get("logo_url") == data["url"], (
            f"logo_url not updated! returned={data['url']} but profile has "
            f"{nxt.json().get('logo_url')}"
        )

        # Cleanup — restore previous logo
        if prev_logo and prev_logo != data["url"]:
            ct2 = _strip_json_ct(provider_session)
            try:
                # use PUT with all required fields
                full = provider_session.get(f"{API}/providers/me", timeout=15).json()
                payload = {
                    "business_name": full.get("business_name") or "Maria",
                    "category_id": full.get("category_id") or "",
                    "logo_url": prev_logo,
                }
                provider_session.headers["Content-Type"] = "application/json"
                provider_session.put(f"{API}/providers/me", json=payload, timeout=15)
            finally:
                _restore_ct(provider_session, ct2)

    def test_upload_banner_updates_profile(self, provider_session):
        prev = provider_session.get(f"{API}/providers/me", timeout=15)
        prev_banner = prev.json().get("banner_url")

        ct = _strip_json_ct(provider_session)
        try:
            r = provider_session.post(
                f"{API}/providers/me/upload-asset",
                files=_png_files(name="TEST_iter63_banner.png"),
                data={"target": "banner"},
                timeout=30,
            )
        finally:
            _restore_ct(provider_session, ct)

        assert r.status_code == 200, f"got {r.status_code}: {r.text[:300]}"
        data = r.json()
        assert data.get("target") == "banner"
        assert data["url"].startswith("/api/files/")

        nxt = provider_session.get(f"{API}/providers/me", timeout=15).json()
        assert nxt.get("banner_url") == data["url"]

        # Cleanup
        if prev_banner and prev_banner != data["url"]:
            ct2 = _strip_json_ct(provider_session)
            try:
                full = provider_session.get(f"{API}/providers/me", timeout=15).json()
                payload = {
                    "business_name": full.get("business_name") or "Maria",
                    "category_id": full.get("category_id") or "",
                    "banner_url": prev_banner,
                }
                provider_session.headers["Content-Type"] = "application/json"
                provider_session.put(f"{API}/providers/me", json=payload, timeout=15)
            finally:
                _restore_ct(provider_session, ct2)

    def test_uploaded_file_is_fetchable(self, provider_session):
        """The returned url must serve the uploaded asset."""
        ct = _strip_json_ct(provider_session)
        try:
            r = provider_session.post(
                f"{API}/providers/me/upload-asset",
                files=_png_files(name="TEST_iter63_fetch.png"),
                data={"target": "logo"},
                timeout=30,
            )
        finally:
            _restore_ct(provider_session, ct)
        assert r.status_code == 200
        url = r.json()["url"]
        # absolute URL needed for /api/files/...
        base = API.rsplit("/api", 1)[0]
        g = requests.get(f"{base}{url}", timeout=20)
        assert g.status_code == 200, f"fetch returned {g.status_code} for {url}"
        # Should look like image bytes
        assert len(g.content) > 0
        assert g.headers.get("content-type", "").startswith("image/") or g.headers.get("content-type", "").startswith("application/")


# ============= Regressions =============

class TestRegressionFirstSteps:
    def test_generate_logo_still_works(self, provider_session):
        r = provider_session.post(
            f"{API}/providers/me/generate-logo",
            json={"color": "#2F9D94", "style": "icon"},
            timeout=60,
        )
        if r.status_code == 429:
            pytest.skip("rate-limit hit on /generate-logo (10/day) — already exercised")
        if r.status_code == 502:
            pytest.skip(f"upstream AI provider 502: {r.text[:200]}")
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:300]}"
        d = r.json()
        assert "image_base64" in d and len(d["image_base64"]) > 1000

    def test_save_ai_image_still_works(self, provider_session):
        # Use a real-ish PNG payload (encode our tiny png * 10 to make it >100 chars)
        big = base64.b64encode(_TINY_PNG * 10).decode()
        r = provider_session.post(
            f"{API}/providers/me/save-ai-image",
            json={"image_base64": big, "mime": "image/png", "target": "logo"},
            timeout=30,
        )
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:300]}"
        d = r.json()
        assert d.get("target") == "logo"
        assert d["url"].startswith("/api/files/")
        assert "file_id" in d


class TestRegressionShareUrl:
    def test_provider_by_slug_returns_slug(self):
        r = requests.get(
            f"{API}/providers/by-slug/maria-cleaning-services-sallisaw-ok",
            timeout=15,
        )
        assert r.status_code == 200
        d = r.json()
        assert d.get("slug") == "maria-cleaning-services-sallisaw-ok"
