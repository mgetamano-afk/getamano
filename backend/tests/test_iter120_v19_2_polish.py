"""V19.2 — Phase 1+2+3 polish bundle.

V19.2.1 — Reels autoplay (`autoPlay` attr on the <video>) + camera zoom
          (pinch + slider via MediaStream track constraints).
V19.2.2 — Consolidated Client Profile (BottomNav for clients now lands
          on /profile, the rich UserProfile page now exposes Favorites
          tab, Account section with email + change-password + sign-out,
          Publicar chamba CTA, complete-profile banner, cover upload).
V19.2.3 — CEO Code Health dashboard (`/api/admin/code-health` endpoint
          + section in AdminCEO.jsx).
"""
from __future__ import annotations

import os
import requests
from tests.test_config import API


def _read(p: str) -> str:
    with open(p, "r", encoding="utf-8") as f:
        return f.read()


# ─────────────────────────────────────────────────────────────────────
# V19.2.1 — Reels autoplay + camera zoom
# ─────────────────────────────────────────────────────────────────────
def test_reels_video_has_autoplay_attribute():
    """Mobile Safari/Chrome only honour IntersectionObserver-driven
    play() calls when the <video> tag itself has `autoPlay`, `muted`
    and `playsInline`. Without `autoPlay` the first reel sits on its
    poster frame."""
    src = _read("/app/frontend/src/pages/ReelsPage.jsx")
    # We expect the <video> tag for the reel to carry all three.
    assert "autoPlay" in src
    assert "playsInline" in src
    assert "muted={muted}" in src
    # Sanity: the comment justifying the change is also there
    assert "feed autoplay" in src.lower() or "autoplay" in src.lower()


def test_camera_recorder_supports_zoom():
    """Recorder must probe `getCapabilities().zoom`, expose a slider,
    react to pinch gestures, and call `applyConstraints({advanced:
    [{zoom}]})` to push the value down to the video track."""
    src = _read("/app/frontend/src/components/ReelCameraRecorder.jsx")
    # State + capability probe
    assert "zoomCaps" in src
    assert "getCapabilities" in src
    assert "track.getCapabilities" in src or "typeof track.getCapabilities" in src
    # Apply constraints
    assert "applyConstraints" in src
    assert "advanced: [{ zoom" in src
    # Pinch handlers
    assert "handleTouchStart" in src
    assert "handleTouchMove" in src
    assert "Math.hypot" in src  # 2-finger distance
    # UI: slider exposes the right data-testid only when caps exist
    assert 'data-testid="reel-recorder-zoom-slider"' in src
    # ZoomIn icon imported from lucide-react
    assert "ZoomIn" in src


def test_camera_video_tag_keeps_autoplay():
    """Live preview must also have autoPlay + muted + playsInline."""
    src = _read("/app/frontend/src/components/ReelCameraRecorder.jsx")
    block = src.split('data-testid="reel-recorder-live"')[0]
    # The relevant attributes are immediately preceding the testid
    block_tail = block[-400:]
    assert "autoPlay" in block_tail
    assert "muted" in block_tail
    assert "playsInline" in block_tail


# ─────────────────────────────────────────────────────────────────────
# V19.2.2 — Consolidated Client Profile
# ─────────────────────────────────────────────────────────────────────
def test_bottom_nav_routes_client_to_profile():
    """The duplicated `/dashboard` destination for the client bottom-nav
    "Perfil" tile is gone — clients now land on the unified /profile."""
    src = _read("/app/frontend/src/components/BottomNav.jsx")
    # The else branch (client role) must include /profile, not /dashboard
    client_block = src.split("} else {")[1].split("// EXACTLY 5 items")[0]
    assert 'path: "/profile"' in client_block
    assert 'path: "/dashboard"' not in client_block.split("/profile")[1] if "/profile" in client_block else True


def test_user_profile_exposes_cover_uploader_and_complete_banner():
    """Personal profile page must render the cover image, the
    CompleteProfileBanner when fields are missing, and the new tabs
    (Favoritos for clients, Reels for providers)."""
    src = _read("/app/frontend/src/pages/UserProfile.jsx")
    assert "CompleteProfileBanner" in src
    assert "CoverUploader" in src
    assert "FavoritesTab" in src
    assert "ChangePasswordPrompt" in src
    # Tabs list — clients get favoritos, providers get reels (mutex)
    assert "id: \"favoritos\"" in src
    assert "id: \"reels\"" in src
    # Account section testid
    assert "user-profile-account-section" in src
    assert "user-profile-change-password" in src
    assert "user-profile-logout" in src
    # Post chamba CTA for clients
    assert "/empleos?post=1" in src
    assert "user-profile-post-chamba" in src


def test_empleos_page_supports_post_query_param():
    """`/empleos?post=1` must auto-open the compose modal so the profile
    CTA flows directly into posting a job."""
    src = _read("/app/frontend/src/pages/EmpleosPage.jsx")
    assert "useSearchParams" in src
    assert 'searchParams.get("post")' in src
    assert "setShowPost(true)" in src


def test_user_cover_endpoint_round_trip():
    """`POST /api/users/me/cover` saves the file and exposes the URL via
    `cover_url` on the next `GET /api/users/me/profile`."""
    # Log in as the demo client (we just need any session)
    r = requests.post(f"{API}/auth/login", json={
        "email": os.environ.get("TEST_CLIENT_EMAIL", "demo.client@getamano.com"),
        "password": os.environ.get("TEST_CLIENT_PASSWORD", "client123"),
    }, timeout=15)
    assert r.status_code == 200, r.text
    token = (r.json().get("token") or r.json().get("access_token"))
    headers = {"Authorization": f"Bearer {token}"}

    # Upload a 1×1 png
    png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xfc\xcf\xc0P\x0f\x00\x05\x01\x01\x008\xcb\x9d\x05\x00\x00\x00\x00IEND\xaeB`\x82"
    files = {"file": ("cover.png", png, "image/png")}
    up = requests.post(f"{API}/users/me/cover", headers=headers, files=files, timeout=30)
    assert up.status_code == 200, up.text
    body = up.json()
    assert body.get("cover_url", "").startswith("/api/uploads/")

    # Verify the profile now exposes it
    me = requests.get(f"{API}/users/me/profile", headers=headers, timeout=15)
    assert me.status_code == 200
    assert me.json().get("cover_url") == body["cover_url"]

    # Cleanup so the banner reappears on subsequent runs
    rm = requests.delete(f"{API}/users/me/cover", headers=headers, timeout=15)
    assert rm.status_code == 200
    me2 = requests.get(f"{API}/users/me/profile", headers=headers, timeout=15)
    assert me2.json().get("cover_url") is None


# ─────────────────────────────────────────────────────────────────────
# V19.2.3 — CEO Code Health
# ─────────────────────────────────────────────────────────────────────
def test_code_health_endpoint_returns_full_payload():
    """`/api/admin/code-health` returns ruff stats, test counts, file
    hotspots and a verdict (green/yellow/red)."""
    # Admin login
    r = requests.post(f"{API}/auth/login", json={
        "email": os.environ.get("TEST_ADMIN_EMAIL", "admin@getamano.com"),
        "password": os.environ.get("TEST_ADMIN_PASSWORD", "admin123"),
    }, timeout=15)
    assert r.status_code == 200, r.text
    token = (r.json().get("token") or r.json().get("access_token"))
    headers = {"Authorization": f"Bearer {token}"}

    g = requests.get(f"{API}/admin/code-health", headers=headers, timeout=60)
    assert g.status_code == 200, g.text
    data = g.json()
    # Core shape
    assert "commit" in data
    assert "ruff" in data and "pyflakes_errors" in data["ruff"] and "passing" in data["ruff"]
    assert "tests" in data and "total_tests_collected" in data["tests"]
    assert data["tests"]["total_tests_collected"] > 1000, "should report > 1000 tests"
    assert "hotspots" in data and isinstance(data["hotspots"], list)
    assert "verdict" in data and data["verdict"] in {"green", "yellow", "red"}
    # The largest hotspot should be `server.py` (it's intentionally big)
    files = [h["file"] for h in data["hotspots"]]
    assert "server.py" in files


def test_code_health_requires_admin():
    """A regular client must NOT be able to read the code-health stats."""
    r = requests.post(f"{API}/auth/login", json={
        "email": os.environ.get("TEST_CLIENT_EMAIL", "demo.client@getamano.com"),
        "password": os.environ.get("TEST_CLIENT_PASSWORD", "client123"),
    }, timeout=15)
    token = (r.json().get("token") or r.json().get("access_token"))
    g = requests.get(f"{API}/admin/code-health", headers={"Authorization": f"Bearer {token}"}, timeout=15)
    assert g.status_code in {401, 403}, g.text


def test_admin_ceo_page_renders_code_health_section():
    """The dashboard exposes the new section + KPIs + hotspots list."""
    src = _read("/app/frontend/src/pages/admin/AdminCEO.jsx")
    assert "CodeHealthSection" in src
    assert "code-health-pyflakes" in src
    assert "code-health-findings" in src
    assert "code-health-tests" in src
    assert "code-health-hotspots" in src
    assert "code-health-verdict" in src
    assert "/admin/code-health" in src
