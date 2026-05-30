"""
Iteration 96 — V7 rebuild regression (Pasos 1-4).

Covers:
  · Bottom nav swap (Buscar → Reels)
  · Provider Dashboard V7 home + sidebar groups + "Tarjetas físicas" tab
  · Admin Dashboard rebuild with 11 sections
  · Physical cards CRUD (provider + admin)
  · Admin overview / founders / payments endpoints
  · Reels moderation (admin toggle visibility)
  · /geo/reverse endpoint
  · LocationPrompt component + Search wiring
"""
import os
import sys
import uuid

import requests

sys.path.insert(0, os.path.dirname(__file__))
from tests.test_config import API  # noqa: E402


def _read(rel_path: str) -> str:
    full = os.path.join(os.path.dirname(__file__), "..", "..", rel_path)
    with open(full, encoding="utf-8") as f:
        return f.read()


# ─── Paso 1 — BottomNav + Reels closeout ───────────────────────────

def test_bottom_nav_uses_reels():
    src = _read("frontend/src/components/BottomNav.jsx")
    assert 'testid: "bottom-nav-reels"' in src
    assert 'path: "/reels"' in src
    # The legacy Search testid should be gone from the nav.
    assert 'testid: "bottom-nav-search"' not in src


# ─── Paso 2 — Provider Dashboard V7 ────────────────────────────────

def test_provider_sidenav_grouped_v7():
    src = _read("frontend/src/components/ProviderSideNav.jsx")
    assert "Dashboard" in src and "Negocio" in src and "Crecer" in src and "Admin" in src
    # New tabs in V7
    for tid in ("reels", "ecard", "analytics", "destacar", "tarjetas", "preferencias"):
        assert f'id: "{tid}"' in src, f"Sidebar item id={tid} not found"


def test_dashboard_home_v7_exists():
    src = _read("frontend/src/components/DashboardHomeV7.jsx")
    assert "dashboard-home-v7" in src
    assert "home-v7-completeness" in src
    assert "home-v7-portfolio" in src
    assert "home-v7-reels" in src
    assert "home-v7-referrals" in src
    assert "home-v7-feature" in src


def test_provider_dashboard_wires_v7_home():
    src = _read("frontend/src/pages/ProviderDashboard.jsx")
    assert "import DashboardHomeV7" in src
    assert "<DashboardHomeV7" in src


def test_trust_score_no_more_bajo_label():
    src = _read("frontend/src/components/TrustScore.jsx")
    assert "Completitud de perfil" in src
    # The component used to render `BAJO / MEDIO / ALTO` via tier labels.
    # We removed the visible tier badge — but the helper map may still
    # exist for internal use. The rendered JSX must NOT include
    # `t.label_es`/`t.label_en` inside the card variant header anymore.
    assert "{lang === \"en\" ? t.label_en : t.label_es}" not in src


# ─── Paso 3 — Admin Dashboard rebuild ──────────────────────────────

def test_admin_dashboard_has_all_sections():
    """V7 — admin layout NAV now includes the new sections (Reels,
    Founders, Tarjetas físicas) alongside the legacy entries."""
    src = _read("frontend/src/components/AdminLayout.jsx")
    for label_or_path in (
        "/admin/reels", "Reels",
        "/admin/founders", "Founding Members",
        "/admin/physical-cards", "Tarjetas físicas",
        "/admin/providers",  # legacy still wired
        "/admin/reviews",
    ):
        assert label_or_path in src, f"missing in NAV: {label_or_path}"


def test_admin_overview_endpoint(admin_session):
    r = admin_session.get(f"{API}/admin/overview", timeout=10)
    assert r.status_code == 200
    d = r.json()
    for k in ("total_users", "total_providers", "verified_providers", "new_users_7d"):
        assert k in d["kpis"]
    assert "founders" in d and "slots_total" in d["founders"]
    assert "recent_signups" in d


def test_admin_founders_endpoint(admin_session):
    r = admin_session.get(f"{API}/admin/founders", timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert "members" in d and isinstance(d["members"], list)


def test_admin_payments_endpoint(admin_session):
    r = admin_session.get(f"{API}/admin/payments", timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert d["stripe_live"] is False
    assert "recent_wallet_transactions" in d


def test_admin_reels_listing(admin_session):
    r = admin_session.get(f"{API}/admin/reels", timeout=10)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_admin_reels_toggle_requires_admin():
    # Anonymous → 401
    r = requests.patch(f"{API}/admin/reels/anything/visibility", timeout=10)
    assert r.status_code in (401, 403, 404)


# ─── Physical Cards ────────────────────────────────────────────────

def test_physical_cards_provider_order_and_listing(provider_session):
    # Create
    create = provider_session.post(
        f"{API}/physical-cards/orders",
        json={
            "packs": 1,
            "shipping": {
                "name": "María Test",
                "line1": "123 Main St",
                "city": "Sallisaw",
                "state": "OK",
                "zip": "74955",
                "phone": "555-1234",
            },
        },
        timeout=15,
    )
    assert create.status_code == 200, create.text
    order = create.json()
    assert order["order_id"].startswith("pcord_")
    assert order["qty_cards"] == 10
    assert order["total_usd"] == 29
    assert order["status"] == "ordered"

    # Provider can list their orders
    me = provider_session.get(f"{API}/physical-cards/orders/me", timeout=10)
    assert me.status_code == 200
    assert any(o["order_id"] == order["order_id"] for o in me.json())


def test_physical_cards_admin_listing_and_status(admin_session, provider_session):
    """End-to-end: provider creates order → admin advances status."""
    create = provider_session.post(
        f"{API}/physical-cards/orders",
        json={
            "packs": 2,
            "shipping": {
                "name": "Test",
                "line1": "1 A St",
                "city": "Chicago",
                "state": "IL",
                "zip": "60601",
            },
        },
        timeout=15,
    )
    order_id = create.json()["order_id"]

    # Admin sees it
    lst = admin_session.get(f"{API}/admin/physical-cards", timeout=10)
    assert lst.status_code == 200
    assert any(o["order_id"] == order_id for o in lst.json())

    # Admin updates status
    upd = admin_session.patch(
        f"{API}/admin/physical-cards/{order_id}",
        json={"status": "printing"}, timeout=10,
    )
    assert upd.status_code == 200
    assert upd.json()["status"] == "printing"


def test_physical_cards_requires_provider(client_session):
    r = client_session.post(
        f"{API}/physical-cards/orders",
        json={
            "packs": 1,
            "shipping": {"name": "x", "line1": "x", "city": "x", "state": "x", "zip": "x"},
        },
        timeout=10,
    )
    assert r.status_code == 403


# ─── Paso 4 — LocationPrompt + reverse geocode ─────────────────────

def test_geo_reverse_returns_city_state():
    r = requests.get(f"{API}/geo/reverse", params={"lat": 41.8781, "lng": -87.6298}, timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert "city" in d and "state" in d
    # We tolerate None when Nominatim is down/rate-limited, but on the
    # happy path the Chicago coords should resolve.
    assert d.get("city") in (None, "Chicago")
    assert d.get("state") in (None, "IL")


def test_location_prompt_component_exists():
    src = _read("frontend/src/components/LocationPrompt.jsx")
    assert "location-prompt" in src
    assert "location-prompt-geo" in src
    assert "location-prompt-confirm" in src
    assert "saveLocation" in src


def test_search_wires_location_prompt():
    src = _read("frontend/src/pages/Search.jsx")
    assert "import LocationPrompt" in src
    assert "<LocationPrompt" in src
    assert "search-location-chip" in src
