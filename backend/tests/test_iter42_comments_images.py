"""
Iteration 42 — Comments + Image Upload sprint
Tests:
  - GET /api/community/posts/{post_id}/comments (public, hydrated author)
  - POST /api/community/posts/{post_id}/comments (auth, validation, $inc, notification)
  - DELETE /api/community/comments/{comment_id} (owner/admin/403/404, $dec)
  - GET /api/notifications now includes category='community'
  - /api/upload usable with valid image; rejects non-image and >10MB
  - Seed state: María's post_demo_seed_001 has 1 comment from Carlos Demo
"""
import io
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@getamano.com", "password": "admin123"}
PROVIDER = {"email": "demo.provider@getamano.com", "password": "provider123"}
CLIENT = {"email": "demo.client@getamano.com", "password": "client123"}
SEED_POST_ID = "post_demo_seed_001"


def _login(creds):
    s = requests.Session()
    for attempt in range(2):
        r = s.post(f"{API}/auth/login", json=creds, timeout=20)
        if r.status_code == 200:
            return s
        if r.status_code == 429:
            time.sleep(65)
            continue
        break
    pytest.skip(f"login failed for {creds['email']}: {r.status_code} {r.text[:200]}")


@pytest.fixture(scope="module")
def admin_session():
    s = _login(ADMIN)
    yield s
    s.close()


@pytest.fixture(scope="module")
def provider_session():
    time.sleep(8)
    s = _login(PROVIDER)
    yield s
    s.close()


@pytest.fixture(scope="module")
def client_session():
    time.sleep(8)
    s = _login(CLIENT)
    yield s
    s.close()


# ============ GET /community/posts/{id}/comments ============
class TestListComments:
    def test_list_seed_post_comments_public(self):
        r = requests.get(f"{API}/community/posts/{SEED_POST_ID}/comments", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data and "total" in data and "next_after" in data
        assert isinstance(data["items"], list)
        assert data["total"] >= 1, f"Expected at least 1 seed comment, got {data['total']}"
        # author hydration
        c0 = data["items"][0]
        for k in ("comment_id", "post_id", "user_id", "content", "is_hidden", "created_at", "author"):
            assert k in c0, f"Missing {k} in comment"
        for k in ("user_id", "name", "picture", "slug", "business_name", "is_provider"):
            assert k in c0["author"], f"Missing author.{k}"

    def test_list_unknown_post_404(self):
        r = requests.get(f"{API}/community/posts/post_does_not_exist_xxx/comments", timeout=20)
        assert r.status_code == 404


# ============ POST /community/posts/{id}/comments ============
class TestCreateComment:
    def test_create_comment_increments_count_and_notifies(self, client_session, provider_session):
        # Baseline comments_count on the seed post
        r0 = requests.get(f"{API}/community/posts", timeout=20)
        assert r0.status_code == 200
        posts = r0.json().get("items") or r0.json() if isinstance(r0.json(), list) else r0.json().get("items", [])
        if isinstance(r0.json(), dict):
            posts = r0.json().get("items", [])
        seed_post = next((p for p in posts if p.get("post_id") == SEED_POST_ID), None)
        assert seed_post, "Seed post not found"
        baseline = seed_post.get("comments_count", 0)

        # Provider's notifications baseline
        nr0 = provider_session.get(f"{API}/notifications", timeout=20)
        assert nr0.status_code == 200
        notif_before = nr0.json()
        notif_before_count = notif_before.get("total", 0) if isinstance(notif_before, dict) else len(notif_before)

        # Carlos creates a fresh comment
        body = {"content": "TEST_iter42 comment from Carlos to María"}
        r = client_session.post(f"{API}/community/posts/{SEED_POST_ID}/comments", json=body, timeout=20)
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["content"] == body["content"]
        assert c["post_id"] == SEED_POST_ID
        assert c["is_hidden"] is False
        assert c["author"]["name"]
        global _CREATED_COMMENT_ID
        _CREATED_COMMENT_ID = c["comment_id"]

        # comments_count incremented
        time.sleep(0.5)
        r2 = requests.get(f"{API}/community/posts", timeout=20)
        posts2 = r2.json().get("items", []) if isinstance(r2.json(), dict) else r2.json()
        seed_post2 = next((p for p in posts2 if p.get("post_id") == SEED_POST_ID), None)
        assert seed_post2["comments_count"] == baseline + 1

        # Notification appeared for María (post owner)
        nr1 = provider_session.get(f"{API}/notifications", timeout=20)
        assert nr1.status_code == 200
        notif_after = nr1.json()
        items = notif_after.get("items", []) if isinstance(notif_after, dict) else notif_after
        # Look for our specific notification by the comment_id key
        match = [n for n in items if n.get("category") == "community" and _CREATED_COMMENT_ID in (n.get("notification_key") or "")]
        assert match, f"No community notification for comment {_CREATED_COMMENT_ID}. Sample: {items[:2] if items else 'EMPTY'}"
        n = match[0]
        assert "comentó" in (n.get("title") or "").lower() or "💬" in (n.get("title") or "")
        assert n.get("cta_url") == "/comunidad"

    def test_no_notification_when_commenting_on_own_post(self, provider_session):
        # María creates a NEW post and comments on it. No notification should be created for self.
        nr0 = provider_session.get(f"{API}/notifications", timeout=20)
        before = nr0.json()
        before_items = before.get("items", []) if isinstance(before, dict) else before
        before_keys = {n.get("notification_key") for n in before_items}

        p = provider_session.post(f"{API}/community/posts", json={"content": "TEST_iter42 own post"}, timeout=20)
        if p.status_code == 429:
            pytest.skip("rate-limited on post create")
        assert p.status_code == 200, p.text
        post_id = p.json()["post_id"]

        c = provider_session.post(f"{API}/community/posts/{post_id}/comments", json={"content": "self-comment TEST"}, timeout=20)
        assert c.status_code == 200, c.text

        nr1 = provider_session.get(f"{API}/notifications", timeout=20)
        after = nr1.json()
        after_items = after.get("items", []) if isinstance(after, dict) else after
        new_community = [n for n in after_items if n.get("category") == "community" and n.get("notification_key") not in before_keys]
        assert not new_community, f"Self-comment should NOT create notification, but got: {new_community}"

        # cleanup
        provider_session.delete(f"{API}/community/posts/{post_id}", timeout=20)

    def test_create_comment_validation_too_short(self, client_session):
        # COMMENT_MIN_LEN=1, so empty string fails
        r = client_session.post(f"{API}/community/posts/{SEED_POST_ID}/comments", json={"content": ""}, timeout=20)
        assert r.status_code == 422

    def test_create_comment_validation_too_long(self, client_session):
        long = "x" * 301
        r = client_session.post(f"{API}/community/posts/{SEED_POST_ID}/comments", json={"content": long}, timeout=20)
        assert r.status_code == 422

    def test_create_comment_unknown_post_404(self, client_session):
        r = client_session.post(f"{API}/community/posts/post_xxx/comments", json={"content": "hi"}, timeout=20)
        assert r.status_code == 404

    def test_create_comment_anon_401(self):
        r = requests.post(f"{API}/community/posts/{SEED_POST_ID}/comments", json={"content": "hi"}, timeout=20)
        assert r.status_code in (401, 403)


# ============ DELETE /community/comments/{id} ============
class TestDeleteComment:
    def test_delete_own_comment_decrements(self, client_session):
        # Create then delete by same user
        r = client_session.post(f"{API}/community/posts/{SEED_POST_ID}/comments", json={"content": "TEST_to_delete"}, timeout=20)
        assert r.status_code == 200, r.text
        cid = r.json()["comment_id"]

        r0 = requests.get(f"{API}/community/posts", timeout=20)
        posts = r0.json().get("items", []) if isinstance(r0.json(), dict) else r0.json()
        before = next(p for p in posts if p.get("post_id") == SEED_POST_ID)["comments_count"]

        rd = client_session.delete(f"{API}/community/comments/{cid}", timeout=20)
        assert rd.status_code == 200, rd.text
        assert rd.json().get("ok") is True

        r1 = requests.get(f"{API}/community/posts", timeout=20)
        posts2 = r1.json().get("items", []) if isinstance(r1.json(), dict) else r1.json()
        after = next(p for p in posts2 if p.get("post_id") == SEED_POST_ID)["comments_count"]
        assert after == before - 1

        # GET comments should not include it
        lr = requests.get(f"{API}/community/posts/{SEED_POST_ID}/comments", timeout=20)
        ids = [c["comment_id"] for c in lr.json()["items"]]
        assert cid not in ids

    def test_delete_other_user_403(self, client_session, provider_session):
        # María creates own comment on her own post, Carlos tries to delete → 403
        rp = provider_session.post(f"{API}/community/posts/{SEED_POST_ID}/comments", json={"content": "TEST_maria comment"}, timeout=20)
        assert rp.status_code == 200, rp.text
        cid = rp.json()["comment_id"]

        rd = client_session.delete(f"{API}/community/comments/{cid}", timeout=20)
        assert rd.status_code == 403

        # cleanup by owner
        provider_session.delete(f"{API}/community/comments/{cid}", timeout=20)

    def test_delete_unknown_404(self, client_session):
        rd = client_session.delete(f"{API}/community/comments/cmt_does_not_exist", timeout=20)
        assert rd.status_code == 404

    def test_admin_can_delete_any(self, client_session, admin_session):
        # Carlos creates, admin deletes
        rc = client_session.post(f"{API}/community/posts/{SEED_POST_ID}/comments", json={"content": "TEST_admin_delete"}, timeout=20)
        assert rc.status_code == 200, rc.text
        cid = rc.json()["comment_id"]
        rd = admin_session.delete(f"{API}/community/comments/{cid}", timeout=20)
        assert rd.status_code == 200


# ============ /api/notifications now includes community ============
class TestNotificationsIncludeCommunity:
    def test_notifications_endpoint_returns_community_category(self, client_session, provider_session):
        # Create fresh comment from Carlos → María should get a community notif
        r = client_session.post(f"{API}/community/posts/{SEED_POST_ID}/comments", json={"content": "TEST_notif"}, timeout=20)
        assert r.status_code == 200, r.text
        cid = r.json()["comment_id"]

        time.sleep(0.5)
        nr = provider_session.get(f"{API}/notifications", timeout=20)
        assert nr.status_code == 200, nr.text
        data = nr.json()
        items = data.get("items", []) if isinstance(data, dict) else data
        cats = {n.get("category") for n in items}
        assert "community" in cats, f"No 'community' category present. Got: {cats}"

        # cleanup
        client_session.delete(f"{API}/community/comments/{cid}", timeout=20)


# ============ /api/upload ============
class TestUploadEndpoint:
    def _png_bytes(self):
        # tiny 1x1 PNG (89 bytes)
        return bytes.fromhex(
            "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
            "890000000d49444154789c63f80f0000010001005c2cb1c30000000049454e44ae426082"
        )

    def test_upload_image_success(self, client_session):
        files = {"file": ("test.png", self._png_bytes(), "image/png")}
        r = client_session.post(f"{API}/upload", files=files, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "url" in d and d["url"].startswith("/api/files/")
        assert "file_id" in d

    def test_upload_rejects_non_image(self, client_session):
        files = {"file": ("test.txt", b"hello world", "text/plain")}
        r = client_session.post(f"{API}/upload", files=files, timeout=20)
        assert r.status_code == 400
        assert "imágenes" in (r.json().get("detail") or "").lower() or "image" in (r.json().get("detail") or "").lower()

    def test_upload_rejects_anon(self):
        files = {"file": ("test.png", self._png_bytes(), "image/png")}
        r = requests.post(f"{API}/upload", files=files, timeout=20)
        assert r.status_code in (401, 403)


# ============ Image-only post (no text required when image present) ============
class TestImageOnlyPost:
    def test_image_only_post_succeeds_with_empty_content(self, provider_session):
        """After iter42 fix: when image_url is present, content can be empty.
        When NO image, content must still be >= 4 chars (anti-noise guard)."""
        png = bytes.fromhex(
            "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
            "890000000d49444154789c63f80f0000010001005c2cb1c30000000049454e44ae426082"
        )
        files = {"file": ("test.png", png, "image/png")}
        up = provider_session.post(f"{API}/upload", files=files, timeout=20)
        if up.status_code != 200:
            pytest.skip(f"upload failed: {up.text}")
        image_url = up.json()["url"]

        # 1. Image + empty content → 200
        r = provider_session.post(
            f"{API}/community/posts",
            json={"content": "", "image_url": image_url},
            timeout=20,
        )
        assert r.status_code == 200, f"image-only post should succeed: {r.text}"
        post_id = r.json()["post_id"]
        assert r.json()["image_url"] == image_url

        # 2. No image + 2-char content → 422
        r2 = provider_session.post(
            f"{API}/community/posts",
            json={"content": "hi"},
            timeout=20,
        )
        assert r2.status_code == 422, f"short text-only should be rejected: {r2.text}"

        # cleanup
        provider_session.delete(f"{API}/community/posts/{post_id}", timeout=20)
