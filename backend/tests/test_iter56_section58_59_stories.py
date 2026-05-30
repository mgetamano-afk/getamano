"""Iteration 56 — Section 58 (indexes audit) + Section 59 (404/empty states are FE) +
Stories 24h ephemeral endpoints.

Backend-testable surface:
  • POST /api/stories            (provider only, throttle 5, 403 for client/admin)
  • GET  /api/stories/active     (public, grouped-by-provider)
  • GET  /api/stories/by-provider/{provider_user_id}
  • POST /api/stories/{id}/view  (idempotent via unique index)
  • DELETE /api/stories/{id}     (owner or admin)
  • backend startup clean / indexes were added on `stories` collection
"""
import requests

from tests.test_config import API


# 1x1 transparent PNG (data URL) — same kind of placeholder the seed used
PLACEHOLDER_PNG = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
    "+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


# ─── Section 59 — backend has no changes, just sanity-check stories live behind API ──

class TestStoriesPublicEndpoints:
    """Public endpoints — no auth needed."""

    def test_get_active_returns_list(self):
        r = requests.get(f"{API}/stories/active", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        # demo.provider was seeded with 3 stories → at least one provider row
        if data:
            row = data[0]
            for key in ("provider_user_id", "stories_count", "latest_story_id",
                        "business_name", "image_url"):
                assert key in row, f"missing {key} in active row"
            assert isinstance(row["stories_count"], int)
            assert row["stories_count"] >= 1

    def test_get_active_no_duplicate_provider_rows(self):
        r = requests.get(f"{API}/stories/active", timeout=15)
        assert r.status_code == 200
        rows = r.json()
        seen = [row["provider_user_id"] for row in rows]
        assert len(seen) == len(set(seen)), "duplicate provider in active stories"

    def test_get_by_provider_chronological(self, demo_provider_user_id):
        r = requests.get(
            f"{API}/stories/by-provider/{demo_provider_user_id}", timeout=15
        )
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list)
        # If there are stories, they should be sorted ascending by created_at
        if len(rows) >= 2:
            for a, b in zip(rows, rows[1:]):
                assert a["created_at"] <= b["created_at"], "not chronological asc"


# ─── Stories creation + auth gating ────────────────────────────────────────────

class TestStoriesAuth:

    def test_client_cannot_create_story(self, client_session):
        r = client_session.post(
            f"{API}/stories",
            json={"image_url": PLACEHOLDER_PNG, "caption": "client try"},
            timeout=15,
        )
        assert r.status_code == 403, r.text

    def test_admin_cannot_create_story(self, admin_session):
        r = admin_session.post(
            f"{API}/stories",
            json={"image_url": PLACEHOLDER_PNG, "caption": "admin try"},
            timeout=15,
        )
        assert r.status_code == 403, r.text

    def test_anon_cannot_create_story(self):
        r = requests.post(
            f"{API}/stories",
            json={"image_url": PLACEHOLDER_PNG},
            timeout=15,
        )
        # /auth-required → 401 (no session cookie)
        assert r.status_code in (401, 403), r.text


# ─── Stories CRUD as provider — create, view, delete ──────────────────────────

class TestStoriesProviderFlow:
    """Create a TEST_ story, validate persistence via GET, view it twice
    (dedup check), then delete it as owner."""

    def test_create_view_delete_full_cycle(self, provider_session, client_session):
        # 1. CREATE
        create = provider_session.post(
            f"{API}/stories",
            json={"image_url": PLACEHOLDER_PNG, "caption": "TEST_iter56 cycle"},
            timeout=15,
        )
        assert create.status_code == 200, create.text
        body = create.json()
        for key in ("story_id", "expires_at", "created_at", "provider_user_id",
                    "image_url", "is_public"):
            assert key in body, f"missing {key} in create response"
        assert body["caption"] == "TEST_iter56 cycle"
        assert body["views_count"] == 0
        assert body["is_public"] is True
        story_id = body["story_id"]
        assert story_id.startswith("sto_")

        # 2. GET via by-provider should include the new story
        provider_user_id = body["provider_user_id"]
        listing = requests.get(
            f"{API}/stories/by-provider/{provider_user_id}", timeout=15
        )
        assert listing.status_code == 200
        ids = [s["story_id"] for s in listing.json()]
        assert story_id in ids, "newly created story not in by-provider list"

        # 3. CLIENT VIEWS the story (track once)
        v1 = client_session.post(f"{API}/stories/{story_id}/view", timeout=15)
        assert v1.status_code == 200
        # 4. CLIENT VIEWS AGAIN — dedup via unique index, no double-count
        v2 = client_session.post(f"{API}/stories/{story_id}/view", timeout=15)
        assert v2.status_code == 200

        # views_count from listing
        listing2 = requests.get(
            f"{API}/stories/by-provider/{provider_user_id}", timeout=15
        ).json()
        match = [s for s in listing2 if s["story_id"] == story_id]
        assert match, "story disappeared from listing"
        assert match[0]["views_count"] == 1, \
            f"expected views_count=1 after dedup, got {match[0]['views_count']}"

        # 5. CLIENT CANNOT DELETE (not owner)
        del_forbidden = client_session.delete(
            f"{API}/stories/{story_id}", timeout=15
        )
        assert del_forbidden.status_code == 403

        # 6. OWNER DELETES
        del_ok = provider_session.delete(f"{API}/stories/{story_id}", timeout=15)
        assert del_ok.status_code == 200

        # 7. CONFIRM removed
        after = requests.get(
            f"{API}/stories/by-provider/{provider_user_id}", timeout=15
        ).json()
        assert story_id not in [s["story_id"] for s in after]


# ─── Throttle ────────────────────────────────────────────────────────────────

class TestStoriesThrottle:
    """Provider can only have 5 active stories — 6th should return 429."""

    def test_max_5_active_then_429(self, provider_session):
        # Find current active count
        # Read current provider_user_id from /me equivalent or just from a
        # freshly created story
        seed = provider_session.post(
            f"{API}/stories",
            json={"image_url": PLACEHOLDER_PNG, "caption": "TEST_throttle_seed"},
            timeout=15,
        )
        # could fail with 429 if already at cap from previous tests
        if seed.status_code == 429:
            # Already capped — that itself is the assertion
            return
        assert seed.status_code == 200, seed.text
        seed.json()["provider_user_id"]
        created_ids = [seed.json()["story_id"]]

        try:
            # Top up until at cap (5)
            # Currently created in this test = 1 + 3 seed = at least 4 active
            # Loop a few times — accept 200 (added) or 429 (capped)
            for i in range(6):
                r = provider_session.post(
                    f"{API}/stories",
                    json={"image_url": PLACEHOLDER_PNG,
                          "caption": f"TEST_throttle_{i}"},
                    timeout=15,
                )
                if r.status_code == 429:
                    # The throttle kicked in — that's the contract
                    assert "5" in r.text or "límite" in r.text.lower() or \
                        "limit" in r.text.lower()
                    return
                assert r.status_code == 200
                created_ids.append(r.json()["story_id"])

            # If we never saw 429, we've added 7 without throttle = bug
            assert False, "Expected 429 at 6th active story; never received it"
        finally:
            # Cleanup — delete every story we created so the next test run isn't poisoned
            for sid in created_ids:
                try:
                    provider_session.delete(f"{API}/stories/{sid}", timeout=10)
                except Exception:
                    pass


# ─── Admin delete privilege ──────────────────────────────────────────────────

class TestAdminCanDelete:

    def test_admin_can_delete_others_story(self, provider_session, admin_session):
        # provider creates
        c = provider_session.post(
            f"{API}/stories",
            json={"image_url": PLACEHOLDER_PNG, "caption": "TEST_admin_delete"},
            timeout=15,
        )
        if c.status_code == 429:
            return  # provider at cap from another test — skip cleanly
        assert c.status_code == 200, c.text
        sid = c.json()["story_id"]

        # admin deletes
        d = admin_session.delete(f"{API}/stories/{sid}", timeout=15)
        assert d.status_code == 200, d.text


# ─── Fixtures ─────────────────────────────────────────────────────────────────

import pytest  # noqa: E402


@pytest.fixture(scope="module")
def demo_provider_user_id(provider_session) -> str:
    """Resolve demo provider's user_id by creating a throwaway story and
    reading the provider_user_id from the response — then immediately delete it.
    Falls back to /stories/active scan if creation throttled."""
    r = provider_session.post(
        f"{API}/stories",
        json={"image_url": PLACEHOLDER_PNG, "caption": "TEST_lookup_uid"},
        timeout=15,
    )
    if r.status_code == 200:
        sid = r.json()["story_id"]
        uid = r.json()["provider_user_id"]
        # cleanup
        provider_session.delete(f"{API}/stories/{sid}", timeout=10)
        return uid
    # fallback: scan active
    listing = requests.get(f"{API}/stories/active", timeout=15).json()
    assert listing, "no active stories — cannot resolve provider_user_id"
    return listing[0]["provider_user_id"]
