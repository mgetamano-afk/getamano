"""
Section 81 — AI Search Concierge.

Turns a free-text query like "necesito alguien que arregle mi techo que
tiene goteras" into the right subcategory slug ("techos") plus a brief
human reasoning. Uses gemini-3-flash-preview via the Emergent LLM key.

Why Gemini 3 Flash?
───────────────────
This is a *classification* call — pick 1 of 188 slugs. We don't need
deep reasoning, just fast pattern matching with bilingual (ES/EN)
understanding. Gemini Flash is the cheapest + fastest option that
handles Spanish accurately.

Caching
───────
We cache the (normalized_query → result) in MongoDB for 7 days. Repeat
queries hit cache and return in <50 ms with no LLM cost.

Endpoint
────────
POST /api/search/concierge
Body: {"query": "string", "lang": "es"|"en" (optional)}
Returns: {
  "slug": "techos",                       (best match, or "" if no match)
  "category_id": "cat_xxx",               (resolved from slug)
  "name_es": "Techos",
  "name_en": "Roofing",
  "emoji": "🏚️",
  "confidence": "high"|"medium"|"low",
  "reasoning_es": "Detecté problema de techo con goteras",
  "from_cache": true|false,
}
"""
import json
import logging
import os
import re
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

CACHE_TTL_DAYS = 7


class ConciergeIn(BaseModel):
    query: str = Field(..., min_length=3, max_length=300)
    lang: Optional[str] = Field(default="es")


def _normalize_query(q: str) -> str:
    """Lowercase + collapse whitespace + strip punctuation for cache key.
    Preserves Spanish accents (which carry meaning: 'unas' vs 'uñas')."""
    q = q.strip().lower()
    q = re.sub(r"\s+", " ", q)
    q = re.sub(r"[!?.,;:¡¿\"'`()]", "", q)
    return q[:300]


def _build_system_prompt(catalog_rows: list[dict]) -> str:
    """Build the system prompt with the full 188-slug catalog inline.
    Catalog rows: [{slug, name_es, name_en}, ...]"""
    catalog_lines = [
        f"- {r['slug']}: {r['name_es']} / {r['name_en']}"
        for r in catalog_rows
    ]
    return (
        "Eres un clasificador para una plataforma de servicios para la "
        "comunidad latina en USA llamada getamano. Recibes una consulta "
        "del usuario en español o inglés y devuelves EXACTAMENTE un objeto "
        "JSON (sin texto extra, sin markdown) con esta forma:\n"
        '{"slug": "<uno-de-los-slugs-listados>", "confidence": "high"|"medium"|"low", '
        '"reasoning_es": "<máximo 80 caracteres explicando por qué>"}\n\n'
        "Reglas:\n"
        "1. El 'slug' DEBE ser uno de los listados a continuación. Si NINGUNO "
        "encaja razonablemente, devuelve {\"slug\": \"\", \"confidence\": \"low\", "
        "\"reasoning_es\": \"No encontré una categoría exacta\"}.\n"
        "2. NUNCA inventes slugs nuevos. NUNCA respondas con prosa.\n"
        "3. Razona corto en español sin importar el idioma de entrada.\n"
        "4. Si la consulta es ambigua entre 2 categorías, escoge la más "
        "específica.\n\n"
        "CATÁLOGO COMPLETO (slug : nombre_es / nombre_en):\n"
        + "\n".join(catalog_lines)
    )


def build_concierge_router(*, db) -> APIRouter:
    router = APIRouter()

    @router.post("/search/concierge")
    async def concierge(payload: ConciergeIn) -> dict:
        norm = _normalize_query(payload.query)
        if len(norm) < 3:
            raise HTTPException(status_code=422, detail="Consulta muy corta.")

        # 1. Cache hit?
        cached = await db.concierge_cache.find_one(
            {"_id": norm}, {"_id": 0}
        )
        if cached:
            exp = cached.get("expires_at")
            if isinstance(exp, datetime):
                # MongoDB returns naive UTC; normalize before comparing
                if exp.tzinfo is None:
                    exp = exp.replace(tzinfo=timezone.utc)
                if exp > datetime.now(timezone.utc):
                    cached["from_cache"] = True
                    cached.pop("expires_at", None)
                    cached.pop("created_at", None)
                    return cached

        # 2. LLM classify
        cats = await db.categories.find(
            {}, {"_id": 0, "slug": 1, "name_es": 1, "name_en": 1}
        ).to_list(500)
        valid_slugs = {c["slug"] for c in cats}
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=503, detail="LLM key no configurada.")

        try:
            # Lazy import — keeps cold-start fast for routes that don't use it
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            chat = LlmChat(
                api_key=api_key,
                session_id=f"concierge_{norm[:32]}",
                system_message=_build_system_prompt(cats),
            ).with_model("gemini", "gemini-3-flash-preview")
            raw = await chat.send_message(UserMessage(text=payload.query))
        except Exception as e:  # noqa: BLE001
            logger.warning(f"concierge LLM error: {e}")
            raise HTTPException(status_code=502, detail="No pude clasificar tu consulta.")

        # 3. Parse + sanity check the JSON
        slug = ""
        confidence = "low"
        reasoning = "Sin clasificación clara."
        try:
            # Some models wrap JSON in code fences; strip them
            text = (raw or "").strip()
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
            parsed = json.loads(text)
            s = (parsed.get("slug") or "").strip()
            if s in valid_slugs:
                slug = s
            confidence = parsed.get("confidence", "low")
            if confidence not in {"high", "medium", "low"}:
                confidence = "low"
            reasoning = (parsed.get("reasoning_es") or "")[:120] or reasoning
        except Exception as e:  # noqa: BLE001
            logger.warning(f"concierge parse error: {e} | raw={raw[:160]!r}")

        # 4. Enrich with category metadata
        match = next((c for c in cats if c["slug"] == slug), None) if slug else None
        meta = await db.categories.find_one(
            {"slug": slug}, {"_id": 0, "category_id": 1, "emoji": 1}
        ) if slug else None

        result = {
            "slug": slug,
            "category_id": (meta or {}).get("category_id", ""),
            "name_es": (match or {}).get("name_es", ""),
            "name_en": (match or {}).get("name_en", ""),
            "emoji": (meta or {}).get("emoji", ""),
            "confidence": confidence,
            "reasoning_es": reasoning,
            "from_cache": False,
        }

        # 5. Cache the answer (overwrite if exists)
        try:
            now = datetime.now(timezone.utc)
            await db.concierge_cache.update_one(
                {"_id": norm},
                {"$set": {**result, "expires_at": now + timedelta(days=CACHE_TTL_DAYS),
                          "created_at": now}},
                upsert=True,
            )
        except Exception as e:  # noqa: BLE001
            logger.warning(f"concierge cache write failed: {e}")

        return result

    return router
