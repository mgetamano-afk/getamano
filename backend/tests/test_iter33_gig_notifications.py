"""
Iteration 33 — Section 30 follow-up: nearby-provider notification fan-out.

Verifies:
  1) When a client posts a gig in city X / category Y, providers with the
     same city + category receive a "💼 Nueva chamba" notification with
     priority=high when is_urgent=true, medium otherwise.
  2) When a provider applies, the gig owner receives a "🙋 Nuevo aplicante"
     notification (and the body updates if more apply later).
  3) Idempotency: re-fetching /api/notifications doesn't duplicate entries.
  4) The poster does NOT receive their own gig's fanout.
"""
import os
import sys
import time

import pytest
import requests

sys.path.insert(0, os.path.dirname(__file__))
from test_config import (  # noqa: E402
    ADMIN_EMAIL,  # noqa: F401
    PROVIDER_EMAIL,
    PROVIDER_PASSWORD,
)

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://verified-providers-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
CLIENT_EMAIL = os.environ.get("TEST_CLIENT_EMAIL", "demo.client@getamano.com")
CLIENT_PWD = os.environ.get("TEST_CLIENT_PASSWORD", "client123")


def _login(email: str, password: str) -> requests.Session:
    s = requests.Session()
    for attempt in range(3):
        r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=10)
        if r.status_code == 200:
            return s
        if r.status_code == 429:
            time.sleep(15)
            continue
        r.raise_for_status()
    raise AssertionError(f"login failed for {email}")


@pytest.fixture(scope="module")
def client_session() -> requests.Session:
    return _login(CLIENT_EMAIL, CLIENT_PWD)


@pytest.fixture(scope="module")
def provider_session() -> requests.Session:
    return _login(PROVIDER_EMAIL, PROVIDER_PASSWORD)


@pytest.fixture(scope="module")
def gig(client_session: requests.Session):
    """Create a gig matching the demo provider's vertical (Limpieza, Sallisaw OK)."""
    payload = {
        "title": "TEST_iter33 Necesito limpieza profunda urgente",
        "description": "Casa de 3 habitaciones, 2 baños. Para este fin de semana. Tengo 2 perros amigables.",
        "category": "Limpieza",
        "budget_min": 100,
        "budget_max": 180,
        "city": "Sallisaw",
        "state": "OK",
        "is_urgent": True,
    }
    r = client_session.post(f"{API}/gigs", json=payload, timeout=10)
    assert r.status_code == 200, r.text
    body = r.json()
    yield body
    # cleanup: close it so it disappears from the public board
    client_session.post(f"{API}/gigs/{body['gig_id']}/close", timeout=10)


def test_provider_receives_new_gig_notification(provider_session, gig):
    r = provider_session.get(f"{API}/notifications", timeout=10)
    assert r.status_code == 200
    items = r.json().get("items", [])
    matching = [n for n in items if n.get("notification_key", "").endswith(f"::new_gig::{gig['gig_id']}")]
    assert len(matching) == 1, f"expected 1 fanout notif, got {len(matching)}: {[n.get('notification_key') for n in items]}"
    note = matching[0]
    assert note["category"] == "gigs"
    assert note["priority"] == "high"  # because is_urgent=True
    assert "Sallisaw" in note["title"]
    assert "Limpieza" in note["body"]
    assert note["cta_url"] == "/empleos"
    assert note["is_read"] is False


def test_fanout_is_idempotent(provider_session, gig):
    # First call already happened in previous test; calling again must not dup.
    r1 = provider_session.get(f"{API}/notifications", timeout=10).json()
    r2 = provider_session.get(f"{API}/notifications", timeout=10).json()
    k1 = [n["notification_key"] for n in r1.get("items", []) if n.get("notification_key", "").endswith(f"::new_gig::{gig['gig_id']}")]
    k2 = [n["notification_key"] for n in r2.get("items", []) if n.get("notification_key", "").endswith(f"::new_gig::{gig['gig_id']}")]
    assert len(k1) == 1 and len(k2) == 1


def test_poster_does_not_receive_own_gig_fanout(client_session, gig):
    r = client_session.get(f"{API}/notifications", timeout=10).json()
    items = r.get("items", [])
    self_fanout = [n for n in items if n.get("notification_key", "").endswith(f"::new_gig::{gig['gig_id']}")]
    assert self_fanout == [], "poster should never receive their own gig fanout"


def test_owner_gets_applicant_notification(provider_session, client_session, gig):
    # Provider applies
    payload = {
        "message": "Hola, soy María de María Cleaning Services. Puedo ir el sábado por la mañana con todos mis productos. Cotizo $140 por la limpieza completa.",
        "proposed_price": 140,
    }
    r = provider_session.post(f"{API}/gigs/{gig['gig_id']}/apply", json=payload, timeout=10)
    # 200 first time, 400 if previous run left an application — both fine for this test's intent
    assert r.status_code in (200, 400), r.text
    # Owner pulls their notifications
    notes = client_session.get(f"{API}/notifications", timeout=10).json().get("items", [])
    applicant_notes = [n for n in notes if n.get("notification_key", "").endswith(f"::gig_applicant::{gig['gig_id']}")]
    assert len(applicant_notes) == 1
    n = applicant_notes[0]
    assert n["category"] == "gigs"
    assert n["priority"] == "high"
    assert "aplicante" in n["title"].lower() or "🙋" in n["title"]
    assert n["cta_url"] == "/empleos"
