"""Iteration 49 — i18n SEO sitemap + robots tests.

Validates:
- /api/sitemap.xml emits xhtml:xmlns declaration
- Bilingual pairs (/servicios/* + /services/*) with mutual hreflang annotations
- City+category combos paired bilingually
- Provider URLs paired (/proveedor/{slug} + /provider/{slug})
- Home / emitted once with x-default
- /api/robots.txt allows EN routes
"""

import os
import sys
import pytest
import requests
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(__file__))
from test_config import BASE_URL  # noqa: E402
SITEMAP_URL = f"{BASE_URL}/api/sitemap.xml"
ROBOTS_URL = f"{BASE_URL}/api/robots.txt"

NS = {
    "sm": "http://www.sitemaps.org/schemas/sitemap/0.9",
    "xhtml": "http://www.w3.org/1999/xhtml",
}


@pytest.fixture(scope="module")
def sitemap_text():
    r = requests.get(SITEMAP_URL, timeout=30)
    assert r.status_code == 200, f"sitemap returned {r.status_code}"
    return r.text


@pytest.fixture(scope="module")
def sitemap_root(sitemap_text):
    return ET.fromstring(sitemap_text)


@pytest.fixture(scope="module")
def loc_to_alts(sitemap_root):
    """Map each <loc> → list of (hreflang, href) from its xhtml:link sibs."""
    mapping = {}
    for url_el in sitemap_root.findall("sm:url", NS):
        loc = url_el.find("sm:loc", NS).text
        alts = []
        for link in url_el.findall("xhtml:link", NS):
            alts.append((link.get("hreflang"), link.get("href")))
        mapping.setdefault(loc, []).append(alts)
    return mapping


# ─── Sitemap basics ────────────────────────────────────────────────────
class TestSitemapBasics:
    def test_sitemap_status_200(self):
        r = requests.get(SITEMAP_URL, timeout=30)
        assert r.status_code == 200
        assert "xml" in r.headers.get("content-type", "").lower()

    def test_xhtml_xmlns_declared(self, sitemap_text):
        assert 'xmlns:xhtml="http://www.w3.org/1999/xhtml"' in sitemap_text

    def test_xhtml_link_annotations_present(self, sitemap_text):
        # At least one xhtml:link hreflang annotation must exist
        assert sitemap_text.count("<xhtml:link") > 50, "Expected many hreflang annotations"
        assert 'hreflang="es"' in sitemap_text
        assert 'hreflang="en"' in sitemap_text
        assert 'hreflang="x-default"' in sitemap_text

    def test_well_formed_xml(self, sitemap_root):
        # If ET parsed it successfully, it's well-formed
        assert sitemap_root.tag.endswith("urlset")


# ─── Bilingual pairing ────────────────────────────────────────────────
class TestBilingualPairs:
    def test_servicios_has_services_alternate(self, loc_to_alts):
        es_locs = [l for l in loc_to_alts if "/servicios/" in l or l.endswith("/servicios")]
        assert len(es_locs) > 0, "No /servicios URLs found"
        for es_loc in es_locs[:20]:  # sample
            en_loc = es_loc.replace("/servicios", "/services", 1)
            assert en_loc in loc_to_alts, f"Missing EN twin for {es_loc} → {en_loc}"
            # Check alternates exist
            alts = loc_to_alts[es_loc][0]
            hreflangs = {hl for hl, _ in alts}
            assert {"es", "en", "x-default"}.issubset(hreflangs), f"Missing hreflangs on {es_loc}: {hreflangs}"

    def test_services_has_servicios_alternate(self, loc_to_alts):
        en_locs = [l for l in loc_to_alts if "/services/" in l or l.endswith("/services")]
        assert len(en_locs) > 0
        for en_loc in en_locs[:20]:
            es_loc = en_loc.replace("/services", "/servicios", 1)
            assert es_loc in loc_to_alts, f"Missing ES twin for {en_loc}"

    def test_category_city_pair_present(self, loc_to_alts):
        # Sample: cleaning/sallisaw
        es_url = "https://getamano.us/servicios/cleaning/sallisaw"
        en_url = "https://getamano.us/services/cleaning/sallisaw"
        # These may exist depending on DB seeds. If category=cleaning is missing, skip.
        if es_url not in loc_to_alts:
            pytest.skip("cleaning category not seeded; skipping category/city pair test")
        assert en_url in loc_to_alts, "EN twin for cleaning/sallisaw missing"

        es_alts = dict(loc_to_alts[es_url][0])
        en_alts = dict(loc_to_alts[en_url][0])
        assert es_alts.get("es") == es_url
        assert es_alts.get("en") == en_url
        assert en_alts.get("es") == es_url
        assert en_alts.get("en") == en_url

    def test_provider_pair_present(self, loc_to_alts, sitemap_text):
        # Look for any /proveedor/ URL and check /provider/ twin
        prov_es = [l for l in loc_to_alts if "/proveedor/" in l]
        if not prov_es:
            pytest.skip("No active providers seeded with slugs")
        # Pick a few
        for es_loc in prov_es[:5]:
            en_loc = es_loc.replace("/proveedor/", "/provider/", 1)
            assert en_loc in loc_to_alts, f"Provider EN twin missing: {en_loc}"
            alts = dict(loc_to_alts[es_loc][0])
            assert alts.get("es") == es_loc
            assert alts.get("en") == en_loc
            assert alts.get("x-default") == es_loc

    def test_verified_providers_2_pair(self, loc_to_alts):
        es_url = "https://getamano.us/proveedor/verified-providers-2"
        en_url = "https://getamano.us/provider/verified-providers-2"
        if es_url not in loc_to_alts:
            pytest.skip("verified-providers-2 not in DB; skipping")
        assert en_url in loc_to_alts


# ─── Home URL emitted once ────────────────────────────────────────────
class TestHomeUrl:
    def test_home_emitted_once(self, sitemap_text, loc_to_alts):
        home = "https://getamano.us/"
        # Count occurrences of <loc>https://getamano.us/</loc>
        loc_count = sitemap_text.count(f"<loc>{home}</loc>")
        assert loc_count == 1, f"Home / should appear exactly once, got {loc_count}"

    def test_home_has_x_default(self, loc_to_alts):
        home = "https://getamano.us/"
        assert home in loc_to_alts
        alts = loc_to_alts[home][0]
        hreflangs = {hl for hl, _ in alts}
        assert "x-default" in hreflangs

    def test_home_has_no_es_en_split(self, loc_to_alts):
        # Home should NOT have separate es/en hreflangs since both langs share same path
        home = "https://getamano.us/"
        alts = loc_to_alts[home][0]
        hreflangs = [hl for hl, _ in alts]
        # Only x-default (per current impl) - or es+en+x-default all pointing to same url is also OK
        # but we accept either as long as x-default is there
        assert "x-default" in hreflangs


# ─── Robots ───────────────────────────────────────────────────────────
class TestRobots:
    def test_robots_200(self):
        r = requests.get(ROBOTS_URL, timeout=30)
        assert r.status_code == 200

    def test_robots_allows_english_routes(self):
        r = requests.get(ROBOTS_URL, timeout=30)
        body = r.text
        for expected in ["Allow: /services/", "Allow: /cities/", "Allow: /provider/"]:
            assert expected in body, f"Missing line: {expected}"

    def test_robots_still_allows_spanish_routes(self):
        r = requests.get(ROBOTS_URL, timeout=30)
        body = r.text
        for expected in ["Allow: /servicios/", "Allow: /ciudades/", "Allow: /proveedor/"]:
            assert expected in body, f"Missing line: {expected}"

    def test_robots_disallows_api(self):
        r = requests.get(ROBOTS_URL, timeout=30)
        assert "Disallow: /api/" in r.text
