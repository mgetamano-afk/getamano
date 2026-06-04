"""V19.4 — Server.py refactor: round 2 extractions.

Round 2 modules:
  • routes/messages.py        — 4 endpoints, ~145 LOC moved out
  • routes/admin_providers.py — 4 endpoints, ~85 LOC moved out
  • routes/ads.py             — 6 endpoints, ~60 LOC moved out

This file validates wiring + endpoint round-trips + the absence of
the original inline decorators in server.py + the existing test that
forbids `MessageIn` redefinition (caught a real semantic bug during
the round 2 work — see ConversationBodyIn rename).
"""
import os
import time
import requests
from tests.test_config import API


_TOKEN_CACHE: dict[str, str] = {}


def _login(email_env: str, default_email: str, pwd_env: str, default_pwd: str, role: str) -> str:
    """Cache tokens by role to avoid hitting brute-force rate limiter."""
    if role in _TOKEN_CACHE:
        return _TOKEN_CACHE[role]
    for attempt in range(3):
        r = requests.post(f"{API}/auth/login", json={
            "email": os.environ.get(email_env, default_email),
            "password": os.environ.get(pwd_env, default_pwd),
        }, timeout=15)
        if r.status_code == 200:
            tok = r.json().get("token") or r.json().get("access_token")
            _TOKEN_CACHE[role] = tok
            return tok
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"Could not log in as {role}: {r.status_code} {r.text}")


def _admin_token() -> str:
    return _login("TEST_ADMIN_EMAIL", "admin@getamano.com", "TEST_ADMIN_PASSWORD", "admin123", "admin")


def _client_token() -> str:
    return _login("TEST_CLIENT_EMAIL", "demo.client@getamano.com", "TEST_CLIENT_PASSWORD", "client123", "client")


def _read(p):
    with open(p, "r", encoding="utf-8") as f:
        return f.read()


# ─── Module wiring ──────────────────────────────────────────────────
def test_round2_modules_expose_make_router():
    from routes.messages import make_router as mr_msg
    from routes.admin_providers import make_router as mr_ap
    from routes.ads import make_router as mr_ads
    assert callable(mr_msg)
    assert callable(mr_ap)
    assert callable(mr_ads)


def test_server_no_longer_defines_extracted_endpoints():
    src = _read("/app/backend/server.py")
    moved = [
        '@api_router.post("/messages")',
        '@api_router.post("/messages/{conversation_id}/reply")',
        '@api_router.get("/conversations")',
        '@api_router.get("/conversations/{conversation_id}/messages")',
        '@api_router.get("/admin/providers")',
        '@api_router.post("/admin/providers/{provider_id}/verify")',
        '@api_router.get("/admin/stats")',
        '@api_router.patch("/admin/providers/{provider_id}")',
        '@api_router.get("/ads")',
        '@api_router.post("/ads/{ad_id}/click")',
        '@api_router.get("/admin/ads")',
        '@api_router.post("/admin/ads")',
        '@api_router.put("/admin/ads/{ad_id}")',
        '@api_router.delete("/admin/ads/{ad_id}")',
    ]
    for dec in moved:
        assert dec not in src, f"server.py still defines {dec!r}"
    # The 3 include_router calls MUST exist
    assert "_make_messages_router" in src
    assert "_make_admin_providers_router" in src
    assert "_make_ads_router" in src


def test_duplicate_messagein_resolved_via_rename():
    """Round 2 caught a hidden semantic bug: server.py had TWO classes
    named `MessageIn` (line 350 + line ~6752). Python shadowing meant
    the closure-captured value in the new router was the SECOND class
    (wrong schema, no provider_id field). We renamed the second to
    `ConversationBodyIn` to lock things down."""
    src = _read("/app/backend/server.py")
    # First MessageIn (the one used by the legacy router) stays
    assert "class MessageIn(BaseModel):\n    provider_id: str" in src
    # Second class renamed
    assert "class ConversationBodyIn(BaseModel):" in src
    # Only ONE class is named `MessageIn` now
    assert src.count("class MessageIn(BaseModel):") == 1
    # The /messaging/conversations endpoint uses the renamed model
    assert "payload: ConversationBodyIn" in src


# ─── Endpoints still work ───────────────────────────────────────────
def test_admin_providers_endpoints_still_work():
    tok = _admin_token()
    h = {"Authorization": f"Bearer {tok}"}
    # list
    r1 = requests.get(f"{API}/admin/providers", headers=h, timeout=15)
    assert r1.status_code == 200
    assert isinstance(r1.json(), list)
    # filter by status
    r2 = requests.get(f"{API}/admin/providers?status=approved", headers=h, timeout=15)
    assert r2.status_code == 200
    # stats
    r3 = requests.get(f"{API}/admin/stats", headers=h, timeout=15)
    assert r3.status_code == 200
    body = r3.json()
    for key in ("total_providers", "pending_providers", "approved_providers", "total_users", "total_clients", "total_reviews"):
        assert key in body
    # Auth required
    r4 = requests.get(f"{API}/admin/stats", timeout=15)
    assert r4.status_code in {401, 403}


def test_ads_endpoints_still_work():
    tok = _admin_token()
    h = {"Authorization": f"Bearer {tok}"}
    # Public list
    r1 = requests.get(f"{API}/ads", timeout=15)
    assert r1.status_code == 200
    assert isinstance(r1.json(), list)
    # Admin list (auth)
    r2 = requests.get(f"{API}/admin/ads", headers=h, timeout=15)
    assert r2.status_code == 200
    # Create + Update + Delete round-trip
    create = requests.post(f"{API}/admin/ads", headers=h, json={
        "headline": "Refactor test ad",
        "body": "verifying ads router still works",
        "image_url": "/uploads/x.png",
        "url": "https://example.com",
        "is_active": False,
    }, timeout=15)
    assert create.status_code == 200, create.text
    ad_id = create.json()["ad_id"]
    try:
        upd = requests.put(f"{API}/admin/ads/{ad_id}", headers=h, json={
            "headline": "Refactor test ad v2",
            "body": "v2",
            "image_url": "/uploads/x.png",
            "url": "https://example.com",
            "is_active": False,
        }, timeout=15)
        assert upd.status_code == 200
        # Click track
        click = requests.post(f"{API}/ads/{ad_id}/click", timeout=15)
        assert click.status_code == 200
    finally:
        d = requests.delete(f"{API}/admin/ads/{ad_id}", headers=h, timeout=15)
        assert d.status_code == 200


def test_messages_endpoint_uses_correct_schema():
    """The bug fix: POST /messages MUST require provider_id (legacy
    schema). If the duplicate MessageIn shadowed the captured class,
    this request would 422 because `provider_id` isn't a field on the
    second schema."""
    ctok = _client_token()
    h = {"Authorization": f"Bearer {ctok}"}
    providers = requests.get(f"{API}/providers?limit=1", timeout=15).json()
    if not providers:
        return  # empty fixture
    provider_id = providers[0]["provider_id"]
    r = requests.post(f"{API}/messages", headers=h, json={
        "provider_id": provider_id,
        "body": f"iter122 refactor smoke {time.time()}",
        "subject": "regression",
    }, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("message_id", "").startswith("msg_")
    assert body.get("conversation_id", "").startswith("conv_")


def test_conversations_endpoint_works():
    ctok = _client_token()
    h = {"Authorization": f"Bearer {ctok}"}
    r = requests.get(f"{API}/conversations", headers=h, timeout=15)
    assert r.status_code == 200
    convs = r.json()
    assert isinstance(convs, list)
    # If at least one, verify the shape
    if convs:
        c = convs[0]
        assert "conversation_id" in c
        assert "my_role" in c
        assert "unread" in c


def test_code_health_observes_round2_drop():
    """server.py should be <10,700 LOC after round 2. Pre-round2 was
    10,852; we expected to drop ~290 with the 3 extractions (messages
    145 + admin_providers 85 + ads 60)."""
    tok = _admin_token()
    r = requests.get(f"{API}/admin/code-health", headers={"Authorization": f"Bearer {tok}"}, timeout=60)
    assert r.status_code == 200
    loc = next((h["loc"] for h in r.json()["hotspots"] if h["file"] == "server.py"), 0)
    assert loc < 10_700, f"server.py LOC={loc} — expected <10,700 after V19.4 round 2"
    # AND verdict still green
    assert r.json()["verdict"] == "green"
