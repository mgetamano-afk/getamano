"""V18.4 / V18.5 / V18.6 — Pause overlay, self-reshare, external share.

V18.4 — Premium pause overlay with backdrop-blur + giant Play button.
V18.5 — Self-reshare allowed (founder: "cualquier persona incluso quien
        posteó el reel" can re-share).
V18.6 — External native-feeling share to FB/X/WhatsApp/IG/TikTok.
        New backend endpoint `/api/og/reel/{reel_id}` returns SSR HTML
        with og:image=thumbnail so crawlers render rich previews.
"""
from __future__ import annotations

import os
import time
import requests
from datetime import datetime, timezone

from test_config import API, BASE_URL, PROVIDER_EMAIL, PROVIDER_PASSWORD, CLIENT_EMAIL, CLIENT_PASSWORD

_TIMEOUT = 30


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=_TIMEOUT)
    assert r.status_code == 200, r.text[:300]
    return s


def _read(p):
    with open(p, "r", encoding="utf-8") as f:
        return f.read()


def _ensure_reel(reel_id: str, user_id: str = "user_3e47ee2b3526") -> None:
    """Upsert an isolated test reel so each test runs deterministically."""
    from pymongo import MongoClient
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")
    cli = MongoClient(mongo_url)
    db = cli[db_name]
    db.reels.update_one(
        {"reel_id": reel_id},
        {"$set": {
            "reel_id": reel_id,
            "user_id": user_id,
            "provider_user_id": user_id,
            "video_url": "/api/files/test.mp4",
            "thumbnail_url": "/api/files/test.jpg",
            "caption": f"V18.6 share test {reel_id[-6:]}",
            "business_name": "Maria's Cleaning Services",
            "provider_slug": "maria-cleaning-services-sallisaw-ok",
            "duration_s": 32,
            "likes_count": 0, "wows_count": 0, "saves_count": 0,
            "shares_count": 0, "comments_count": 0, "reshares_count": 0,
            "views_count": 0, "plays_count": 0,
            "milestones": [],
            "is_public": True, "is_deleted": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    cli.close()


# -------------------------------------------------------------------
# V18.5 — Self-reshare is allowed now
# -------------------------------------------------------------------
def test_self_reshare_no_longer_rejected():
    """V18.5 — The owner can reshare their own reel. Idempotent on
    second call (deduped=True)."""
    reel_id = "reel_v18_self_reshare"
    _ensure_reel(reel_id)
    provider = _login(PROVIDER_EMAIL, PROVIDER_PASSWORD)

    # Cleanup any prior state
    provider.delete(f"{API}/reels/{reel_id}/reshare", timeout=_TIMEOUT)

    r1 = provider.post(f"{API}/reels/{reel_id}/reshare", json={}, timeout=_TIMEOUT)
    assert r1.status_code == 200, r1.text[:300]
    body1 = r1.json()
    assert body1.get("ok") is True
    assert body1.get("deduped") is False

    # Idempotent
    r2 = provider.post(f"{API}/reels/{reel_id}/reshare", json={}, timeout=_TIMEOUT)
    assert r2.status_code == 200
    assert r2.json().get("deduped") is True

    # Cleanup
    provider.delete(f"{API}/reels/{reel_id}/reshare", timeout=_TIMEOUT)


# -------------------------------------------------------------------
# V18.6 — Reel OG endpoint (native preview for FB/X/WhatsApp/IG)
# -------------------------------------------------------------------
def test_reel_og_endpoint_returns_rich_meta_tags():
    """V18.6 — /api/og/reel/{id} returns HTML with og:title, og:image,
    og:description, twitter:card. Crawlers see this without auth."""
    reel_id = "reel_v18_og_test"
    _ensure_reel(reel_id)
    r = requests.get(f"{BASE_URL}/api/og/reel/{reel_id}", timeout=_TIMEOUT)
    assert r.status_code == 200
    body = r.text
    # OG tags present
    assert 'property="og:title"' in body
    assert 'property="og:image"' in body
    assert 'property="og:description"' in body
    assert 'property="og:type" content="video.other"' in body
    # Twitter card
    assert 'name="twitter:card" content="summary_large_image"' in body
    # Canonical points at the SPA reel route
    assert f"/reels?r={reel_id}" in body
    # Cache-control set at the app layer. We hit the backend directly to
    # bypass the Cloudflare preview proxy which strips cache headers on
    # the dev origin (the deployed prod ingress keeps them intact).
    direct = requests.get(f"http://localhost:8001/api/og/reel/{reel_id}", timeout=_TIMEOUT)
    assert "max-age=3600" in (direct.headers.get("cache-control") or "")
    # Human redirect via meta-refresh + JS
    assert "http-equiv=\"refresh\"" in body
    assert "window.location.replace" in body


def test_reel_og_endpoint_uses_thumbnail_when_present():
    """The og:image should be the reel's actual thumbnail. The endpoint
    rewrites a leading-slash thumbnail_url to a full public URL."""
    reel_id = "reel_v18_og_thumb"
    _ensure_reel(reel_id)
    r = requests.get(f"{BASE_URL}/api/og/reel/{reel_id}", timeout=_TIMEOUT)
    body = r.text
    # Either the seeded value or its rewritten absolute form must appear
    assert "/api/files/test.jpg" in body or "test.jpg" in body


def test_reel_og_endpoint_404_for_unknown_reel_returns_fallback_html():
    """Unknown reel ids return 404 BUT with a graceful HTML body — the
    crawler still gets readable OG tags so the link doesn't look broken."""
    r = requests.get(f"{BASE_URL}/api/og/reel/this-reel-does-not-exist", timeout=_TIMEOUT)
    assert r.status_code == 404
    body = r.text
    assert "Reel no disponible" in body or "og:title" in body


# -------------------------------------------------------------------
# Frontend source locks
# -------------------------------------------------------------------
SHARE_MODAL_PATH = "/app/frontend/src/components/ReelShareModal.jsx"
ACTION_MENU_PATH = "/app/frontend/src/components/ReelActionMenu.jsx"
REELS_PAGE_PATH = "/app/frontend/src/pages/ReelsPage.jsx"


def test_share_modal_exposes_all_six_targets():
    """V18.6 — ReelShareModal must surface Facebook, X, WhatsApp,
    Instagram, TikTok and "More" (native share sheet) with the right
    brand-coloured pills. The data-testid is built dynamically via the
    `id` field of each entry in the TARGETS array — we lock the IDs
    here and the dynamic `reel-share-${id}` template separately."""
    src = _read(SHARE_MODAL_PATH)
    for tid in ["facebook", "twitter", "whatsapp", "instagram", "tiktok", "more"]:
        assert f'id: "{tid}"' in src, f"missing share target: {tid}"
    # Dynamic testid template
    assert "`reel-share-${t.id}`" in src
    # Each target uses an official share URL or web-share fallback
    assert "facebook.com/sharer/sharer.php" in src
    assert "twitter.com/intent/tweet" in src
    assert "wa.me/?text=" in src
    assert "instagram://camera" in src
    # Native share sheet
    assert "navigator.share" in src
    # Share URL points at our OG endpoint so previews are rich
    assert "/api/og/reel/" in src


def test_action_menu_re_added_share_external_button():
    """V18.6 — The "Compartir en redes" pill (share-outside) is back in
    the rail with id=share. Comment + reshare were already there from
    V17.5/V17.6."""
    src = _read(ACTION_MENU_PATH)
    assert 'id: "share"' in src
    assert "ReelShareModal" in src
    assert "shareModalOpen" in src
    assert "onShareExternalClick" in src
    # The label must distinguish it from "reshare en mi perfil"
    assert "Compartir en redes" in src


def test_reels_page_pause_overlay_blur_and_giant_play():
    """V18.4 — When the video pauses, the overlay must apply
    backdrop-blur-md + a big gradient Play button (w-24 h-24, scale
    100/50). The overlay opacity transitions instead of conditionally
    rendering, so the play button can ease out/in smoothly."""
    src = _read(REELS_PAGE_PATH)
    assert "reel-paused-overlay" in src
    assert "backdrop-blur-md" in src
    # w-24 h-24 is the big button
    assert "w-24 h-24" in src
    # Opacity-based transition (vs conditional render) so the fade
    # animation is smooth.
    assert "opacity-100" in src and "opacity-0" in src
    # Scale 100/50 keyframe
    assert "scale-50" in src
    # The overlay must be pointer-events: none so the underlying rail
    # remains clickable. Otherwise the player traps every tap.
    assert "pointer-events-none" in src
