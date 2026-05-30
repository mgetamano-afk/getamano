"""
Iteration 109 — V15 Reels FIX: video upload endpoint + empty-state copy.

User report: "no reels no funciona" — root cause was `/api/upload` only
accepting images, so ReelCreator's video uploads were silently failing
with "Solo imágenes (jpg/png/webp/gif/heic)". This iteration adds a
dedicated `/api/reels/upload-video` endpoint, updates the frontend
clients to use it, friendlies the legacy `/upload` 400 message, and
fixes the empty-state copy to reflect V15's "todos los usuarios pueden
subir reels" rule.
"""
import io
import os
import sys

import requests

sys.path.insert(0, os.path.dirname(__file__))
from tests.test_config import API  # noqa: E402


def _read(rel: str) -> str:
    full = os.path.join(os.path.dirname(__file__), "..", "..", rel)
    with open(full, encoding="utf-8") as f:
        return f.read()


TINY_MP4 = bytes.fromhex(
    "0000001866747970697363" "6f6d000000016973636d6d70343100000008667265650000033f6d646174"
) + b"\0" * 200  # just enough to be detected as MP4 by content-type alone


# ─── Backend ────────────────────────────────────────────────────────

def test_legacy_upload_rejects_video_with_friendly_redirect(client_session):
    files = {"file": ("v.mp4", io.BytesIO(TINY_MP4), "video/mp4")}
    r = client_session.post(f"{API}/upload", files=files, timeout=10)
    assert r.status_code == 400, r.text
    detail = r.json().get("detail", "").lower()
    # Must mention the new endpoint so future devs don't repeat this bug
    assert "/api/reels/upload-video" in r.json().get("detail", "") or "reels/upload-video" in detail


def test_reels_upload_video_accepts_mp4(client_session):
    files = {"file": ("v.mp4", io.BytesIO(TINY_MP4), "video/mp4")}
    r = client_session.post(f"{API}/reels/upload-video", files=files, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["url"].startswith("/api/files/")
    assert body["content_type"] == "video/mp4"


def test_reels_upload_video_accepts_webm(client_session):
    files = {"file": ("v.webm", io.BytesIO(b"WEBM" + b"\0" * 200), "video/webm")}
    r = client_session.post(f"{API}/reels/upload-video", files=files, timeout=15)
    assert r.status_code == 200, r.text


def test_reels_upload_video_rejects_image(client_session):
    files = {"file": ("img.png", io.BytesIO(b"\x89PNG\0"), "image/png")}
    r = client_session.post(f"{API}/reels/upload-video", files=files, timeout=10)
    assert r.status_code == 400, r.text


def test_reels_upload_video_requires_auth():
    files = {"file": ("v.mp4", io.BytesIO(TINY_MP4), "video/mp4")}
    r = requests.post(f"{API}/reels/upload-video", files=files, timeout=10)
    assert r.status_code in (401, 403), r.text


def test_full_e2e_upload_then_create_reel(client_session):
    """The full path the frontend exercises: upload mp4 → POST /reels."""
    files = {"file": ("v.mp4", io.BytesIO(TINY_MP4), "video/mp4")}
    up = client_session.post(f"{API}/reels/upload-video", files=files, timeout=15).json()
    body = {"video_url": up["url"], "caption": "iter109 e2e"}
    r = client_session.post(f"{API}/reels", json=body, timeout=10)
    assert r.status_code == 200, r.text
    reel = r.json()
    assert reel["video_url"] == up["url"]
    # Cleanup
    client_session.delete(f"{API}/reels/{reel['reel_id']}", timeout=10)


# ─── Frontend wiring (source-code locks) ───────────────────────────

def test_reel_creator_uses_video_endpoint():
    src = _read("frontend/src/components/ReelCreator.jsx")
    assert '"/reels/upload-video"' in src
    assert '"/upload"' not in src.replace('"/upload-video"', "").replace('"/upload-image"', "")


def test_reel_recorder_uses_video_endpoint():
    src = _read("frontend/src/components/ReelCameraRecorder.jsx")
    assert '"/reels/upload-video"' in src


def test_empty_state_v15_copy_no_longer_says_providers():
    src = _read("frontend/src/pages/ReelsPage.jsx")
    # New copy mentions "anyone / cualquier" instead of "providers"
    assert "Cualquier persona" in src or "Anyone can post" in src
    # The misleading "Providers can post" copy was scrubbed
    assert "Providers can post" not in src
    assert "Los proveedores pueden subir" not in src
    # CTA in empty state
    assert 'data-testid="reels-empty-cta"' in src


def test_reels_open_creator_listener_has_cleanup():
    """Old code attached a global window listener with no cleanup. Make
    sure the new version uses useEffect's return value to remove it."""
    src = _read("frontend/src/pages/ReelsPage.jsx")
    assert 'window.addEventListener("reels:open-creator"' in src
    assert 'window.removeEventListener("reels:open-creator"' in src
    # The old window._reelsCreatorListener global must be gone
    assert "_reelsCreatorListener" not in src


def test_unverified_label_shown_on_reels_author():
    src = _read("frontend/src/pages/ReelsPage.jsx")
    assert "Sin verificar" in src
    assert "reel-unverified-" in src
