"""
Iteration 92 — v4 Phase D
=========================

Covers:
  · Story tag de proveedor: anyone can post a story when they tag a
    provider; the tagged provider gets a push.
  · `/stories/active` surfaces `tagged_provider_*` fields so the viewer
    can render "Ver {business} →" CTA.
  · Frontend StoryCreator has the autocomplete UI.
  · Feed/Barrio unification: `/comunidad` uses ComunidadPage in barrio
    mode (smoke check already in iter89).
"""
import os
import sys
import uuid

import requests

sys.path.insert(0, os.path.dirname(__file__))
from tests.test_config import API, DEMO_SLUG  # noqa: E402


def _read(rel_path: str) -> str:
    full = os.path.join(os.path.dirname(__file__), "..", "..", rel_path)
    with open(full, encoding="utf-8") as f:
        return f.read()


def test_client_story_requires_tag(client_session):
    """Without tag, a non-provider client cannot post a story."""
    r = client_session.post(
        f"{API}/stories",
        json={"image_url": "https://example.com/photo.jpg"},
        timeout=15,
    )
    assert r.status_code in (403, 422)
    if r.status_code == 403:
        assert "Etiqueta" in r.text or "Tag" in r.text


def test_client_story_with_tag_creates_and_surfaces_tagged_provider(client_session):
    """Client tags a provider → story is created with tagged_provider_* snapshot."""
    # Resolve a real provider_id from the demo provider's slug
    r = requests.get(f"{API}/providers/by-slug/{DEMO_SLUG}", timeout=10)
    assert r.status_code == 200
    tagged_provider_id = r.json()["provider_id"]

    create = client_session.post(
        f"{API}/stories",
        json={
            "image_url": f"https://placehold.co/600x800?text=iter92-{uuid.uuid4().hex[:6]}",
            "caption": "Excelente trabajo, super recomendado",
            "tagged_provider_id": tagged_provider_id,
        },
        timeout=15,
    )
    assert create.status_code == 200, create.text
    doc = create.json()
    assert doc["tagged_provider_id"] == tagged_provider_id
    assert doc["tagged_provider_slug"] == DEMO_SLUG
    assert doc["tagged_business_name"]
    assert doc["is_provider_author"] is False
    story_id = doc["story_id"]

    # Listed in /stories/active with tag fields
    active = requests.get(f"{API}/stories/active", params={"limit": 50}, timeout=10)
    assert active.status_code == 200
    rows = active.json()
    assert any(
        row.get("latest_story_id") == story_id
        and row.get("tagged_provider_slug") == DEMO_SLUG
        and row.get("tagged_business_name")
        for row in rows
    ), f"tagged story not surfaced — rows={rows[:2]}"

    # Cleanup
    client_session.delete(f"{API}/stories/{story_id}", timeout=10)


def test_provider_can_still_post_without_tag(provider_session):
    """Backward compat — providers don't need a tag."""
    create = provider_session.post(
        f"{API}/stories",
        json={
            "image_url": f"https://placehold.co/600x800?text=iter92p-{uuid.uuid4().hex[:6]}",
            "caption": "Working today",
        },
        timeout=15,
    )
    assert create.status_code == 200, create.text
    doc = create.json()
    assert doc["is_provider_author"] is True
    assert doc.get("tagged_provider_id") in (None, "")
    provider_session.delete(f"{API}/stories/{doc['story_id']}", timeout=10)


# ─── Frontend source locks ─────────────────────────────────────────

def test_story_creator_has_tag_autocomplete():
    src = _read("frontend/src/components/StoriesCarousel.jsx")
    assert 'data-testid="story-creator-tag-input"' in src
    assert 'data-testid="story-creator-tag-chip"' in src
    assert "tagged_provider_id" in src
    # CTA wires to tagged provider when present
    assert "tagged_provider_slug" in src
    assert "tagged_business_name" in src


def test_feed_barrio_unified():
    """Section 89 v4 unification — /comunidad now renders barrio mode and
    the Feed tab is gone."""
    app = _read("frontend/src/App.js")
    layout = _read("frontend/src/components/ComunidadLayout.jsx")
    assert "ComunidadPage embedded barrio" in app
    assert 'id: "feed"' not in layout  # tab removed
    assert 'id: "barrio"' in layout
