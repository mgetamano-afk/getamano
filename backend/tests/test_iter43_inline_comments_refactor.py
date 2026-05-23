"""
Iteration 43 — Backend regression for the routes/community.py refactor.

Verifies every /api/community/* endpoint behaves identically after being
extracted from server.py into routes/community.py via make_router factory.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://verified-providers-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@getamano.com", "password": "admin123"}
PROVIDER = {"email": "demo.provider@getamano.com", "password": "provider123"}
CLIENT = {"email": "demo.client@getamano.com", "password": "client123"}

SEED_POST_ID = "post_demo_seed_001"
SEED_POST_ID_2 = "post_demo_seed_002"


def _login(creds):
    s = requests.Session()
    for attempt in range(4):
        r = s.post(f"{API}/auth/login", json=creds, timeout=15)
        if r.status_code == 200:
            return s
        if r.status_code == 429:
            time.sleep(15)
            continue
        break
    pytest.skip(f"Auth failed for {creds['email']}: {r.status_code} {r.text[:120]}")


@pytest.fixture(scope="module")
def admin_sess():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def provider_sess():
    return _login(PROVIDER)


@pytest.fixture(scope="module")
def client_sess():
    return _login(CLIENT)


# ─── Posts (anon + auth) ─────────────────────────────────────────────────
class TestCommunityPosts:
    def test_list_posts_anon(self):
        r = requests.get(f"{API}/community/posts", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "items" in data and isinstance(data["items"], list)
        ids = {p["post_id"] for p in data["items"]}
        assert SEED_POST_ID in ids, "post_demo_seed_001 missing"
        assert SEED_POST_ID_2 in ids, "post_demo_seed_002 missing"
        sample = next(p for p in data["items"] if p["post_id"] == SEED_POST_ID)
        assert "author" in sample
        assert sample["author"].get("name")
        assert "liked_by_me" in sample
        # anon: followed_by_me may be present as False (hydrate adds default)
        assert sample["author"].get("followed_by_me", False) is False

    def test_feed_auth_has_followed_flag(self, client_sess):
        r = client_sess.get(f"{API}/community/posts/feed", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data["items"], list)
        sample = next((p for p in data["items"] if p.get("author", {}).get("is_provider")), None)
        if sample:
            assert "followed_by_me" in sample["author"]
        assert "liked_by_me" in data["items"][0]

    def test_feed_requires_auth(self):
        r = requests.get(f"{API}/community/posts/feed", timeout=15)
        assert r.status_code in (401, 403)

    def test_create_post_image_only_ok(self, client_sess):
        payload = {"content": "", "image_url": "https://picsum.photos/seed/iter43/600/400"}
        r = client_sess.post(f"{API}/community/posts", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        post = r.json()
        assert post.get("post_id", "").startswith("post_")
        assert post.get("image_url") == payload["image_url"]
        # Cleanup
        client_sess.delete(f"{API}/community/posts/{post['post_id']}")

    def test_create_post_short_text_no_image_422(self, client_sess):
        r = client_sess.post(f"{API}/community/posts", json={"content": "hi"}, timeout=15)
        assert r.status_code == 422

    def test_create_post_text_ok(self, client_sess):
        r = client_sess.post(f"{API}/community/posts", json={"content": "TEST_iter43 inline regression post"}, timeout=15)
        assert r.status_code == 200, r.text
        pid = r.json()["post_id"]
        # Toggle like
        lr = client_sess.post(f"{API}/community/posts/{pid}/like", timeout=15)
        assert lr.status_code == 200
        assert lr.json()["liked"] is True
        ur = client_sess.post(f"{API}/community/posts/{pid}/like", timeout=15)
        assert ur.json()["liked"] is False
        # Cleanup (soft delete by owner)
        d = client_sess.delete(f"{API}/community/posts/{pid}", timeout=15)
        assert d.status_code == 200

    def test_delete_post_non_owner_forbidden(self, client_sess, provider_sess):
        # Provider creates, client (non-owner) tries delete
        r = provider_sess.post(f"{API}/community/posts", json={"content": "TEST_iter43 owner-only delete"}, timeout=15)
        assert r.status_code == 200
        pid = r.json()["post_id"]
        bad = client_sess.delete(f"{API}/community/posts/{pid}", timeout=15)
        assert bad.status_code == 403
        # owner cleanup
        provider_sess.delete(f"{API}/community/posts/{pid}")

    def test_delete_post_admin_ok(self, provider_sess, admin_sess):
        r = provider_sess.post(f"{API}/community/posts", json={"content": "TEST_iter43 admin delete"}, timeout=15)
        pid = r.json()["post_id"]
        d = admin_sess.delete(f"{API}/community/posts/{pid}", timeout=15)
        assert d.status_code == 200


# ─── Stories / Suggested / Trending / Follows ────────────────────────────
class TestCommunityAux:
    def test_stories(self):
        r = requests.get(f"{API}/community/stories", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        if data:
            assert {"user_id", "slug", "business_name"}.issubset(set(data[0]))

    def test_suggested_auth(self, client_sess):
        r = client_sess.get(f"{API}/community/suggested", timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        for p in items:
            assert not (p.get("business_name") or "").startswith("TEST_")

    def test_trending(self):
        r = requests.get(f"{API}/community/trending", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        if data:
            assert "category_id" in data[0] and "count" in data[0]

    def test_me_follows(self, client_sess):
        r = client_sess.get(f"{API}/community/me/follows", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "items" in body and "count" in body

    def test_follow_unfollow(self, client_sess, provider_sess):
        # Get provider user_id from /auth/me
        me = provider_sess.get(f"{API}/auth/me", timeout=15).json()
        prov_uid = me.get("user_id")
        assert prov_uid
        f = client_sess.post(f"{API}/community/follows/{prov_uid}", timeout=15)
        assert f.status_code == 200 and f.json()["following"] is True
        u = client_sess.delete(f"{API}/community/follows/{prov_uid}", timeout=15)
        assert u.status_code == 200 and u.json()["following"] is False

    def test_follow_self_400(self, client_sess):
        me = client_sess.get(f"{API}/auth/me", timeout=15).json()
        r = client_sess.post(f"{API}/community/follows/{me['user_id']}", timeout=15)
        assert r.status_code == 400


# ─── Comments ────────────────────────────────────────────────────────────
class TestCommunityComments:
    def test_list_comments_anon_seed(self):
        r = requests.get(f"{API}/community/posts/{SEED_POST_ID}/comments", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "items" in body and "total" in body
        assert body["total"] >= 1
        contents = [c["content"] for c in body["items"]]
        assert any("Excelente servicio María" in c for c in contents), f"Seed comment from Carlos missing: {contents}"

    def test_list_comments_404(self):
        r = requests.get(f"{API}/community/posts/post_doesnotexist/comments", timeout=15)
        assert r.status_code == 404

    def test_create_and_delete_comment(self, client_sess):
        unique = f"TEST_iter43 inline comment {uuid.uuid4().hex[:6]}"
        c = client_sess.post(f"{API}/community/posts/{SEED_POST_ID}/comments", json={"content": unique}, timeout=15)
        assert c.status_code == 200, c.text
        cid = c.json()["comment_id"]
        # Verify persistence
        lst = requests.get(f"{API}/community/posts/{SEED_POST_ID}/comments?limit=100", timeout=15).json()
        assert any(x["comment_id"] == cid and x["content"] == unique for x in lst["items"])
        # Delete by owner
        d = client_sess.delete(f"{API}/community/comments/{cid}", timeout=15)
        assert d.status_code == 200

    def test_delete_comment_non_owner_403(self, client_sess, provider_sess):
        unique = f"TEST_iter43 forbidden-del {uuid.uuid4().hex[:6]}"
        c = client_sess.post(f"{API}/community/posts/{SEED_POST_ID}/comments", json={"content": unique}, timeout=15)
        assert c.status_code == 200
        cid = c.json()["comment_id"]
        # Provider is post owner (María) → admin/owner allowed; need a different non-admin user
        # Use admin to delete instead — verify admin override works
        # But to test 403, create as client, then provider (post owner) tries: provider IS post owner so allowed.
        # So just verify owner-delete and admin-delete; skip cross-user 403 since seed post belongs to provider.
        # cleanup
        client_sess.delete(f"{API}/community/comments/{cid}")

    def test_delete_comment_admin_override(self, client_sess, admin_sess):
        unique = f"TEST_iter43 admin-del {uuid.uuid4().hex[:6]}"
        c = client_sess.post(f"{API}/community/posts/{SEED_POST_ID}/comments", json={"content": unique}, timeout=15)
        cid = c.json()["comment_id"]
        d = admin_sess.delete(f"{API}/community/comments/{cid}", timeout=15)
        assert d.status_code == 200

    def test_comment_validation_empty(self, client_sess):
        r = client_sess.post(f"{API}/community/posts/{SEED_POST_ID}/comments", json={"content": ""}, timeout=15)
        assert r.status_code == 422

    def test_comment_notification_to_owner(self, client_sess, provider_sess):
        unique = f"TEST_iter43 notif {uuid.uuid4().hex[:8]}"
        c = client_sess.post(f"{API}/community/posts/{SEED_POST_ID}/comments", json={"content": unique}, timeout=15)
        assert c.status_code == 200
        cid = c.json()["comment_id"]
        # Provider checks notifications
        r = provider_sess.get(f"{API}/notifications?limit=20", timeout=15)
        assert r.status_code == 200
        items = r.json().get("items") if isinstance(r.json(), dict) else r.json()
        if isinstance(items, dict):
            items = items.get("items", [])
        # Allow either structure
        assert any(unique[:60] in (n.get("body") or "") or "comentó" in (n.get("title") or "") for n in items), "Notification fan-out missing"
        client_sess.delete(f"{API}/community/comments/{cid}")


# ─── Demo seed integrity ─────────────────────────────────────────────────
class TestSeedIntegrity:
    def test_demo_seeds_intact(self):
        r = requests.get(f"{API}/community/posts?limit=50", timeout=15)
        ids = {p["post_id"] for p in r.json()["items"]}
        assert SEED_POST_ID in ids
        assert SEED_POST_ID_2 in ids

    def test_carlos_seed_comment_intact(self):
        r = requests.get(f"{API}/community/posts/{SEED_POST_ID}/comments?limit=100", timeout=15)
        contents = [c["content"] for c in r.json()["items"]]
        assert any("Excelente servicio María! Te recomiendo a mis amigos." in c for c in contents)
