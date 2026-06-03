"""V17 — Reels cleanup + Comments + Reshare + Mentions.

Test scope:
  V17.1 — BottomNav hides on /reels · min 3s duration enforced ·
          MediaPermissionGate component exists with kind="camera"|"gallery"
  V17.2 — Comments on reels + stories (auth gate, hydration, optimistic)
  V17.3 — Internal reshare (idempotent + self-reshare 400)
  V17.4 — @mentions in comments (autocomplete + notification + render)
"""
from __future__ import annotations

import re
import time
import requests
import pytest

from test_config import API, PROVIDER_EMAIL, PROVIDER_PASSWORD, CLIENT_EMAIL, CLIENT_PASSWORD

_TIMEOUT = 30


def _login(email: str, password: str) -> requests.Session:
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=_TIMEOUT)
    assert r.status_code == 200, r.text[:300]
    return s


# -------------------------------------------------------------------
# V17.4 — Mention search (public, no auth required)
# -------------------------------------------------------------------
def test_mentions_search_finds_demo_provider():
    """Typing `@maria` must surface the demo provider in the dropdown."""
    r = requests.get(f"{API}/mentions/search?q=maria", timeout=_TIMEOUT)
    assert r.status_code == 200
    items = r.json().get("items") or []
    handles = [it["handle"] for it in items]
    assert any("maria" in h for h in handles), f"expected a maria* handle, got {handles}"
    # The match must include the verified flag + is_provider
    first = items[0]
    assert "handle" in first and "name" in first and "user_id" in first
    assert first.get("is_provider") is True


def test_mentions_search_empty_query_returns_no_items():
    r = requests.get(f"{API}/mentions/search?q=", timeout=_TIMEOUT)
    assert r.status_code == 200
    assert r.json().get("items") == []


# -------------------------------------------------------------------
# V17.2 — Comments (E2E with a real seeded reel)
# -------------------------------------------------------------------
def _get_a_reel_id(provider_session: requests.Session) -> str:
    """Helper — fetch (or create) a reel we can comment on.

    The demo seed doesn't include reels (V15 reels are user-uploaded), so
    we seed one directly via mongo if the feed is empty. This keeps the
    integration tests self-contained without depending on prior runs.
    """
    feed = requests.get(f"{API}/reels/feed?limit=1", timeout=_TIMEOUT).json()
    items = feed.get("items") or []
    if items:
        return items[0]["reel_id"]

    # Seed via direct DB insert (test_credentials.md guarantees mongo
    # access). We use a stable-suffixed reel_id so cleanup is idempotent.
    import os
    from pymongo import MongoClient
    from datetime import datetime, timezone
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")
    cli = MongoClient(mongo_url)
    db = cli[db_name]
    reel_id = f"reel_test_v17_seed"
    db.reels.update_one(
        {"reel_id": reel_id},
        {"$set": {
            "reel_id": reel_id,
            "user_id": "user_3e47ee2b3526",  # demo provider
            "video_url": "https://example.com/v17-seed.mp4",
            "thumbnail_url": "https://example.com/v17-seed.jpg",
            "caption": "V17 seed reel",
            "likes_count": 0,
            "wows_count": 0,
            "shares_count": 0,
            "saves_count": 0,
            "comments_count": 0,
            "reshares_count": 0,
            "is_deleted": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    cli.close()
    return reel_id


def test_comment_auth_required():
    r = requests.post(f"{API}/reels/ANY-ID/comments", json={"text": "x"}, timeout=_TIMEOUT)
    assert r.status_code in (401, 403)


def test_comment_lifecycle_post_then_delete():
    provider = _login(PROVIDER_EMAIL, PROVIDER_PASSWORD)
    client = _login(CLIENT_EMAIL, CLIENT_PASSWORD)
    reel_id = _get_a_reel_id(provider)

    # CLIENT posts a comment with a mention
    suffix = str(int(time.time() * 1000))[-6:]
    text = f"Buen trabajo, gracias! {suffix} cc @maria-cleaning-services-sallisaw-ok"
    r = client.post(f"{API}/reels/{reel_id}/comments", json={"text": text}, timeout=_TIMEOUT)
    assert r.status_code == 200, r.text[:300]
    body = r.json()
    assert body["text"] == text
    assert body["author"]["user_id"]  # hydrated
    # V17.4 — the mention was resolved
    assert len(body.get("mentioned_user_ids") or []) >= 1
    comment_id = body["comment_id"]

    # GET list — must include our new comment
    listing = requests.get(f"{API}/reels/{reel_id}/comments", timeout=_TIMEOUT).json()
    found = next((c for c in listing.get("items") or [] if c["comment_id"] == comment_id), None)
    assert found is not None
    assert found["author"]["name"]

    # Author can DELETE their own comment
    d = client.delete(f"{API}/comments/{comment_id}", timeout=_TIMEOUT)
    assert d.status_code == 200, d.text[:200]

    # And it's gone from the listing
    listing2 = requests.get(f"{API}/reels/{reel_id}/comments", timeout=_TIMEOUT).json()
    assert all(c["comment_id"] != comment_id for c in listing2.get("items") or [])


def test_comment_non_owner_cannot_delete_others_comments():
    provider = _login(PROVIDER_EMAIL, PROVIDER_PASSWORD)
    client = _login(CLIENT_EMAIL, CLIENT_PASSWORD)
    reel_id = _get_a_reel_id(provider)

    r = client.post(f"{API}/reels/{reel_id}/comments", json={"text": "test delete acl"}, timeout=_TIMEOUT)
    assert r.status_code == 200
    cid = r.json()["comment_id"]

    # Provider (not the author) tries to delete — must 403 (admin override
    # uses role=admin, demo provider has role=provider).
    d = provider.delete(f"{API}/comments/{cid}", timeout=_TIMEOUT)
    assert d.status_code == 403

    # Cleanup
    client.delete(f"{API}/comments/{cid}", timeout=_TIMEOUT)


# -------------------------------------------------------------------
# V17.3 — Internal reshare
# -------------------------------------------------------------------
def test_self_reshare_rejected():
    """Provider cannot reshare their own reel."""
    provider = _login(PROVIDER_EMAIL, PROVIDER_PASSWORD)
    reel_id = _get_a_reel_id(provider)
    r = provider.post(f"{API}/reels/{reel_id}/reshare", json={}, timeout=_TIMEOUT)
    assert r.status_code == 400


def test_reshare_idempotent_and_toggleable():
    provider = _login(PROVIDER_EMAIL, PROVIDER_PASSWORD)
    client = _login(CLIENT_EMAIL, CLIENT_PASSWORD)
    reel_id = _get_a_reel_id(provider)

    # Cleanup any prior state
    client.delete(f"{API}/reels/{reel_id}/reshare", timeout=_TIMEOUT)

    # First reshare → deduped=False
    r1 = client.post(f"{API}/reels/{reel_id}/reshare", json={}, timeout=_TIMEOUT)
    assert r1.status_code == 200, r1.text[:300]
    assert r1.json().get("deduped") is False

    # Second reshare → deduped=True
    r2 = client.post(f"{API}/reels/{reel_id}/reshare", json={}, timeout=_TIMEOUT)
    assert r2.status_code == 200
    assert r2.json().get("deduped") is True

    # State endpoint reflects it
    s = client.get(f"{API}/reels/{reel_id}/reshare-state", timeout=_TIMEOUT)
    assert s.status_code == 200
    assert s.json().get("reshared") is True

    # DELETE removes it
    d = client.delete(f"{API}/reels/{reel_id}/reshare", timeout=_TIMEOUT)
    assert d.status_code == 200
    assert d.json().get("removed") is True

    s2 = client.get(f"{API}/reels/{reel_id}/reshare-state", timeout=_TIMEOUT)
    assert s2.json().get("reshared") is False


# -------------------------------------------------------------------
# V17.1 — Min duration enforcement (server-side)
# -------------------------------------------------------------------
def test_reel_video_service_exposes_min_duration_constant():
    """Locks the public contract — services/reel_video must expose
    `MIN_REEL_DURATION_S = 3` and the `ReelTooShortError` exception."""
    from services.reel_video import MIN_REEL_DURATION_S, ReelTooShortError, MAX_REEL_DURATION_S
    assert MIN_REEL_DURATION_S == 3
    assert MAX_REEL_DURATION_S == 60
    exc = ReelTooShortError(1.5)
    assert exc.duration == 1.5


# -------------------------------------------------------------------
# V17.1 — UI source locks (frontend changes are too thin to E2E)
# -------------------------------------------------------------------
BOTTOM_NAV_PATH = "/app/frontend/src/components/BottomNav.jsx"
ACTION_MENU_PATH = "/app/frontend/src/components/ReelActionMenu.jsx"
PERM_GATE_PATH = "/app/frontend/src/components/MediaPermissionGate.jsx"
RECORDER_PATH = "/app/frontend/src/components/ReelCameraRecorder.jsx"
CREATOR_PATH = "/app/frontend/src/components/ReelCreator.jsx"
COMMENTS_PATH = "/app/frontend/src/components/CommentsSheet.jsx"
MENTION_PATH = "/app/frontend/src/components/MentionTextarea.jsx"


def _read(p: str) -> str:
    with open(p, "r", encoding="utf-8") as f:
        return f.read()


def test_bottomnav_hidden_on_reels():
    src = _read(BOTTOM_NAV_PATH)
    assert '"/reels"' in src
    assert "HIDDEN_PATHS" in src


def test_reel_fab_no_longer_offsets_for_bottomnav():
    """With the BottomNav hidden, the FAB sits flush near the bottom
    edge (24px safe-area inset). Previously it had to clear the 76px
    nav strip, which created the visual artifact the founder reported."""
    src = _read(ACTION_MENU_PATH)
    assert "calc(24px + env(safe-area-inset-bottom" in src
    assert "calc(76px + env(safe-area-inset-bottom" not in src


def test_permission_gate_exists_and_has_both_kinds():
    src = _read(PERM_GATE_PATH)
    assert 'kind === "camera"' in src
    # Gallery is the else branch in the icon ternary — assert by Icon import
    assert "Images" in src  # lucide gallery icon
    # Both Spanish and English titles
    assert "quiere acceder a tu cámara" in src
    assert "quiere acceder a tus fotos" in src
    assert "wants to access your camera" in src
    # Cache so we don't re-prompt every time
    assert "localStorage" in src
    assert 'data-testid="media-permission-gate"' in src
    assert 'data-testid="media-permission-allow"' in src
    assert 'data-testid="media-permission-deny"' in src


def test_camera_recorder_gates_getUserMedia_behind_permission():
    """Critical privacy regression guard — getUserMedia must NEVER be
    called before the user accepted our app-level prompt."""
    src = _read(RECORDER_PATH)
    assert "MediaPermissionGate" in src
    assert "permissionGranted" in src
    # getUserMedia call sits inside a useEffect that early-returns when
    # permissionGranted is false.
    assert "if (!permissionGranted) return undefined" in src


def test_gallery_picker_gates_file_input_behind_permission():
    src = _read(CREATOR_PATH)
    assert "MediaPermissionGate" in src
    assert "permGateOpen" in src
    # The "choose video" button toggles the gate, the gate then triggers
    # the hidden file input. Direct .click() on the input from the tile
    # is no longer wired.
    assert 'onClick={() => setPermGateOpen(true)}' in src


def test_reel_creator_helper_text_says_3_to_60_seconds():
    src = _read(CREATOR_PATH)
    assert "3-60s" in src


def test_comments_sheet_has_required_testids():
    src = _read(COMMENTS_PATH)
    # MentionTextarea inside renders `${testid}-input` at runtime; the
    # CommentsSheet source just passes `testid="comments-input"`.
    for tid in ["comments-sheet", "comments-close", "comments-list", "comments-send"]:
        assert f'"{tid}"' in src, f"missing testid: {tid}"
    assert 'testid="comments-input"' in src


def test_mention_textarea_uses_search_endpoint_and_handles_keys():
    src = _read(MENTION_PATH)
    assert "/mentions/search" in src
    # Keyboard nav
    assert '"ArrowDown"' in src
    assert '"ArrowUp"' in src
    assert '"Enter"' in src
    assert "getActiveMentionToken" in src


def test_action_menu_exposes_new_comment_and_reshare_actions():
    src = _read(ACTION_MENU_PATH)
    assert 'id: "comment"' in src
    assert 'id: "reshare"' in src
    assert "MessageCircle" in src
    assert "Repeat2" in src
    # CommentsSheet is mounted from the menu
    assert "CommentsSheet" in src
    # Reshare state probed on active-reel change
    assert "/reshare-state" in src


# -------------------------------------------------------------------
# V17.4 — handle extraction unit tests (pure functions)
# -------------------------------------------------------------------
def test_extract_handles_dedupes_and_caps():
    from routes.social_engagement import extract_handles, MAX_MENTIONS_PER_TEXT
    handles = extract_handles("@maria @MARIA @carlos @ana @luis @pedro @sofia @julia")
    # Lowercase + dedupe + cap
    assert "maria" in handles
    assert "MARIA".lower() in handles
    assert len(handles) <= MAX_MENTIONS_PER_TEXT
    # No duplicates
    assert len(handles) == len(set(handles))


def test_extract_handles_ignores_email_addresses():
    """@ embedded in an email shouldn't trigger a mention."""
    from routes.social_engagement import extract_handles
    assert extract_handles("write me at foo@example.com please") == []


def test_extract_handles_returns_empty_for_no_at_signs():
    from routes.social_engagement import extract_handles
    assert extract_handles("just text") == []
    assert extract_handles("") == []
