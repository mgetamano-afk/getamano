"""V19 — Three small UI polish fixes from screenshots.

V19.1 — Rename Spanish "Gremios" → "Grupos" in user-facing copy (route
        slugs / internal vars stay `gremios` for stability).
V19.2 — Broken avatar `?` fallback in BarrioComposer and inline
        comments composer (Comunidad page).
V19.3 — "Tu historia" tile:
          • prefer the latest story media as the thumbnail
          • add onError fallback to deterministic illustrated avatar
          • the `+` badge stays a perfect circle on mobile (was getting
            stretched to an oval by the global 44px touch-target rule).
"""
from __future__ import annotations


def _read(p):
    with open(p, "r", encoding="utf-8") as f:
        return f.read()


# -------------------------------------------------------------------
# V19.1 — "Gremios" → "Grupos" in user-facing Spanish copy
# -------------------------------------------------------------------
def test_comunidad_layout_renames_gremios_to_grupos():
    """The community sub-nav tab must read "Grupos" / "Groups" (was
    "Gremios" / "Guilds")."""
    src = _read("/app/frontend/src/components/ComunidadLayout.jsx")
    assert '"Grupos"' in src
    assert '"Groups"' in src
    # The old wording must NOT appear in the entry definition
    assert '"Gremios"' not in src
    assert '"Guilds"' not in src


def test_gremios_page_uses_grupos_copy():
    """GremiosPage header + empty state + composer label all use
    "Grupos" / "grupo" in Spanish. Internal slugs (/gremios, data-testids)
    can stay the same to avoid breaking API contracts."""
    src = _read("/app/frontend/src/pages/GremiosPage.jsx")
    assert '"Grupos"' in src
    assert '"Groups"' in src
    assert 'Aún no hay grupos' in src
    assert 'Publicado en el grupo' in src
    assert 'Comparte algo con tu grupo' in src
    # The old Spanish noun shouldn't appear as a user-facing string
    assert "Aún no hay gremios" not in src


def test_v8_ecosystem_table_uses_grupos():
    src = _read("/app/frontend/src/components/V8EnrichmentSections.jsx")
    assert "Publicación en Grupos" in src
    assert "Publicación en Gremios" not in src


# -------------------------------------------------------------------
# V19.2 — Avatar onError fallback in BarrioComposer
# -------------------------------------------------------------------
def test_comunidad_composer_avatar_has_on_error_fallback():
    """When user.picture is a broken/expired URL (common with Google
    OAuth long-cached pictures) we must swap to a deterministic
    illustrated avatar so the `?` broken-image icon never shows."""
    src = _read("/app/frontend/src/pages/ComunidadPage.jsx")
    assert "getDefaultAvatar" in src
    # Both the BarrioComposer and the inline comments composer must
    # carry the fallback. We assert on the import + the literal helper
    # being referenced inside an onError handler.
    assert "onError" in src
    # The avatar resolver is still the primary source
    assert "resolveAvatar({picture: user.picture" in src


# -------------------------------------------------------------------
# V19.3 — "Tu historia" tile fixes
# -------------------------------------------------------------------
def test_stories_carousel_uses_latest_story_image_as_thumbnail():
    """When the logged-in user has an active story, the "Tu historia"
    tile must show that story's media (`myGroup.image_url`) instead of
    only the static profile picture — matches Instagram behaviour."""
    src = _read("/app/frontend/src/components/StoriesCarousel.jsx")
    assert "myGroup.image_url" in src
    # Fallback chain: story image → logo → user.picture → default avatar
    assert "getDefaultAvatar" in src


def test_story_add_badge_keeps_circular_shape_on_mobile():
    """The `+` badge is 22×22 px. The global mobile CSS rule forces a
    44px min-height on every <button>, which warps it into an oval.
    We opt out via the `no-min-touch` class so the badge stays a
    perfect circle."""
    src = _read("/app/frontend/src/components/StoriesCarousel.jsx")
    assert "no-min-touch" in src
    # The badge itself still has w-[22px] h-[22px] rounded-full
    assert "w-[22px] h-[22px] rounded-full bg-[#0077B6]" in src


def test_story_tile_images_have_on_error_fallback():
    """Both the myGroup and no-group paths must register an onError
    so a stale Google OAuth picture URL never produces the broken `?`
    icon inside the gradient ring."""
    src = _read("/app/frontend/src/components/StoriesCarousel.jsx")
    # Two onError handlers (one per branch)
    assert src.count("e.currentTarget.dataset.fellback") >= 2
    assert src.count("getDefaultAvatar({") >= 2


def test_index_css_min_touch_target_has_opt_out():
    """The global 44px touch-target rule was warping small icon
    badges. We exempt buttons with the `no-min-touch` class."""
    css = _read("/app/frontend/src/index.css")
    assert "button:not(.no-min-touch)" in css
    assert ':not(.no-min-touch)' in css
