"""Pre-launch BUG fixes regression tests. Run after every deploy."""
import os
import re
import sys
import httpx
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from test_config import BASE_URL as API_BASE, ADMIN_EMAIL, ADMIN_PASSWORD as ADMIN_PASS  # type: ignore


@pytest.fixture(scope="module")
def admin_client():
    c = httpx.Client(base_url=API_BASE, timeout=15)
    r = c.post("/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, r.text
    return c


def test_bug02_plans_endpoint_returns_correct_prices():
    """BUG-02: /api/plans must return Free $0 / Basic $10 / Pro $15 / Premium $25."""
    r = httpx.get(f"{API_BASE}/api/plans", timeout=10)
    assert r.status_code == 200
    data = r.json()
    prices = {p["id"]: p["price_monthly"] for p in data}
    assert prices == {"free": 0, "basic": 10, "pro": 15, "premium": 25}, prices


def test_bug02_ceo_metrics_uses_correct_prices(admin_client):
    """BUG-02: CEO metrics MRR computation must use the canonical pricing table."""
    r = admin_client.get("/api/admin/ceo-metrics")
    assert r.status_code == 200, r.text
    rev = r.json()["revenue"]
    assert rev["plan_prices"] == {"free": 0, "basic": 10, "pro": 15, "premium": 25}


def test_bug04_public_search_excludes_test_providers():
    """BUG-04: GET /api/providers must NOT return any business name starting with TEST."""
    r = httpx.get(f"{API_BASE}/api/providers?limit=50", timeout=10)
    assert r.status_code == 200
    items = r.json()
    test_items = [p for p in items if re.match(r"^TEST[_\s]?", p.get("business_name", ""), re.IGNORECASE)]
    assert not test_items, f"Found {len(test_items)} TEST providers leaking to public: {[p['business_name'] for p in test_items]}"


def test_bug04_admin_still_sees_test_providers(admin_client):
    """Admin endpoints must NOT apply the TEST filter so test data is still manageable."""
    r = admin_client.get("/api/admin/providers")
    assert r.status_code == 200
    items = r.json()
    test_items = [p for p in items if re.match(r"^TEST", p.get("business_name", ""), re.IGNORECASE)]
    # there should be at least some TEST rows from prior seeds
    assert len(test_items) > 0, "Admin should still see TEST rows for cleanup"


def test_bug04_featured_excludes_test():
    """BUG-04: GET /api/providers/featured must filter TEST out too."""
    r = httpx.get(f"{API_BASE}/api/providers/featured", timeout=10)
    assert r.status_code == 200
    for p in r.json():
        assert not re.match(r"^TEST", p.get("business_name", ""), re.IGNORECASE), p["business_name"]


def test_bug04_founding_status_excludes_test():
    """BUG-04: recent founding members must not include TEST."""
    r = httpx.get(f"{API_BASE}/api/promo-codes/founding-status", timeout=10)
    assert r.status_code == 200
    data = r.json()
    for rec in data.get("recent", []):
        name = (rec.get("business_name") or "")
        assert not re.match(r"^TEST", name, re.IGNORECASE), name


def test_bug05_public_stats_returns_label_key():
    """BUG-05: /public/stats must include `providers_label` so the homepage can show
    'registrados' vs 'verificados' depending on critical mass."""
    r = httpx.get(f"{API_BASE}/api/public/stats", timeout=10)
    assert r.status_code == 200
    s = r.json()
    assert "providers" in s and isinstance(s["providers"], int)
    assert "states" in s and isinstance(s["states"], int)
    assert s.get("providers_label") in {"registered", "verified"}


def test_bug06_founding_counter_consistency():
    """BUG-06: founding status used/max are consistent integers in [0..50]."""
    r = httpx.get(f"{API_BASE}/api/promo-codes/founding-status", timeout=10)
    assert r.status_code == 200
    s = r.json()
    assert isinstance(s["used"], int) and 0 <= s["used"] <= s["max"]
    assert s["max"] == 50
    if s["used"] >= s["max"]:
        assert s["available"] is False


def test_bug09_admin_cities_seeded(admin_client):
    """BUG-09: /admin/cities must return the pre-seeded 24 US cities (not empty)."""
    r = admin_client.get("/api/admin/cities")
    assert r.status_code == 200
    cities = r.json()
    assert len(cities) >= 20, f"Expected at least 20 cities, got {len(cities)}"
    names = {c["name"].lower() for c in cities}
    for must_have in ("dallas", "houston", "los angeles", "miami", "chicago"):
        assert must_have in names, f"Missing seeded city: {must_have}"


def test_bug09_admin_audit_log_works(admin_client):
    r = admin_client.get("/api/admin/audit-log")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_bug09_admin_pricing_intelligence_endpoint(admin_client):
    """AdminPricingIntelligence page depends on this endpoint."""
    r = admin_client.get("/api/admin/pricing-intelligence")
    # Either exists with 200 or hasn't been built yet (404). It must NOT return 500.
    assert r.status_code in (200, 404)
