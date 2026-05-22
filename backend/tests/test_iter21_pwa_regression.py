"""Iteration 21 — PWA + regression check.
Validates that PWA static assets are served correctly and that all
previously-working public APIs still return 200 with the expected shape.
"""
import os
import re
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if "REACT_APP_BACKEND_URL" in os.environ else "https://verified-providers-2.preview.emergentagent.com"


# ---------- PWA static assets ----------
def test_manifest_json_valid_and_full():
    r = requests.get(f"{BASE}/manifest.json", timeout=10)
    assert r.status_code == 200
    assert "application/json" in r.headers.get("content-type", "")
    m = r.json()
    assert m["name"] and m["short_name"] == "getamano"
    assert m["start_url"].startswith("/")
    assert m["scope"] == "/"
    assert m["display"] == "standalone"
    assert m["theme_color"] == "#025F67"
    assert m["background_color"] == "#F7F6F2"
    icons = m.get("icons", [])
    assert len(icons) == 12, f"expected 12 icons, got {len(icons)}"
    any_icons = [i for i in icons if i.get("purpose") == "any"]
    maskable_icons = [i for i in icons if i.get("purpose") == "maskable"]
    assert len(any_icons) == 10
    assert len(maskable_icons) == 2
    assert len(m.get("shortcuts", [])) == 3


def test_service_worker_served():
    r = requests.get(f"{BASE}/service-worker.js", timeout=10)
    assert r.status_code == 200
    assert "javascript" in r.headers.get("content-type", "")
    body = r.text
    assert "addEventListener" in body
    assert "/api/" in body  # API never-cache logic referenced


def test_index_html_has_pwa_meta():
    r = requests.get(f"{BASE}/", timeout=10)
    assert r.status_code == 200
    html = r.text
    assert 'rel="manifest"' in html
    assert 'href="/manifest.json"' in html
    assert 'name="theme-color"' in html
    assert "#025F67" in html
    assert 'name="apple-mobile-web-app-capable"' in html
    assert 'apple-touch-icon' in html
    assert 'viewport-fit=cover' in html
    assert 'property="og:title"' in html
    assert 'property="og:image"' in html


PWA_ICONS = [
    "icon-72x72.png", "icon-96x96.png", "icon-128x128.png", "icon-144x144.png",
    "icon-152x152.png", "icon-192x192.png", "icon-256x256.png", "icon-384x384.png",
    "icon-512x512.png", "icon-maskable-192x192.png", "icon-maskable-512x512.png",
    "apple-touch-icon-120.png", "apple-touch-icon-152.png",
    "apple-touch-icon-167.png", "apple-touch-icon-180.png",
]


def test_pwa_icons_all_200_png():
    for name in PWA_ICONS:
        r = requests.get(f"{BASE}/{name}", timeout=10)
        assert r.status_code == 200, f"{name} returned {r.status_code}"
        assert "image/png" in r.headers.get("content-type", ""), f"{name} bad ct"
        assert len(r.content) > 1000


# ---------- API regression ----------
def test_api_providers_ok():
    r = requests.get(f"{BASE}/api/providers", timeout=15)
    assert r.status_code == 200
    data = r.json()
    # Accept list or {items:[...]}
    items = data.get("items") if isinstance(data, dict) else data
    assert isinstance(items, list)


def test_api_public_stats_ok():
    r = requests.get(f"{BASE}/api/public/stats", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, dict)


def test_api_promo_codes_founding_status_ok():
    r = requests.get(f"{BASE}/api/promo-codes/founding-status", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, dict)


def test_api_plans_ok():
    r = requests.get(f"{BASE}/api/plans", timeout=10)
    assert r.status_code == 200
    data = r.json()
    items = data.get("items") if isinstance(data, dict) else data
    assert isinstance(items, list)
    assert len(items) >= 4


def test_api_categories_ok():
    r = requests.get(f"{BASE}/api/categories", timeout=10)
    assert r.status_code == 200
    data = r.json()
    items = data.get("items") if isinstance(data, dict) else data
    assert isinstance(items, list)
