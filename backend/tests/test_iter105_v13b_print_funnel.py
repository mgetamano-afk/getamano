"""
Iteration 105 — V13b Print-with-getamano funnel.

Backend integration tests + frontend source-code locks:
  · GET  /physical-cards/preview-pdf returns application/pdf binary.
  · POST /physical-cards/print-orders creates row with PDF stored.
  · GET  /physical-cards/print-orders/me lists provider's orders (no pdf_b64).
  · GET  /admin/print-orders lists every order, no pdf payload.
  · GET  /admin/print-orders/{id}/pdf streams the PDF back to admin.
  · PATCH /admin/print-orders/{id}?status=queued_for_print updates the row.
  · Frontend buttons + AdminPrintOrders page are wired.
"""
import os
import sys

import pytest
import requests

sys.path.insert(0, os.path.dirname(__file__))
from tests.test_config import API, DEMO_SLUG  # noqa: E402


def _read(rel: str) -> str:
    full = os.path.join(os.path.dirname(__file__), "..", "..", rel)
    with open(full, encoding="utf-8") as f:
        return f.read()


@pytest.fixture()
def db():
    from pymongo import MongoClient
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")
    return MongoClient(mongo_url)[db_name]


@pytest.fixture()
def primary_provider_id(provider_session):
    me = provider_session.get(f"{API}/providers/by-slug/{DEMO_SLUG}", timeout=10).json()
    return me["provider_id"]


# ─── Backend ───────────────────────────────────────────────────────

def test_preview_pdf_returns_pdf_binary(provider_session):
    r = provider_session.get(f"{API}/physical-cards/preview-pdf", timeout=15)
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("application/pdf")
    assert r.content.startswith(b"%PDF")
    assert len(r.content) > 5000


def test_preview_pdf_includes_business_name(provider_session):
    """The PDF body should mention the business name verbatim so the printer
    knows which order it belongs to even if it gets renamed locally."""
    r = provider_session.get(f"{API}/physical-cards/preview-pdf", timeout=15)
    # ReportLab encodes text as PostScript-style. We grep for a uniquely
    # identifiable token from María's Cleaning Services.
    assert b"Cleaning" in r.content or b"Mar" in r.content


def test_submit_print_order_creates_row_and_returns_no_pdf(provider_session, primary_provider_id, db):
    r = provider_session.post(
        f"{API}/physical-cards/print-orders",
        json={"provider_id": primary_provider_id, "packs": 1, "notes": "Acabado brillante"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "pdf_b64" not in body  # never leak to provider
    assert body["status"] == "pending_payment"
    assert body["packs"] == 1
    assert body["total_usd"] == 29  # PRICE_PER_PACK_USD
    # PDF is stored server-side
    stored = db.print_card_orders.find_one({"order_id": body["order_id"]})
    assert stored["pdf_b64"]
    assert stored["notes"] == "Acabado brillante"


def test_my_print_orders_list_excludes_pdf(provider_session):
    items = provider_session.get(f"{API}/physical-cards/print-orders/me", timeout=10).json()
    assert isinstance(items, list)
    for o in items:
        assert "pdf_b64" not in o


def test_admin_list_print_orders_excludes_pdf(admin_session):
    r = admin_session.get(f"{API}/admin/print-orders", timeout=10)
    assert r.status_code == 200, r.text
    for o in r.json():
        assert "pdf_b64" not in o


def test_admin_can_download_print_order_pdf(provider_session, primary_provider_id, admin_session):
    created = provider_session.post(
        f"{API}/physical-cards/print-orders",
        json={"provider_id": primary_provider_id, "packs": 2},
        timeout=15,
    ).json()
    order_id = created["order_id"]
    r = admin_session.get(f"{API}/admin/print-orders/{order_id}/pdf", timeout=15)
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("application/pdf")
    assert r.content.startswith(b"%PDF")


def test_admin_can_advance_print_order_status(provider_session, primary_provider_id, admin_session):
    created = provider_session.post(
        f"{API}/physical-cards/print-orders",
        json={"provider_id": primary_provider_id, "packs": 1},
        timeout=15,
    ).json()
    order_id = created["order_id"]
    r = admin_session.patch(
        f"{API}/admin/print-orders/{order_id}",
        params={"status": "queued_for_print"},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "queued_for_print"


def test_admin_rejects_invalid_status(admin_session):
    r = admin_session.patch(
        f"{API}/admin/print-orders/pco_doesnotexist",
        params={"status": "bogus"},
        timeout=10,
    )
    assert r.status_code == 400, r.text


def test_admin_pdf_404_on_missing_order(admin_session):
    r = admin_session.get(f"{API}/admin/print-orders/pco_doesnotexist/pdf", timeout=10)
    assert r.status_code == 404, r.text


def test_provider_cannot_print_other_users_ecard(provider_session):
    r = provider_session.post(
        f"{API}/physical-cards/print-orders",
        json={"provider_id": "prov_someoneelse", "packs": 1},
        timeout=10,
    )
    assert r.status_code == 404, r.text


# ─── Frontend wiring (source-code locks) ───────────────────────────

def test_physical_cards_panel_has_pdf_and_print_buttons():
    src = _read("frontend/src/components/PhysicalCardsPanel.jsx")
    assert 'data-testid="physical-card-download-pdf"' in src
    assert 'data-testid="physical-card-print-with-getamano"' in src
    # Endpoints wired
    assert "/physical-cards/preview-pdf" in src
    assert "/physical-cards/print-orders" in src


def test_admin_print_orders_page_exists_and_wired():
    src = _read("frontend/src/pages/admin/AdminPrintOrders.jsx")
    assert 'data-testid="admin-print-orders-page"' in src
    assert "/admin/print-orders" in src
    assert "/admin/print-orders/${orderId}/pdf" in src
    # Status flow
    for status in ("pending_payment", "queued_for_print", "printing", "shipped", "delivered"):
        assert status in src


def test_admin_sidebar_has_print_orders_link():
    src = _read("frontend/src/components/AdminLayout.jsx")
    assert '"/admin/print-orders"' in src
    assert "Imprimir con getamano" in src


def test_app_has_admin_print_orders_route():
    src = _read("frontend/src/App.js")
    assert '<Route path="/admin/print-orders"' in src
    assert "AdminPrintOrders" in src


def test_reportlab_is_in_requirements():
    src = _read("backend/requirements.txt")
    assert "reportlab" in src.lower()
