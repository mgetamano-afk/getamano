"""
Iteration 103 — V12 multi-eCard ownership + sandbox payments.

These tests reuse the seeded `provider_session` fixture (María's Cleaning)
and clean up secondary eCards via direct MongoDB writes between tests, so
the registration rate-limit (5/min) never bites.
"""
import os
import sys
from typing import Optional

import pytest
import requests

sys.path.insert(0, os.path.dirname(__file__))
from tests.test_config import API, DEMO_SLUG  # noqa: E402


def _read(rel: str) -> str:
    full = os.path.join(os.path.dirname(__file__), "..", "..", rel)
    with open(full, encoding="utf-8") as f:
        return f.read()


# ─── Helpers ────────────────────────────────────────────────────────

@pytest.fixture()
def db():
    """Sync pymongo handle used only to reset state between tests."""
    from pymongo import MongoClient
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")
    client = MongoClient(mongo_url)
    return client[db_name]


@pytest.fixture()
def demo_provider_state(provider_session, db):
    """Wipes all secondary eCards + turns verification OFF on the primary
    before AND after each test so this iteration is isolated from siblings."""
    me = provider_session.get(f"{API}/providers/by-slug/{DEMO_SLUG}", timeout=10).json()
    primary_id = me["provider_id"]
    user_id = me["user_id"]

    def _reset():
        db.provider_profiles.delete_many({
            "user_id": user_id,
            "provider_id": {"$ne": primary_id},
        })
        db.provider_profiles.update_one(
            {"provider_id": primary_id},
            {"$set": {"verification_active": False}},
        )
        db.ecard_payments.delete_many({"user_id": user_id})

    _reset()
    yield {"primary_id": primary_id, "user_id": user_id}
    _reset()


def _create_2nd_ecard(session: requests.Session, name: str) -> Optional[dict]:
    pay = session.post(f"{API}/users/me/ecards/sandbox-pay",
                       json={"kind": "opening"}, timeout=10).json()
    cats = requests.get(f"{API}/categories", timeout=10).json()
    r = session.post(f"{API}/providers", json={
        "business_name": name,
        "category_id": cats[0]["category_id"],
        "city": "Sallisaw", "state": "OK",
        "description": "Negocio independiente para validar el flujo multi-eCard del proveedor.",
        "opening_payment_id": pay["payment_id"],
    }, timeout=15)
    if r.status_code != 200:
        return None
    return {**r.json(), "_token": pay["payment_id"]}


# ─── Pricing math ───────────────────────────────────────────────────

def test_pricing_with_one_owned_charges_5_next(provider_session, demo_provider_state):
    r = provider_session.get(f"{API}/users/me/ecards/pricing", timeout=10)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["owned_count"] >= 1
    assert body["next_opening_fee_cents"] == 500
    assert body["tiers"]["verification_tiers_cents"] == {"1": 1000, "2": 1500, "3": 2000}


def test_pricing_verification_tiers_walk(provider_session, demo_provider_state):
    primary_id = demo_provider_state["primary_id"]
    # Activate verification on primary → tier 1 ($10)
    r1 = provider_session.post(f"{API}/users/me/ecards/{primary_id}/verify", timeout=10).json()
    assert r1["verified_count"] == 1 and r1["monthly_cents"] == 1000
    # Create a 2nd and verify it → tier 2 ($15)
    ec2 = _create_2nd_ecard(provider_session, "V12 Verify Walk Second")
    assert ec2 is not None
    r2 = provider_session.post(f"{API}/users/me/ecards/{ec2['provider_id']}/verify", timeout=10).json()
    assert r2["verified_count"] == 2 and r2["monthly_cents"] == 1500
    # Cancel primary → back to tier 1 ($10)
    r3 = provider_session.delete(f"{API}/users/me/ecards/{primary_id}/verify", timeout=10).json()
    assert r3["verified_count"] == 1 and r3["monthly_cents"] == 1000


# ─── Sandbox-pay endpoint ───────────────────────────────────────────

def test_sandbox_pay_opening_mints_unique_payments(provider_session, demo_provider_state):
    a = provider_session.post(f"{API}/users/me/ecards/sandbox-pay",
                               json={"kind": "opening"}, timeout=10).json()
    b = provider_session.post(f"{API}/users/me/ecards/sandbox-pay",
                               json={"kind": "opening"}, timeout=10).json()
    assert a["payment_id"] != b["payment_id"]
    assert a["amount_cents"] == 500
    assert a["kind"] == "opening"
    assert a["status"] == "sandbox_paid"


def test_sandbox_pay_verification_returns_next_tier(provider_session, demo_provider_state):
    r = provider_session.post(f"{API}/users/me/ecards/sandbox-pay",
                               json={"kind": "verification"}, timeout=10).json()
    # 0 verified → activating the 1st → tier 1 → $10
    assert r["amount_cents"] == 1000


# ─── POST /providers gating ────────────────────────────────────────

def test_2nd_ecard_without_token_returns_402(provider_session, demo_provider_state):
    cats = requests.get(f"{API}/categories", timeout=10).json()
    r = provider_session.post(f"{API}/providers", json={
        "business_name": "V12 Gate Without Token",
        "category_id": cats[0]["category_id"],
        "city": "Sallisaw", "state": "OK",
        "description": "Sin token de apertura, este endpoint debe rechazar el alta inmediatamente.",
    }, timeout=15)
    assert r.status_code == 402, r.text


def test_token_reuse_returns_402(provider_session, demo_provider_state):
    ec = _create_2nd_ecard(provider_session, "V12 Reuse First")
    assert ec is not None
    # Reuse the SAME token → must fail
    cats = requests.get(f"{API}/categories", timeout=10).json()
    r = provider_session.post(f"{API}/providers", json={
        "business_name": "V12 Reuse Second",
        "category_id": cats[0]["category_id"],
        "city": "Sallisaw", "state": "OK",
        "description": "Tercer negocio intentando reusar el mismo token de apertura ya consumido.",
        "opening_payment_id": ec["_token"],
    }, timeout=15)
    assert r.status_code == 402, r.text


def test_2nd_ecard_appears_in_list(provider_session, demo_provider_state):
    ec = _create_2nd_ecard(provider_session, "V12 List Independent")
    assert ec is not None
    listing = provider_session.get(f"{API}/users/me/ecards", timeout=10).json()
    assert len(listing) == 2
    names = {e["business_name"] for e in listing}
    assert "V12 List Independent" in names
    assert all(e["public_url"].startswith("/p/") for e in listing)


def test_verify_unknown_provider_returns_404(provider_session, demo_provider_state):
    r = provider_session.post(f"{API}/users/me/ecards/prov_doesnotexist/verify", timeout=10)
    assert r.status_code == 404, r.text


def test_verify_idempotent_returns_already_active(provider_session, demo_provider_state):
    pid = demo_provider_state["primary_id"]
    provider_session.post(f"{API}/users/me/ecards/{pid}/verify", timeout=10)
    r2 = provider_session.post(f"{API}/users/me/ecards/{pid}/verify", timeout=10).json()
    assert r2.get("already_active") is True


# ─── Frontend wiring (source-code locks) ───────────────────────────

def test_ecards_manager_panel_is_wired():
    src = _read("frontend/src/pages/ProviderDashboard.jsx")
    assert "EcardsManagerPanel" in src
    assert 'tab === "ecard"' in src
    assert 'Mi eCard pública' not in src


def test_sidebar_label_renamed_to_plural():
    src = _read("frontend/src/components/ProviderSideNav.jsx")
    assert '"Mis eCards"' in src
    assert '"My eCards"' in src


def test_panel_has_add_another_button_and_stripe_migration_hints():
    src = _read("frontend/src/components/EcardsManagerPanel.jsx")
    assert 'data-testid="ecards-add-another-button"' in src
    assert 'data-testid="sandbox-pay-confirm"' in src
    assert 'Stripe Link' in src
    assert 'Stripe Subscriptions' in src


def test_provider_onboarding_forwards_opening_token():
    src = _read("frontend/src/pages/ProviderOnboarding.jsx")
    assert "opening_payment_id" in src
    assert "useSearchParams" in src


def test_user_id_unique_index_was_dropped():
    src = _read("backend/server.py")
    # The unique constraint on provider_profiles.user_id must be removed and
    # an explicit drop_index migration in place.
    assert 'db.provider_profiles.create_index("user_id", unique=True)' not in src
    assert 'drop_index("user_id_1")' in src
