"""Tests for GET /api/banners/banner-of-the-week (Section 57)."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://verified-providers-2.preview.emergentagent.com").rstrip("/")
ENDPOINT = f"{BASE_URL}/api/banners/banner-of-the-week"


class TestBannerOfTheWeek:
    """Public endpoint - no auth required."""

    def test_endpoint_reachable_no_auth(self):
        r = requests.get(ENDPOINT, timeout=15)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:200]}"

    def test_returns_json(self):
        r = requests.get(ENDPOINT, timeout=15)
        assert r.status_code == 200
        # Either dict (banner found) or null (no banners)
        data = r.json()
        assert data is None or isinstance(data, dict)

    def test_returns_marias_pinned_festive_banner(self):
        """With seeded demo data, must return Maria's pinned festive banner."""
        r = requests.get(ENDPOINT, timeout=15)
        data = r.json()
        assert data is not None, "Expected a banner with seeded demo data"
        # Validate core fields
        assert "share_id" in data
        assert "provider_id" in data
        assert "business_name" in data
        assert "likes" in data
        assert "style" in data
        assert "image_url" in data
        # Specific seeded values
        assert data["business_name"] == "María's Cleaning Services", f"Unexpected: {data['business_name']}"
        assert data["style"] == "festive"
        assert data["pinned"] is True
        assert data["likes"] >= 1
        assert data["provider_slug"] == "maria-cleaning-services-sallisaw-ok"

    def test_no_mongodb_object_id_in_response(self):
        r = requests.get(ENDPOINT, timeout=15)
        data = r.json()
        if data:
            assert "_id" not in data, "MongoDB _id should be excluded from response"

    def test_response_has_required_marketing_fields(self):
        r = requests.get(ENDPOINT, timeout=15)
        data = r.json()
        if data:
            for f in ["image_url", "business_name", "provider_slug", "verified", "likes"]:
                assert f in data, f"Missing required field: {f}"
