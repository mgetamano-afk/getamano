"""Iteration 9 — Sprint 1: 173-category catalog + SEO local routes regression.

Covers:
  - /api/seo/sectors (14 sectors, total cats >= 173)
  - /api/seo/cities (23 cities)
  - /api/seo/city/{slug}, /api/seo/category/{slug}
  - /api/seo/page/{cat}/{city}
  - /api/sitemap.xml, /api/robots.txt
  - Regression: /api/categories, /api/providers/* , /api/auth/login
"""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- SEO sectors ----------
def test_seo_sectors_returns_14_sectors_and_173_plus_categories(http):
    r = http.get(f"{API}/seo/sectors", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "sectors" in data
    sectors = data["sectors"]
    assert len(sectors) == 14, f"Expected 14 sectors, got {len(sectors)}"
    total_cats = 0
    for s in sectors:
        assert set(["sector", "label", "color", "categories"]).issubset(s.keys())
        assert isinstance(s["categories"], list)
        for c in s["categories"]:
            assert "category_id" in c
            assert "slug" in c
            assert "name_es" in c
            assert "sector" in c
            assert "license_flag" in c
            assert "providers_count" in c
            assert c["license_flag"] in ("red", "yellow", "green")
        total_cats += len(s["categories"])
    assert total_cats >= 173, f"Expected >=173 categories, got {total_cats}"


# ---------- SEO cities ----------
def test_seo_cities_returns_23(http):
    r = http.get(f"{API}/seo/cities", timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 23
    assert len(data["items"]) == 23
    for c in data["items"]:
        assert "slug" in c and "name" in c and "state" in c and "providers_count" in c


# ---------- SEO city detail ----------
def test_seo_city_detail_sallisaw(http):
    r = http.get(f"{API}/seo/city/sallisaw", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["city"]["slug"] == "sallisaw"
    assert isinstance(d["categories"], list)
    assert "total_providers" in d


def test_seo_city_detail_404(http):
    r = http.get(f"{API}/seo/city/no-existe-ciudad", timeout=30)
    assert r.status_code == 404


# ---------- SEO category detail ----------
def test_seo_category_detail_limpieza(http):
    r = http.get(f"{API}/seo/category/limpieza-hogar", timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["category"]["slug"] == "limpieza-hogar"
    assert isinstance(d["cities"], list)
    assert "total_cities" in d


def test_seo_category_detail_404(http):
    r = http.get(f"{API}/seo/category/no-existe-cat", timeout=30)
    assert r.status_code == 404


# ---------- SEO page combined ----------
def test_seo_page_limpieza_sallisaw(http):
    r = http.get(f"{API}/seo/page/limpieza-hogar/sallisaw", timeout=30)
    assert r.status_code == 200
    d = r.json()
    for k in ("category", "city", "providers", "related_cities", "related_categories"):
        assert k in d
    assert len(d["related_cities"]) <= 4
    assert len(d["related_categories"]) <= 4
    assert d["category"]["slug"] == "limpieza-hogar"
    assert d["city"]["slug"] == "sallisaw"


def test_seo_page_404_category(http):
    r = http.get(f"{API}/seo/page/no-existe-cat/sallisaw", timeout=30)
    assert r.status_code == 404


def test_seo_page_404_city(http):
    r = http.get(f"{API}/seo/page/limpieza-hogar/no-existe-city", timeout=30)
    assert r.status_code == 404


# ---------- sitemap + robots ----------
def test_sitemap_xml(http):
    r = http.get(f"{API}/sitemap.xml", timeout=60)
    assert r.status_code == 200
    assert "application/xml" in r.headers.get("content-type", "")
    body = r.text
    assert body.startswith("<?xml version")
    assert "<url><loc>https://getamano.us/" in body
    url_count = len(re.findall(r"<url>", body))
    assert url_count >= 200, f"Expected >=200 URLs, got {url_count}"


def test_robots_txt(http):
    r = http.get(f"{API}/robots.txt", timeout=30)
    assert r.status_code == 200
    assert "text/plain" in r.headers.get("content-type", "")
    body = r.text
    assert "User-agent: *" in body
    assert "Allow: /servicios/" in body
    assert "Disallow: /api/" in body
    assert "Sitemap: https://getamano.us/sitemap.xml" in body


# ---------- Regression ----------
def test_categories_legacy_listing(http):
    r = http.get(f"{API}/categories", timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 173


def test_providers_list(http):
    r = http.get(f"{API}/providers", timeout=30)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_providers_featured(http):
    r = http.get(f"{API}/providers/featured", timeout=30)
    assert r.status_code == 200


def test_providers_identity_counts(http):
    r = http.get(f"{API}/providers/identity-counts", timeout=30)
    assert r.status_code == 200
    d = r.json()
    for k in ("all", "latino", "american"):
        assert k in d


def test_promo_founding_status(http):
    r = http.get(f"{API}/promo-codes/founding-status", timeout=30)
    assert r.status_code == 200


def test_auth_login_admin(http):
    r = http.post(f"{API}/auth/login", json={"email": "admin@getamano.com", "password": "admin123"}, timeout=30)
    assert r.status_code == 200, r.text
    assert "user" in r.json() or "access_token" in r.json()


def test_auth_login_provider(http):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "demo.provider@getamano.com", "password": "provider123"}, timeout=30)
    assert r.status_code == 200, r.text
    # then try market-pulse on same session
    mp = s.get(f"{API}/providers/me/market-pulse", timeout=30)
    assert mp.status_code in (200, 404), f"market-pulse status {mp.status_code}: {mp.text[:200]}"
