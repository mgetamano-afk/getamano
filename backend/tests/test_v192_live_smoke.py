"""V19.2 — live smoke tests against the public preview URL.

Covers:
* /api/admin/code-health (admin only, payload shape)
* /api/users/me/profile (exposes `cover_url`)
* /api/users/me/cover (POST multipart, GET reflects, DELETE clears)
"""
from __future__ import annotations

import io
import os

import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://verified-providers-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"


def _login(email: str, password: str) -> requests.Session:
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text[:200]}"
    token = r.json().get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def admin_session() -> requests.Session:
    return _login("admin@getamano.com", "admin123")


@pytest.fixture(scope="module")
def client_session() -> requests.Session:
    return _login("demo.client@getamano.com", "client123")


# ─── /api/admin/code-health ──────────────────────────────────────────
def test_code_health_requires_auth():
    r = requests.get(f"{API}/admin/code-health", timeout=15)
    assert r.status_code in (401, 403), f"expected 401/403 unauth, got {r.status_code}"


def test_code_health_payload_shape(admin_session: requests.Session):
    r = admin_session.get(f"{API}/admin/code-health", timeout=30)
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    # required top-level keys
    for k in ("commit", "ruff", "tests", "hotspots", "verdict"):
        assert k in data, f"missing key {k} in {list(data.keys())}"
    # ruff sub-keys
    for k in ("pyflakes_errors", "total_findings", "passing"):
        assert k in data["ruff"], f"missing ruff.{k}"
    # tests sub-keys
    for k in ("total_tests_collected", "total_test_files"):
        assert k in data["tests"], f"missing tests.{k}"
    # verdict valid
    assert data["verdict"] in ("green", "yellow", "red"), data["verdict"]
    # hotspots list with server.py somewhere
    assert isinstance(data["hotspots"], list) and len(data["hotspots"]) >= 1
    joined = " ".join(str(h) for h in data["hotspots"])
    assert "server.py" in joined


# ─── /api/users/me/profile exposes cover_url ────────────────────────
def test_profile_exposes_cover_url(client_session: requests.Session):
    r = client_session.get(f"{API}/users/me/profile", timeout=15)
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    assert "cover_url" in data, f"cover_url missing from /users/me/profile: keys={list(data.keys())}"


# ─── /api/users/me/cover roundtrip ──────────────────────────────────
_PNG_1x1 = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xfc\xff"
    b"\xff?\x03\x00\x06\x00\x02\xfe\xa1\x9c\x97\x00\x00\x00\x00IEND\xaeB`\x82"
)


def test_cover_upload_delete_roundtrip(client_session: requests.Session):
    # Upload
    files = {"file": ("cover.png", io.BytesIO(_PNG_1x1), "image/png")}
    r = client_session.post(f"{API}/users/me/cover", files=files, timeout=30)
    assert r.status_code == 200, f"cover upload failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    cover_url = data.get("cover_url") or (data.get("user") or {}).get("cover_url")
    assert cover_url, f"no cover_url in response: {data}"

    # Verify via /profile
    r2 = client_session.get(f"{API}/users/me/profile", timeout=15)
    assert r2.status_code == 200
    assert r2.json().get("cover_url"), "cover_url didn't persist on profile"

    # Delete
    r3 = client_session.delete(f"{API}/users/me/cover", timeout=15)
    assert r3.status_code in (200, 204), f"delete failed: {r3.status_code} {r3.text[:300]}"

    # Verify deletion
    r4 = client_session.get(f"{API}/users/me/profile", timeout=15)
    assert r4.status_code == 200
    cv = r4.json().get("cover_url")
    assert not cv, f"cover_url should be cleared, got {cv!r}"
