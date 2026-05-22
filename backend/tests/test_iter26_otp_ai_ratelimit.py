"""
Iteration 26 - Test SECTION 23 (rate limit), SECTION 24 (OTP), SECTION 25 (AI), sitemap.
"""
import os
import re
import time
import subprocess
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://verified-providers-2.preview.emergentagent.com").rstrip("/")
DEMO_PROVIDER_EMAIL = "demo.provider@getamano.com"
DEMO_PROVIDER_PASSWORD = "provider123"


@pytest.fixture(scope="module")
def provider_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": DEMO_PROVIDER_EMAIL, "password": DEMO_PROVIDER_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return s


# ── Section 25: AI improve-description ──────────────────────────────────
class TestAIImproveDescription:
    def test_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/ai/improve-description",
                          json={"text": "Limpieza profesional de casas en Dallas", "locale": "es"}, timeout=15)
        assert r.status_code in (401, 403), f"Expected auth required, got {r.status_code}: {r.text}"

    def test_rejects_short_text(self, provider_session):
        r = provider_session.post(f"{BASE_URL}/api/ai/improve-description", json={"text": "hola", "locale": "es"}, timeout=30)
        assert r.status_code == 400, f"Expected 400 short text, got {r.status_code}: {r.text}"

    def test_improve_spanish(self, provider_session):
        body = {
            "text": "Hago limpieza de casas en Dallas, soy responsable y trabajo bien.",
            "category": "cleaning",
            "locale": "es",
        }
        r = provider_session.post(f"{BASE_URL}/api/ai/improve-description", json=body, timeout=60)
        assert r.status_code == 200, f"AI improve failed: {r.status_code} {r.text}"
        data = r.json()
        assert "improved" in data and "original" in data and "was_improved" in data and "model" in data
        assert data["model"] == "claude-haiku-4-5"
        assert isinstance(data["improved"], str) and len(data["improved"]) > 10
        improved_lower = data["improved"].lower()
        # Spanish output sanity — no banned English words from forbidden phrases
        for english in ["cleaning", "the best", "amazing"]:
            assert english not in improved_lower, f"Found English word '{english}' in Spanish output: {data['improved']}"

    def test_improve_english(self, provider_session):
        body = {
            "text": "I clean homes in Dallas, I work hard and I'm responsible.",
            "category": "cleaning",
            "locale": "en",
        }
        r = provider_session.post(f"{BASE_URL}/api/ai/improve-description", json=body, timeout=60)
        assert r.status_code == 200, f"AI improve failed: {r.status_code} {r.text}"
        data = r.json()
        assert isinstance(data["improved"], str) and len(data["improved"]) > 10
        # English sanity — contains common English words
        assert re.search(r"\b(the|and|for|with|your|you|i)\b", data["improved"], flags=re.I), \
            f"Output doesn't look English: {data['improved']}"


# ── Section 24: OTP send + verify ────────────────────────────────────────
class TestOTPFlow:
    def test_send_otp_already_verified(self):
        r = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"email": DEMO_PROVIDER_EMAIL}, timeout=15)
        assert r.status_code == 200, f"send-otp failed: {r.status_code} {r.text}"
        data = r.json()
        assert data.get("ok") is True
        assert data.get("already_verified") is True, f"Expected already_verified, got {data}"

    def test_send_otp_new_user_register_then_otp(self):
        ts = int(time.time())
        new_email = f"test.user.{ts}@example.com"
        # Register the new user first
        reg = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": new_email,
            "password": "Password123",
            "name": "Test User",
            "role": "client",
        }, timeout=20)
        assert reg.status_code in (200, 201), f"register failed: {reg.status_code} {reg.text}"
        # Request OTP
        r = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"email": new_email, "locale": "es"}, timeout=20)
        assert r.status_code == 200, f"send-otp failed: {r.status_code} {r.text}"
        data = r.json()
        assert data.get("ok") is True
        # RESEND_API_KEY not set → delivery should be 'logged'
        assert data.get("delivery") in ("logged", "sent"), f"unexpected delivery: {data}"
        # store for next test
        pytest.new_user_email = new_email

    def test_verify_otp_wrong_code(self):
        # send-otp first to ensure a code exists
        email = getattr(pytest, "new_user_email", None)
        if not email:
            pytest.skip("No new_user_email from previous test")
        r = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"email": email, "code": "000000"}, timeout=15)
        assert r.status_code == 400, f"Expected 400 wrong code, got {r.status_code}: {r.text}"
        assert "incorrecto" in r.json().get("detail", "").lower() or "código" in r.json().get("detail", "").lower()

    def test_verify_otp_no_active_code(self):
        # An email that's never requested OTP
        ts = int(time.time())
        fake_email = f"never.requested.{ts}@example.com"
        r = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"email": fake_email, "code": "123456"}, timeout=15)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
        assert "no hay código" in r.json().get("detail", "").lower()

    def test_verify_otp_correct_code(self):
        email = getattr(pytest, "new_user_email", None)
        if not email:
            pytest.skip("No new_user_email")
        # Read backend log for OTP code
        try:
            out = subprocess.check_output(
                ["grep", "-a", f"OTP code for {email}", "/var/log/supervisor/backend.err.log"],
                stderr=subprocess.STDOUT,
                timeout=10,
            ).decode("utf-8", errors="ignore")
        except subprocess.CalledProcessError as e:
            pytest.skip(f"OTP code not found in log: {e.output}")
        # Last matching line
        last = out.strip().splitlines()[-1]
        m = re.search(r"=\s*(\d{6})", last)
        if not m:
            pytest.skip(f"Could not parse code from line: {last}")
        code = m.group(1)
        r = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"email": email, "code": code}, timeout=15)
        assert r.status_code == 200, f"verify-otp correct failed: {r.status_code} {r.text}"
        data = r.json()
        assert data.get("ok") is True
        assert "verified_at" in data


# ── Section 23: Rate limiting on login ───────────────────────────────────
class TestRateLimit:
    def test_login_rate_limit(self):
        """8/min limit on /api/auth/login. After 8 401s, expect 429."""
        statuses = []
        # use a fresh email so we don't pollute demo provider's bucket attempts
        bogus_email = f"ratelimit.{int(time.time())}@example.com"
        for i in range(12):
            r = requests.post(f"{BASE_URL}/api/auth/login",
                              json={"email": bogus_email, "password": "wrongpassword"},
                              timeout=10)
            statuses.append(r.status_code)
            time.sleep(0.1)
        # Expect at least one 429 in the last few requests
        assert 429 in statuses, f"No 429 encountered. Statuses: {statuses}"
        # First few should NOT be 429
        assert statuses[0] != 429, f"First request was already 429: {statuses}"
        # Find the 429 detail
        last_429_idx = max(i for i, s in enumerate(statuses) if s == 429)
        r2 = requests.post(f"{BASE_URL}/api/auth/login",
                           json={"email": bogus_email, "password": "wrong"}, timeout=10)
        if r2.status_code == 429:
            detail = r2.json().get("detail", "")
            assert "demasiadas peticiones" in detail.lower(), f"Detail mismatch: {detail}"
        print(f"Login rate-limit statuses: {statuses}, last 429 at index {last_429_idx}")


# ── Sitemap ───────────────────────────────────────────────────────────────
class TestSitemap:
    def test_sitemap_xml(self):
        r = requests.get(f"{BASE_URL}/api/sitemap.xml", timeout=30)
        assert r.status_code == 200, f"sitemap failed: {r.status_code}"
        assert "application/xml" in r.headers.get("content-type", ""), f"Wrong content-type: {r.headers.get('content-type')}"
        body = r.text
        assert "<url><loc>https://getamano.us/categoria/cleaning</loc>" in body, "cleaning category hub missing"
        assert "<url><loc>https://getamano.us/instalar</loc>" in body, "/instalar missing"
        url_count = body.count("<url>")
        print(f"Sitemap URL count: {url_count}")
        assert url_count > 4400, f"Expected >4400 URLs, got {url_count}"
