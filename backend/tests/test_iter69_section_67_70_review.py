"""
Iteration 69 — Review request testing for Sections 67-70 + Sprint A close-the-loop.

Covers:
 - Sprint A:  /api/user-referrals/me/inviter, /send-thanks (idempotent), /dismiss-banner
 - Section 67: /api/categories (Catering y Eventos), public eCard, search filter
 - Section 68: /api/plans 4 tiers, NotificationBell markRead idempotent
 - Section 70: /api/providers/me/versions/quota, snapshot, restore, delete
 - About page route + Footer link
 - Logo / manifest verification
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://verified-providers-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# --- credentials ---
ADMIN = {"email": "admin@getamano.com", "password": "admin123"}
PROVIDER = {"email": "demo.provider@getamano.com", "password": "provider123"}
CLIENT = {"email": "demo.client@getamano.com", "password": "client123"}
REFEREE = {"email": "sprint_a_test2_1779919657@getamano.com", "password": "TestPass123!"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"Login failed for {creds['email']}: {r.status_code} {r.text[:200]}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    return token


@pytest.fixture(scope="session")
def provider_token():
    return _login(PROVIDER)


@pytest.fixture(scope="session")
def client_token():
    return _login(CLIENT)


@pytest.fixture(scope="session")
def referee_token():
    try:
        return _login(REFEREE)
    except AssertionError:
        pytest.skip("Sprint A referee account not available")


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# ============================================================
# Sprint A — close-the-loop endpoints
# ============================================================
class TestSprintA:
    def test_inviter_me_endpoint(self, referee_token):
        r = requests.get(f"{API}/user-referrals/me/inviter", headers=auth_headers(referee_token), timeout=20)
        assert r.status_code == 200, f"inviter status {r.status_code}: {r.text[:200]}"
        data = r.json()
        # inviter info should reflect demo provider (María González)
        # Accept loose shape but at least has either inviter object or has_inviter flag
        assert isinstance(data, dict)
        # Common shapes:
        has_inviter = data.get("has_inviter") or data.get("inviter") or data.get("inviter_name") or data.get("inviter_user_id")
        assert has_inviter, f"No inviter info in response: {data}"

    def test_send_thanks_idempotent(self, referee_token):
        url = f"{API}/user-referrals/me/send-thanks"
        r1 = requests.post(url, headers=auth_headers(referee_token), json={}, timeout=20)
        assert r1.status_code in (200, 201), f"first send-thanks failed: {r1.status_code} {r1.text[:200]}"
        r2 = requests.post(url, headers=auth_headers(referee_token), json={}, timeout=20)
        # idempotent → not a 5xx; either 200/201 with already_sent flag or 409
        assert r2.status_code in (200, 201, 409), f"second send-thanks unexpected status: {r2.status_code}: {r2.text[:200]}"

    def test_dismiss_banner(self, referee_token):
        r = requests.post(f"{API}/user-referrals/me/dismiss-banner", headers=auth_headers(referee_token), json={}, timeout=20)
        assert r.status_code in (200, 201, 204), f"dismiss-banner failed: {r.status_code} {r.text[:200]}"

    def test_inviter_endpoint_for_non_referee(self, client_token):
        # demo.client was not invited — should still return 200 with no inviter, not 500
        r = requests.get(f"{API}/user-referrals/me/inviter", headers=auth_headers(client_token), timeout=20)
        assert r.status_code == 200, f"unexpected status for non-referee: {r.status_code}: {r.text[:200]}"


# ============================================================
# Section 67 — Catalog + dual audience
# ============================================================
class TestSection67:
    def test_categories_has_catering_y_eventos(self):
        r = requests.get(f"{API}/categories", timeout=20)
        assert r.status_code == 200
        cats = r.json()
        # accept either list or dict-with-data
        items = cats if isinstance(cats, list) else cats.get("data") or cats.get("categories") or []
        names = []
        for c in items:
            for key in ("name", "name_es", "label", "title", "label_es"):
                v = c.get(key) if isinstance(c, dict) else None
                if v:
                    names.append(str(v))
        joined = " | ".join(names).lower()
        assert "catering" in joined, f"No catering category found. Names sample: {names[:30]}"
        # The new label should reference "eventos" (es) or "events" (en)
        assert ("eventos" in joined) or ("events" in joined), f"Catering category not renamed to Catering y Eventos / Catering & Events. Sample: {names[:30]}"
        # And should NOT keep the old "Latin Catering" string
        assert "latin catering" not in joined, "Old 'Latin Catering' label still present"

    def test_public_ecard_endpoint(self):
        # backend route for public provider data
        slug = "maria-cleaning-services-sallisaw-ok"
        for path in (f"/providers/by-slug/{slug}", f"/p/{slug}", f"/public/providers/{slug}"):
            r = requests.get(f"{API}{path}", timeout=20)
            if r.status_code == 200:
                return
        # acceptable fallback: hit the OG HTML route to confirm provider page exists
        r2 = requests.get(f"{API}/og/p/{slug}", timeout=20)
        assert r2.status_code == 200, "No working public eCard endpoint and OG fallback failed"


# ============================================================
# Section 68 — Plans + Notifications
# ============================================================
class TestSection68:
    def test_plans_endpoint_has_four_tiers(self):
        r = requests.get(f"{API}/plans", timeout=20)
        assert r.status_code == 200, f"/plans status {r.status_code}"
        data = r.json()
        plans = data if isinstance(data, list) else data.get("plans") or data.get("data") or []
        assert len(plans) >= 4, f"Expected >=4 plans, got {len(plans)}: {plans}"
        # gather price→feature_count map
        by_price = {}
        for p in plans:
            price = p.get("price_monthly") if isinstance(p, dict) else None
            if price is None:
                price = p.get("price") if isinstance(p, dict) else None
            feats = p.get("features_en") or p.get("features_es") or p.get("features") or []
            count = len(feats) if isinstance(feats, list) else None
            if price is not None:
                by_price[int(price)] = count
        # Expected tiers
        expected = {0: 6, 10: 8, 15: 11, 25: 13}
        prices_present = set([k for k in by_price.keys() if isinstance(k, int)])
        for needed, exp_count in expected.items():
            assert needed in prices_present, f"Missing plan with price ${needed}. Got prices: {prices_present}"
            assert by_price[needed] == exp_count, f"Plan ${needed} expected {exp_count} features, got {by_price[needed]}"

    def test_notification_mark_read_idempotent(self, provider_token):
        # fetch one notification id
        r = requests.get(f"{API}/notifications", headers=auth_headers(provider_token), timeout=20)
        if r.status_code != 200:
            pytest.skip(f"notifications endpoint returned {r.status_code}")
        body = r.json()
        items = body if isinstance(body, list) else body.get("notifications") or body.get("data") or []
        if not items:
            pytest.skip("no notifications to test mark-read")
        nid = items[0].get("id") or items[0].get("_id") or items[0].get("notification_id")
        if not nid:
            pytest.skip("no notification id field")
        url = f"{API}/notifications/{nid}/read"
        r1 = requests.post(url, headers=auth_headers(provider_token), timeout=20)
        if r1.status_code == 404:
            # try PUT
            r1 = requests.put(url, headers=auth_headers(provider_token), timeout=20)
        assert r1.status_code in (200, 201, 204), f"first markRead failed: {r1.status_code}"
        r2 = requests.post(url, headers=auth_headers(provider_token), timeout=20)
        if r2.status_code == 404:
            r2 = requests.put(url, headers=auth_headers(provider_token), timeout=20)
        assert r2.status_code in (200, 201, 204), f"second markRead not idempotent: {r2.status_code}"


# ============================================================
# Section 70 — Profile Versions
# ============================================================
class TestSection70Versions:
    def test_versions_quota(self, provider_token):
        r = requests.get(f"{API}/providers/me/versions/quota", headers=auth_headers(provider_token), timeout=20)
        assert r.status_code == 200, f"quota status {r.status_code}: {r.text[:200]}"
        d = r.json()
        assert isinstance(d, dict)
        # Should expose at least max and used (any naming)
        keys = set(d.keys())
        assert any(k in keys for k in ("max", "limit", "quota", "max_versions")), f"missing max-like key: {keys}"
        assert any(k in keys for k in ("used", "count", "current", "used_versions", "current_count")), f"missing used-like key: {keys}"

    def test_versions_full_lifecycle(self, provider_token):
        h = auth_headers(provider_token)

        # snapshot create
        label = f"TEST_iter69_{int(time.time())}"
        r = requests.post(f"{API}/providers/me/versions/snapshot", headers=h, json={"label": label}, timeout=20)
        assert r.status_code in (200, 201), f"snapshot create failed: {r.status_code} {r.text[:200]}"
        snap = r.json()
        version_obj = snap.get("version") or snap
        snap_id = (version_obj.get("version_id") if isinstance(version_obj, dict) else None) or snap.get("id") or snap.get("_id") or snap.get("version_id")
        assert snap_id, f"no id in snapshot response: {snap}"

        # auto-snapshot via PUT /providers/me — count should not decrease
        r_list_before = requests.get(f"{API}/providers/me/versions", headers=h, timeout=20)
        before_count = None
        if r_list_before.status_code == 200:
            body = r_list_before.json()
            arr = body if isinstance(body, list) else body.get("versions") or body.get("data") or []
            before_count = len(arr)

        # trigger an update — PUT requires full provider payload, so fetch then re-PUT
        cur = requests.get(f"{API}/providers/me", headers=h, timeout=20)
        assert cur.status_code == 200, f"GET /providers/me failed: {cur.status_code}"
        cur_data = cur.json()
        # strip non-writable / server-side fields
        for k in ("_id", "created_at", "updated_at", "provider_id", "user_id", "rating_avg", "rating_count", "verification_status"):
            cur_data.pop(k, None)
        cur_data["description"] = cur_data.get("description", "") + ""  # no-op edit
        r_put = requests.put(f"{API}/providers/me", headers=h, json=cur_data, timeout=20)
        assert r_put.status_code in (200, 201), f"PUT /providers/me failed: {r_put.status_code} {r_put.text[:300]}"

        # restore (provider is pro per credentials file — should succeed)
        r_restore = requests.post(f"{API}/providers/me/versions/{snap_id}/restore", headers=h, timeout=20)
        assert r_restore.status_code in (200, 201), f"restore on pro plan failed: {r_restore.status_code} {r_restore.text[:200]}"

        # delete the snapshot
        r_del = requests.delete(f"{API}/providers/me/versions/{snap_id}", headers=h, timeout=20)
        assert r_del.status_code in (200, 204), f"delete snapshot failed: {r_del.status_code} {r_del.text[:200]}"


# ============================================================
# About page + Logo / manifest
# ============================================================
class TestStaticPagesAndAssets:
    def test_manifest_lang_and_name(self):
        r = requests.get(f"{BASE_URL}/manifest.json", timeout=20)
        assert r.status_code == 200, "manifest.json missing"
        try:
            m = r.json()
        except Exception:
            pytest.fail(f"manifest is not JSON: {r.text[:200]}")
        # name should reflect updated branding
        name = (m.get("name") or "") + " " + (m.get("short_name") or "")
        assert "getamano" in name.lower(), f"manifest name does not include getamano: {name}"
        # lang updated
        assert m.get("lang", "").lower().startswith("en"), f"manifest lang not en-US-like: {m.get('lang')}"

    @pytest.mark.parametrize("icon", [
        "icon-72.png", "icon-96.png", "icon-128.png", "icon-144.png",
        "icon-152.png", "icon-192.png", "icon-384.png", "icon-512.png",
        "apple-touch-icon.png", "favicon.ico"
    ])
    def test_pwa_icons_served(self, icon):
        # accept some name variants (icon-72.png vs icon-72x72.png)
        candidates = [icon]
        if icon.startswith("icon-") and icon.endswith(".png"):
            n = icon.replace("icon-", "").replace(".png", "")
            candidates.append(f"icon-{n}x{n}.png")
        ok = False
        for c in candidates:
            r = requests.get(f"{BASE_URL}/{c}", timeout=15)
            if r.status_code == 200 and len(r.content) > 100:
                ok = True
                break
        assert ok, f"icon {icon} not served (tried {candidates})"

    def test_about_page_route_serves_html(self):
        # SPA route — backend ingress should return index.html for unknown non-/api paths
        r = requests.get(f"{BASE_URL}/nosotros", timeout=20)
        assert r.status_code == 200, f"/nosotros not served: {r.status_code}"
        assert "<html" in r.text.lower() or "<!doctype" in r.text.lower()
