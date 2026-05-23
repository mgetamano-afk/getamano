"""Pytest conftest — auto-loaded by pytest.

Provides:
1. sys.path bootstrapping so sibling modules (test_config) are importable.
2. Session-scoped HTTP fixtures (admin_session, provider_session, client_session)
   that log in once per test session and are shared across every test file —
   eliminating the repeated login boilerplate that used to live at the top of
   each individual test module.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import pytest  # noqa: E402
import requests  # noqa: E402

from tests.test_config import (  # noqa: E402
    BASE_URL,
    API,
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    PROVIDER_EMAIL,
    PROVIDER_PASSWORD,
    CLIENT_EMAIL,
    CLIENT_PASSWORD,
    DEMO_SLUG,
)


def _login_session(email: str, password: str):
    """Return an authenticated session, or None if login fails."""
    s = requests.Session()
    try:
        r = s.post(
            f"{API}/auth/login",
            json={"email": email, "password": password},
            timeout=15,
        )
    except requests.RequestException:
        return None
    if r.status_code != 200:
        return None
    return s


@pytest.fixture(scope="session")
def api_url() -> str:
    """The API base URL — shorthand for f'{BASE_URL}/api'."""
    return API


@pytest.fixture(scope="session")
def base_url() -> str:
    """Bare host URL (no /api prefix), useful for /sitemap.xml etc."""
    return BASE_URL


@pytest.fixture(scope="session")
def anon_session() -> requests.Session:
    """Anonymous session — for public endpoints (sitemap, search, providers list)."""
    return requests.Session()


@pytest.fixture(scope="session")
def admin_session():
    s = _login_session(ADMIN_EMAIL, ADMIN_PASSWORD)
    if not s:
        pytest.skip(f"admin login failed for {ADMIN_EMAIL} — seed missing?")
    return s


@pytest.fixture(scope="session")
def provider_session():
    s = _login_session(PROVIDER_EMAIL, PROVIDER_PASSWORD)
    if not s:
        pytest.skip(f"provider login failed for {PROVIDER_EMAIL} — seed missing?")
    return s


@pytest.fixture(scope="session")
def client_session():
    s = _login_session(CLIENT_EMAIL, CLIENT_PASSWORD)
    if not s:
        pytest.skip(f"client login failed for {CLIENT_EMAIL} — seed missing?")
    return s


@pytest.fixture(scope="session")
def demo_provider_id() -> str:
    """Resolve María Cleaning Services' provider_id once per test session."""
    r = requests.get(f"{API}/providers/by-slug/{DEMO_SLUG}", timeout=15)
    if r.status_code != 200:
        pytest.skip(f"demo provider slug {DEMO_SLUG} not found")
    data = r.json()
    return data.get("provider_id") or data.get("id") or ""
