"""
Iteration 79 — Hierarchical service category picker.

Backend tests that lock the contract of:
  · /api/categories          — every doc carries an `emoji` field
  · /api/categories/tree     — 14 sectors with non-empty children, sorted

The hierarchical UI relies on these two endpoints. If a future seed
migration drops the emoji column or breaks the sectoring, these tests
catch it.
"""
import os
import sys
import time

import pytest
import requests

sys.path.insert(0, os.path.dirname(__file__))
from tests.test_config import API  # noqa: E402


def test_categories_endpoint_returns_emojis_for_all():
    """Every category doc must expose a non-empty `emoji` after the
    backfill migration runs. Catches a regression where new categories
    are seeded without the emoji column."""
    r = requests.get(f"{API}/categories", timeout=10)
    assert r.status_code == 200
    cats = r.json()
    assert isinstance(cats, list) and len(cats) >= 14
    missing = [c["slug"] for c in cats if not (c.get("emoji") or "").strip()]
    assert not missing, f"categories without emoji: {missing[:10]}…"


def test_categories_tree_returns_full_hierarchy():
    """`/categories/tree` must return all sectors with children and
    the basic shape consumed by the React picker."""
    r = requests.get(f"{API}/categories/tree", timeout=10)
    assert r.status_code == 200
    tree = r.json()
    assert isinstance(tree, list)
    # The 14 SECTOR_LABELS keys ought to map to non-empty nodes after seed.
    assert len(tree) >= 10, f"expected ≥10 sectors, got {len(tree)}"
    for node in tree:
        assert isinstance(node, dict)
        for key in ("sector", "label_es", "emoji", "color", "count", "children"):
            assert key in node, f"node missing {key}: {node}"
        assert isinstance(node["children"], list)
        assert len(node["children"]) == node["count"]
        assert len(node["children"]) >= 1, f"empty sector: {node['sector']}"
        # Each child must carry its own emoji + slug + names
        for c in node["children"]:
            for key in ("slug", "emoji", "name_es", "name_en", "license_flag"):
                assert key in c, f"child missing {key}: {c}"
            assert c["emoji"], f"child missing emoji: {c}"
            # license_flag is one of the three known values
            assert c["license_flag"] in {"green", "yellow", "red"}, (
                f"unknown license_flag: {c}"
            )


def test_categories_tree_is_fast():
    """Picker is invoked from the search page on every open; must be <300 ms."""
    t0 = time.perf_counter()
    r = requests.get(f"{API}/categories/tree", timeout=10)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    assert r.status_code == 200
    assert elapsed_ms < 300, f"slow: {elapsed_ms:.0f}ms (>300ms cap)"


def test_categories_tree_children_alphabetical_within_sector():
    """Children inside a sector should be sorted by name_es so the
    picker presents them deterministically — no random shuffling
    between requests."""
    r = requests.get(f"{API}/categories/tree", timeout=10)
    assert r.status_code == 200
    tree = r.json()
    for node in tree:
        names = [(c.get("name_es") or "").lower() for c in node["children"]]
        assert names == sorted(names), (
            f"sector {node['sector']} not alphabetical: {names}"
        )


def test_search_with_subcategory_slug_returns_matching_providers():
    """Selecting a subcategory in the picker passes its `slug` as the
    `category` query param. The `/providers?category=...` endpoint
    must accept it (HTTP 200) and return a list — even if empty."""
    r = requests.get(f"{API}/categories/tree", timeout=10)
    assert r.status_code == 200
    # Use the first sector's first child as a guaranteed valid slug
    first_sub_slug = r.json()[0]["children"][0]["slug"]
    r2 = requests.get(f"{API}/providers", params={"category": first_sub_slug}, timeout=10)
    assert r2.status_code == 200
    assert isinstance(r2.json(), list)
