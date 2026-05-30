"""
Iteration 102 — Section V11 mobile UX cleanup.

Validates the 4 fixes shipped after the iPhone 17 Pro audit:
  1. `/` now renders AppHome (not ReelsPage). Reels stays at `/reels`.
  2. The "Barrio/Nbhd" tab is removed from the ComunidadLayout top tabbar.
  3. The "+" badge on "Tu historia" is positioned Instagram-style at the
     bottom-right of the avatar (small circle overlay, not a giant +).
  4. The stories carousel container reserves vertical room (pt-3) so the
     -top-1 / -bottom-1 like badges are fully visible.
"""
import os
import sys


def _read(rel: str) -> str:
    full = os.path.join(os.path.dirname(__file__), "..", "..", rel)
    with open(full, encoding="utf-8") as f:
        return f.read()


# ─── Fix 1: `/` → AppHome ────────────────────────────────────────
def test_root_route_renders_apphome():
    src = _read("frontend/src/App.js")
    assert '<Route path="/" element={<AppHome />} />' in src
    # ReelsPage no longer answers the root path
    assert '<Route path="/" element={<ReelsPage />}' not in src


def test_reels_route_still_intact():
    src = _read("frontend/src/App.js")
    assert '<Route path="/reels" element={<ReelsPage />}' in src


# ─── Fix 2: No "Barrio/Nbhd" top tab in ComunidadLayout ─────────
def test_no_barrio_top_tab():
    src = _read("frontend/src/components/ComunidadLayout.jsx")
    assert 'id: "barrio"' not in src
    assert '"Nbhd"' not in src
    # Sub-section tabs still wired
    for tab_id in ('"gremios"', '"explorar"', '"ranking"', '"ecards"', '"wall-of-fame"'):
        assert tab_id in src, f"missing tab id {tab_id}"


def test_active_tab_lookup_safe_when_no_match():
    """When the user is on /comunidad (base barrio feed) no top tab should
    be highlighted as active — the lookup must safely return null."""
    src = _read("frontend/src/components/ComunidadLayout.jsx")
    # Must use optional chaining since activeTab can be null
    assert "activeTab?.id" in src


# ─── Fix 3: Instagram-style + on "Tu historia" ───────────────────
def test_story_plus_is_instagram_style():
    src = _read("frontend/src/components/StoriesCarousel.jsx")
    # Both story states (myGroup + create-tile) use the same anchored badge
    assert 'data-testid="story-create-plus"' in src
    assert 'data-testid="story-add-badge"' in src
    # Both badges are pinned at the bottom-right with negative offsets
    assert "-bottom-0.5 -right-0.5" in src
    # The huge dashed-border + that used to fill the avatar is gone
    assert "border-2 border-dashed border-teal-400" not in src


# ─── Fix 4: Story badges no longer clipped at top ─────────────────
def test_stories_carousel_has_top_padding():
    src = _read("frontend/src/components/StoriesCarousel.jsx")
    # pt-3 leaves room for the -top-1 likes badge on StoryTile
    assert "pt-3 pb-3" in src
