"""
Iteration 102 — Section V11 + V11.1 mobile UX cleanup.

Validates the fixes shipped after the iPhone 17 Pro audit:
  V11
    1. `/` now renders the live Search page. Reels stays at `/reels`.
    2. The "Barrio/Nbhd" tab is removed from the ComunidadLayout top tabbar.
    3. The "+" badge on "Tu historia" is positioned Instagram-style at the
       bottom-right of the avatar (small circle overlay, not a giant +).
    4. The stories carousel container reserves vertical room (pt-3) so the
       -top-1 / -bottom-1 like badges are fully visible.
  V11.1
    5. The previous AppHome (greeting + hero + featured + jobs digest) lives
       at `/moreinfo` and is linked from the footer "Plataforma" column.
"""
import os


def _read(rel: str) -> str:
    full = os.path.join(os.path.dirname(__file__), "..", "..", rel)
    with open(full, encoding="utf-8") as f:
        return f.read()


# ─── V11 Fix 1 + V11.1: `/` → Search, `/moreinfo` → AppHome ─────
def test_root_route_renders_search():
    src = _read("frontend/src/App.js")
    assert '<Route path="/" element={<Search />} />' in src
    assert '<Route path="/" element={<AppHome />}' not in src
    assert '<Route path="/" element={<ReelsPage />}' not in src


def test_moreinfo_route_renders_apphome():
    src = _read("frontend/src/App.js")
    assert '<Route path="/moreinfo" element={<AppHome />} />' in src


def test_reels_route_still_intact():
    src = _read("frontend/src/App.js")
    assert '<Route path="/reels" element={<ReelsPage />}' in src


def test_footer_has_moreinfo_link():
    src = _read("frontend/src/components/Footer.jsx")
    assert 'to="/moreinfo"' in src
    assert 'data-testid="footer-moreinfo"' in src


def test_i18n_has_moreinfo_keys():
    src = _read("frontend/src/contexts/I18nContext.jsx")
    assert '"footer.moreinfo": "Más información"' in src
    assert '"footer.moreinfo": "More info"' in src


# ─── V11 Fix 2: No "Barrio/Nbhd" top tab in ComunidadLayout ─────
def test_no_barrio_top_tab():
    src = _read("frontend/src/components/ComunidadLayout.jsx")
    assert 'id: "barrio"' not in src
    assert '"Nbhd"' not in src
    for tab_id in ('"gremios"', '"explorar"', '"ranking"', '"ecards"', '"wall-of-fame"'):
        assert tab_id in src, f"missing tab id {tab_id}"


def test_active_tab_lookup_safe_when_no_match():
    src = _read("frontend/src/components/ComunidadLayout.jsx")
    assert "activeTab?.id" in src


# ─── V11 Fix 3: Instagram-style + on "Tu historia" ───────────────
def test_story_plus_is_instagram_style():
    src = _read("frontend/src/components/StoriesCarousel.jsx")
    assert 'data-testid="story-create-plus"' in src
    assert 'data-testid="story-add-badge"' in src
    assert "-bottom-0.5 -right-0.5" in src
    assert "border-2 border-dashed border-teal-400" not in src


# ─── V11 Fix 4: Story badges no longer clipped at top ─────────────
def test_stories_carousel_has_top_padding():
    src = _read("frontend/src/components/StoriesCarousel.jsx")
    assert "pt-3 pb-3" in src
