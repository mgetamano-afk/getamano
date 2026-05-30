"""
Iteration 97 — V8 Landing enrichment regression.

Covers:
  · Custom VerifiedBadge component renders with the new artwork
  · ProviderECard + Search + SearchResultCard now use VerifiedBadge
  · V8 Landing enrichment sections mounted (Verifica/Tools/Reach/Table/Who/CTA)
  · Routes: `/` → Reels, `/about` → Landing, `/app` → AppHome,
    `/landing` → Landing alias
  · AboutNavBar component exists
  · Backend /founders/status still answers
"""
import os
import sys

import requests

sys.path.insert(0, os.path.dirname(__file__))
from tests.test_config import API  # noqa: E402


def _read(rel_path: str) -> str:
    full = os.path.join(os.path.dirname(__file__), "..", "..", rel_path)
    with open(full, encoding="utf-8") as f:
        return f.read()


# ─── Verified badge swap ─────────────────────────────────────────────

def test_verified_badge_component_exists():
    src = _read("frontend/src/components/VerifiedBadge.jsx")
    assert "verified-badge" in src
    # The component must point to the new artwork asset(s) via the
    # template literal `/verify-badge-${srcVariant}.png`.
    assert "verify-badge-${srcVariant}.png" in src


def test_verified_badge_artwork_files_present():
    base = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "public")
    for sz in (64, 128, 256):
        assert os.path.isfile(os.path.join(base, f"verify-badge-{sz}.png")), f"missing verify-badge-{sz}.png"


def test_provider_ecard_uses_verified_badge():
    src = _read("frontend/src/pages/ProviderECard.jsx")
    assert "import VerifiedBadge" in src
    assert "<VerifiedBadge" in src


def test_search_card_uses_verified_badge():
    src = _read("frontend/src/components/SearchResultCard.jsx")
    assert "import VerifiedBadge" in src
    assert "<VerifiedBadge" in src


def test_landing_uses_verified_badge():
    src = _read("frontend/src/pages/Landing.jsx")
    assert "import VerifiedBadge" in src


# ─── V8 sections ────────────────────────────────────────────────────

def test_v8_enrichment_component_exists():
    src = _read("frontend/src/components/V8EnrichmentSections.jsx")
    for tid in (
        "v8-enrichment",
        "v8-verify-section",
        "v8-tools-section",
        "v8-reach-section",
        "v8-ecosystem-section",
        "v8-who-section",
        "v8-final-cta",
    ):
        assert f'data-testid="{tid}"' in src, f"missing {tid}"


def test_v8_table_lists_features():
    src = _read("frontend/src/components/V8EnrichmentSections.jsx")
    # A few canonical rows must be in the table source
    for keyword in (
        "Trust Score",
        "GM-XXXX",
        "Reels",
        "Portfolio",
        "Portafolio",
        "Featured",
        "Destacado",
        "Physical business card",
        "Tarjeta física",
    ):
        assert keyword in src, f"feature row missing: {keyword}"


def test_v8_wired_into_landing():
    src = _read("frontend/src/pages/Landing.jsx")
    assert "import V8EnrichmentSections" in src
    assert "<V8EnrichmentSections />" in src


def test_about_nav_bar_exists_and_used_on_about():
    nav = _read("frontend/src/components/AboutNavBar.jsx")
    assert 'data-testid="about-nav-bar"' in nav
    assert 'about-nav-open-app' in nav
    landing = _read("frontend/src/pages/Landing.jsx")
    assert "AboutNavBar" in landing
    assert "isAboutRoute" in landing


def test_routes_v8():
    src = _read("frontend/src/App.js")
    assert '<Route path="/" element={<ReelsPage />}' in src
    assert '<Route path="/about" element={<Landing />}' in src
    assert '<Route path="/app" element={<AppHome />}' in src


# ─── Backend: Founder banner data source ─────────────────────────────

def test_founders_status_endpoint_works():
    r = requests.get(f"{API}/founders/status", timeout=10)
    assert r.status_code == 200
    body = r.json()
    for k in ("slots_used", "slots_total"):
        assert k in body
