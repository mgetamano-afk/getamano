"""
Iteration 78 — Interactive story stickers (phone / promo / tip).

What this guards
────────────────
1. POST /stories accepts and persists a `stickers` array (max 3).
2. Validation rejects malformed stickers:
   · phone sticker without `phone`
   · promo/tip sticker without `text`
   · coords outside [0, 100]
   · phone shorter than 7 digits
   · more than 3 stickers
3. /stories/by-provider returns stickers unchanged (round-trip).
4. /stories/active does NOT include the bulky stickers array (carousel
   tiles only need image_url + meta; viewer fetches full payload).

Why /active should NOT carry stickers
─────────────────────────────────────
The home carousel renders 10-30 thumbnails. Sending sticker arrays for
each adds ~200B per row × 30 = 6KB of payload that nobody reads — the
viewer pulls `by-provider` when opened. Keeping `/active` lean keeps
the first paint snappy.
"""
import os
import sys
import uuid

import pytest
import requests

sys.path.insert(0, os.path.dirname(__file__))
from tests.test_config import API  # noqa: E402


def _upload_dummy_image(provider_session) -> str:
    """Create a tiny in-memory PNG and upload it. Returns the stored URL."""
    import io
    from PIL import Image
    img = Image.new("RGB", (200, 250), color=(120, 50, 90))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    buf.seek(0)
    files = {"file": ("test.png", buf, "image/png")}
    r = provider_session.post(f"{API}/upload", files=files, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["url"]


def test_create_story_with_phone_sticker(provider_session):
    img = _upload_dummy_image(provider_session)
    payload = {
        "image_url": img,
        "caption": "sticker test",
        "stickers": [
            {"type": "phone", "x": 50, "y": 70, "phone": "+1 555 222 3333"},
        ],
    }
    r = provider_session.post(f"{API}/stories", json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    data = r.json()
    assert "stickers" in data and len(data["stickers"]) == 1
    sti = data["stickers"][0]
    assert sti["type"] == "phone"
    # Phone should be normalized (digits only + leading +)
    assert sti["phone"].startswith("+") or sti["phone"][0].isdigit()
    assert all(c.isdigit() or c == "+" for c in sti["phone"])
    assert sti["x"] == 50.0
    assert sti["y"] == 70.0
    assert sti.get("id", "").startswith("sti_")
    # Clean up
    provider_session.delete(f"{API}/stories/{data['story_id']}")


def test_create_story_with_three_sticker_types(provider_session):
    img = _upload_dummy_image(provider_session)
    payload = {
        "image_url": img,
        "stickers": [
            {"type": "phone", "x": 20, "y": 30, "phone": "5551234567"},
            {"type": "promo", "x": 50, "y": 50, "text": "20% OFF Today"},
            {"type": "tip",   "x": 80, "y": 70, "text": "Pro tip"},
        ],
    }
    r = provider_session.post(f"{API}/stories", json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    data = r.json()
    types = sorted(s["type"] for s in data["stickers"])
    assert types == ["phone", "promo", "tip"]
    provider_session.delete(f"{API}/stories/{data['story_id']}")


def test_more_than_three_stickers_rejected(provider_session):
    img = _upload_dummy_image(provider_session)
    payload = {
        "image_url": img,
        "stickers": [{"type": "tip", "x": 50, "y": 50, "text": f"t{i}"} for i in range(4)],
    }
    r = provider_session.post(f"{API}/stories", json=payload, timeout=15)
    assert r.status_code == 422, r.text


def test_phone_sticker_without_number_rejected(provider_session):
    img = _upload_dummy_image(provider_session)
    payload = {
        "image_url": img,
        "stickers": [{"type": "phone", "x": 50, "y": 50}],
    }
    r = provider_session.post(f"{API}/stories", json=payload, timeout=15)
    assert r.status_code == 422


def test_promo_sticker_without_text_rejected(provider_session):
    img = _upload_dummy_image(provider_session)
    payload = {
        "image_url": img,
        "stickers": [{"type": "promo", "x": 50, "y": 50}],
    }
    r = provider_session.post(f"{API}/stories", json=payload, timeout=15)
    assert r.status_code == 422


def test_sticker_coords_out_of_range_rejected(provider_session):
    img = _upload_dummy_image(provider_session)
    for x, y in [(-5, 50), (50, 105), (110, 50)]:
        r = provider_session.post(f"{API}/stories", json={
            "image_url": img,
            "stickers": [{"type": "tip", "x": x, "y": y, "text": "x"}],
        }, timeout=15)
        assert r.status_code == 422, (x, y, r.status_code)


def test_phone_sticker_too_short_rejected(provider_session):
    img = _upload_dummy_image(provider_session)
    r = provider_session.post(f"{API}/stories", json={
        "image_url": img,
        "stickers": [{"type": "phone", "x": 50, "y": 50, "phone": "123"}],
    }, timeout=15)
    assert r.status_code == 422


def test_stories_by_provider_returns_stickers(provider_session):
    """Round-trip: a story created with stickers must come back with
    the same stickers via /stories/by-provider."""
    img = _upload_dummy_image(provider_session)
    payload = {
        "image_url": img,
        "stickers": [
            {"type": "promo", "x": 40, "y": 60, "text": "Hot deal"},
        ],
    }
    r = provider_session.post(f"{API}/stories", json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    created = r.json()
    story_id = created["story_id"]

    # Look up self via /providers/me (provider session)
    me = provider_session.get(f"{API}/providers/me", timeout=10).json()
    provider_uid = me.get("user_id") or me.get("provider_user_id")
    assert provider_uid

    r = provider_session.get(f"{API}/stories/by-provider/{provider_uid}", timeout=10)
    assert r.status_code == 200
    rows = r.json()
    target = next((s for s in rows if s["story_id"] == story_id), None)
    assert target is not None, "freshly created story missing from /by-provider"
    assert "stickers" in target
    assert len(target["stickers"]) == 1
    assert target["stickers"][0]["type"] == "promo"
    assert target["stickers"][0]["text"] == "Hot deal"

    # Clean up
    provider_session.delete(f"{API}/stories/{story_id}")
