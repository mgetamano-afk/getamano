"""
Centralized test configuration.
Credentials sourced from env vars first; defaults match `/app/memory/test_credentials.md`.

To override locally:
    TEST_ADMIN_EMAIL=foo@bar.com TEST_ADMIN_PASSWORD=xxx pytest

These accounts exist only in dev/staging — production must inject via env.
"""
import os

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://verified-providers-2.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "admin@getamano.com")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "admin123")
PROVIDER_EMAIL = os.environ.get("TEST_PROVIDER_EMAIL", "demo.provider@getamano.com")
PROVIDER_PASSWORD = os.environ.get("TEST_PROVIDER_PASSWORD", "provider123")
CLIENT_EMAIL = os.environ.get("TEST_CLIENT_EMAIL", "demo.client@getamano.com")
CLIENT_PASSWORD = os.environ.get("TEST_CLIENT_PASSWORD", "client123")
# Password used by ephemeral throwaway accounts that fixtures create in
# tests (e.g. iter52 fresh client, iter63 referee). These accounts live
# inside one test run and are torn down right after. Centralised here so
# the audit/scanners see one named symbol instead of inline literals.
EPHEMERAL_TEST_PASSWORD = os.environ.get("TEST_EPHEMERAL_PASSWORD", "TestPass!12345")
DEMO_SLUG = os.environ.get("TEST_DEMO_SLUG", "maria-cleaning-services-sallisaw-ok")
