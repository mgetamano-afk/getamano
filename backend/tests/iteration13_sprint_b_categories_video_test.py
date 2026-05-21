"""Sprint B — Gallery photo categories + Provider presentation video (Pro/Premium only).

Covers:
- GET /api/gallery/photo-categories (public, 6 items, ES labels)
- POST /api/providers/me/gallery accepts/rejects category Literal
- PUT /api/providers/me/gallery/{id}/category set/unset/404
- POST /api/providers/me/video plan gating (free→403, pro→200)
- POST /api/providers/me/video content-type and size validations
- POST /api/providers/me/video replaces existing
- DELETE /api/providers/me/video unsets fields
- GET /api/providers/by-slug/... includes video_url
"""
import io
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

PROVIDER_EMAIL = "demo.provider@getamano.com"
PROVIDER_PASSWORD = "provider123"
PROVIDER_SLUG = "maria-cleaning-services-sallisaw-ok"

# Minimal valid-looking MP4 (header ftypisom) — backend only checks content_type, not bytes.
MINIMAL_MP4 = b"\x00\x00\x00\x20ftypisom" + b"\x00" * 200


# --- Fixtures ---
@pytest.fixture(scope="module")
def provider_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": PROVIDER_EMAIL, "password": PROVIDER_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def seed_ids(provider_session):
    s = provider_session
    r2 = s.get(f"{API}/providers/me", timeout=15)
    assert r2.status_code == 200, r2.text
    return {g["id"] for g in (r2.json().get("gallery") or [])}


@pytest.fixture(autouse=True)
def restore_state(provider_session, seed_ids):
    """After each test: plan=pro, remove video, clear categories on seed photos and delete non-seed."""
    yield
    s = provider_session
    try:
        s.post(f"{API}/providers/me/plan", json={"plan": "pro"}, timeout=15)
    except Exception:
        pass
    try:
        s.delete(f"{API}/providers/me/video", timeout=15)
    except Exception:
        pass
    try:
        r2 = s.get(f"{API}/providers/me", timeout=15)
        if r2.status_code == 200:
            for g in (r2.json().get("gallery") or []):
                if g["id"] not in seed_ids:
                    s.delete(f"{API}/providers/me/gallery/{g['id']}", timeout=15)
                else:
                    # Unset category on seed photos
                    s.put(f"{API}/providers/me/gallery/{g['id']}/category", json={"category": None}, timeout=15)
    except Exception:
        pass


# --- Categories endpoint ---
class TestPhotoCategories:
    def test_public_list_no_auth(self):
        r = requests.get(f"{API}/gallery/photo-categories", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 6
        keys = {x["key"] for x in data}
        assert keys == {"trabajo_terminado", "antes_despues", "equipo", "herramientas", "negocio", "otro"}
        labels = {x["key"]: x["label"] for x in data}
        # Spanish labels sanity check
        assert "Trabajo" in labels["trabajo_terminado"]
        assert "Antes" in labels["antes_despues"]
        assert isinstance(labels["otro"], str) and labels["otro"]


# --- Gallery POST with category ---
class TestGalleryItemCategory:
    def test_post_with_valid_category(self, provider_session):
        s = provider_session
        r = s.post(f"{API}/providers/me/gallery",
                   json={"url": "/api/files/test.jpg", "caption": "x", "category": "equipo"},
                   timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["category"] == "equipo"
        # Verify persistence
        rp = s.get(f"{API}/providers/me", timeout=15)
        gallery = rp.json().get("gallery", [])
        match = next((g for g in gallery if g["id"] == body["id"]), None)
        assert match and match["category"] == "equipo"

    def test_post_with_invalid_category_422(self, provider_session):
        s = provider_session
        r = s.post(f"{API}/providers/me/gallery",
                   json={"url": "/api/files/test.jpg", "category": "invalid_value"},
                   timeout=15)
        assert r.status_code == 422, f"Expected 422, got {r.status_code}: {r.text}"

    def test_post_without_category_ok(self, provider_session):
        s = provider_session
        r = s.post(f"{API}/providers/me/gallery",
                   json={"url": "/api/files/test.jpg"},
                   timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("category") is None


# --- PUT category ---
class TestGalleryCategoryUpdate:
    def test_set_then_unset(self, provider_session, seed_ids):
        s = provider_session
        gid = next(iter(seed_ids))
        # Set
        r1 = s.put(f"{API}/providers/me/gallery/{gid}/category",
                   json={"category": "negocio"}, timeout=15)
        assert r1.status_code == 200, r1.text
        # Verify
        rp = s.get(f"{API}/providers/me", timeout=15).json()
        match = next(g for g in rp["gallery"] if g["id"] == gid)
        assert match["category"] == "negocio"
        # Unset to null
        r2 = s.put(f"{API}/providers/me/gallery/{gid}/category",
                   json={"category": None}, timeout=15)
        assert r2.status_code == 200, r2.text
        rp = s.get(f"{API}/providers/me", timeout=15).json()
        match = next(g for g in rp["gallery"] if g["id"] == gid)
        assert match["category"] is None

    def test_404_on_unknown_id(self, provider_session):
        s = provider_session
        r = s.put(f"{API}/providers/me/gallery/g_does_not_exist_xyz/category",
                  json={"category": "otro"}, timeout=15)
        assert r.status_code == 404, r.text

    def test_invalid_category_value_422(self, provider_session, seed_ids):
        s = provider_session
        gid = next(iter(seed_ids))
        r = s.put(f"{API}/providers/me/gallery/{gid}/category",
                  json={"category": "no_existe"}, timeout=15)
        assert r.status_code == 422, r.text


# --- Video upload Plan gating + validations ---
class TestProviderVideo:
    def test_free_plan_403(self, provider_session):
        s = provider_session
        s.post(f"{API}/providers/me/plan", json={"plan": "free"}, timeout=15)
        files = {"file": ("clip.mp4", io.BytesIO(MINIMAL_MP4), "video/mp4")}
        r = s.post(f"{API}/providers/me/video", files=files, timeout=30)
        assert r.status_code == 403, f"Expected 403 on free, got {r.status_code}: {r.text}"
        detail = r.json().get("detail", "")
        assert "Pro" in detail and "Premium" in detail

    def test_pro_plan_upload_ok(self, provider_session):
        s = provider_session
        s.post(f"{API}/providers/me/plan", json={"plan": "pro"}, timeout=15)
        files = {"file": ("clip.mp4", io.BytesIO(MINIMAL_MP4), "video/mp4")}
        r = s.post(f"{API}/providers/me/video", files=files, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["video_url"].startswith("/api/files/")
        assert body["content_type"] == "video/mp4"
        assert body["size"] == len(MINIMAL_MP4)
        # Verify persistence
        prof = s.get(f"{API}/providers/me", timeout=15).json()
        assert prof.get("video_url") == body["video_url"]
        assert prof.get("video_content_type") == "video/mp4"
        assert prof.get("video_uploaded_at")

    def test_rejects_non_video_content_type(self, provider_session):
        s = provider_session
        s.post(f"{API}/providers/me/plan", json={"plan": "pro"}, timeout=15)
        files = {"file": ("img.jpg", io.BytesIO(b"\xff\xd8\xff" + b"\x00" * 100), "image/jpeg")}
        r = s.post(f"{API}/providers/me/video", files=files, timeout=30)
        assert r.status_code == 400, r.text
        assert "MP4" in r.json().get("detail", "") or "Formato" in r.json().get("detail", "")

    def test_accepts_mov_and_avi(self, provider_session):
        s = provider_session
        s.post(f"{API}/providers/me/plan", json={"plan": "pro"}, timeout=15)
        for ct in ["video/quicktime", "video/x-msvideo", "video/avi"]:
            files = {"file": ("clip.bin", io.BytesIO(MINIMAL_MP4), ct)}
            r = s.post(f"{API}/providers/me/video", files=files, timeout=30)
            assert r.status_code == 200, f"{ct} failed: {r.status_code} {r.text}"

    def test_replaces_existing_video(self, provider_session):
        s = provider_session
        s.post(f"{API}/providers/me/plan", json={"plan": "pro"}, timeout=15)
        # First upload
        files1 = {"file": ("a.mp4", io.BytesIO(MINIMAL_MP4), "video/mp4")}
        r1 = s.post(f"{API}/providers/me/video", files=files1, timeout=30)
        assert r1.status_code == 200
        url1 = r1.json()["video_url"]
        # Second upload
        files2 = {"file": ("b.mp4", io.BytesIO(MINIMAL_MP4 + b"\x01"), "video/mp4")}
        r2 = s.post(f"{API}/providers/me/video", files=files2, timeout=30)
        assert r2.status_code == 200
        url2 = r2.json()["video_url"]
        assert url1 != url2
        # Verify provider profile now has url2
        prof = s.get(f"{API}/providers/me", timeout=15).json()
        assert prof.get("video_url") == url2

    def test_delete_video_unsets_fields(self, provider_session):
        s = provider_session
        s.post(f"{API}/providers/me/plan", json={"plan": "pro"}, timeout=15)
        files = {"file": ("clip.mp4", io.BytesIO(MINIMAL_MP4), "video/mp4")}
        r = s.post(f"{API}/providers/me/video", files=files, timeout=30)
        assert r.status_code == 200
        # Now delete
        rd = s.delete(f"{API}/providers/me/video", timeout=15)
        assert rd.status_code == 200, rd.text
        prof = s.get(f"{API}/providers/me", timeout=15).json()
        assert "video_url" not in prof or not prof.get("video_url")
        assert "video_content_type" not in prof or not prof.get("video_content_type")
        assert "video_uploaded_at" not in prof or not prof.get("video_uploaded_at")


# --- Public by-slug includes video_url ---
class TestBySlugVideo:
    def test_by_slug_includes_video_url_when_set(self, provider_session):
        s = provider_session
        s.post(f"{API}/providers/me/plan", json={"plan": "pro"}, timeout=15)
        files = {"file": ("clip.mp4", io.BytesIO(MINIMAL_MP4), "video/mp4")}
        ru = s.post(f"{API}/providers/me/video", files=files, timeout=30)
        assert ru.status_code == 200
        expected_url = ru.json()["video_url"]
        # Public fetch — no auth needed
        rp = requests.get(f"{API}/providers/by-slug/{PROVIDER_SLUG}", timeout=15)
        assert rp.status_code == 200, rp.text
        assert rp.json().get("video_url") == expected_url
