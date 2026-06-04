"""V19.5 — Round 3 split (likes, community_engagement, galleries,
uploads) + LOC timeline visualization.

Validates wiring + endpoint round-trips + the new loc_history field.
"""
import os
import time
import requests
from tests.test_config import API


_TOKEN_CACHE: dict[str, str] = {}


def _login(email_env: str, default_email: str, pwd_env: str, default_pwd: str, role: str) -> str:
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
    raise RuntimeError(f"Could not log in as {role}")


def _admin_token() -> str:
    return _login("TEST_ADMIN_EMAIL", "admin@getamano.com", "TEST_ADMIN_PASSWORD", "admin123", "admin")


def _client_token() -> str:
    return _login("TEST_CLIENT_EMAIL", "demo.client@getamano.com", "TEST_CLIENT_PASSWORD", "client123", "client")


def _read(p):
    with open(p, "r", encoding="utf-8") as f:
        return f.read()


# ─── Module wiring ──────────────────────────────────────────────────
def test_round3_modules_expose_make_router():
    from routes.likes import make_router as mr1
    from routes.community_engagement import make_router as mr2
    from routes.galleries import make_router as mr3
    from routes.uploads import make_router as mr4
    assert all(callable(m) for m in (mr1, mr2, mr3, mr4))


def test_server_no_longer_defines_round3_endpoints():
    src = _read("/app/backend/server.py")
    moved = [
        '@api_router.post("/providers/{provider_id}/like")',
        '@api_router.get("/providers/{provider_id}/like-status")',
        '@api_router.get("/community/leaderboard")',
        '@api_router.get("/community/wall-of-fame")',
        '@api_router.get("/public/stats")',
        '@api_router.get("/providers/me/gallery/limit")',
        '@api_router.post("/providers/me/gallery")',
        '@api_router.put("/providers/me/gallery/reorder")',
        '@api_router.put("/providers/me/gallery/{item_id}/category")',
        '@api_router.delete("/providers/me/gallery/{item_id}")',
        '@api_router.get("/gallery/photo-categories")',
        '@api_router.post("/providers/me/video")',
        '@api_router.delete("/providers/me/video")',
        '@api_router.post("/providers/me/plan")',
        '@api_router.post("/reels/upload-video")',
        '@api_router.post("/upload")',
        '@api_router.get("/files/{path:path}")',
    ]
    for dec in moved:
        assert dec not in src, f"server.py still defines {dec!r}"
    # The 4 include_router calls MUST exist
    for tok in ("_make_likes_router", "_make_community_engagement_router", "_make_galleries_router", "_make_uploads_router"):
        assert tok in src


# ─── Endpoints still work ───────────────────────────────────────────
def test_likes_toggle_idempotent():
    ctok = _client_token()
    h = {"Authorization": f"Bearer {ctok}"}
    providers = requests.get(f"{API}/providers?limit=1", timeout=15).json()
    if not providers:
        return
    pid = providers[0]["provider_id"]
    # Toggle once
    r1 = requests.post(f"{API}/providers/{pid}/like", headers=h, timeout=15)
    assert r1.status_code == 200
    state1 = r1.json()["liked"]
    # Toggle back
    r2 = requests.post(f"{API}/providers/{pid}/like", headers=h, timeout=15)
    assert r2.json()["liked"] == (not state1)
    # Status
    r3 = requests.get(f"{API}/providers/{pid}/like-status", headers=h, timeout=15)
    assert r3.status_code == 200
    assert isinstance(r3.json()["liked"], bool)


def test_community_endpoints_still_work():
    r1 = requests.get(f"{API}/community/leaderboard?period=month&limit=5", timeout=15)
    assert r1.status_code == 200
    assert "items" in r1.json() and r1.json()["period"] == "month"
    r2 = requests.get(f"{API}/community/wall-of-fame?limit=5", timeout=15)
    assert r2.status_code == 200
    body = r2.json()
    assert "items" in body and "stats" in body
    for k in ("total_unlocked", "total_providers", "by_tier"):
        assert k in body["stats"]
    r3 = requests.get(f"{API}/public/stats", timeout=15)
    assert r3.status_code == 200
    for k in ("providers", "providers_label", "states", "rating"):
        assert k in r3.json()


def test_gallery_photo_categories_still_works():
    r = requests.get(f"{API}/gallery/photo-categories", timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list) and body
    assert "key" in body[0] and "label" in body[0]


def test_gallery_limit_endpoint_still_works():
    ctok = _client_token()
    # Carlos is a client without a provider profile → 404
    h = {"Authorization": f"Bearer {ctok}"}
    r = requests.get(f"{API}/providers/me/gallery/limit", headers=h, timeout=15)
    assert r.status_code in {200, 404}  # 404 = no provider profile, 200 = provider


def test_files_endpoint_serves_known_storage_path():
    # Pull a public provider with a logo_url, fetch it from /files/{path}
    providers = requests.get(f"{API}/providers?limit=10", timeout=15).json()
    logos = [p.get("logo_url", "") for p in providers if (p.get("logo_url") or "").startswith("/api/files/")]
    if not logos:
        return
    path = logos[0].replace("/api/files/", "")
    r = requests.get(f"{API}/files/{path}", timeout=15)
    assert r.status_code == 200
    assert len(r.content) > 100


# ─── Timeline ───────────────────────────────────────────────────────
def test_code_health_includes_loc_history():
    """The new V19.5 sparkline data — must be present on every snapshot."""
    tok = _admin_token()
    r = requests.get(f"{API}/admin/code-health", headers={"Authorization": f"Bearer {tok}"}, timeout=60)
    assert r.status_code == 200
    body = r.json()
    assert "loc_history" in body, "loc_history must be exposed"
    hist = body["loc_history"]
    assert isinstance(hist, list)
    assert len(hist) >= 5, f"expected >= 5 commits charted (got {len(hist)})"
    # Each entry has the right shape
    for entry in hist[:3]:
        for key in ("commit", "at", "loc"):
            assert key in entry, f"history entry missing {key!r}"
        assert isinstance(entry["loc"], int)
        assert entry["loc"] > 1000  # server.py is a substantial file
    # Reversed correctly: oldest first, newest last
    assert hist[0]["at"] < hist[-1]["at"]


def test_admin_ceo_renders_loc_timeline_component():
    src = _read("/app/frontend/src/pages/admin/AdminCEO.jsx")
    assert "LocTimeline" in src
    assert "code-health-timeline" in src
    assert "code-health-timeline-svg" in src
    # SVG should be present
    assert "<svg" in src


def test_code_health_observes_round3_drop():
    """server.py LOC must have dropped to < 10,300 after V19.5 round 3."""
    tok = _admin_token()
    r = requests.get(f"{API}/admin/code-health", headers={"Authorization": f"Bearer {tok}"}, timeout=60)
    loc = next((h["loc"] for h in r.json()["hotspots"] if h["file"] == "server.py"), 0)
    assert loc < 10_300, f"server.py still {loc} LOC — expected <10,300 after V19.5"
