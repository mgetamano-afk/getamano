"""
Iteration 86 — Stories mobile-first regression locks.

These contract-level tests don't try to render React (we don't have a
JSDOM here), but they DO assert that the source code keeps the mobile
guarantees the user explicitly asked for after this iteration:

  · The story viewer uses `100dvh` (dynamic viewport, respects mobile
    browser chrome), not legacy `100vh` which had black-bar bugs on iOS.
  · The story image is `object-cover` and `inset-0` so it fills the
    frame on mobile — sticker `%` coords map to visible image bounds.
  · The header row honours `env(safe-area-inset-top)` so it doesn't
    collide with the iPhone notch.
  · The creator modal opens as a bottom-sheet on mobile (rounded-t
    instead of rounded-3xl, items-end alignment).
  · There is exactly ONE `<BottomNav>` mount point in App.js to lock
    BUG-4 from regressing.

These read the source files directly. Cheap, fast, and we'll fail loud
on the PR that breaks the mobile contract.
"""
import os


ROOT = os.path.dirname(os.path.dirname(__file__))
STORIES_PATH = os.path.join(ROOT, "..", "frontend", "src", "components", "StoriesCarousel.jsx")
APP_PATH = os.path.join(ROOT, "..", "frontend", "src", "App.js")


def _read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def test_stories_viewer_uses_dynamic_viewport():
    src = _read(STORIES_PATH)
    assert "100dvh" in src, (
        "Section 86 regression: StoriesCarousel.jsx must use 100dvh "
        "(dynamic viewport) so iOS Safari/Chrome browser chrome doesn't "
        "shrink the visible area."
    )
    # The legacy `height: "100vh"` literal that caused the old bug
    # should not return.
    assert 'height: "100vh"' not in src and "maxHeight: \"100vh\"" not in src, (
        "Section 86 regression: legacy 100vh literal returned. The story "
        "viewer must use 100dvh on the outer container."
    )


def test_stories_image_fills_the_frame_on_mobile():
    src = _read(STORIES_PATH)
    # The image must be absolute + inset-0 + w-full h-full object-cover
    # so the photo fills the viewport on phones (Instagram pattern) and
    # stickers align with visible image bounds.
    assert 'className="absolute inset-0 w-full h-full object-cover select-none"' in src, (
        "Section 86 regression: story viewer image must use "
        "`absolute inset-0 w-full h-full object-cover` so it fills the "
        "mobile viewport without leaving black bars."
    )
    # The old object-contain pattern is gone.
    assert 'className="object-contain select-none"' not in src


def test_stories_header_respects_safe_area_top():
    src = _read(STORIES_PATH)
    # Header row should compute top from env(safe-area-inset-top) so
    # it sits below the iPhone notch.
    assert "env(safe-area-inset-top" in src, (
        "Section 86 regression: header/progress bars must use "
        "env(safe-area-inset-top) so they don't collide with the notch."
    )


def test_stories_creator_is_bottom_sheet_on_mobile():
    src = _read(STORIES_PATH)
    # The creator modal outer wrapper aligns to bottom on mobile,
    # center on desktop. We just check that `items-end` is present
    # together with `md:items-center` — the canonical bottom-sheet
    # signal.
    assert "items-end md:items-center" in src, (
        "Section 86 regression: StoryCreator modal must align items "
        "to the bottom on mobile so it slides up as a sheet."
    )
    assert "rounded-t-3xl md:rounded-3xl" in src, (
        "Section 86 regression: StoryCreator panel must round only "
        "the top corners on mobile (bottom-sheet)."
    )


def test_only_one_bottomnav_mounted():
    """Section 74 BUG-4 lock — duplicate <BottomNav /> would render twice
    in the DOM. App.js must mount it exactly once."""
    src = _read(APP_PATH)
    count = src.count("<BottomNav")
    assert count == 1, (
        f"BUG-4 regression: <BottomNav /> mounted {count} times in App.js; "
        "must be exactly 1."
    )
