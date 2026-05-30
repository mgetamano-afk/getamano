"""
Iteration 100 — V10 verify-badge swap + V9 Parts 4A/4B audit.

Validates:
  · The 4 verify-badge PNG variants exist and are non-empty.
  · VerifiedBadge.jsx renders the new artwork variants by size.
  · The V10 prompt's i18n tooltip + code prop are wired.
  · Backend community POST still allows normal (non-provider) users
    to publish, fulfilling V9 Parts 4A/4B without extra work.
"""
import os
import sys

import requests

sys.path.insert(0, os.path.dirname(__file__))
from tests.test_config import API  # noqa: E402


PUBLIC = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "public")


def _read(rel_path: str) -> str:
    full = os.path.join(os.path.dirname(__file__), "..", "..", rel_path)
    with open(full, encoding="utf-8") as f:
        return f.read()


# ─── Asset files exist ────────────────────────────────────────────
def test_verify_badge_master_exists():
    p = os.path.join(PUBLIC, "verify-badge.png")
    assert os.path.exists(p) and os.path.getsize(p) > 1000


def test_verify_badge_64_exists():
    p = os.path.join(PUBLIC, "verify-badge-64.png")
    assert os.path.exists(p) and os.path.getsize(p) > 500


def test_verify_badge_128_exists():
    p = os.path.join(PUBLIC, "verify-badge-128.png")
    assert os.path.exists(p) and os.path.getsize(p) > 1000


def test_verify_badge_256_exists():
    p = os.path.join(PUBLIC, "verify-badge-256.png")
    assert os.path.exists(p) and os.path.getsize(p) > 5000


# ─── VerifiedBadge.jsx V10 wiring ─────────────────────────────────
def test_verified_badge_component_v10_props():
    src = _read("frontend/src/components/VerifiedBadge.jsx")
    # i18n-aware alt text reads tx_lang
    assert 'tx_lang' in src
    # New props: code (GM-XXXX) + darkBg (Reels)
    assert 'code' in src
    assert 'darkBg' in src
    # Tooltip composes "Verificado por getamano · GM-XXXX" using ${code}
    assert '${code}' in src or "${altBase}" in src
    # Asset paths still point at the pre-rendered sizes
    assert "/verify-badge-${srcVariant}.png" in src


def test_reels_uses_dark_bg_badge():
    src = _read("frontend/src/pages/ReelsPage.jsx")
    # Reels overlay should pass darkBg to keep the badge visible on video.
    assert "darkBg" in src


# ─── V9 4A/4B — Composer accepts non-provider users ──────────────
def test_community_create_post_open_to_clients(client_session):
    r = client_session.post(
        f"{API}/community/posts",
        json={"content": "Hola Barrio — V10 audit · iter100 ✅ "},
        timeout=10,
    )
    assert r.status_code in (200, 201), r.text
    body = r.json()
    pid = body.get("post_id") or body.get("id")
    assert pid, body
    # Cleanup
    client_session.delete(f"{API}/community/posts/{pid}", timeout=10)


def test_community_composer_not_gated_to_providers():
    """Frontend composer must allow any logged-in user (V9 Part 4A)."""
    src = _read("frontend/src/pages/ComunidadPage.jsx")
    # No 'provider only' gate in NewPostBox
    assert "is_provider" not in src.split("function NewPostBox")[1].split("return (")[0]


# ─── Backend health smoke ────────────────────────────────────────
def test_backend_root_responds():
    r = requests.get(f"{API}/categories", timeout=10)
    assert r.status_code == 200
