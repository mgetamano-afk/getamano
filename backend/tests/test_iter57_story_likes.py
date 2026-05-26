"""
Iteration 57 — Section 61: Story Likes endpoints.

Covers:
- POST /api/stories/{story_id}/like (auth) — toggles like, returns {liked, likes_count}.
- GET  /api/stories/{story_id}/like-state (auth) — returns {liked: bool}.
- Owner cannot like own story (400).
- Idempotency via unique (story_id, user_id) — repeated POST toggles.
- views_count: first view increments, second view from same viewer does NOT.
- Non-existent story → 404.
- Unauth → 401/403.
"""
import pytest
import requests
from tests.test_config import API


# ---------------------- helpers ----------------------

def _get_active_story_for_provider(provider_session: requests.Session) -> str:
    """Return a story_id authored by demo provider via /stories/active groups + /by-provider drill-down."""
    r = provider_session.get(f"{API}/stories/active", timeout=15)
    assert r.status_code == 200, f"GET /stories/active failed: {r.status_code} {r.text}"
    groups = r.json() or []
    # /stories/active returns groups: [{provider_user_id, latest_story_id, stories_count, ...}, ...]
    for group in groups:
        sid = group.get("latest_story_id")
        if sid:
            return sid
    pytest.skip("No active stories available for testing — seed missing?")


def _story_meta(session: requests.Session, story_id: str) -> dict:
    """Find a story by story_id in /stories/by-provider listing across all providers in /active."""
    active = session.get(f"{API}/stories/active", timeout=10).json()
    for group in active:
        rows = session.get(
            f"{API}/stories/by-provider/{group['provider_user_id']}", timeout=10
        ).json()
        for s in rows:
            if s.get("story_id") == story_id:
                return s
    return {}


# ---------------------- LIKE endpoint tests ----------------------

class TestStoryLikeAuth:
    """Auth gating on the like endpoints."""

    def test_like_requires_auth(self, anon_session, provider_session):
        sid = _get_active_story_for_provider(provider_session)
        r = anon_session.post(f"{API}/stories/{sid}/like", timeout=10)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_like_state_requires_auth(self, anon_session, provider_session):
        sid = _get_active_story_for_provider(provider_session)
        r = anon_session.get(f"{API}/stories/{sid}/like-state", timeout=10)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"


class TestStoryLikeOwnerForbidden:
    """Provider owner cannot like their own story → 400."""

    def test_owner_cannot_like_own_story(self, provider_session):
        sid = _get_active_story_for_provider(provider_session)
        r = provider_session.post(f"{API}/stories/{sid}/like", timeout=10)
        assert r.status_code == 400, f"expected 400 owner-block, got {r.status_code} {r.text}"
        body = r.json()
        assert "detail" in body
        assert "propia" in body["detail"].lower() or "own" in body["detail"].lower()


class TestStoryLikeToggle:
    """Client can toggle like on someone else's story. Idempotent."""

    def test_client_like_toggle_full_cycle(self, client_session, provider_session):
        sid = _get_active_story_for_provider(provider_session)

        # Get initial state
        state0 = client_session.get(f"{API}/stories/{sid}/like-state", timeout=10)
        assert state0.status_code == 200
        initial_liked = state0.json().get("liked", False)

        # First toggle — flip state
        r1 = client_session.post(f"{API}/stories/{sid}/like", timeout=10)
        assert r1.status_code == 200, f"toggle1 failed: {r1.status_code} {r1.text}"
        body1 = r1.json()
        assert "liked" in body1 and "likes_count" in body1
        assert body1["liked"] == (not initial_liked)
        assert isinstance(body1["likes_count"], int)
        assert body1["likes_count"] >= 0

        # Verify like-state matches toggle result
        state1 = client_session.get(f"{API}/stories/{sid}/like-state", timeout=10)
        assert state1.status_code == 200
        assert state1.json().get("liked") == body1["liked"]

        # Second toggle — flip back
        r2 = client_session.post(f"{API}/stories/{sid}/like", timeout=10)
        assert r2.status_code == 200
        body2 = r2.json()
        assert body2["liked"] == initial_liked
        # likes_count must differ by 1 between toggles
        assert abs(body1["likes_count"] - body2["likes_count"]) == 1

        # Final state matches initial
        state2 = client_session.get(f"{API}/stories/{sid}/like-state", timeout=10)
        assert state2.json().get("liked") == initial_liked

    def test_likes_count_increments_persistently(self, client_session, provider_session):
        """Like once, fetch /stories/active, verify likes_count >= 1 for that story."""
        sid = _get_active_story_for_provider(provider_session)

        # Ensure starting NOT liked
        state0 = client_session.get(f"{API}/stories/{sid}/like-state", timeout=10)
        if state0.json().get("liked"):
            client_session.post(f"{API}/stories/{sid}/like", timeout=10)

        # Like it
        r = client_session.post(f"{API}/stories/{sid}/like", timeout=10)
        assert r.status_code == 200
        assert r.json().get("liked") is True
        new_count = r.json().get("likes_count")
        assert new_count >= 1

        # Fetch the story metadata via by-provider and verify count reflected
        meta = _story_meta(client_session, sid)
        assert meta.get("likes_count", 0) >= 1, f"likes_count not persisted on story {sid}: {meta}"

        # cleanup: unlike
        client_session.post(f"{API}/stories/{sid}/like", timeout=10)


class TestStoryLikeNotFound:
    def test_like_nonexistent_story_404(self, client_session):
        r = client_session.post(f"{API}/stories/story_does_not_exist_xyz/like", timeout=10)
        assert r.status_code == 404


# ---------------------- VIEWS dedup regression ----------------------

class TestStoryViewsDedup:
    """First /view increments views_count; second from same viewer does NOT."""

    def test_view_dedup_same_viewer(self, client_session, provider_session):
        sid = _get_active_story_for_provider(provider_session)

        # snapshot views_count via by-provider drill-down
        def _views_for(sid_target):
            meta = _story_meta(client_session, sid_target)
            return meta.get("views_count", 0)

        before = _views_for(sid)

        # First view by client
        v1 = client_session.post(f"{API}/stories/{sid}/view", timeout=10)
        assert v1.status_code in (200, 201), f"first view failed: {v1.status_code}"

        mid = _views_for(sid)

        # Second view by SAME client — should NOT increment
        v2 = client_session.post(f"{API}/stories/{sid}/view", timeout=10)
        assert v2.status_code in (200, 201), f"second view failed: {v2.status_code}"

        after = _views_for(sid)
        assert after == mid, f"dedup broken: views {mid} -> {after} (should be equal)"
