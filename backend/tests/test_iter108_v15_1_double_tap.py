"""
Iteration 108 — V15.1 Double-tap to like (Instagram-style).

Frontend source-code locks. Validates:
  · ReelsPage exposes the double-tap timing + onTapVideo + fireLike pair.
  · `LikeBurst` is now exported from ReelActionMenu and imported by ReelsPage.
  · MetricPill receives a `highlight` prop that turns the heart rose
    when the current viewer already liked the reel.
"""
import os


def _read(rel: str) -> str:
    full = os.path.join(os.path.dirname(__file__), "..", "..", rel)
    with open(full, encoding="utf-8") as f:
        return f.read()


def test_double_tap_constants_present():
    src = _read("frontend/src/pages/ReelsPage.jsx")
    assert "DOUBLE_TAP_MS" in src
    assert "fireLike" in src
    assert "lastTapRef" in src
    assert "pendingTapRef" in src


def test_likeburst_exported_and_reused():
    rmenu = _read("frontend/src/components/ReelActionMenu.jsx")
    assert "export function LikeBurst" in rmenu
    reels = _read("frontend/src/pages/ReelsPage.jsx")
    assert "import ReelActionMenu, { LikeBurst }" in reels


def test_heart_metric_highlights_when_liked():
    src = _read("frontend/src/pages/ReelsPage.jsx")
    assert "highlight={liked}" in src
    # MetricPill renders fill-current on the heart when highlighted
    assert "fill-current" in src
