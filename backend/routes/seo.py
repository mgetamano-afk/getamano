"""
SEO module — Section 22 extracted from server.py.

Holds every endpoint that powers the public SEO hubs:
  - GET /seo/cities                       Hub list (/ciudades)
  - GET /seo/sectors                      Hub list (/servicios)
  - GET /seo/city/{city_slug}             Category list within a city
  - GET /seo/category/{category_slug}     City list within a category
  - GET /seo/page/{cat_slug}/{city_slug}  Landing-page payload (providers + related)
  - GET /seo/content/{cat_slug}/{city_slug} AI-generated unique paragraph (cached)
  - GET /sitemap.xml                      XML sitemap (lazy, full index)
  - GET /robots.txt                       Allow public hubs, disallow dashboards

Wired in server.py via `make_router(...)` which captures shared deps
(db, PUBLIC_GUARD, SEO_CITIES, SECTOR_LABELS, SECTOR_COLORS).
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Optional

from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import PlainTextResponse

logger = logging.getLogger(__name__)

SEO_CATEGORY_SLUGS = (
    "cleaning", "catering", "construction", "handyman", "auto", "beauty",
    "moving", "legal", "landscaping", "events", "tutoring", "health",
)
PLAN_RANK = {"premium": 0, "pro": 1, "basic": 2, "free": 3}
SITEMAP_PROVIDERS_LIMIT = 2000
SITEMAP_CATS_LIMIT = 500
SEO_BASE_URL = "https://getamano.us"


# ─── City + category helpers ───────────────────────────────────────────
def _find_city(cities: list[dict], slug: str) -> Optional[dict]:
    return next((c for c in cities if c["slug"] == slug), None)


def _city_name_regex(city_name: str) -> dict:
    return {"$regex": f"^{city_name}$", "$options": "i"}


async def _count_providers(db, public_guard: dict, **extra) -> int:
    return await db.provider_profiles.count_documents({"is_active": True, **public_guard, **extra})


# ─── Handler bodies ────────────────────────────────────────────────────
async def _do_seo_cities(deps) -> dict:
    items = []
    for c in deps.SEO_CITIES:
        count = await _count_providers(deps.db, deps.PUBLIC_GUARD, city=_city_name_regex(c["name"]))
        items.append({**c, "providers_count": count})
    items.sort(key=lambda x: -x["providers_count"])
    return {"items": items, "total": len(items)}


async def _do_seo_sectors(deps) -> dict:
    cats = await deps.db.categories.find({}, {"_id": 0}).to_list(500)
    by_sector: dict[str, list[dict]] = {}
    for c in cats:
        s = c.get("sector", "hogar")
        by_sector.setdefault(s, []).append(c)
    out = []
    for sector_key, sector_label in deps.SECTOR_LABELS.items():
        items = by_sector.get(sector_key, [])
        if not items:
            continue
        for cat in items:
            cat["providers_count"] = await deps.db.provider_profiles.count_documents(
                {"is_active": True, "category_id": cat["category_id"]}
            )
        items.sort(key=lambda x: -x.get("providers_count", 0))
        out.append({
            "sector": sector_key,
            "label": sector_label,
            "color": deps.SECTOR_COLORS.get(sector_key, "#2F9D94"),
            "categories": items,
        })
    return {"sectors": out}


async def _do_seo_city_detail(deps, city_slug: str) -> dict:
    city = _find_city(deps.SEO_CITIES, city_slug)
    if not city:
        raise HTTPException(status_code=404, detail="City not found")
    pipeline = [
        {"$match": {"is_active": True, "city": _city_name_regex(city["name"]), "is_test": {"$ne": True}}},
        {"$group": {"_id": "$category_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    agg = await deps.db.provider_profiles.aggregate(pipeline).to_list(500)
    cat_ids = [a["_id"] for a in agg if a["_id"]]
    cats = await deps.db.categories.find({"category_id": {"$in": cat_ids}}, {"_id": 0}).to_list(500)
    cat_map = {c["category_id"]: c for c in cats}
    items: list[dict] = []
    for a in agg:
        c = cat_map.get(a["_id"])
        if c:
            items.append({**c, "providers_count": a["count"]})
    return {"city": city, "categories": items, "total_providers": sum(a["count"] for a in agg)}


async def _do_seo_category_detail(deps, category_slug: str) -> dict:
    cat = await deps.db.categories.find_one({"slug": category_slug}, {"_id": 0})
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    items: list[dict] = []
    for c in deps.SEO_CITIES:
        count = await _count_providers(
            deps.db, deps.PUBLIC_GUARD,
            category_id=cat["category_id"], city=_city_name_regex(c["name"]),
        )
        if count > 0:
            items.append({**c, "providers_count": count})
    items.sort(key=lambda x: -x["providers_count"])
    return {"category": cat, "cities": items, "total_cities": len(items)}


async def _fetch_related_cities(deps, cat_id: str, exclude_slug: str) -> list[dict]:
    related: list[dict] = []
    for c in deps.SEO_CITIES:
        if c["slug"] == exclude_slug:
            continue
        cnt = await deps.db.provider_profiles.count_documents(
            {"is_active": True, "category_id": cat_id, "city": _city_name_regex(c["name"])}
        )
        related.append({**c, "count": cnt})
    related.sort(key=lambda x: -x["count"])
    with_results = [c for c in related if c["count"] > 0][:4]
    if with_results:
        return with_results
    return [{**c, "count": 0} for c in deps.SEO_CITIES if c["slug"] != exclude_slug][:4]


async def _do_seo_page(deps, category_slug: str, city_slug: str) -> dict:
    cat = await deps.db.categories.find_one({"slug": category_slug}, {"_id": 0})
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    city = _find_city(deps.SEO_CITIES, city_slug)
    if not city:
        raise HTTPException(status_code=404, detail="City not found")

    providers = await deps.db.provider_profiles.find(
        {
            "is_active": True, "category_id": cat["category_id"],
            "city": _city_name_regex(city["name"]), **deps.PUBLIC_GUARD,
        },
        {"_id": 0},
    ).limit(12).to_list(12)
    providers.sort(key=lambda p: (-p.get("rating_count", 0), PLAN_RANK.get(p.get("plan", "free"), 9)))

    related_cities = await _fetch_related_cities(deps, cat["category_id"], city_slug)
    related_categories = await deps.db.categories.find(
        {"sector": cat.get("sector"), "slug": {"$ne": cat["slug"]}}, {"_id": 0},
    ).limit(4).to_list(4)

    return {
        "category": cat,
        "city": city,
        "providers": providers,
        "related_cities": related_cities,
        "related_categories": related_categories,
    }


async def _generate_seo_paragraph(deps, cat: dict, city: dict) -> Optional[str]:
    """Call Claude via emergentintegrations. Returns content or None on failure."""
    prompt = (
        f"Eres un copywriter latino para getamano, marketplace que conecta a latinos en USA con proveedores latinos verificados. "
        f"Escribe UN ÚNICO PÁRRAFO de 90-110 palabras en español neutro sobre buscar servicios de '{cat['name_es']}' en {city['name']}, {city['state']}. "
        f"Tono cálido, profesional, útil. Menciona que getamano conecta con proveedores latinos verificados. "
        f"NO listas, NO emojis, NO títulos. NO inventes datos numéricos (precios, cantidades). "
        f"Termina con un llamado sutil a explorar la lista o pedir cotización. NO menciones competidores."
    )
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=os.environ.get("EMERGENT_LLM_KEY"),
            session_id=f"seo_{cat['slug']}_{city['slug']}",
            system_message="Eres un copywriter SEO bilingüe para la comunidad latina en USA.",
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        content = (await chat.send_message(UserMessage(text=prompt))).strip()
        return content or None
    except Exception as e:
        logger.warning("SEO AI content gen failed for %s/%s: %s", cat["slug"], city["slug"], e)
        return None


def _seo_paragraph_fallback(cat: dict, city: dict) -> str:
    return (
        f"En getamano encontrarás proveedores latinos verificados de {cat['name_es'].lower()} "
        f"en {city['name']}, {city['state']}. Compara reseñas reales, solicita cotización gratis en español, "
        f"y contrata con confianza. Apoya a la comunidad mientras resuelves lo que necesitas."
    )


async def _do_seo_content(deps, category_slug: str, city_slug: str) -> dict:
    cached = await deps.db.seo_content_cache.find_one(
        {"cat_slug": category_slug, "city_slug": city_slug}, {"_id": 0},
    )
    if cached and cached.get("content"):
        return {"content": cached["content"], "generated_at": cached.get("generated_at"), "cached": True}

    cat = await deps.db.categories.find_one({"slug": category_slug}, {"_id": 0})
    city = _find_city(deps.SEO_CITIES, city_slug)
    if not cat or not city:
        raise HTTPException(status_code=404, detail="Not found")

    now_iso = datetime.now(timezone.utc).isoformat()
    content = await _generate_seo_paragraph(deps, cat, city)
    if content:
        await deps.db.seo_content_cache.update_one(
            {"cat_slug": category_slug, "city_slug": city_slug},
            {"$set": {
                "cat_slug": category_slug, "city_slug": city_slug,
                "content": content, "generated_at": now_iso,
            }},
            upsert=True,
        )
        return {"content": content, "generated_at": now_iso, "cached": False}

    return {
        "content": _seo_paragraph_fallback(cat, city),
        "generated_at": now_iso,
        "cached": False, "fallback": True,
    }


# ─── Sitemap + Robots ──────────────────────────────────────────────────
def _static_sitemap_urls(base: str) -> list[str]:
    return [
        f"<url><loc>{base}/</loc><priority>1.0</priority><changefreq>daily</changefreq></url>",
        f"<url><loc>{base}/servicios</loc><priority>0.9</priority><changefreq>weekly</changefreq></url>",
        f"<url><loc>{base}/ciudades</loc><priority>0.9</priority><changefreq>weekly</changefreq></url>",
        f"<url><loc>{base}/plans</loc><priority>0.8</priority><changefreq>monthly</changefreq></url>",
        f"<url><loc>{base}/comunidad</loc><priority>0.8</priority><changefreq>weekly</changefreq></url>",
        f"<url><loc>{base}/instalar</loc><priority>0.7</priority><changefreq>monthly</changefreq></url>",
        f"<url><loc>{base}/terminos</loc><priority>0.3</priority><changefreq>monthly</changefreq></url>",
        f"<url><loc>{base}/privacidad</loc><priority>0.3</priority><changefreq>monthly</changefreq></url>",
    ]


async def _do_sitemap(deps) -> Response:
    base = SEO_BASE_URL
    urls = _static_sitemap_urls(base)
    # Section 22 SEO category hubs — ES + EN dual indexing
    for slug in SEO_CATEGORY_SLUGS:
        urls.append(f"<url><loc>{base}/categoria/{slug}</loc><priority>0.9</priority><changefreq>weekly</changefreq></url>")
        urls.append(f"<url><loc>{base}/category/{slug}</loc><priority>0.7</priority><changefreq>weekly</changefreq></url>")
    cats = await deps.db.categories.find({}, {"_id": 0, "slug": 1}).to_list(SITEMAP_CATS_LIMIT)
    for cat in cats:
        urls.append(f"<url><loc>{base}/servicios/{cat['slug']}</loc><priority>0.7</priority><changefreq>weekly</changefreq></url>")
        for city in deps.SEO_CITIES:
            urls.append(
                f"<url><loc>{base}/servicios/{cat['slug']}/{city['slug']}</loc>"
                f"<priority>0.8</priority><changefreq>weekly</changefreq></url>"
            )
    for city in deps.SEO_CITIES:
        urls.append(f"<url><loc>{base}/ciudades/{city['slug']}</loc><priority>0.7</priority><changefreq>weekly</changefreq></url>")
    providers = await deps.db.provider_profiles.find(
        {"is_active": True, **deps.PUBLIC_GUARD}, {"_id": 0, "slug": 1},
    ).to_list(SITEMAP_PROVIDERS_LIMIT)
    for p in providers:
        if p.get("slug"):
            urls.append(f"<url><loc>{base}/proveedor/{p['slug']}</loc><priority>0.7</priority><changefreq>weekly</changefreq></url>")
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(urls) + "\n</urlset>"
    )
    return Response(content=xml, media_type="application/xml")


_ROBOTS_TXT = """User-agent: *
Allow: /
Allow: /servicios/
Allow: /ciudades/
Allow: /proveedor/
Disallow: /dashboard/
Disallow: /admin/
Disallow: /api/
Disallow: /login
Disallow: /register

Sitemap: https://getamano.us/sitemap.xml
"""


# ─── Router factory ────────────────────────────────────────────────────
def make_router(*, db, PUBLIC_GUARD: dict, SEO_CITIES: list[dict],
                SECTOR_LABELS: dict, SECTOR_COLORS: dict) -> APIRouter:
    deps = SimpleNamespace(
        db=db,
        PUBLIC_GUARD=PUBLIC_GUARD,
        SEO_CITIES=SEO_CITIES,
        SECTOR_LABELS=SECTOR_LABELS,
        SECTOR_COLORS=SECTOR_COLORS,
    )
    router = APIRouter(tags=["seo"])

    @router.get("/seo/cities")
    async def seo_cities():
        return await _do_seo_cities(deps)

    @router.get("/seo/sectors")
    async def seo_sectors():
        return await _do_seo_sectors(deps)

    @router.get("/seo/city/{city_slug}")
    async def seo_city_detail(city_slug: str):
        return await _do_seo_city_detail(deps, city_slug)

    @router.get("/seo/category/{category_slug}")
    async def seo_category_detail(category_slug: str):
        return await _do_seo_category_detail(deps, category_slug)

    @router.get("/seo/page/{category_slug}/{city_slug}")
    async def seo_page_data(category_slug: str, city_slug: str):
        return await _do_seo_page(deps, category_slug, city_slug)

    @router.get("/seo/content/{category_slug}/{city_slug}")
    async def seo_content(category_slug: str, city_slug: str):
        return await _do_seo_content(deps, category_slug, city_slug)

    @router.get("/sitemap.xml")
    async def sitemap():
        return await _do_sitemap(deps)

    @router.get("/robots.txt", response_class=PlainTextResponse)
    async def robots():
        return _ROBOTS_TXT

    return router
