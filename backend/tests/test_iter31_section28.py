"""Section 28 backend tests: 3 demo accounts login + manifest + splash assets."""
import os
import time
import pytest
import requests
from tests.test_config import (
    BASE_URL,
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    PROVIDER_EMAIL,
    PROVIDER_PASSWORD,
    CLIENT_EMAIL,
    CLIENT_PASSWORD,
)

DEMOS = [
    (ADMIN_EMAIL, ADMIN_PASSWORD, "admin"),
    (PROVIDER_EMAIL, PROVIDER_PASSWORD, "provider"),
    (CLIENT_EMAIL, CLIENT_PASSWORD, "client"),
]

SPLASH_FILES = [
    "splash-iphone-se.png",
    "splash-iphone-6-7-8.png",
    "splash-iphone-xr-11.png",
    "splash-iphone-x-xs-11pro.png",
    "splash-iphone-12-13-14.png",
    "splash-iphone-12pro-max.png",
    "splash-iphone-14pro-max.png",
    "splash-iphone-xs-max-11pro-max.png",
    "splash-iphone-15-16.png",
    "splash-iphone-17.png",
    "splash-iphone-17-pro-max.png",
    "splash-ipad-mini.png",
    "splash-ipad-pro-11.png",
    "splash-ipad-pro-12.png",
]


@pytest.mark.parametrize("email,password,expected_role", DEMOS)
def test_demo_login(email, password, expected_role):
    time.sleep(0.2)  # rate-limit friendly
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    assert "user" in data, f"Missing user in response for {email}: {data}"
    # token may be in body or cookie
    has_token = "token" in data or "access_token" in data or any("session_token" in c.name for c in r.cookies)
    assert has_token, f"No token returned for {email}: keys={list(data.keys())} cookies={[c.name for c in r.cookies]}"
    assert data["user"].get("role") == expected_role, f"Expected role {expected_role}, got {data['user'].get('role')}"
    assert data["user"].get("email") == email


def test_demo_client_email_verified_via_db():
    """Section 28 — new demo client must be email_verified=true (verify via Mongo since login API doesn't expose it)."""
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    from dotenv import load_dotenv
    load_dotenv('/app/backend/.env')
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME')
    assert mongo_url and db_name
    async def _check():
        client = AsyncIOMotorClient(mongo_url)
        doc = await client[db_name].users.find_one({"email": CLIENT_EMAIL})
        client.close()
        return doc
    doc = asyncio.get_event_loop().run_until_complete(_check())
    assert doc is not None, "demo.client user not found in DB"
    assert doc.get("email_verified") is True, f"email_verified should be True in DB, got {doc.get('email_verified')}"
    assert doc.get("role") == "client"
    assert doc.get("name") == "Carlos Demo"


def test_manifest_json():
    r = requests.get(f"{BASE_URL}/manifest.json", timeout=15)
    assert r.status_code == 200
    m = r.json()
    assert m.get("background_color") == "#FFFFFF", f"Expected #FFFFFF, got {m.get('background_color')}"
    assert m.get("theme_color") == "#025F67"


@pytest.mark.parametrize("fname", SPLASH_FILES)
def test_splash_asset(fname):
    r = requests.get(f"{BASE_URL}/splash/{fname}", timeout=15)
    assert r.status_code == 200, f"{fname} -> {r.status_code}"
    ct = r.headers.get("content-type", "")
    assert "image/png" in ct or "image" in ct, f"{fname} content-type={ct}"
    assert len(r.content) > 100, f"{fname} too small ({len(r.content)} bytes)"
