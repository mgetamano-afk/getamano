"""V16.2 — Recommendation Story PNG + RecommendModal upgrade.

A client viewing an eCard can write a recommendation (existing flow) and
now also publish it natively to IG/FB/WhatsApp Story with their message
overlaid on the provider's hero photo. Plus a "Cliente real ✓" badge
when the recommender has prior interactions with this provider.
"""
from __future__ import annotations

import io
import time

import requests
from PIL import Image

from test_config import API, DEMO_SLUG, CLIENT_EMAIL, CLIENT_PASSWORD

_TIMEOUT = 30


def _img_dims(content: bytes) -> tuple[int, int]:
    return Image.open(io.BytesIO(content)).size


# -------------------------------------------------------------------
# Helpers — create a recommendation we can render PNGs for
# -------------------------------------------------------------------
def _create_recommendation(provider_id: str, name: str = "Carlos Test", message: str = "") -> dict:
    payload = {
        "client_name": name,
        "client_city": "Tulsa, OK",
        "message": message or None,
        "source": "ecard_button",
    }
    r = requests.post(f"{API}/providers/{provider_id}/recommend", json=payload, timeout=_TIMEOUT)
    assert r.status_code == 200, r.text[:300]
    return r.json()


def _login(email: str, password: str) -> requests.Session:
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=_TIMEOUT)
    assert r.status_code == 200, r.text[:300]
    return s


def _get_demo_provider_id() -> str:
    r = requests.get(f"{API}/providers/by-slug/{DEMO_SLUG}", timeout=_TIMEOUT)
    assert r.status_code == 200, r.text[:300]
    return r.json()["provider_id"]


# -------------------------------------------------------------------
# Backend integration
# -------------------------------------------------------------------
def test_recommendation_png_renders_1080x1920():
    """V16.2 — given a valid share_token, the recommendation PNG endpoint
    returns a 1080×1920 PNG with the client's message + provider hero."""
    provider_id = _get_demo_provider_id()
    suffix = str(int(time.time() * 1000))[-8:]
    rec = _create_recommendation(
        provider_id,
        name=f"Carlos {suffix}",
        message="Trabaja increíble. María limpió mi casa en 2 horas y dejó todo brillando.",
    )
    token = rec["share_token"]
    r = requests.get(f"{API}/og-image/recommendation/{token}.png", timeout=_TIMEOUT)
    assert r.status_code == 200, r.text[:300]
    assert r.headers["content-type"] == "image/png"
    w, h = _img_dims(r.content)
    assert (w, h) == (1080, 1920), f"expected 1080x1920, got {w}x{h}"
    # PNG should be non-trivial (hero photo embedded + bubble overlay)
    assert len(r.content) > 60_000


def test_recommendation_png_404_for_unknown_token():
    """An invalid / unknown share_token must 404 (not silently render a
    blank PNG — that would leak provider data on share token collisions)."""
    r = requests.get(f"{API}/og-image/recommendation/INVALID-TOKEN.png", timeout=_TIMEOUT)
    assert r.status_code == 404


def test_recommendation_png_falls_back_to_default_message():
    """When the recommendation has NO custom message, the PNG must still
    render with a default copy (no crash)."""
    provider_id = _get_demo_provider_id()
    suffix = str(int(time.time() * 1000))[-8:]
    rec = _create_recommendation(provider_id, name=f"Empty {suffix}", message="")
    r = requests.get(f"{API}/og-image/recommendation/{rec['share_token']}.png", timeout=_TIMEOUT)
    assert r.status_code == 200
    w, h = _img_dims(r.content)
    assert (w, h) == (1080, 1920)


def test_can_verify_client_endpoint_requires_auth():
    """The /can-verify-client endpoint is auth-gated (anonymous users
    can't probe whether they qualify as 'real client' — security via
    obscurity for any future endorsement pricing model)."""
    provider_id = _get_demo_provider_id()
    r = requests.get(f"{API}/providers/{provider_id}/can-verify-client", timeout=_TIMEOUT)
    assert r.status_code == 401, r.text[:200]


def test_can_verify_client_endpoint_returns_signals():
    """With a logged-in client, the endpoint returns a boolean + signals
    breakdown. The demo client may or may not have interacted; we only
    lock the response shape."""
    s = _login(CLIENT_EMAIL, CLIENT_PASSWORD)
    provider_id = _get_demo_provider_id()
    r = s.get(f"{API}/providers/{provider_id}/can-verify-client", timeout=_TIMEOUT)
    assert r.status_code == 200, r.text[:200]
    body = r.json()
    assert "can_verify_client" in body
    assert "signals" in body
    assert set(body["signals"].keys()) == {"review", "message", "request"}
    assert isinstance(body["can_verify_client"], bool)


# -------------------------------------------------------------------
# Backend source-locks
# -------------------------------------------------------------------
SERVER_PATH = "/app/backend/server.py"


def _server_src() -> str:
    with open(SERVER_PATH, "r", encoding="utf-8") as f:
        return f.read()


def test_recommendation_endpoint_registered():
    src = _server_src()
    assert '@app.get("/api/og-image/recommendation/{share_token}.png")' in src
    assert "og_image_recommendation_png" in src
    assert "_build_og_image_recommendation_svg" in src
    assert "_wrap_svg_text" in src


def test_recommendation_svg_includes_bubble_and_quote_marks():
    """Visual contract: white bubble + Georgia italic message + quote
    marks + client byline + CTA pill. Source-lock keeps the layout
    intact when other code in this section is refactored."""
    src = _server_src()
    # Bubble + speech-bubble tail
    assert 'rx="32" fill="white"' in src
    # Quote marks
    assert "&#8220;" in src or "“" in src
    assert "&#8221;" in src or "”" in src
    # CTA copy
    assert "Conoce a" in src
    # TE LO RECOMIENDO header
    assert "TE LO RECOMIENDO" in src


def test_can_verify_client_logic_checks_three_signals():
    src = _server_src()
    assert "/providers/{provider_id}/can-verify-client" in src
    # All three signal collections probed
    assert "db.reviews.count_documents" in src
    assert "db.messages.count_documents" in src
    assert "db.service_requests.count_documents" in src


# -------------------------------------------------------------------
# Frontend source-locks
# -------------------------------------------------------------------
MODAL_PATH = "/app/frontend/src/components/RecommendModal.jsx"


def _modal_src() -> str:
    with open(MODAL_PATH, "r", encoding="utf-8") as f:
        return f.read()


def test_modal_calls_can_verify_client_endpoint():
    src = _modal_src()
    assert "/can-verify-client" in src
    assert "canVerifyClient" in src
    assert 'data-testid="recommend-verified-client-hint"' in src


def test_modal_renders_story_preview_in_step_2():
    src = _modal_src()
    assert 'data-testid="recommend-story-preview"' in src
    assert 'data-testid="recommend-story-preview-img"' in src
    assert "/api/og-image/recommendation/" in src


def test_modal_has_publish_story_button():
    src = _modal_src()
    assert 'data-testid="recommend-share-story"' in src
    assert "publishStory" in src
    assert "navigator.canShare" in src
    assert "navigator.share" in src
    assert "files: [file]" in src


def test_modal_submit_label_adapts_to_message_length():
    """V16.2 hybrid copy: if the user typed >=20 chars the button says
    'Publicar mi recomendación', else 'Compartir tal cual'. Source-lock."""
    src = _modal_src()
    assert "submitWithMsg" in src
    assert "submitWithoutMsg" in src
    assert "hasMessage" in src
    assert "Publicar mi recomendación" in src
    assert "Compartir tal cual" in src
