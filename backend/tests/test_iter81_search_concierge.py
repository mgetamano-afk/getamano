"""
Iteration 81 — AI Search Concierge contract tests.

Locks the behavior of POST /api/search/concierge:
  · Returns a JSON object with the documented shape
  · Maps natural-language Spanish & English queries to real slugs
  · Caches responses (second call shows from_cache=true)
  · Rejects too-short queries with 422
  · Cache hits are <500 ms

NOTE: These hit the live Gemini API via the Emergent LLM key, so they
are skipped if the key is not configured (e.g., local dev without the
.env file).
"""
import os
import sys
import time

import pytest
import requests

sys.path.insert(0, os.path.dirname(__file__))
from tests.test_config import API  # noqa: E402


def _has_llm_key() -> bool:
    if "EMERGENT_LLM_KEY" in os.environ:
        return True
    try:
        with open("/app/backend/.env") as f:
            for line in f:
                if line.startswith("EMERGENT_LLM_KEY="):
                    return True
    except FileNotFoundError:
        pass
    return False


pytestmark = pytest.mark.skipif(not _has_llm_key(), reason="no EMERGENT_LLM_KEY available")


def _post(query: str) -> requests.Response:
    return requests.post(
        f"{API}/search/concierge",
        json={"query": query},
        timeout=15,
    )


def test_too_short_query_rejected():
    r = _post("hi")
    assert r.status_code == 422


def test_spanish_roof_query_maps_to_techos():
    r = _post("necesito que arreglen mi techo, tengo goteras")
    assert r.status_code == 200, r.text
    data = r.json()
    for key in ("slug", "category_id", "name_es", "name_en", "emoji", "confidence", "reasoning_es", "from_cache"):
        assert key in data, f"missing {key} in {data}"
    assert data["slug"] == "techos", f"expected techos, got {data['slug']}"
    assert data["confidence"] in {"high", "medium", "low"}
    assert isinstance(data["from_cache"], bool)


def test_english_query_maps_to_a_valid_slug():
    """English input must still classify into one of the catalog slugs."""
    r = _post("I need someone to fix my air conditioning")
    assert r.status_code == 200
    data = r.json()
    assert data["slug"], f"empty slug for AC query: {data}"
    # AC / HVAC is in the catalog; the LLM should land somewhere reasonable
    assert "hvac" in data["slug"] or "ac" in data["slug"].lower() or data["slug"] == "hvac"


def test_cache_returns_from_cache_true_on_repeat():
    """Same normalized query → cache hit on second call."""
    query = "busco quien me cuide a mi mama los fines de semana"
    r1 = _post(query)
    assert r1.status_code == 200
    r2 = _post(query)
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["from_cache"] is True


def test_cache_hit_is_fast():
    """Cache hits must avoid the LLM round-trip → <500ms."""
    query = "necesito un plomero para mi cocina"
    # warm
    _post(query)
    t0 = time.perf_counter()
    r = _post(query)
    elapsed = (time.perf_counter() - t0) * 1000
    assert r.status_code == 200
    assert r.json()["from_cache"] is True
    assert elapsed < 500, f"cache slow: {elapsed:.0f}ms"


def test_unclassifiable_query_returns_empty_slug():
    """Nonsensical input should NOT invent a slug."""
    r = _post("qwerty asdfgh zxcvbn 12345")
    assert r.status_code == 200
    data = r.json()
    # The model is allowed to be wrong, but it MUST either return a valid
    # slug from the catalog OR an empty string. It must never invent one.
    if data["slug"]:
        # If it picked something, verify it's a real slug from the catalog
        cats = requests.get(f"{API}/categories", timeout=10).json()
        valid = {c["slug"] for c in cats}
        assert data["slug"] in valid, f"invented slug: {data['slug']}"
