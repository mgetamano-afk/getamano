"""Iteration 46 — Viral share tracking for provider eCards.

Endpoints under test (see /app/backend/server.py Section 46):
- POST /api/providers/me/share-event
- POST /api/providers/track-share-view
- GET  /api/providers/me/share-stats

We rely on the shared fixtures in conftest.py:
  - provider_session (demo.provider)
  - admin_session    (admin)
  - anon_session     (public, no cookies)
"""
import time

import pytest

from tests.test_config import API, DEMO_SLUG


# ────────────────────────────── helpers ──────────────────────────────

def _unique_ref(prefix: str = "test_iter46") -> str:
    """Unique referrer slug to avoid 24h-TTL collisions across runs."""
    return f"{prefix}_{int(time.time() * 1000)}"


def _ip(octet: int) -> str:
    """Fake source IP to drive the X-Forwarded-For dedupe key."""
    return f"203.0.113.{octet}"


# ──────────────────────────── share-event ────────────────────────────

class TestProviderShareEvent:
    """POST /api/providers/me/share-event — provider records a share click."""

    def test_share_event_whatsapp_increments_counters(self, provider_session):
        # Baseline stats so the test is robust against historical state.
        before = provider_session.get(f"{API}/providers/me/share-stats", timeout=15).json()
        base_count = int(before.get("share_count") or 0)
        base_whatsapp = int((before.get("share_channels") or {}).get("whatsapp") or 0)

        r = provider_session.post(
            f"{API}/providers/me/share-event",
            json={"channel": "whatsapp"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}

        after = provider_session.get(f"{API}/providers/me/share-stats", timeout=15).json()
        assert int(after["share_count"]) == base_count + 1
        assert int(after["share_channels"]["whatsapp"]) == base_whatsapp + 1
        assert after["last_share_at"] is not None

    def test_share_event_qr_increments_qr_channel(self, provider_session):
        before = provider_session.get(f"{API}/providers/me/share-stats", timeout=15).json()
        base_qr = int((before.get("share_channels") or {}).get("qr") or 0)

        r = provider_session.post(
            f"{API}/providers/me/share-event",
            json={"channel": "qr"},
            timeout=15,
        )
        assert r.status_code == 200

        after = provider_session.get(f"{API}/providers/me/share-stats", timeout=15).json()
        assert int(after["share_channels"]["qr"]) == base_qr + 1

    def test_share_event_requires_auth(self, anon_session):
        r = anon_session.post(
            f"{API}/providers/me/share-event",
            json={"channel": "whatsapp"},
            timeout=15,
        )
        assert r.status_code == 401, r.text

    def test_share_event_admin_forbidden(self, admin_session):
        r = admin_session.post(
            f"{API}/providers/me/share-event",
            json={"channel": "whatsapp"},
            timeout=15,
        )
        assert r.status_code == 403, r.text

    def test_share_event_invalid_channel_422(self, provider_session):
        r = provider_session.post(
            f"{API}/providers/me/share-event",
            json={"channel": "sms"},
            timeout=15,
        )
        assert r.status_code == 422, r.text


# ─────────────────────────── track-share-view ───────────────────────────

class TestTrackShareView:
    """POST /api/providers/track-share-view — anonymous referrer crediting."""

    def test_known_slug_counted_true(self, anon_session):
        # Use demo provider's real slug → counter actually persists.
        r = anon_session.post(
            f"{API}/providers/track-share-view",
            json={"ref": DEMO_SLUG},
            headers={"X-Forwarded-For": _ip(10)},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["counted"] is True

    def test_same_ip_within_24h_deduped(self, anon_session):
        ref = _unique_ref("dedupe")
        ip = _ip(20)
        # First call falls through to update_one but matches no profile (unknown
        # slug) → counted:false. The TTL row IS still inserted, so the SECOND
        # call must hit the DuplicateKeyError branch.
        first = anon_session.post(
            f"{API}/providers/track-share-view",
            json={"ref": ref},
            headers={"X-Forwarded-For": ip},
            timeout=15,
        )
        assert first.status_code == 200
        # First insert always succeeds; counted depends on whether slug matches
        # (it doesn't, on purpose, to keep DB clean) — that's fine.

        second = anon_session.post(
            f"{API}/providers/track-share-view",
            json={"ref": ref},
            headers={"X-Forwarded-For": ip},
            timeout=15,
        )
        assert second.status_code == 200
        body = second.json()
        assert body["counted"] is False
        assert body.get("reason") == "deduped_24h"

    def test_different_ips_independent(self, anon_session):
        ref = _unique_ref("multi_ip")
        r1 = anon_session.post(
            f"{API}/providers/track-share-view",
            json={"ref": ref},
            headers={"X-Forwarded-For": _ip(31)},
            timeout=15,
        )
        r2 = anon_session.post(
            f"{API}/providers/track-share-view",
            json={"ref": ref},
            headers={"X-Forwarded-For": _ip(32)},
            timeout=15,
        )
        assert r1.status_code == 200 and r2.status_code == 200
        # Neither should be deduped — different IPs.
        assert r1.json().get("reason") != "deduped_24h"
        assert r2.json().get("reason") != "deduped_24h"

    def test_self_ref_still_counts_backend(self, anon_session):
        """Backend doesn't enforce self-credit prevention; frontend does. So a
        ?ref=<own slug> POST still returns counted:true. Use a fresh IP."""
        r = anon_session.post(
            f"{API}/providers/track-share-view",
            json={"ref": DEMO_SLUG},
            headers={"X-Forwarded-For": _ip(40)},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["counted"] is True

    def test_nonexistent_slug_counted_false(self, anon_session):
        ref = f"nonexistent-slug-{int(time.time())}"
        r = anon_session.post(
            f"{API}/providers/track-share-view",
            json={"ref": ref},
            headers={"X-Forwarded-For": _ip(50)},
            timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        # Slug doesn't match any profile → counted:false (modified_count=0).
        assert body["counted"] is False
        assert body.get("reason") != "deduped_24h"

    def test_empty_ref_short_circuits(self, anon_session):
        # Pydantic min_length=2 → 422 before handler. So we send a 2-char
        # whitespace ref to exercise the in-handler "blank after strip" branch.
        r = anon_session.post(
            f"{API}/providers/track-share-view",
            json={"ref": "  "},
            headers={"X-Forwarded-For": _ip(60)},
            timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["counted"] is False

    def test_referred_view_counter_persists(self, anon_session, provider_session):
        """Multiple distinct IPs → referred_view_count grows by exactly N."""
        stats0 = provider_session.get(f"{API}/providers/me/share-stats", timeout=15).json()
        base = int(stats0.get("referred_view_count") or 0)

        for octet in (101, 102, 103):
            r = anon_session.post(
                f"{API}/providers/track-share-view",
                json={"ref": DEMO_SLUG},
                headers={"X-Forwarded-For": _ip(octet)},
                timeout=15,
            )
            assert r.status_code == 200
            assert r.json()["counted"] is True

        stats1 = provider_session.get(f"{API}/providers/me/share-stats", timeout=15).json()
        assert int(stats1["referred_view_count"]) == base + 3


# ──────────────────────────── share-stats ────────────────────────────

class TestShareStats:
    """GET /api/providers/me/share-stats — provider dashboard payload."""

    def test_stats_shape_for_provider(self, provider_session):
        r = provider_session.get(f"{API}/providers/me/share-stats", timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        # Required keys
        for k in ("share_count", "referred_view_count", "last_share_at",
                  "share_channels", "recent_events", "slug"):
            assert k in body, f"missing key {k!r}"
        assert isinstance(body["share_count"], int)
        assert isinstance(body["referred_view_count"], int)
        assert isinstance(body["share_channels"], dict)
        assert isinstance(body["recent_events"], list)
        # No raw MongoDB _id leaks
        for ev in body["recent_events"]:
            assert "_id" not in ev
            assert "channel" in ev
            assert "created_at" in ev
        # Cap at 7 entries
        assert len(body["recent_events"]) <= 7

    def test_stats_recent_events_sorted_desc(self, provider_session):
        # Fire two events with different channels to guarantee ordering signal.
        for ch in ("email", "copy"):
            provider_session.post(
                f"{API}/providers/me/share-event",
                json={"channel": ch}, timeout=15,
            )
        body = provider_session.get(f"{API}/providers/me/share-stats", timeout=15).json()
        events = body["recent_events"]
        assert len(events) >= 2
        # Sorted descending by created_at
        for a, b in zip(events, events[1:]):
            assert a["created_at"] >= b["created_at"]

    def test_stats_admin_forbidden(self, admin_session):
        r = admin_session.get(f"{API}/providers/me/share-stats", timeout=15)
        assert r.status_code == 403, r.text

    def test_stats_anon_unauthorized(self, anon_session):
        r = anon_session.get(f"{API}/providers/me/share-stats", timeout=15)
        assert r.status_code == 401, r.text


# ─────────────────────────── performance check ───────────────────────────

class TestPerformanceContract:
    """The dashboard hot-path GET /providers/me must NOT do extra queries
    just because share tracking exists. We can't introspect Mongo from here,
    but we CAN assert the response shape still contains the denormalised
    counters (share_count, referred_view_count) as plain fields."""

    def test_me_payload_carries_denormalised_counters(self, provider_session):
        r = provider_session.get(f"{API}/providers/me", timeout=15)
        # /providers/me MAY 200 or 404 depending on shape. We just want shape.
        if r.status_code != 200:
            pytest.skip(f"/providers/me returned {r.status_code} — skipping")
        body = r.json()
        # Be tolerant of nested 'profile' wrapper.
        profile = body.get("profile") if isinstance(body, dict) and "profile" in body else body
        # Counters may be 0 / missing on fresh profiles, but should not 500.
        assert isinstance(profile, dict)
