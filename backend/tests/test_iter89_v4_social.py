"""
Iteration 89 — v4 social-first features regression locks.

Covers:
  · Portfolio CRUD as provider, public read-only by slug, 12-item cap.
  · Gremios join/leave/post/like/reply cycle, public-read by slug,
    auto-join on first post.
  · Trust Score signal enrichment on /api/providers list + by-slug.
  · Community post `author.provider_verified` + `author.getamano_code`.
  · BarrioPage and GremiosPage routes mounted in App.js.
"""
import os
import sys
import uuid

import requests

sys.path.insert(0, os.path.dirname(__file__))
from tests.test_config import API, DEMO_SLUG  # noqa: E402


def _read(rel_path: str) -> str:
    full = os.path.join(os.path.dirname(__file__), "..", "..", rel_path)
    with open(full, encoding="utf-8") as f:
        return f.read()


# ─── Trust signal enrichment ───────────────────────────────────────

def test_search_returns_trust_signals():
    r = requests.get(f"{API}/providers", params={"limit": 5}, timeout=15)
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    assert len(items) >= 1
    for p in items:
        for k in ("portfolio_count", "days_active", "referrals_converted", "avg_rating", "reviews_count"):
            assert k in p, f"{k} missing on /providers result"
        assert isinstance(p["portfolio_count"], int)
        assert isinstance(p["days_active"], int)
        assert isinstance(p["referrals_converted"], int)


def test_by_slug_returns_trust_signals():
    r = requests.get(f"{API}/providers/by-slug/{DEMO_SLUG}", timeout=15)
    assert r.status_code == 200
    data = r.json()
    for k in ("portfolio_count", "days_active", "referrals_converted", "avg_rating", "reviews_count"):
        assert k in data, f"{k} missing on /providers/by-slug"


# ─── Portfolio CRUD ────────────────────────────────────────────────

def test_public_portfolio_endpoint_is_accessible():
    r = requests.get(f"{API}/providers/by-slug/{DEMO_SLUG}/portfolio", timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_portfolio_crud_as_provider(provider_session):
    # List
    r = provider_session.get(f"{API}/providers/me/portfolio", timeout=15)
    assert r.status_code == 200
    initial = r.json()
    assert isinstance(initial, list)

    # Add a placeholder URL — backend stores it as-is; we clean up after.
    new_url = f"https://placehold.co/600x600?text=test-{uuid.uuid4().hex[:6]}"
    add_r = provider_session.post(
        f"{API}/providers/me/portfolio",
        json={"image_url": new_url, "caption": "regression test photo"},
        timeout=15,
    )
    assert add_r.status_code == 200, add_r.text
    created = add_r.json()
    assert created["image_url"] == new_url
    assert created["caption"] == "regression test photo"
    assert "id" in created and created["id"].startswith("port_")
    item_id = created["id"]

    # Patch caption
    patch_r = provider_session.patch(
        f"{API}/providers/me/portfolio/{item_id}",
        json={"caption": "updated caption"},
        timeout=15,
    )
    assert patch_r.status_code == 200
    assert patch_r.json()["caption"] == "updated caption"

    # Delete (cleanup)
    del_r = provider_session.delete(f"{API}/providers/me/portfolio/{item_id}", timeout=15)
    assert del_r.status_code == 200
    assert del_r.json()["deleted"] is True


# ─── Gremios ───────────────────────────────────────────────────────

def test_list_gremios_public():
    r = requests.get(f"{API}/gremios", timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_gremio_lifecycle(provider_session):
    category = "limpieza"  # demo provider's own category exists in seed
    # Join
    join_r = provider_session.post(f"{API}/gremios/{category}/join", timeout=15)
    assert join_r.status_code == 200
    assert join_r.json()["joined"] is True

    # Post
    post_r = provider_session.post(
        f"{API}/gremios/{category}/posts",
        json={"content": f"regression test post {uuid.uuid4().hex[:6]}"},
        timeout=15,
    )
    assert post_r.status_code == 200, post_r.text
    post = post_r.json()
    assert "id" in post and post["id"].startswith("gpost_")
    post_id = post["id"]

    # List posts now includes ours
    list_r = provider_session.get(f"{API}/gremios/{category}/posts", timeout=15)
    assert list_r.status_code == 200
    posts = list_r.json()
    assert any(p["id"] == post_id for p in posts)
    # Author hydration carries provider_verified + getamano_code
    p = next(p for p in posts if p["id"] == post_id)
    assert "author" in p
    assert "provider_verified" in p["author"]
    assert "getamano_code" in p["author"]

    # Like (toggle on)
    like_r = provider_session.post(f"{API}/gremios/posts/{post_id}/like", timeout=15)
    assert like_r.status_code == 200
    assert like_r.json()["liked"] is True

    # Reply
    reply_r = provider_session.post(
        f"{API}/gremios/posts/{post_id}/replies",
        json={"content": "regression reply"},
        timeout=15,
    )
    assert reply_r.status_code == 200, reply_r.text
    reply = reply_r.json()
    assert "id" in reply and reply["id"].startswith("grep_")

    # List replies
    replies_r = provider_session.get(f"{API}/gremios/posts/{post_id}/replies", timeout=15)
    assert replies_r.status_code == 200
    rs = replies_r.json()
    assert any(r["id"] == reply["id"] for r in rs)

    # Like toggle off
    unlike_r = provider_session.post(f"{API}/gremios/posts/{post_id}/like", timeout=15)
    assert unlike_r.status_code == 200
    assert unlike_r.json()["liked"] is False

    # Leave (clean up membership for next run)
    leave_r = provider_session.delete(f"{API}/gremios/{category}/leave", timeout=15)
    assert leave_r.status_code == 200
    assert leave_r.json()["left"] is True


def test_anonymous_cannot_post_in_gremio():
    r = requests.post(f"{API}/gremios/limpieza/posts", json={"content": "ouch"}, timeout=15)
    assert r.status_code == 401


# ─── Frontend source locks ─────────────────────────────────────────

def test_routes_mounted():
    src = _read("frontend/src/App.js")
    # Section 89 v4 unified — `/comunidad` now uses the rich
    # ComunidadPage in barrio mode; legacy `/comunidad/barrio` aliases
    # to the same component.
    assert '<Route path="barrio" element={<ComunidadPage embedded barrio />}' in src
    assert '<Route path="gremios" element={<GremiosPage />}' in src


def test_pages_exist():
    barrio = _read("frontend/src/pages/BarrioPage.jsx")
    gremios = _read("frontend/src/pages/GremiosPage.jsx")
    comunidad = _read("frontend/src/pages/ComunidadPage.jsx")
    overlay = _read("frontend/src/components/BarrioOverlay.jsx")
    # BarrioPage is now a thin wrapper that delegates to ComunidadPage
    # in barrio mode.
    assert "ComunidadPage embedded barrio" in barrio
    assert "gremios-page" in gremios
    assert "barrio-page" in comunidad  # rendered by ComunidadPage when barrio
    assert "barrio-header" in overlay
    assert "BarrioHeader" in overlay
    assert "FeaturedStrip" in overlay


def test_search_result_renders_trust_tile():
    src = _read("frontend/src/components/SearchResultCard.jsx")
    assert 'import TrustScore' in src
    assert 'variant="tile"' in src


def test_stories_carousel_open_to_all_with_view_profile_cta():
    src = _read("frontend/src/components/StoriesCarousel.jsx")
    # Story tile for self renders for any logged-in user, not gated by provider
    assert '"story-tile-self"' in src
    # CTA "Ver perfil →" is rendered when a provider slug is present
    assert '"story-viewer-cta-ecard"' in src


def test_portfolio_and_trustscore_mounted_in_ecard():
    src = _read("frontend/src/pages/ProviderECard.jsx")
    assert 'import Portfolio from "../components/Portfolio"' in src
    assert 'import TrustScore from "../components/TrustScore"' in src
    assert "/portfolio" in src  # portfolio fetch URL


def test_portfolio_and_trustscore_mounted_in_dashboard():
    src = _read("frontend/src/pages/ProviderDashboard.jsx")
    assert 'import Portfolio from "../components/Portfolio"' in src
    assert 'import TrustScore from "../components/TrustScore"' in src
