"""V19.3 — Server.py refactor: extracted routers.

Validates that endpoints previously inline in `server.py` continue to
work after being moved into `routes/admin_insights.py` and
`routes/admin_catalog.py`. Also asserts the modules are properly wired
via `make_router(...)` (the codebase pattern).
"""
from __future__ import annotations

import os
import requests
from tests.test_config import API


# Module-level cache so we don't trigger the auth/login rate limiter when
# the file's 9 tests all run in the same process. Tests are read-only-ish
# (one CRUD test cleans up after itself) so sharing one session is safe.
_TOKEN_CACHE: dict[str, str] = {}


def _admin_token() -> str:
    if "admin" in _TOKEN_CACHE:
        return _TOKEN_CACHE["admin"]
    r = requests.post(f"{API}/auth/login", json={
        "email": os.environ.get("TEST_ADMIN_EMAIL", "admin@getamano.com"),
        "password": os.environ.get("TEST_ADMIN_PASSWORD", "admin123"),
    }, timeout=15)
    r.raise_for_status()
    body = r.json()
    tok = body.get("token") or body.get("access_token")
    _TOKEN_CACHE["admin"] = tok
    return tok


# ─── Module wiring ──────────────────────────────────────────────────
def test_admin_insights_module_exposes_make_router():
    from routes.admin_insights import make_router, PLAN_PRICES
    # Sanity: factory signature matches the codebase pattern
    assert callable(make_router)
    # Single source of truth for plan prices is exported
    assert PLAN_PRICES == {"free": 0, "basic": 10, "pro": 15, "premium": 25}


def test_admin_catalog_module_exposes_make_router():
    from routes.admin_catalog import make_router
    assert callable(make_router)


def test_server_py_no_longer_defines_extracted_endpoints():
    """The original inline `@api_router.get(\"/admin/ceo-metrics\")` etc.
    decorators must NOT live in server.py anymore — they belong to the
    extracted modules. We assert their absence to lock the refactor."""
    with open("/app/backend/server.py", "r", encoding="utf-8") as f:
        src = f.read()
    # Decorators that were moved out
    for moved in [
        '@api_router.get("/admin/ceo-metrics")',
        '@api_router.get("/admin/code-health")',
        '@api_router.get("/admin/daily-brief")',
        '@api_router.post("/admin/categories")',
        '@api_router.put("/admin/categories/{category_id}")',
        '@api_router.delete("/admin/categories/{category_id}")',
        '@api_router.get("/admin/cities")',
        '@api_router.post("/admin/cities")',
        '@api_router.delete("/admin/cities/{city_id}")',
        '@api_router.get("/cities")',
        '@api_router.get("/admin/audit-log")',
    ]:
        assert moved not in src, f"server.py still defines {moved!r} — extraction incomplete"
    # The new include_router calls MUST exist
    assert "_make_admin_insights_router" in src
    assert "_make_admin_catalog_router" in src


# ─── Endpoints still work ───────────────────────────────────────────
def test_admin_ceo_metrics_still_works():
    tok = _admin_token()
    r = requests.get(f"{API}/admin/ceo-metrics", headers={"Authorization": f"Bearer {tok}"}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    # Shape sanity
    for key in ("volume", "acquisition", "engagement", "revenue", "geography", "categories", "top_performers", "activity"):
        assert key in body, f"missing key: {key}"
    assert body["revenue"]["plan_prices"] == {"free": 0, "basic": 10, "pro": 15, "premium": 25}


def test_admin_code_health_still_works():
    tok = _admin_token()
    r = requests.get(f"{API}/admin/code-health", headers={"Authorization": f"Bearer {tok}"}, timeout=60)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["verdict"] in {"green", "yellow", "red"}
    # The dashboard should observe that we DID drop server.py LOC
    server_loc = next((h["loc"] for h in body["hotspots"] if h["file"] == "server.py"), None)
    assert server_loc is not None
    assert server_loc < 11_000, f"server.py still {server_loc} LOC — refactor didn't reduce it"


def test_admin_categories_crud_still_works():
    tok = _admin_token()
    headers = {"Authorization": f"Bearer {tok}"}
    # Create a throwaway category
    slug = f"refactor_test_{os.urandom(4).hex()}"
    create = requests.post(f"{API}/admin/categories", headers=headers, json={
        "slug": slug,
        "name_es": "Test refactor",
        "name_en": "Test refactor",
        "icon": "Sparkles",
        "color": "#3B82F6",
    }, timeout=15)
    assert create.status_code == 200, create.text
    cat_id = create.json()["category_id"]
    try:
        # Update
        upd = requests.put(f"{API}/admin/categories/{cat_id}", headers=headers, json={
            "slug": slug, "name_es": "Test refactor v2", "name_en": "Test refactor v2",
            "icon": "Sparkles", "color": "#FF0000",
        }, timeout=15)
        assert upd.status_code == 200, upd.text
        # Duplicate-slug guard still works
        dup = requests.post(f"{API}/admin/categories", headers=headers, json={
            "slug": slug, "name_es": "x", "name_en": "x", "icon": "Sparkles", "color": "#000",
        }, timeout=15)
        assert dup.status_code == 400
    finally:
        # Delete
        d = requests.delete(f"{API}/admin/categories/{cat_id}", headers=headers, timeout=15)
        assert d.status_code == 200


def test_admin_cities_and_public_cities_still_work():
    tok = _admin_token()
    headers = {"Authorization": f"Bearer {tok}"}
    # Admin list (auth required)
    a = requests.get(f"{API}/admin/cities", headers=headers, timeout=15)
    assert a.status_code == 200
    assert isinstance(a.json(), list)
    # Public list (no auth)
    p = requests.get(f"{API}/cities", timeout=15)
    assert p.status_code == 200
    assert isinstance(p.json(), list)
    # Admin endpoint should reject unauth
    u = requests.get(f"{API}/admin/cities", timeout=15)
    assert u.status_code in {401, 403}


def test_admin_audit_log_still_works():
    tok = _admin_token()
    headers = {"Authorization": f"Bearer {tok}"}
    r = requests.get(f"{API}/admin/audit-log?limit=5", headers=headers, timeout=15)
    assert r.status_code == 200
    logs = r.json()
    assert isinstance(logs, list)
    if logs:
        # Each row has admin info joined in
        assert "admin" in logs[0]
        assert "action" in logs[0]


def test_code_health_dashboard_validates_refactor_impact():
    """The CEO dashboard observes the refactor itself: server.py LOC
    must have dropped >400 lines from the pre-refactor baseline of
    ~11,413. This test 'closes the loop' — the founder's intuition
    that the dashboard would surface refactor wins is now provable."""
    tok = _admin_token()
    r = requests.get(f"{API}/admin/code-health", headers={"Authorization": f"Bearer {tok}"}, timeout=60)
    assert r.status_code == 200
    loc = next((h["loc"] for h in r.json()["hotspots"] if h["file"] == "server.py"), 0)
    # Pre-refactor: 11,413. Post-refactor: ~10,852. We allow a ±50 wiggle
    # room for future minor edits to the file.
    assert loc < 11_000, f"server.py LOC={loc} — expected <11000 after V19.3 extraction"
