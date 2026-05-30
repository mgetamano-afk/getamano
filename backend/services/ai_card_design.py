"""
AI Card Background Service (V14)
=================================

Generates a category-aware abstract background for the physical NFC card
using Gemini Nano Banana (gemini-3.1-flash-image-preview) via the
Emergent LLM key.

API:
    bg_b64 = await generate_card_background(
        category_label="Limpieza · House Cleaning",
        palette=("#0077B6", "#03045E", "#F77F00"),
        business_name="María's Cleaning Services",
        seed_hint="microfibers and bubbles",  # optional
    )

Returns a base64-encoded PNG (no `data:` prefix). Callers should treat
the value as opaque. Each call invokes the model — there is NO caching
at this layer because the provider explicitly asks for new variants
("ilimitado mientras edita"). Caching is the caller's responsibility.

Notes
-----
* The category label is plain-text (Spanish or English). We pass it
  verbatim into the prompt and let Gemini infer the visual idiom.
* The PNG is sized roughly 1024×1024 (Gemini default). We crop +
  resize to the card aspect ratio when we composite the PDF.
* Negative prompts: "no text, no logos, no people, no faces" — those
  belong on the card layer, not the background.
"""
import asyncio
import base64
import logging
import os
import uuid
from typing import Optional, Tuple

logger = logging.getLogger(__name__)


CATEGORY_HINTS = {
    # Light category-aware nudges. The model is smart enough without these,
    # but they speed up the "looks like X" recognition by a few seconds.
    "limpieza": "soft microfiber textures, gentle bubbles, light shine",
    "cleaning": "soft microfiber textures, gentle bubbles, light shine",
    "plomería": "stylised pipes and water droplets in abstract patterns",
    "plumbing": "stylised pipes and water droplets in abstract patterns",
    "construcción": "abstract architectural shapes, blueprints fading",
    "construction": "abstract architectural shapes, blueprints fading",
    "jardinería": "soft leaves and plant silhouettes",
    "landscaping": "soft leaves and plant silhouettes",
    "garden": "soft leaves and plant silhouettes",
    "salud": "abstract pulse waves, calm clinical lines",
    "health": "abstract pulse waves, calm clinical lines",
    "comida": "abstract food shapes, herbs, gentle steam",
    "food": "abstract food shapes, herbs, gentle steam",
    "belleza": "elegant brush strokes, soft curves",
    "beauty": "elegant brush strokes, soft curves",
    "automotriz": "abstract chrome curves and tire treads",
    "auto": "abstract chrome curves and tire treads",
    "fotografía": "abstract bokeh and aperture blur shapes",
    "photography": "abstract bokeh and aperture blur shapes",
}


def _infer_hint(category_label: str) -> str:
    """Best-effort match category label to a curated visual idiom."""
    norm = (category_label or "").lower()
    for key, val in CATEGORY_HINTS.items():
        if key in norm:
            return val
    return "elegant abstract geometric shapes related to the business category"


async def generate_card_background(
    *,
    category_label: str,
    palette: Tuple[str, str, str],
    business_name: Optional[str] = None,
    seed_hint: Optional[str] = None,
) -> str:
    """Calls Gemini Nano Banana and returns base64-encoded PNG."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise RuntimeError("EMERGENT_LLM_KEY missing from environment")

    primary, secondary, accent = palette
    hint = seed_hint or _infer_hint(category_label)

    # The prompt is intentionally explicit: NO text, NO logos, NO people.
    # We want a *texture* the card overlay can sit on top of cleanly.
    prompt = (
        "Design an elegant, professional, abstract BACKGROUND TEXTURE for a "
        f"business card. Industry / category: {category_label}. "
        f"Visual hint: {hint}. "
        f"Dominant palette in hex: {primary} (primary, ~60%), "
        f"{secondary} (deep tone, ~30%), {accent} (accent, ~10%). "
        "Style: editorial gradient + soft geometric shapes, sophisticated, "
        "tasteful, premium. Suitable as a background for white overlay text. "
        "Strictly NO TEXT, NO LETTERS, NO NUMBERS, NO LOGOS, NO PEOPLE, "
        "NO FACES, NO BRAND NAMES. Output a single 16:9 landscape image."
    )

    chat = LlmChat(
        api_key=api_key,
        # Fresh session per call so prompts don't bleed across providers.
        session_id=f"card-bg-{uuid.uuid4().hex[:10]}",
        system_message="You are an editorial graphic designer who makes premium abstract backgrounds.",
    )
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(
        modalities=["image", "text"]
    )

    msg = UserMessage(text=prompt)
    try:
        text, images = await chat.send_message_multimodal_response(msg)
    except Exception as e:
        logger.exception("Gemini Nano Banana failed")
        raise RuntimeError(f"AI generation failed: {e}") from e

    if not images:
        logger.warning(f"Gemini returned no images. text head: {text[:80] if text else ''}")
        raise RuntimeError("AI did not return any image. Please try again with another palette.")

    # `images[0]['data']` is already a base64 string per emergentintegrations.
    b64 = images[0].get("data")
    if not b64:
        raise RuntimeError("AI returned an empty image payload")
    return b64


def b64_to_bytes(b64: str) -> bytes:
    return base64.b64decode(b64)


# ─── Convenience CLI for ops smoke-tests ────────────────────────────
if __name__ == "__main__":
    async def _main():
        bg = await generate_card_background(
            category_label="Limpieza · House Cleaning",
            palette=("#0077B6", "#03045E", "#F77F00"),
            business_name="María's Cleaning",
        )
        path = "/tmp/card-bg-smoke.png"
        with open(path, "wb") as f:
            f.write(b64_to_bytes(bg))
        print(f"saved {path} ({len(bg)} b64 chars)")

    asyncio.run(_main())
