"""
Iteration 68 — Section 65 (Dynamic OG image PNG/SVG/HTML) + Stories/Banners refactor regression + Push endpoints.

Covers:
 - GET /api/og-image/verified-providers-2.png (PNG 1200x630, exists & non-existing slug both 200)
 - GET /api/og-image/verified-providers-2.svg (svg fallback)
 - GET /api/og/p/{slug} returns HTML with og:image -> .png (PNG-first)
 - WhatsApp UA still gets OG-rich HTML
 - Stories refactor (routes/stories.py): /api/stories/active, /api/stories/by-provider, POST, DELETE
 - Banners refactor (routes/banners.py): /api/banners/public, /api/banners/banner-of-the-week, POST publish (auth)
 - Push: /api/push/public-key (no auth), /api/push/subscribe (auth) writes to MongoDB
 - Auth: provider login works (JWT issued)
 - General endpoints still up: /api/providers, /api/categories, /api/follows/me/feed (auth)
"""

import io
import os
import re
import struct
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
PROVIDER_SLUG = "maria-cleaning-services-sallisaw-ok"
NONEXISTENT_SLUG = "this-slug-does-not-exist-xyz-12345"


# ----------------- helpers -----------------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def provider_token(session):
    r = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "demo.provider@getamano.com", "password": "provider123"},
    )
    assert r.status_code == 200, f"login failed {r.status_code}: {r.text[:300]}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    if not tok:
        pytest.skip("no token returned from login")
    return tok


@pytest.fixture(scope="module")
def auth_headers(provider_token):
    return {"Authorization": f"Bearer {provider_token}"}


def _png_dims(content: bytes):
    # PNG signature 8 bytes + IHDR
    assert content[:8] == b"\x89PNG\r\n\x1a\n", "not a PNG signature"
    # IHDR starts at byte 8 (length=13), then 'IHDR', then 4-byte width, 4-byte height
    width = struct.unpack(">I", content[16:20])[0]
    height = struct.unpack(">I", content[20:24])[0]
    return width, height


# ----------------- Section 65: OG dynamic -----------------
class TestSection65OG:
    def test_og_png_existing_slug(self, session):
        r = session.get(f"{BASE_URL}/api/og-image/{PROVIDER_SLUG}.png", timeout=30)
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:200]}"
        ct = r.headers.get("content-type", "")
        assert "image/png" in ct, f"content-type={ct}"
        assert len(r.content) > 5000, f"png too small: {len(r.content)} bytes"
        w, h = _png_dims(r.content)
        assert (w, h) == (1200, 630), f"dims {w}x{h} != 1200x630"

    def test_og_png_nonexistent_slug_still_200(self, session):
        r = session.get(f"{BASE_URL}/api/og-image/{NONEXISTENT_SLUG}.png", timeout=30)
        # Spec: both must return 200 (fallback)
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:200]}"
        assert "image/png" in r.headers.get("content-type", "")

    def test_og_svg_fallback(self, session):
        r = session.get(f"{BASE_URL}/api/og-image/{PROVIDER_SLUG}.svg", timeout=15)
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:200]}"
        assert "image/svg" in r.headers.get("content-type", "")
        assert b"<svg" in r.content[:500]

    def test_og_html_uses_png(self, session):
        r = session.get(f"{BASE_URL}/api/og/p/{PROVIDER_SLUG}", timeout=15)
        assert r.status_code == 200
        html = r.text
        # og:image must point to .png
        m = re.search(r'<meta\s+property=["\']og:image["\']\s+content=["\']([^"\']+)["\']', html, re.I)
        assert m, "no og:image meta tag"
        og_url = m.group(1)
        assert og_url.endswith(".png"), f"og:image not .png: {og_url}"
        # og:image:type should be image/png
        assert re.search(r'og:image:type["\']\s+content=["\']image/png["\']', html, re.I), \
            "og:image:type=image/png missing"

    def test_og_html_whatsapp_ua(self, session):
        r = session.get(
            f"{BASE_URL}/api/og/p/{PROVIDER_SLUG}",
            headers={"User-Agent": "WhatsApp/2.0"},
            timeout=15,
        )
        assert r.status_code == 200
        assert "og:image" in r.text
        assert "og:title" in r.text


# ----------------- Stories refactor regression -----------------
class TestStoriesRefactor:
    def test_active_public(self, session):
        r = session.get(f"{BASE_URL}/api/stories/active", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) or isinstance(data, dict)

    def test_by_provider_public(self, session):
        # use demo provider id from creds memory
        r = session.get(f"{BASE_URL}/api/stories/by-provider/user_3e47ee2b3526", timeout=15)
        assert r.status_code in (200, 404)

    def test_post_requires_auth(self, session):
        r = requests.post(f"{BASE_URL}/api/stories", json={"media_url": "x"}, timeout=10)
        assert r.status_code in (401, 403, 422), f"got {r.status_code}"

    def test_delete_requires_auth(self, session):
        r = requests.delete(f"{BASE_URL}/api/stories/nonexistent", timeout=10)
        assert r.status_code in (401, 403, 404), f"got {r.status_code}"


# ----------------- Banners refactor regression -----------------
class TestBannersRefactor:
    def test_public(self, session):
        r = session.get(f"{BASE_URL}/api/banners/public", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), (list, dict))

    def test_banner_of_the_week(self, session):
        r = session.get(f"{BASE_URL}/api/banners/banner-of-the-week", timeout=15)
        assert r.status_code in (200, 204), f"got {r.status_code}"

    def test_publish_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/banners/publish", json={}, timeout=10)
        assert r.status_code in (401, 403), f"got {r.status_code}: {r.text[:200]}"


# ----------------- Push endpoints -----------------
class TestPush:
    def test_public_key_no_auth(self, session):
        r = session.get(f"{BASE_URL}/api/push/public-key", timeout=10)
        assert r.status_code == 200
        data = r.json()
        key = data.get("public_key") or data.get("publicKey")
        assert key and len(key) >= 80, f"public_key length={len(key) if key else 0}"

    def test_subscribe_requires_auth(self):
        r = requests.post(
            f"{BASE_URL}/api/push/subscribe",
            json={"endpoint": "https://fcm.googleapis.com/x", "keys": {"p256dh": "k", "auth": "a"}},
            timeout=10,
        )
        assert r.status_code in (401, 403), f"got {r.status_code}"

    def test_subscribe_with_auth(self, session, auth_headers):
        payload = {
            "endpoint": "https://fcm.googleapis.com/fcm/send/TEST_iter68_endpoint",
            "keys": {"p256dh": "TEST_p256dh_key_iter68", "auth": "TEST_auth_iter68"},
        }
        r = session.post(
            f"{BASE_URL}/api/push/subscribe", json=payload, headers=auth_headers, timeout=10
        )
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:200]}"
        body = r.json()
        assert body.get("ok") is True, f"body={body}"


# ----------------- Auth & general regression -----------------
class TestGeneralRegression:
    def test_login(self, session):
        r = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo.provider@getamano.com", "password": "provider123"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data.get("access_token") or data.get("token")

    def test_providers(self, session):
        r = session.get(f"{BASE_URL}/api/providers", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), (list, dict))

    def test_categories(self, session):
        r = session.get(f"{BASE_URL}/api/categories", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), (list, dict))

    def test_follows_feed_auth(self, session, auth_headers):
        r = session.get(f"{BASE_URL}/api/follows/me/feed", headers=auth_headers, timeout=15)
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:200]}"
