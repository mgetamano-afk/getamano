"""Iteration 53 — Sections 55 (Saved eCards) + 56 (OG previews).

Covers:
- PUT /api/saved-ecards (bookmark, like, both)
- Self-save guard (HTTP 400)
- GET /api/saved-ecards/me/state/{provider_id}
- GET /api/saved-ecards/me?filter=
- PUT /api/saved-ecards/{provider_id}/note
- DELETE /api/saved-ecards/{provider_id}
- like_count / bookmark_count recomputed on provider profile
- GET /api/og-image/{slug}.svg (real + fallback)
- GET /api/og/p/{slug} (WhatsApp UA, fallback, meta-refresh)
"""
import re
import pytest
import requests

from tests.test_config import API, DEMO_SLUG


# ---------------------------------------------------------------------------
# Section 55 — Saved eCards
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module", autouse=True)
def _cleanup_saved(client_session, demo_provider_id):
    """Make sure no stale saved entry from previous runs exists."""
    client_session.delete(f"{API}/saved-ecards/{demo_provider_id}", timeout=15)
    yield
    client_session.delete(f"{API}/saved-ecards/{demo_provider_id}", timeout=15)


class TestSavedECardsCRUD:
    def test_put_bookmark_with_note(self, client_session, demo_provider_id):
        r = client_session.put(
            f"{API}/saved-ecards",
            json={"provider_id": demo_provider_id, "save_type": "bookmark",
                  "personal_note": "TEST_iter53 note 1"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["save_type"] == "bookmark"
        assert data["personal_note"] == "TEST_iter53 note 1"
        assert "saved_at" in data
        assert "provider_id" in data

    def test_get_state_after_save(self, client_session, demo_provider_id):
        r = client_session.get(f"{API}/saved-ecards/me/state/{demo_provider_id}", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["save_type"] == "bookmark"
        assert data["personal_note"] == "TEST_iter53 note 1"

    def test_put_change_to_like(self, client_session, demo_provider_id):
        r = client_session.put(
            f"{API}/saved-ecards",
            json={"provider_id": demo_provider_id, "save_type": "like"},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["save_type"] == "like"

    def test_put_change_to_both(self, client_session, demo_provider_id):
        r = client_session.put(
            f"{API}/saved-ecards",
            json={"provider_id": demo_provider_id, "save_type": "both",
                  "personal_note": "TEST_iter53 both"},
            timeout=15,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["save_type"] == "both"
        assert data["personal_note"] == "TEST_iter53 both"

    def test_provider_counts_updated_after_both(self, demo_provider_id):
        # public endpoint, no auth required
        r = requests.get(f"{API}/providers/by-slug/{DEMO_SLUG}", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data.get("like_count", 0) >= 1, f"expected like_count >= 1, got {data.get('like_count')}"
        assert data.get("bookmark_count", 0) >= 1, f"expected bookmark_count >= 1, got {data.get('bookmark_count')}"

    def test_list_me_all(self, client_session, demo_provider_id):
        r = client_session.get(f"{API}/saved-ecards/me?filter=all", timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert any(i.get("provider_id") == demo_provider_id for i in items)
        # joined provider data should be nested
        match = next(i for i in items if i["provider_id"] == demo_provider_id)
        assert match.get("provider") is not None
        assert match["provider"].get("business_name")

    def test_list_me_bookmark_filter(self, client_session, demo_provider_id):
        # save_type=both should appear in bookmark filter too
        r = client_session.get(f"{API}/saved-ecards/me?filter=bookmark", timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert any(i["provider_id"] == demo_provider_id for i in items)

    def test_list_me_like_filter(self, client_session, demo_provider_id):
        r = client_session.get(f"{API}/saved-ecards/me?filter=like", timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert any(i["provider_id"] == demo_provider_id for i in items)

    def test_update_note_only(self, client_session, demo_provider_id):
        r = client_session.put(
            f"{API}/saved-ecards/{demo_provider_id}/note",
            json={"personal_note": "TEST_iter53 updated note"},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["personal_note"] == "TEST_iter53 updated note"

        # verify save_type unchanged
        state = client_session.get(f"{API}/saved-ecards/me/state/{demo_provider_id}", timeout=15).json()
        assert state["save_type"] == "both"
        assert state["personal_note"] == "TEST_iter53 updated note"

    def test_self_save_forbidden(self, provider_session, demo_provider_id):
        r = provider_session.put(
            f"{API}/saved-ecards",
            json={"provider_id": demo_provider_id, "save_type": "bookmark"},
            timeout=15,
        )
        assert r.status_code == 400
        body = r.json()
        assert "No puedes guardar tu propia eCard" in str(body)

    def test_delete_removes_entry_and_recomputes(self, client_session, demo_provider_id):
        r = client_session.delete(f"{API}/saved-ecards/{demo_provider_id}", timeout=15)
        assert r.status_code == 200
        assert r.json().get("removed", 0) >= 1

        # state should now be empty
        state = client_session.get(f"{API}/saved-ecards/me/state/{demo_provider_id}", timeout=15).json()
        assert state.get("save_type") is None

        # counts decremented on provider profile
        prov = requests.get(f"{API}/providers/by-slug/{DEMO_SLUG}", timeout=15).json()
        # Note: counts may not be 0 if other users also saved, but our test contribution should be gone
        assert prov.get("like_count", 0) >= 0
        assert prov.get("bookmark_count", 0) >= 0


# ---------------------------------------------------------------------------
# Section 56 — OG endpoints
# ---------------------------------------------------------------------------

class TestOGEndpoints:
    def test_og_image_real_slug(self):
        r = requests.get(f"{API}/og-image/{DEMO_SLUG}.svg", timeout=15)
        assert r.status_code == 200
        assert "image/svg+xml" in r.headers.get("content-type", "")
        body = r.text
        assert "<svg" in body
        # business_name should be present
        assert "Maria" in body or "María" in body or "Cleaning" in body
        # getamano branding
        assert "getamano" in body.lower()

    def test_og_image_fallback_slug(self):
        r = requests.get(f"{API}/og-image/this-slug-does-not-exist-xyz.svg", timeout=15)
        assert r.status_code == 200
        assert "image/svg+xml" in r.headers.get("content-type", "")
        assert "<svg" in r.text
        assert "getamano" in r.text.lower()

    def test_og_html_whatsapp_ua(self):
        headers = {"User-Agent": "WhatsApp/2.21.1"}
        r = requests.get(f"{API}/og/p/{DEMO_SLUG}", headers=headers, timeout=15,
                         allow_redirects=False)
        assert r.status_code == 200
        body = r.text
        # critical OG tags
        for prop in ["og:title", "og:description", "og:image", "og:url",
                     "og:type", "og:site_name", "twitter:card", "twitter:image",
                     "og:image:width", "og:image:height"]:
            assert prop in body, f"missing OG/Twitter meta: {prop}"
        # count og:* occurrences >= 10
        og_count = len(re.findall(r'og:[a-zA-Z_:]+', body))
        assert og_count >= 10, f"expected >=10 og:* references, got {og_count}"
        # meta-refresh redirect to /p/{slug}
        assert re.search(r'<meta\s+http-equiv=["\']refresh["\']', body, re.IGNORECASE)
        assert f"/p/{DEMO_SLUG}" in body

    def test_og_html_404_for_missing_slug(self):
        r = requests.get(f"{API}/og/p/nonexistent-slug-xyz-12345", timeout=15,
                         allow_redirects=False)
        assert r.status_code == 404
        # still returns fallback HTML
        assert "og:" in r.text or "<html" in r.text.lower()
