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
DEMO_SLUG = os.environ.get("TEST_DEMO_SLUG", "maria-cleaning-services-sallisaw-ok")
