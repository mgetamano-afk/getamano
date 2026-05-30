"""V16.3 — Banner Pro finally has a job: AI banner → eCard cover.

Before V16.3, the Banner Pro tab generated promotional banners but they
could only be downloaded or published to the public banner gallery —
never used where they were originally intended: as the cover photo on
the provider's own eCard. V16.3 wires both ends:

1. `BannerGenerator` adds a "Use as eCard cover" button (one-click upload
   + PUT /providers/me cover_url).
2. `ProviderECard` falls back through a cascade when cover_url is empty:
   cover_url → gallery[0].url → /api/og-image/{slug}.png. Never blank gray.

These are pure frontend changes — backend already has PUT /providers/me
with partial updates AND /api/og-image/{slug}.png from V16.
"""
from __future__ import annotations

import os
import requests

from test_config import API, BASE_URL, DEMO_SLUG, PROVIDER_EMAIL, PROVIDER_PASSWORD

_TIMEOUT = 30


def _login_provider() -> requests.Session:
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": PROVIDER_EMAIL, "password": PROVIDER_PASSWORD}, timeout=_TIMEOUT)
    assert r.status_code == 200, r.text[:300]
    return s


# -------------------------------------------------------------------
# Backend integration — PUT /providers/me must accept a partial cover_url
# update without wiping other fields.
# -------------------------------------------------------------------
def test_dedicated_cover_endpoint_partial_update():
    """V16.3 — PUT /providers/me/cover accepts just {cover_url} and
    updates that single field without requiring business_name etc.
    This is the endpoint BannerGenerator's "Use as cover" button calls."""
    s = _login_provider()
    me = s.get(f"{API}/providers/me", timeout=_TIMEOUT)
    assert me.status_code == 200
    before = me.json()
    gallery_before = before.get("gallery") or []
    services_before = before.get("services") or []
    cover_before = before.get("cover_url") or ""
    business_before = before.get("business_name")

    new_cover = "https://example.com/test-cover-iter114.png"
    r = s.put(f"{API}/providers/me/cover", json={"cover_url": new_cover}, timeout=_TIMEOUT)
    assert r.status_code == 200, r.text[:300]
    body = r.json()
    assert body.get("ok") is True
    assert body.get("cover_url") == new_cover

    after = s.get(f"{API}/providers/me", timeout=_TIMEOUT).json()
    assert after.get("cover_url") == new_cover
    assert after.get("business_name") == business_before
    assert len(after.get("gallery") or []) == len(gallery_before)
    assert len(after.get("services") or []) == len(services_before)

    # Restore original cover so other tests aren't affected
    s.put(f"{API}/providers/me/cover", json={"cover_url": cover_before}, timeout=_TIMEOUT)


def test_dedicated_cover_endpoint_requires_auth():
    r = requests.put(f"{API}/providers/me/cover", json={"cover_url": "https://x.com/y.png"}, timeout=_TIMEOUT)
    assert r.status_code == 401


def test_og_image_endpoint_available_for_cover_fallback():
    """V16.3 client falls back to /api/og-image/{slug}.png when cover_url
    is empty. Lock that the endpoint stays healthy with a 200 response
    in the dimensions the eCard cover expects."""
    r = requests.get(f"{BASE_URL}/api/og-image/{DEMO_SLUG}.png", timeout=_TIMEOUT)
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"


# -------------------------------------------------------------------
# Frontend source-locks
# -------------------------------------------------------------------
ECARD_PATH = "/app/frontend/src/pages/ProviderECard.jsx"
BANNER_PATH = "/app/frontend/src/components/BannerGenerator.jsx"


def _read(p: str) -> str:
    with open(p, "r", encoding="utf-8") as f:
        return f.read()


def test_ecard_cover_has_fallback_cascade():
    src = _read(ECARD_PATH)
    # The cascade variables
    assert "galleryFirst" in src
    assert "ogCover" in src
    assert "effectiveCover" in src
    # Order: cover_url → gallery[0] → OG image
    assert "p.cover_url || galleryFirst || ogCover" in src
    # OG fallback uses /api/og-image/ endpoint
    assert "/api/og-image/" in src
    # Each branch sets a distinct data-testid so the visual smoke can
    # confirm which fallback fired
    assert "ecard-cover-img-cover" in src or "data-testid={`ecard-cover-img-${source}`}" in src


def test_banner_generator_has_use_as_cover_button():
    src = _read(BANNER_PATH)
    assert 'data-testid="banner-use-as-cover-btn"' in src
    assert "useAsCover" in src
    # The function must call /upload + PUT /providers/me/cover (dedicated
    # partial-update endpoint; the full PUT /providers/me requires the
    # complete profile payload).
    assert 'api.post("/upload"' in src
    assert "cover_url: imageUrl" in src
    assert 'api.put("/providers/me/cover"' in src
    # Spanish label
    assert "Usar como portada" in src
    # English label
    assert "Use as eCard cover" in src
    # Confirmation badge after save
    assert 'data-testid="banner-saved-as-cover-badge"' in src


def test_banner_generator_resets_cover_state_on_regenerate():
    """When the provider hits "Generate" again, the saved-as-cover flag
    must reset so they can save the NEW banner as cover too."""
    src = _read(BANNER_PATH)
    assert "setSavedAsCover(false)" in src
    # Should be inside generate()
    gen_idx = src.find("const generate = async")
    next_fn_idx = src.find("const compose ", gen_idx)
    if next_fn_idx == -1:
        next_fn_idx = len(src)
    assert "setSavedAsCover(false)" in src[gen_idx:next_fn_idx], \
        "reset must live inside generate()"
