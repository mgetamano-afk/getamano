"""
Iteration 106 — V14 AI Card Designer.

Backend integration: hits the real Gemini Nano Banana endpoint via the
Emergent LLM key (response ~5-15s). Frontend assertions are source-code
locks so they run instantly.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))
from tests.test_config import API, DEMO_SLUG  # noqa: E402


def _read(rel: str) -> str:
    full = os.path.join(os.path.dirname(__file__), "..", "..", rel)
    with open(full, encoding="utf-8") as f:
        return f.read()


@pytest.fixture()
def primary_provider_id(provider_session):
    me = provider_session.get(f"{API}/providers/by-slug/{DEMO_SLUG}", timeout=10).json()
    return me["provider_id"]


AI_TIMEOUT = 60  # real Gemini calls can take 15-30s; give margin


# ─── Backend ────────────────────────────────────────────────────────

def test_ai_design_create_persists_and_returns_data_url(provider_session, primary_provider_id):
    r = provider_session.post(f"{API}/physical-cards/ai-design", json={
        "provider_id": primary_provider_id,
        "palette": ["#0077B6", "#03045E", "#F77F00"],
    }, timeout=AI_TIMEOUT)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["design_id"].startswith("des_")
    assert body["palette"] == ["#0077B6", "#03045E", "#F77F00"]
    assert body["preview_data_url"].startswith("data:image/")
    assert body["category_label"]


def test_ai_design_active_returns_latest(provider_session, primary_provider_id):
    """Single AI call + verify the most recent design wins."""
    a = provider_session.post(f"{API}/physical-cards/ai-design", json={
        "provider_id": primary_provider_id,
        "palette": ["#FF0000", "#00FF00", "#0000FF"],
    }, timeout=AI_TIMEOUT).json()
    active = provider_session.get(f"{API}/physical-cards/ai-design/active", timeout=10).json()
    assert active["design_id"] == a["design_id"]
    assert active["palette"] == ["#FF0000", "#00FF00", "#0000FF"]


def test_ai_design_rejects_palette_with_less_than_3_colors(provider_session, primary_provider_id):
    r = provider_session.post(f"{API}/physical-cards/ai-design", json={
        "provider_id": primary_provider_id,
        "palette": ["#0077B6"],
    }, timeout=10)
    assert r.status_code == 422, r.text


def test_ai_design_rejects_foreign_provider(provider_session):
    r = provider_session.post(f"{API}/physical-cards/ai-design", json={
        "provider_id": "prov_someoneelse",
        "palette": ["#000000", "#111111", "#222222"],
    }, timeout=10)
    assert r.status_code == 404, r.text


def test_preview_pdf_after_active_design(provider_session):
    """Validates the PDF still streams cleanly when an AI design is active."""
    r = provider_session.get(f"{API}/physical-cards/preview-pdf", timeout=20)
    assert r.status_code == 200, r.text
    assert r.content.startswith(b"%PDF")


def test_print_order_carries_design_id(provider_session, primary_provider_id):
    active = provider_session.get(f"{API}/physical-cards/ai-design/active", timeout=10).json()
    if not active.get("design_id"):
        pytest.skip("no active design yet")
    r = provider_session.post(f"{API}/physical-cards/print-orders", json={
        "provider_id": primary_provider_id, "packs": 1, "design_id": active["design_id"],
    }, timeout=20).json()
    assert r["design_id"] == active["design_id"]
    assert r["has_ai_background"] is True


# ─── Frontend wiring ────────────────────────────────────────────────

def test_ai_card_designer_component_wired_into_panel():
    src = _read("frontend/src/components/PhysicalCardsPanel.jsx")
    assert "AiCardDesigner" in src
    assert "onDesignChange" in src


def test_ai_card_designer_has_presets_and_custom_picker():
    src = _read("frontend/src/components/AiCardDesigner.jsx")
    assert 'data-testid="ai-card-designer"' in src
    assert 'data-testid="ai-generate-button"' in src
    assert 'data-testid="ai-custom-palette"' in src
    for pid in ("ocean", "sunset", "forest", "berry", "monochrome", "warm"):
        assert f'id: "{pid}"' in src
    assert "extractDominantColors" in src


def test_preview_overlays_ai_background_and_shows_ia_badge():
    src = _read("frontend/src/components/PhysicalCardsPanel.jsx")
    assert "preview_data_url" in src
    assert 'data-testid="physical-card-ai-badge"' in src
    assert "design_id" in src
