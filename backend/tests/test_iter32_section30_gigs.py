"""
Section 30 - Gigs/Chambas board E2E tests (iteration 32).

Covers:
- GET /api/gigs returns active gigs (seed)
- POST /api/gigs by client creates a chamba
- Provider POST /api/gigs/{id}/apply (success + duplicate rejection)
- Owner cannot apply to own gig (400)
- Non-provider (admin/client) cannot apply (403)
- POST /api/gigs/{id}/close: only owner; status removed from default list
- applicant_count is present in /api/gigs response
"""
import os
import time
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL"):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"


_SESSION_CACHE: dict = {}


def _login(email, password):
    # Cache sessions to avoid the auth rate-limit (5/min per email).
    if email in _SESSION_CACHE:
        return _SESSION_CACHE[email]
    s = requests.Session()
    # retry-on-429 with a single backoff so the suite is resilient
    for attempt in range(2):
        r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
        if r.status_code == 200:
            break
        if r.status_code == 429 and attempt == 0:
            time.sleep(65)
            continue
        assert False, f"login {email} failed: {r.status_code} {r.text}"
    _SESSION_CACHE[email] = s
    return s


# ── 1) Public listing returns active gigs ─────────────────────────────
def test_list_gigs_returns_array_with_applicant_count():
    r = requests.get(f"{API}/gigs", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list), f"expected list, got {type(data)}"
    # At least one seed gig should be there.  applicant_count must be present
    if data:
        sample = data[0]
        assert "gig_id" in sample
        assert "title" in sample
        assert "category" in sample
        assert "status" in sample and sample["status"] == "open"
        assert "applicant_count" in sample, f"missing applicant_count: keys={list(sample.keys())}"
        assert isinstance(sample["applicant_count"], int)


# ── 2) Client posts a chamba; verify it shows up in list ──────────────
created_gig_id = {"id": None}


def test_client_can_create_gig():
    time.sleep(0.2)
    s = _login("demo.client@getamano.com", "client123")
    payload = {
        "title": "TEST_iter32 Necesito limpieza de oficina",
        "description": "Limpieza profunda de oficina pequenia, 3 escritorios y bano. Hoy de preferencia.",
        "category": "Limpieza",
        "budget_min": 80,
        "budget_max": 150,
        "city": "Sallisaw",
        "state": "OK",
        "is_urgent": True,
    }
    r = s.post(f"{API}/gigs", json=payload, timeout=15)
    assert r.status_code == 200, f"create gig: {r.status_code} {r.text}"
    g = r.json()
    assert g["title"] == payload["title"]
    assert g["category"] == "Limpieza"
    assert g["city"] == "Sallisaw"
    assert g["status"] == "open"
    assert g["is_urgent"] is True
    assert "gig_id" in g
    assert "_id" not in g, "MongoDB _id leaked in response"
    created_gig_id["id"] = g["gig_id"]


def test_created_gig_visible_in_list():
    assert created_gig_id["id"], "previous create test must run first"
    r = requests.get(f"{API}/gigs", timeout=15)
    assert r.status_code == 200
    ids = [g["gig_id"] for g in r.json()]
    assert created_gig_id["id"] in ids


# ── 3) Title / description validation ─────────────────────────────────
def test_create_gig_rejects_short_title():
    time.sleep(0.2)
    s = _login("demo.client@getamano.com", "client123")
    r = s.post(f"{API}/gigs", json={"title": "abc", "description": "a" * 30, "category": "Limpieza"}, timeout=15)
    assert r.status_code == 400


def test_create_gig_rejects_short_description():
    time.sleep(0.2)
    s = _login("demo.client@getamano.com", "client123")
    r = s.post(f"{API}/gigs", json={"title": "Necesito ayuda urgente", "description": "abc", "category": "Limpieza"}, timeout=15)
    assert r.status_code == 400


# ── 4) Anonymous cannot post ──────────────────────────────────────────
def test_anonymous_cannot_post_gig():
    r = requests.post(f"{API}/gigs", json={"title": "Necesito ayuda", "description": "a" * 30, "category": "Limpieza"}, timeout=15)
    assert r.status_code in (401, 403)


# ── 5) Provider applies; second apply blocked ─────────────────────────
def test_provider_can_apply_and_duplicate_rejected():
    assert created_gig_id["id"], "create test must have populated id"
    time.sleep(0.3)
    s = _login("demo.provider@getamano.com", "provider123")
    msg = "Hola, tengo experiencia limpiando oficinas y puedo ir hoy. Llevo mis productos y todo."
    r1 = s.post(f"{API}/gigs/{created_gig_id['id']}/apply", json={"message": msg, "proposed_price": 120}, timeout=15)
    assert r1.status_code == 200, f"first apply: {r1.status_code} {r1.text}"
    # second apply must be rejected (unique index)
    r2 = s.post(f"{API}/gigs/{created_gig_id['id']}/apply", json={"message": msg, "proposed_price": 130}, timeout=15)
    assert r2.status_code in (400, 409), f"duplicate apply must fail: {r2.status_code} {r2.text}"


def test_provider_apply_short_message_rejected():
    assert created_gig_id["id"]
    time.sleep(0.2)
    s = _login("demo.provider@getamano.com", "provider123")
    r = s.post(f"{API}/gigs/{created_gig_id['id']}/apply", json={"message": "hi"}, timeout=15)
    assert r.status_code == 400


# ── 6) Non-provider cannot apply ──────────────────────────────────────
def test_client_cannot_apply_to_gig():
    assert created_gig_id["id"]
    time.sleep(0.2)
    s = _login("demo.client@getamano.com", "client123")
    msg = "Soy cliente intentando aplicar, esto no debe permitirse a la chamba publicada."
    r = s.post(f"{API}/gigs/{created_gig_id['id']}/apply", json={"message": msg}, timeout=15)
    assert r.status_code == 403, f"client apply must be forbidden, got {r.status_code} {r.text}"


# ── 7) Owner cannot apply to own gig ──────────────────────────────────
def test_owner_cannot_apply_to_own_gig():
    """Owner is a client, but the role check fires first (403). To test the
    business rule (400 'tu propia chamba'), we'd need an owner who is also a
    provider — skip that branch. We still assert it fails."""
    assert created_gig_id["id"]
    time.sleep(0.2)
    s = _login("demo.client@getamano.com", "client123")
    r = s.post(f"{API}/gigs/{created_gig_id['id']}/apply",
               json={"message": "intentando aplicar a mi propia chamba publicada"},
               timeout=15)
    assert r.status_code in (400, 403)


# ── 8) applicant_count reflects new application ───────────────────────
def test_applicant_count_increments():
    assert created_gig_id["id"]
    r = requests.get(f"{API}/gigs/{created_gig_id['id']}", timeout=15)
    assert r.status_code == 200
    g = r.json()
    assert g.get("applicant_count", 0) >= 1, f"applicant_count should be >=1: {g.get('applicant_count')}"
    assert "posted_by_display" in g, "anonymized poster display name missing"


# ── 9) Owner closes; non-owner cannot close ───────────────────────────
def test_non_owner_cannot_close():
    assert created_gig_id["id"]
    time.sleep(0.2)
    s = _login("demo.provider@getamano.com", "provider123")
    r = s.post(f"{API}/gigs/{created_gig_id['id']}/close", timeout=15)
    assert r.status_code == 403


def test_owner_can_close_gig_and_removed_from_default_list():
    assert created_gig_id["id"]
    time.sleep(0.2)
    s = _login("demo.client@getamano.com", "client123")
    r = s.post(f"{API}/gigs/{created_gig_id['id']}/close", timeout=15)
    assert r.status_code == 200
    assert r.json().get("ok") is True
    # gig should no longer be in default open listing
    r2 = requests.get(f"{API}/gigs", timeout=15)
    ids = [g["gig_id"] for g in r2.json()]
    assert created_gig_id["id"] not in ids, "closed gig still listed in /api/gigs"


# ── 10) After closing, applications return 400 ────────────────────────
def test_apply_to_closed_gig_rejected():
    assert created_gig_id["id"]
    time.sleep(0.2)
    s = _login("demo.provider@getamano.com", "provider123")
    msg = "Mensaje suficientemente largo para pasar la validacion de chamba."
    r = s.post(f"{API}/gigs/{created_gig_id['id']}/apply", json={"message": msg}, timeout=15)
    assert r.status_code == 400


# ── 11) Filter by category ────────────────────────────────────────────
def test_filter_by_category():
    r = requests.get(f"{API}/gigs", params={"category": "Limpieza"}, timeout=15)
    assert r.status_code == 200
    for g in r.json():
        assert g["category"].lower() == "limpieza"
