"""
Iteration 91 — v4 Phase C (Push Notifications wiring) regression.

The webpush delivery itself can't be tested without a real subscription,
but we can validate:
  1. The VAPID public key endpoint resolves to a non-empty key.
  2. `/api/push/subscribe` requires auth + persists the subscription.
  3. `/api/push/me` lists current subscriptions.
  4. `/api/push/test` returns a structured result and is auth-gated.
  5. The wiring exists in source code (review POST, service-request POST,
     message POST) so we never silently drop the push trigger.
"""
import os
import sys

import requests

sys.path.insert(0, os.path.dirname(__file__))
from tests.test_config import API  # noqa: E402


def _read(rel_path: str) -> str:
    full = os.path.join(os.path.dirname(__file__), "..", "..", rel_path)
    with open(full, encoding="utf-8") as f:
        return f.read()


def test_vapid_public_key_endpoint():
    r = requests.get(f"{API}/push/public-key", timeout=10)
    assert r.status_code == 200
    pk = r.json().get("public_key", "")
    # base64url EC P-256 public keys are 87 chars (no padding)
    assert len(pk) >= 80
    assert pk.startswith("B")  # uncompressed marker prefix when base64url-encoded


def test_subscribe_requires_auth():
    r = requests.post(
        f"{API}/push/subscribe",
        json={
            "endpoint": "https://fcm.googleapis.com/fcm/send/fake",
            "keys": {"p256dh": "x" * 60, "auth": "y" * 22},
        },
        timeout=10,
    )
    assert r.status_code == 401


def test_subscribe_and_list_and_test_push(client_session):
    fake_endpoint = "https://fcm.googleapis.com/fcm/send/iter91-regression"
    sub = client_session.post(
        f"{API}/push/subscribe",
        json={
            "endpoint": fake_endpoint,
            "keys": {"p256dh": "x" * 60, "auth": "y" * 22},
            "user_agent": "pytest/iter91",
        },
        timeout=10,
    )
    assert sub.status_code == 200, sub.text
    assert sub.json()["ok"] is True

    me = client_session.get(f"{API}/push/me", timeout=10)
    assert me.status_code == 200
    rows = me.json()
    assert any(r["endpoint"] == fake_endpoint for r in rows)

    # send a test push — VAPID is configured + we have a fake endpoint,
    # so the call should succeed at API level. The fake endpoint will
    # 404 from FCM and the helper will mark it invalid → removed_invalid.
    test = client_session.post(f"{API}/push/test", timeout=15)
    assert test.status_code == 200, test.text
    body = test.json()
    assert "sent" in body and "removed_invalid" in body and "total_subs" in body

    # cleanup
    unsub = client_session.post(f"{API}/push/unsubscribe", json={"endpoint": fake_endpoint}, timeout=10)
    assert unsub.status_code == 200


# ─── Source-code locks: ensure the push triggers stay wired ────────

def test_push_wired_into_reviews():
    src = _read("backend/routes/reviews.py")
    assert "send_push_to_user" in src
    assert "dejó una reseña" in src


def test_push_wired_into_service_requests():
    # Section 89 v4 Phase H — the service-requests POST handler was
    # extracted from server.py into routes/leads.py.
    src = _read("backend/routes/leads.py")
    assert "Nueva solicitud de cotización" in src
    assert "from routes.push import send_push_to_user" in src


def test_push_wired_into_messages():
    src = _read("backend/server.py")
    # Both legacy and modern messaging endpoints push.
    assert src.count('"title": f"Mensaje de {user.name}"') >= 2


def test_push_test_endpoint_exists():
    src = _read("backend/routes/push.py")
    assert '@router.post("/push/test")' in src


def test_frontend_test_push_helper_exists():
    src = _read("frontend/src/lib/push.js")
    assert "export async function sendTestPush" in src
    assert "/push/test" in src
