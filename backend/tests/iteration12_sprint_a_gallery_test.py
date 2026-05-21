"""Sprint A — Plan-based photo policy + Gallery UX backend tests.

Covers:
- GET /api/plans new wording
- GET /api/providers/me/gallery/limit
- POST /api/providers/me/gallery (sort_order + Free=20 enforcement)
- PUT /api/providers/me/gallery/reorder (persist + tolerate invalid ids + keep leftovers)
- PUT /api/providers/me/gallery/{item_id}/category (404 on bad id)
- POST /api/upload returns URL, file is compressed to 1200px max-width
- POST /api/upload rejects >10MB and non-image content type
"""
import io
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

PROVIDER_EMAIL = "demo.provider@getamano.com"
PROVIDER_PASSWORD = os.environ.get("TEST_PROVIDER_PASSWORD", "provider123")


# --- Fixtures ---
@pytest.fixture(scope="module")
def provider_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": PROVIDER_EMAIL, "password": PROVIDER_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def seed_ids(provider_session):
    """Capture pre-existing seed photo ids — must not be deleted by tests."""
    s = provider_session
    r2 = s.get(f"{API}/providers/me", timeout=15)
    assert r2.status_code == 200, r2.text
    gallery = r2.json().get("gallery", []) or []
    return {g["id"] for g in gallery}


@pytest.fixture(autouse=True)
def restore_plan_and_cleanup(provider_session, seed_ids):
    """After every test, restore plan to pro and remove any non-seed gallery items."""
    yield
    s = provider_session
    try:
        s.post(f"{API}/providers/me/plan", json={"plan": "pro"}, timeout=15)
    except Exception:
        pass
    try:
        r2 = s.get(f"{API}/providers/me", timeout=15)
        if r2.status_code == 200:
            for g in (r2.json().get("gallery") or []):
                if g["id"] not in seed_ids:
                    s.delete(f"{API}/providers/me/gallery/{g['id']}", timeout=15)
    except Exception:
        pass


# --- /api/plans wording ---
def test_plans_wording():
    r = requests.get(f"{API}/plans", timeout=15)
    assert r.status_code == 200
    plans = {p["id"]: p for p in r.json()}
    assert "free" in plans and "basic" in plans and "pro" in plans and "premium" in plans
    free_feats = " | ".join(plans["free"]["features_es"]).lower()
    assert "20 fotos" in free_feats, f"Free should mention 20 fotos: {free_feats}"
    basic_feats = " | ".join(plans["basic"]["features_es"]).lower()
    assert "fotos ilimitadas" in basic_feats
    pro_feats = " | ".join(plans["pro"]["features_es"]).lower()
    assert "fotos ilimitadas" in pro_feats
    assert "video de presentación" in pro_feats
    premium_feats = " | ".join(plans["premium"]["features_es"]).lower()
    assert "fotos ilimitadas" in premium_feats
    assert "video de presentación" in premium_feats


# --- /api/providers/me/gallery/limit ---
def test_gallery_limit_pro_unlimited(provider_session):
    s = provider_session
    s.post(f"{API}/providers/me/plan", json={"plan": "pro"}, timeout=15)
    r = s.get(f"{API}/providers/me/gallery/limit", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["plan"] == "pro"
    assert data["max"] is None
    assert data["can_upload"] == True  # noqa: E712
    assert data["remaining"] is None
    assert isinstance(data["used"], int)


def test_gallery_limit_free_caps_20(provider_session):
    s = provider_session
    s.post(f"{API}/providers/me/plan", json={"plan": "free"}, timeout=15)
    r = s.get(f"{API}/providers/me/gallery/limit", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["plan"] == "free"
    assert data["max"] == 20
    assert isinstance(data["remaining"], int)


# --- POST /providers/me/gallery sort_order + Free 20 enforcement ---
def test_gallery_post_sort_order_increments(provider_session):
    s = provider_session
    s.post(f"{API}/providers/me/plan", json={"plan": "pro"}, timeout=15)
    r1 = s.post(f"{API}/providers/me/gallery", json={"url": "https://example.com/a.jpg", "category": "negocio"}, timeout=15)
    assert r1.status_code == 200, r1.text
    item1 = r1.json()
    assert item1["category"] == "negocio"
    assert "sort_order" in item1
    r2 = s.post(f"{API}/providers/me/gallery", json={"url": "https://example.com/b.jpg"}, timeout=15)
    assert r2.status_code == 200
    item2 = r2.json()
    assert item2["sort_order"] == item1["sort_order"] + 1


def test_gallery_free_limit_403_at_21(provider_session, seed_ids):
    s = provider_session
    s.post(f"{API}/providers/me/plan", json={"plan": "free"}, timeout=15)
    # Calculate how many to add to reach 20
    lim = s.get(f"{API}/providers/me/gallery/limit", timeout=15).json()
    to_add = 20 - lim["used"]
    assert to_add >= 0
    for i in range(to_add):
        r = s.post(f"{API}/providers/me/gallery", json={"url": f"https://example.com/fill{i}.jpg"}, timeout=15)
        assert r.status_code == 200, f"Fill #{i} failed: {r.status_code} {r.text}"
    # Now at 20 — next must 403
    r403 = s.post(f"{API}/providers/me/gallery", json={"url": "https://example.com/over.jpg"}, timeout=15)
    assert r403.status_code == 403, f"Expected 403 at #21, got {r403.status_code} {r403.text}"
    detail = r403.json().get("detail", "").lower()
    assert "límite" in detail or "limite" in detail or "20" in detail


# --- PUT /providers/me/gallery/reorder ---
def test_reorder_persists_and_tolerates_invalid(provider_session):
    s = provider_session
    s.post(f"{API}/providers/me/plan", json={"plan": "pro"}, timeout=15)
    a = s.post(f"{API}/providers/me/gallery", json={"url": "https://example.com/r1.jpg"}, timeout=15).json()
    b = s.post(f"{API}/providers/me/gallery", json={"url": "https://example.com/r2.jpg"}, timeout=15).json()
    c = s.post(f"{API}/providers/me/gallery", json={"url": "https://example.com/r3.jpg"}, timeout=15).json()
    # Reorder b,a + invalid id; c should remain at end
    payload = {"order": [b["id"], "g_nonexistent", a["id"]]}
    rr = s.put(f"{API}/providers/me/gallery/reorder", json=payload, timeout=15)
    assert rr.status_code == 200, rr.text
    # Verify persistence via profile fetch
    prof = s.get(f"{API}/providers/me", timeout=15).json()
    gallery = sorted(prof["gallery"], key=lambda g: g.get("sort_order", 0))
    ids = [g["id"] for g in gallery]
    # b first, then a, then c (and any seed) at end
    assert ids.index(b["id"]) < ids.index(a["id"]) < ids.index(c["id"]), f"Order wrong: {ids}"


# --- PUT /providers/me/gallery/{id}/category ---
def test_set_category_404_when_missing(provider_session):
    s = provider_session
    r = s.put(f"{API}/providers/me/gallery/g_doesnotexist/category", json={"category": "equipo"}, timeout=15)
    assert r.status_code == 404


def test_set_category_ok(provider_session):
    s = provider_session
    s.post(f"{API}/providers/me/plan", json={"plan": "pro"}, timeout=15)
    item = s.post(f"{API}/providers/me/gallery", json={"url": "https://example.com/cat.jpg"}, timeout=15).json()
    r = s.put(f"{API}/providers/me/gallery/{item['id']}/category", json={"category": "equipo"}, timeout=15)
    assert r.status_code == 200
    assert r.json()["category"] == "equipo"


# --- POST /api/upload (compression + validation) ---
def _make_jpeg_bytes(width: int, height: int) -> bytes:
    from PIL import Image
    img = Image.new("RGB", (width, height), color=(220, 100, 50))
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=92)
    return out.getvalue()


def test_upload_compresses_to_1200_width(provider_session):
    s = provider_session
    raw = _make_jpeg_bytes(2000, 1500)
    files = {"file": ("big.jpg", raw, "image/jpeg")}
    r = s.post(f"{API}/upload", files=files, timeout=30)
    assert r.status_code == 200, r.text
    url = r.json()["url"]
    # Fetch and verify dimensions via PIL
    full = f"{BASE_URL}{url}"
    r2 = s.get(full, timeout=20)
    assert r2.status_code == 200
    from PIL import Image
    img = Image.open(io.BytesIO(r2.content))
    assert img.width <= 1200, f"Width should be <=1200, got {img.width}"
    # Aspect preserved: original 2000x1500 → 1200x900
    assert img.width == 1200 and img.height == 900, f"Got {img.width}x{img.height}"
    # Compressed bytes should be much smaller than original
    assert len(r2.content) < len(raw), f"Compressed {len(r2.content)} >= original {len(raw)}"


def test_upload_rejects_non_image(provider_session):
    s = provider_session
    files = {"file": ("note.txt", b"hello world", "text/plain")}
    r = s.post(f"{API}/upload", files=files, timeout=15)
    assert r.status_code == 400
    assert "imágenes" in r.json().get("detail", "").lower() or "imagenes" in r.json().get("detail", "").lower()


def test_upload_rejects_over_10mb(provider_session):
    s = provider_session
    # Create ~11MB payload. Use random-ish bytes that won't compress trivially in HTTP layer.
    big = os.urandom(11 * 1024 * 1024)
    files = {"file": ("huge.jpg", big, "image/jpeg")}
    r = s.post(f"{API}/upload", files=files, timeout=60)
    assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text[:200]}"
    assert "10" in r.json().get("detail", "")
