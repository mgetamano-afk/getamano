"""
Iteration 110 — V15.2 / V15.3 / V12 polish:
  · V15.2: FAB action chips show only the colored icon (no text pill).
            Labels move to title/aria-label for a11y.
  · V15.3: Server-side ffmpeg post-process for reel uploads:
            – trim > 60s to 60s
            – auto-generate 480p JPEG thumbnail
            – re-encode to H.264/AAC MP4
            Endpoint returns `thumbnail_url`, `duration_s`, `was_trimmed`.
  · V12:  After paying $5 for a 2nd+ eCard, onboarding now skips the
            "plan picker" step (V13 removed subscription tiers entirely).
"""
import io
import os
import subprocess
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))
from tests.test_config import API  # noqa: E402


def _read(rel: str) -> str:
    full = os.path.join(os.path.dirname(__file__), "..", "..", rel)
    with open(full, encoding="utf-8") as f:
        return f.read()


@pytest.fixture(scope="module")
def red_mp4_short():
    """5s red MP4 (~ 6 KB) — used to validate the happy path."""
    path = "/tmp/iter110_red.mp4"
    if not os.path.exists(path):
        subprocess.run([
            "ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi",
            "-i", "color=c=red:size=480x854:duration=5",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", path,
        ], check=True)
    with open(path, "rb") as f:
        return f.read()


@pytest.fixture(scope="module")
def long_mp4():
    """90s blue MP4 — used to validate the trim path."""
    path = "/tmp/iter110_long.mp4"
    if not os.path.exists(path):
        subprocess.run([
            "ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi",
            "-i", "color=c=blue:size=480x854:duration=90",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", path,
        ], check=True)
    with open(path, "rb") as f:
        return f.read()


# ─── V15.3 — Server-side video processor ────────────────────────────

def test_short_clip_returns_metadata(client_session, red_mp4_short):
    files = {"file": ("v.mp4", io.BytesIO(red_mp4_short), "video/mp4")}
    r = client_session.post(f"{API}/reels/upload-video", files=files, timeout=60)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["thumbnail_url"], "thumbnail must be generated"
    assert body["thumbnail_url"].startswith("/api/files/")
    assert body["thumbnail_url"].endswith("-thumb.jpg")
    assert 4 <= (body.get("duration_s") or 0) <= 6, body
    assert body["was_trimmed"] is False
    assert body["content_type"] == "video/mp4"


def test_long_clip_gets_trimmed_to_60s(client_session, long_mp4):
    files = {"file": ("v.mp4", io.BytesIO(long_mp4), "video/mp4")}
    r = client_session.post(f"{API}/reels/upload-video", files=files, timeout=120)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["was_trimmed"] is True
    # Duration claimed in the response should be <= 60s
    assert body.get("duration_s") and body["duration_s"] <= 60.5


def test_thumbnail_jpeg_is_servable(client_session, red_mp4_short):
    files = {"file": ("v.mp4", io.BytesIO(red_mp4_short), "video/mp4")}
    up = client_session.post(f"{API}/reels/upload-video", files=files, timeout=60).json()
    # `API` ends in /api; thumbnail_url already starts with /api/files/...
    # so we strip the trailing /api before concatenation.
    thumb = client_session.get(f"{API[:-4]}{up['thumbnail_url']}", timeout=30)
    assert thumb.status_code == 200, thumb.text
    assert thumb.content[:3] == b"\xff\xd8\xff", "JPEG magic header"


# ─── V15.2 — FAB chips have no visible text pill ───────────────────

def test_fab_chips_have_no_text_pill():
    src = _read("frontend/src/components/ReelActionMenu.jsx")
    # The old text pill markup (`bg-slate-900/85 backdrop-blur px-2.5`)
    # must be gone.
    assert "bg-slate-900/85 backdrop-blur" not in src
    # Each chip wires title + aria-label for a11y
    assert "title={a.label}" in src
    assert "aria-label={a.label}" in src


# ─── V12 — Add-another-eCard skips the plan step ───────────────────

def test_onboarding_skips_plan_step_for_2nd_ecard():
    src = _read("frontend/src/pages/ProviderOnboarding.jsx")
    assert "isAdditionalEcard" in src
    assert "STEPS_BASE" in src
    # When isAdditionalEcard is true, the plan step is sliced off.
    assert "STEPS_BASE.slice(1)" in src


def test_onboarding_no_more_hardcoded_step_indices():
    """The JSX branches must compare against `stepIndexInBase` so the
    same step blocks work for both first-and-additional eCards."""
    src = _read("frontend/src/pages/ProviderOnboarding.jsx")
    assert "stepIndexInBase" in src
    # Old hardcoded `step === 0` etc. for JSX branches must be gone.
    # Allow `step === 0` ONLY in setStep/comparison guards if any
    # were left in side effects — but no `{step === N &&` left.
    assert "{step === 0 &&" not in src
    assert "{step === 1 &&" not in src
    assert "{step === 5 &&" not in src


# ─── requirements.txt has ffmpeg-python ────────────────────────────

def test_ffmpeg_python_pinned():
    src = _read("backend/requirements.txt")
    assert "ffmpeg-python" in src.lower()
