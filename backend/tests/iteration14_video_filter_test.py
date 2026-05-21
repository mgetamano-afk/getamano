"""
Iteration 14 — Quick test: has_video filter on GET /api/providers
- has_video=true returns only providers with non-empty video_url
- demo provider (maria-cleaning-services-sallisaw-ok) has a video and should appear
- has_video=false (falsy) ignores filter -> returns all
- without filter, demo provider's video_url field is present
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://verified-providers-2.preview.emergentagent.com").rstrip("/")
DEMO_SLUG = "maria-cleaning-services-sallisaw-ok"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def test_providers_no_filter_includes_demo_with_video(session):
    r = session.get(f"{BASE_URL}/api/providers", params={"limit": 50})
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    demo = next((p for p in data if p.get("slug") == DEMO_SLUG), None)
    assert demo is not None, f"Demo provider {DEMO_SLUG} not found in providers list"
    assert demo.get("video_url"), f"Demo provider missing video_url. Got: {demo.get('video_url')!r}"
    assert isinstance(demo["video_url"], str)
    assert len(demo["video_url"]) > 0


def test_providers_has_video_true_returns_only_with_video(session):
    r = session.get(f"{BASE_URL}/api/providers", params={"has_video": "true", "limit": 50})
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1, "Expected at least one provider with video (demo)"
    # All returned providers must have non-empty video_url
    for p in data:
        vu = p.get("video_url")
        assert vu and isinstance(vu, str) and vu.strip() != "", (
            f"Provider {p.get('slug')} returned by has_video=true but has empty video_url={vu!r}"
        )
    # Demo provider must be among results
    slugs = [p.get("slug") for p in data]
    assert DEMO_SLUG in slugs, f"Demo provider {DEMO_SLUG} missing from has_video=true results. Got: {slugs}"


def test_providers_has_video_false_ignores_filter(session):
    # has_video=false is Python falsy -> filter NOT applied -> should return all
    r_all = session.get(f"{BASE_URL}/api/providers", params={"limit": 50})
    r_false = session.get(f"{BASE_URL}/api/providers", params={"has_video": "false", "limit": 50})
    assert r_all.status_code == 200
    assert r_false.status_code == 200
    all_slugs = sorted([p.get("slug") for p in r_all.json()])
    false_slugs = sorted([p.get("slug") for p in r_false.json()])
    assert all_slugs == false_slugs, (
        f"has_video=false should be a no-op. Diff:\n  all={all_slugs}\n  false={false_slugs}"
    )


def test_has_video_true_subset_of_all(session):
    """Sanity: with_video count <= total count, and every with_video slug is in all."""
    r_all = session.get(f"{BASE_URL}/api/providers", params={"limit": 50})
    r_vid = session.get(f"{BASE_URL}/api/providers", params={"has_video": "true", "limit": 50})
    all_slugs = {p.get("slug") for p in r_all.json()}
    vid_slugs = {p.get("slug") for p in r_vid.json()}
    assert vid_slugs.issubset(all_slugs)
    assert len(vid_slugs) <= len(all_slugs)
