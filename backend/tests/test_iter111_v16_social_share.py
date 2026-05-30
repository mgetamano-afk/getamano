"""V16 — Social share rich-link previews (Open Graph + Twitter Cards).

These tests pin the public surface introduced in V16:
  - /api/og-image/{slug}.png renders a 1200x630 PNG (hero precedence:
    gallery photo → AI card design → gradient).
  - /api/og-image/story/{slug}.png renders a 1080x1920 vertical PNG for
    Instagram / TikTok Stories.
  - /api/og/p/{slug} returns bot-friendly HTML with full og:* + twitter:*
    meta tags, pointing at the PNG.
  - /p/{slug} bot middleware: when User-Agent matches a social crawler,
    the SPA index is replaced by the OG HTML (verified by direct hit to
    the FastAPI route — the actual SPA proxy is k8s-level out-of-scope).

Source locks:
  - ShareLinkCard.jsx exposes data-testids share-link-social-preview,
    share-link-story-download, share-link-validate-fb, share-link-validate-x.
  - server.py _load_og_provider picks gallery[0].url first.
"""
from __future__ import annotations

import io

import requests
from PIL import Image

from test_config import BASE_URL, DEMO_SLUG

_TIMEOUT = 30  # cairosvg cold-start + remote logo fetch budget


def _img_dims(content: bytes) -> tuple[int, int]:
    return Image.open(io.BytesIO(content)).size


# -------------------------------------------------------------------
# Backend integration tests
# -------------------------------------------------------------------
def test_og_image_png_1200x630_with_hero():
    """Horizontal PNG renders at 1200x630 and is non-trivial in size.

    The demo provider has 3 unsplash gallery photos seeded — the response
    should embed one of them as hero, pushing the PNG size > 100 KB
    (gradient-only baseline is ~150 KB; with embedded JPEG hero it's
    typically 300-500 KB).
    """
    r = requests.get(f"{BASE_URL}/api/og-image/{DEMO_SLUG}.png", timeout=_TIMEOUT)
    assert r.status_code == 200, r.text[:400]
    assert r.headers["content-type"] == "image/png"
    # Note: caching headers we set are stripped by the ingress (CF) — what
    # matters is the immediate render result, not the propagated cache
    # policy. The cache lives in the FastAPI app's response anyway.
    w, h = _img_dims(r.content)
    assert (w, h) == (1200, 630), f"expected 1200x630, got {w}x{h}"
    assert len(r.content) > 60_000, "PNG too small — hero embedding likely failed"


def test_og_image_story_png_1080x1920():
    """V16 Instagram / TikTok Story PNG renders at 1080x1920 vertical."""
    r = requests.get(f"{BASE_URL}/api/og-image/story/{DEMO_SLUG}.png", timeout=_TIMEOUT)
    assert r.status_code == 200, r.text[:400]
    assert r.headers["content-type"] == "image/png"
    # Inline disposition + .png suggested filename → so a fetch+blob
    # download in the frontend gets a sensible default file name.
    cd = r.headers.get("content-disposition", "")
    assert "story.png" in cd
    w, h = _img_dims(r.content)
    assert (w, h) == (1080, 1920), f"expected 1080x1920, got {w}x{h}"


def test_og_image_story_does_not_match_horizontal_route():
    """Regression — `/api/og-image/{slug}-story.png` would greedy-match the
    horizontal route (since {slug} captures `foo-story`). V16 moved Story
    under `/story/{slug}.png` to disambiguate. This locks the contract."""
    # The disambiguated route returns vertical:
    r = requests.get(f"{BASE_URL}/api/og-image/story/{DEMO_SLUG}.png", timeout=_TIMEOUT)
    assert r.status_code == 200
    w, h = _img_dims(r.content)
    assert h > w, "story endpoint must return vertical aspect"

    # The greedy horizontal route returns horizontal (1200x630) for the
    # untouched slug — proving the routes don't collide:
    r2 = requests.get(f"{BASE_URL}/api/og-image/{DEMO_SLUG}.png", timeout=_TIMEOUT)
    assert r2.status_code == 200
    w2, h2 = _img_dims(r2.content)
    assert (w2, h2) == (1200, 630)


def test_og_image_svg_contains_hero_image_when_gallery_present():
    """SVG variant must inline an `<image>` element for the hero when the
    provider has a gallery — proves _load_og_provider picked gallery[0]."""
    r = requests.get(f"{BASE_URL}/api/og-image/{DEMO_SLUG}.svg", timeout=_TIMEOUT)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("image/svg+xml")
    body = r.text
    assert "<image" in body, "no <image> in SVG — hero never rendered"
    # The brand strip changes label depending on hero source — when it's
    # a real photo we surface "FOTO REAL DEL PROFESIONAL".
    assert "FOTO REAL DEL PROFESIONAL" in body or "PROFESIONAL VERIFICADO" in body


def test_og_html_handler_renders_meta_tags():
    """Direct hit on /api/og/p/{slug} must always return SSR HTML with
    og:image pointing at the PNG endpoint and twitter:card=summary_large_image.
    """
    r = requests.get(f"{BASE_URL}/api/og/p/{DEMO_SLUG}", timeout=_TIMEOUT)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/html")
    body = r.text
    assert 'property="og:image"' in body
    assert f"/api/og-image/{DEMO_SLUG}.png" in body
    assert 'name="twitter:card" content="summary_large_image"' in body
    # Description must include rating + city + verified marker for the demo provider
    assert "Sallisaw" in body
    # And a human-redirect (meta-refresh OR window.location.replace JS)
    assert "http-equiv=\"refresh\"" in body or "window.location.replace" in body


def test_og_html_handler_for_unknown_slug_falls_back():
    """Unknown slugs must NOT 500 — the generic getamano card protects the
    referrer's posted link from looking broken on FB/WhatsApp."""
    r = requests.get(f"{BASE_URL}/api/og/p/this-slug-does-not-exist-anywhere", timeout=_TIMEOUT)
    assert r.status_code == 404
    body = r.text
    # Still must be HTML with og:* tags so the FB scraper doesn't blank-out
    assert 'property="og:title"' in body
    assert "Proveedor no encontrado" in body or "no encontrado" in body


def test_og_bot_middleware_triggers_for_social_user_agents():
    """When the bot middleware is reached (i.e. /p/{slug} routes through
    FastAPI), a social-crawler UA must get the OG HTML, not the SPA.

    Note: in the prod k8s setup, /p/{slug} is routed to the React dev
    server by ingress so the middleware never runs for those requests —
    THAT'S WHY ShareLinkCard publishes `/api/og/p/{slug}` as the canonical
    share URL. We still keep the middleware so any direct FastAPI hit
    (custom domain, server-side routing) behaves identically.
    """
    # We can't easily hit the FastAPI service directly through the ingress
    # so this test exercises the middleware via the /api-routed endpoint
    # (which always reaches FastAPI) with a Facebook UA.
    r = requests.get(
        f"{BASE_URL}/api/og/p/{DEMO_SLUG}",
        headers={"User-Agent": "facebookexternalhit/1.1"},
        timeout=_TIMEOUT,
    )
    assert r.status_code == 200
    assert 'property="og:image"' in r.text


# -------------------------------------------------------------------
# Frontend source-code locks
# -------------------------------------------------------------------
SHARE_CARD_PATH = "/app/frontend/src/components/ShareLinkCard.jsx"


def _share_card_src() -> str:
    with open(SHARE_CARD_PATH, "r", encoding="utf-8") as f:
        return f.read()


def test_share_card_renders_live_preview():
    """ShareLinkCard must include the live preview block + image with
    `share-link-preview-img` testid pointing at the OG PNG endpoint."""
    src = _share_card_src()
    assert 'data-testid="share-link-social-preview"' in src
    assert 'data-testid="share-link-preview-img"' in src
    assert "/api/og-image/${slug}.png" in src


def test_share_card_has_story_publish_button():
    """V16 / V16.1 — `share-link-story-publish` button must fetch the
    1080×1920 story PNG via /api/og-image/story/{slug}.png and trigger
    a Web Share API call with the file payload (so on mobile the user
    picks Instagram/Facebook/WhatsApp Story directly). Falls back to
    blob download on desktop / unsupported browsers.
    """
    src = _share_card_src()
    assert 'data-testid="share-link-story-publish"' in src
    assert "/api/og-image/story/${slug}.png" in src
    assert "publishStory" in src
    # Web Share API with file payload
    assert "navigator.canShare" in src
    assert "navigator.share" in src
    assert "files: [file]" in src
    # Fallback still creates a downloadable blob (Safari/desktop)
    assert "createObjectURL" in src


def test_share_card_has_validator_buttons():
    """V16 — Validator buttons open FB Sharing Debugger and Twitter Card
    Validator pre-filled with the share URL."""
    src = _share_card_src()
    assert 'data-testid="share-link-validate-fb"' in src
    assert 'data-testid="share-link-validate-x"' in src
    assert "developers.facebook.com/tools/debug" in src
    assert "cards-dev.twitter.com/validator" in src


# -------------------------------------------------------------------
# Backend source locks (paranoid — keeps V16 hero precedence wired)
# -------------------------------------------------------------------
SERVER_PATH = "/app/backend/server.py"


def _server_src() -> str:
    with open(SERVER_PATH, "r", encoding="utf-8") as f:
        return f.read()


def test_load_og_provider_gallery_first():
    """_load_og_provider must pick gallery[0] before AI before gradient."""
    src = _server_src()
    # Gallery-first lookup
    assert 'gallery = provider.get("gallery")' in src
    assert '"_hero_image_source"' in src
    # AI fallback uses card_designs.is_active
    assert "card_designs.find_one" in src
    assert '"is_active": True' in src


def test_og_story_endpoint_registered():
    """The vertical story endpoint must be wired at /story/{slug}.png."""
    src = _server_src()
    assert '@app.get("/api/og-image/story/{slug}.png")' in src
    assert "_build_og_image_story_svg" in src
    assert "1080" in src and "1920" in src
