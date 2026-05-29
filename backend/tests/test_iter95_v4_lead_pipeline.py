"""
Iteration 95 — v4 Phase G (Lead Pipeline) regression.
"""
import os
import sys
import uuid

import requests

sys.path.insert(0, os.path.dirname(__file__))
from tests.test_config import API  # noqa: E402


def _read(rel_path: str) -> str:
    full = os.path.join(os.path.dirname(__file__), "..", "..", rel_path)
    with open(full, encoding="utf-8") as f:
        return f.read()


def test_pipeline_endpoint_requires_auth():
    r = requests.get(f"{API}/leads/pipeline", timeout=10)
    assert r.status_code == 401


def test_pipeline_returns_buckets_and_counts(provider_session):
    r = provider_session.get(f"{API}/leads/pipeline", timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert set(body["counts"].keys()) == {"new", "contacted", "quoted", "won", "lost"}
    assert set(body["buckets"].keys()) >= {"new", "contacted", "quoted", "won", "lost"}
    assert body["total"] == sum(body["counts"].values())


def test_status_transitions_through_pipeline(client_session, provider_session, demo_provider_id):
    # 1) client creates a request
    create = client_session.post(
        f"{API}/service-requests",
        json={"provider_id": demo_provider_id, "message": f"iter95 lead {uuid.uuid4().hex[:6]}"},
        timeout=15,
    )
    assert create.status_code == 200, create.text
    request_id = create.json()["request_id"]
    assert create.json()["status"] == "new"

    for next_status in ("contacted", "quoted", "won"):
        r = provider_session.put(
            f"{API}/service-requests/{request_id}/status",
            json={"status": next_status}, timeout=10,
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == next_status

    # 2) Legacy "completed" should normalize to "won"
    r = provider_session.put(
        f"{API}/service-requests/{request_id}/status",
        json={"status": "completed"}, timeout=10,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "won"


def test_legacy_statuses_accepted(client_session, provider_session, demo_provider_id):
    """Old clients sending pending/accepted/declined must still work."""
    create = client_session.post(
        f"{API}/service-requests",
        json={"provider_id": demo_provider_id, "message": f"iter95 legacy {uuid.uuid4().hex[:6]}"},
        timeout=10,
    )
    rid = create.json()["request_id"]
    for legacy, expected in [("accepted", "quoted"), ("declined", "lost")]:
        r = provider_session.put(
            f"{API}/service-requests/{rid}/status",
            json={"status": legacy}, timeout=10,
        )
        assert r.json()["status"] == expected


# ─── Frontend source locks ─────────────────────────────────────────

def test_lead_pipeline_component_mounted_in_dashboard():
    src = _read("frontend/src/pages/ProviderDashboard.jsx")
    assert "import LeadPipeline" in src
    assert "<LeadPipeline />" in src


def test_lead_pipeline_component_exists():
    src = _read("frontend/src/components/LeadPipeline.jsx")
    assert "lead-pipeline" in src
    assert "leads-column-${status}" in src
    assert 'STATUS_ORDER = ["new", "contacted", "quoted", "won", "lost"]' in src
    assert "/leads/pipeline" in src
    assert "/service-requests/" in src
