"""Quick sanity check that the new conftest fixtures wire up correctly.
Each fixture should yield a working session / value or skip gracefully.
"""


def test_api_url(api_url):
    assert api_url.endswith("/api")


def test_anon_session_can_hit_public_endpoint(anon_session, api_url):
    r = anon_session.get(f"{api_url}/community/posts?limit=1", timeout=15)
    assert r.status_code == 200
    assert "items" in r.json()


def test_admin_session_authenticated(admin_session, api_url):
    r = admin_session.get(f"{api_url}/auth/me", timeout=15)
    assert r.status_code == 200
    assert r.json().get("role") == "admin"


def test_provider_session_authenticated(provider_session, api_url):
    r = provider_session.get(f"{api_url}/auth/me", timeout=15)
    assert r.status_code == 200
    assert r.json().get("role") == "provider"


def test_client_session_authenticated(client_session, api_url):
    r = client_session.get(f"{api_url}/auth/me", timeout=15)
    assert r.status_code == 200
    assert r.json().get("role") == "client"


def test_demo_provider_id_resolves(demo_provider_id):
    assert demo_provider_id  # truthy string
    assert demo_provider_id.startswith(("prov_", "provider_"))  # sanity
