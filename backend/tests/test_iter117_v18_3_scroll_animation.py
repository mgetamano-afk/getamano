"""V18.3 — Scroll-in animation for reels + stories.

When the active reel/story changes, both the media surface and the
action rail animate together so the swipe gesture feels like one
cohesive composition sliding into place.

These are pure CSS/JS animations (no backend impact) so the suite is
all source-locks.
"""
from __future__ import annotations


ACTION_MENU_PATH = "/app/frontend/src/components/ReelActionMenu.jsx"
REELS_PAGE_PATH = "/app/frontend/src/pages/ReelsPage.jsx"
STORIES_PATH = "/app/frontend/src/components/StoriesCarousel.jsx"
APP_CSS_PATH = "/app/frontend/src/App.css"


def _read(p: str) -> str:
    with open(p, "r", encoding="utf-8") as f:
        return f.read()


def test_reel_action_rail_slides_when_active_reel_changes():
    """When `activeReel.reel_id` changes, the rail bumps a tick that
    re-keys the inner div so the `reel-rail-slide` animation re-fires.
    """
    src = _read(ACTION_MENU_PATH)
    assert "railAnimTick" in src
    assert "reel-rail-slide" in src
    # Keyframes defined in the local style block
    assert "@keyframes reelRailSlide" in src
    # Translate-up + scale + slight blur for the polished feel
    assert "translate3d(0, 28px" in src
    assert "blur(2px)" in src or "filter: blur" in src


def test_reel_video_settles_when_becoming_active():
    """ReelSlide adds `reel-video-active` and re-keys the <video> so the
    `reelVideoSettle` keyframe replays whenever the slide becomes the
    active one. Without this, the snap-scroll feels static."""
    reels_src = _read(REELS_PAGE_PATH)
    css = _read(APP_CSS_PATH)
    # JSX side
    assert "reel-video-active" in reels_src
    assert "activeTick" in reels_src
    assert "setActiveTick" in reels_src
    # CSS keyframes side
    assert "@keyframes reelVideoSettle" in css
    # Subtle zoom-out from 1.07 → 1 + brightness ramp
    assert "scale(1.07)" in css
    assert "brightness(0.85)" in css


def test_story_card_animates_directionally_on_swipe():
    """When activeIdx changes in a story group, the next/prev direction
    decides whether the image slides in from the right (next) or left
    (prev). The image element is re-keyed with the direction so the
    keyframe runs every swipe.
    """
    src = _read(STORIES_PATH)
    assert "slideDir" in src
    assert "setSlideDir" in src
    # Per-direction CSS classes
    assert "story-card-slide-in" in src
    assert "story-card-slide-in-reverse" in src
    # Both keyframes registered globally
    css = _read(APP_CSS_PATH)
    assert "@keyframes storyCardSlideIn" in css
    assert "@keyframes storyCardSlideInReverse" in css
    # Direction logic — next vs prev
    assert 'activeIdx > prevIdxRef.current ? "next" : "prev"' in src


def test_story_image_key_includes_direction_for_remount():
    """The img key MUST include both story_id AND slideDir so React
    re-mounts (re-firing the CSS animation) on every swipe, even when
    swiping to the same story repeatedly during testing."""
    src = _read(STORIES_PATH)
    assert "story-img-${active.story_id}-${slideDir}" in src
