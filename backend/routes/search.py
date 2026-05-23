"""
Search module — extracted from server.py.

Holds every public `/api/providers` + `/api/search/*` endpoint plus its
helpers. The previous monolithic `search_providers` (complexity 27, 16 args)
is now decomposed into small testable helpers:

    _build_simple_filters(params, db)
        → MongoDB query fragments for the 9 non-text filters.

    _build_text_search(q, db)
        → ($or clauses, expanded_terms) tuple driven by search_synonyms.

    _haversine_km(...)         → pure math.
    _attach_distances(...)     → annotates docs with km + miles.
    _sort_providers(...)       → plan-aware ordering (proximity-first or rating).
    _attach_categories(...)    → hydrates the embedded category doc.

`make_router(*, db, PUBLIC_GUARD, DEFAULT_COUNTRY)` returns the APIRouter
wired into `server.py`.
"""
from __future__ import annotations

import re
from math import asin, cos, radians, sin, sqrt
from types import SimpleNamespace
from typing import Any, Literal, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from search_synonyms import expand_query, suggest_alternatives


# ─── Constants ──────────────────────────────────────────────────────────
PLAN_ORDER: dict[str, int] = {"premium": 0, "pro": 1, "basic": 2, "free": 3}
KM_PER_MILE: float = 1.60934
MILES_PER_KM: float = 0.621371
EARTH_RADIUS_KM: float = 6371.0


# ─── Pydantic param container (drives the public route signature) ──────
class _SearchParams(BaseModel):
    """Internal container so individual helpers can take a single arg."""
    q: Optional[str] = None
    category: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    verified: Optional[bool] = None
    language: Optional[str] = None
    latino_owned: Optional[bool] = None
    owner_identity: Optional[Literal["latino", "american"]] = None
    country: Optional[str] = None
    has_video: Optional[bool] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    radius_km: Optional[float] = None
    radius_miles: float = 75.0
    limit: int = 24


# ─── Pure filter helpers ───────────────────────────────────────────────
async def _resolve_category_id(db, slug: str) -> Optional[str]:
    cat = await db.categories.find_one({"slug": slug}, {"_id": 0, "category_id": 1})
    return cat.get("category_id") if cat else None


async def _build_simple_filters(params: _SearchParams, db, public_guard: dict) -> dict:
    """Translate the 9 boolean/string filters into a Mongo query dict."""
    query: dict[str, Any] = {"is_active": True, **public_guard}
    if params.country:
        query["country"] = params.country
    if params.category:
        cat_id = await _resolve_category_id(db, params.category)
        if cat_id:
            query["category_id"] = cat_id
    if params.city:
        query["city"] = {"$regex": params.city, "$options": "i"}
    if params.state:
        query["state"] = {"$regex": f"^{params.state}$", "$options": "i"}
    if params.zip_code:
        query["zip_code"] = params.zip_code
    if params.verified:
        query["verification_status"] = "approved"
    if params.language:
        query["languages"] = params.language
    if params.latino_owned:
        query["latino_owned"] = "yes"
    if params.owner_identity:
        query["owner_identity"] = params.owner_identity
    if params.has_video:
        query["video_url"] = {"$exists": True, "$ne": ""}
    return query


def _regex_or_clauses(terms: list[str]) -> list[dict]:
    """Expand each term into 3 i-regex clauses (name / description / services)."""
    clauses: list[dict] = []
    for term in terms:
        safe = re.escape(term)
        clauses.extend([
            {"business_name": {"$regex": safe, "$options": "i"}},
            {"description":   {"$regex": safe, "$options": "i"}},
            {"services":      {"$regex": safe, "$options": "i"}},
        ])
    return clauses


async def _category_id_clause_for_terms(db, expanded_terms: list[str]) -> Optional[dict]:
    """Widen the $or with a category_id IN clause when synonyms hit a category name."""
    if not expanded_terms:
        return None
    cat_docs = await db.categories.find(
        {"$or": [
            {"name_es": {"$in": expanded_terms}},
            {"name_en": {"$in": expanded_terms}},
        ]},
        {"_id": 0, "category_id": 1},
    ).to_list(20)
    cat_ids = [c["category_id"] for c in cat_docs]
    return {"category_id": {"$in": cat_ids}} if cat_ids else None


async def _build_text_search(q: Optional[str], db) -> list[dict]:
    """Return the $or clauses for the smart-search text expansion (empty if no q)."""
    if not q:
        return []
    expanded_terms = expand_query(q)
    or_clauses = _regex_or_clauses([q] + expanded_terms)
    cat_clause = await _category_id_clause_for_terms(db, expanded_terms)
    if cat_clause:
        or_clauses.append(cat_clause)
    return or_clauses


# ─── Proximity helpers ─────────────────────────────────────────────────
def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    la1, lo1, la2, lo2 = map(radians, (lat1, lng1, lat2, lng2))
    dlat, dlng = la2 - la1, lo2 - lo1
    a = sin(dlat / 2) ** 2 + cos(la1) * cos(la2) * sin(dlng / 2) ** 2
    return 2 * EARTH_RADIUS_KM * asin(sqrt(a))


def _annotate_distance(provider: dict, lat: float, lng: float) -> None:
    """Mutate provider to add distance_km / distance_miles (or 9999 on bad data)."""
    try:
        dist_km = _haversine_km(lat, lng, float(provider["latitude"]), float(provider["longitude"]))
        provider["distance_km"] = round(dist_km, 2)
        provider["distance_miles"] = round(dist_km * MILES_PER_KM, 1)
    except (KeyError, TypeError, ValueError):
        provider["distance_km"] = 9999.0
        provider["distance_miles"] = 9999.0


def _effective_radius_km(radius_km: Optional[float], radius_miles: float) -> float:
    if radius_km is not None:
        return radius_km
    return radius_miles * KM_PER_MILE


# ─── Sort + hydrate ────────────────────────────────────────────────────
def _sort_by_proximity(providers: list[dict]) -> None:
    providers.sort(key=lambda p: (
        p["distance_km"],
        PLAN_ORDER.get(p.get("plan", "free"), 9),
        -p.get("likes_count", 0),
    ))


def _sort_by_relevance(providers: list[dict]) -> None:
    providers.sort(key=lambda p: (
        PLAN_ORDER.get(p.get("plan", "free"), 9),
        -p.get("likes_count", 0),
        -p.get("rating_avg", 0),
    ))


async def _attach_categories(providers: list[dict], db) -> None:
    cats = {c["category_id"]: c for c in await db.categories.find({}, {"_id": 0}).to_list(100)}
    for p in providers:
        p["category"] = cats.get(p.get("category_id"))


# ─── Main handler bodies ───────────────────────────────────────────────
async def _do_search_providers(deps, params: _SearchParams) -> list[dict]:
    query = await _build_simple_filters(params, deps.db, deps.PUBLIC_GUARD)

    or_clauses = await _build_text_search(params.q, deps.db)
    if or_clauses:
        query["$or"] = or_clauses

    use_proximity = params.lat is not None and params.lng is not None
    if use_proximity:
        query["latitude"] = {"$ne": None}
        query["longitude"] = {"$ne": None}

    fetch_n = params.limit * (4 if use_proximity else 2)
    providers = await deps.db.provider_profiles.find(query, {"_id": 0}).limit(fetch_n).to_list(fetch_n)

    if use_proximity:
        radius = _effective_radius_km(params.radius_km, params.radius_miles)
        for p in providers:
            _annotate_distance(p, params.lat, params.lng)
        providers = [p for p in providers if p["distance_km"] <= radius]
        _sort_by_proximity(providers)
    else:
        _sort_by_relevance(providers)

    providers = providers[: params.limit]
    await _attach_categories(providers, deps.db)
    return providers


async def _do_autocomplete(deps, q: str, lang: str) -> dict:
    canonicals = expand_query(q, max_results=8)
    if not canonicals:
        return {"q": q, "matches": []}
    cat_docs = await deps.db.categories.find(
        {"$or": [{"name_es": {"$in": canonicals}}, {"name_en": {"$in": canonicals}}]},
        {"_id": 0, "slug": 1, "name_es": 1, "name_en": 1},
    ).to_list(50)
    by_name: dict[str, dict] = {}
    for c in cat_docs:
        by_name[c.get("name_es", "")] = c
        by_name[c.get("name_en", "")] = c
    matches: list[dict] = []
    for canon in canonicals:
        cat = by_name.get(canon)
        matches.append({
            "label": canon,
            "label_en": (cat.get("name_en") if cat else canon),
            "slug": (cat.get("slug") if cat else None),
        })
    return {"q": q, "matches": matches}


def _do_alternatives(q: str) -> dict:
    return {"q": q, "alternatives": suggest_alternatives(q, max_results=4)}


# ─── Router factory ────────────────────────────────────────────────────
def make_router(*, db, PUBLIC_GUARD: dict, DEFAULT_COUNTRY: str = "US") -> APIRouter:
    deps = SimpleNamespace(db=db, PUBLIC_GUARD=PUBLIC_GUARD)
    router = APIRouter(tags=["search"])

    @router.get("/providers")
    async def search_providers(
        q: Optional[str] = None,
        category: Optional[str] = None,
        city: Optional[str] = None,
        state: Optional[str] = None,
        zip_code: Optional[str] = None,
        verified: Optional[bool] = None,
        language: Optional[str] = None,
        latino_owned: Optional[bool] = None,
        owner_identity: Optional[Literal["latino", "american"]] = None,
        country: Optional[str] = DEFAULT_COUNTRY,
        has_video: Optional[bool] = None,
        lat: Optional[float] = None,
        lng: Optional[float] = None,
        radius_km: Optional[float] = None,
        radius_miles: float = 75.0,
        limit: int = 24,
    ):
        params = _SearchParams(
            q=q, category=category, city=city, state=state, zip_code=zip_code,
            verified=verified, language=language, latino_owned=latino_owned,
            owner_identity=owner_identity, country=country, has_video=has_video,
            lat=lat, lng=lng, radius_km=radius_km, radius_miles=radius_miles,
            limit=limit,
        )
        return await _do_search_providers(deps, params)

    @router.get("/search/autocomplete")
    async def search_autocomplete(q: str = "", lang: str = "es"):
        return await _do_autocomplete(deps, q, lang)

    @router.get("/search/alternatives")
    async def search_alternatives(q: str = ""):
        return _do_alternatives(q)

    return router
