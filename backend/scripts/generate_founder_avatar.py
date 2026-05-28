"""
One-shot script — generate the founder portrait illustration for the
About page. Style matches the existing 8 default avatars (flat 2D vector,
brand-aligned background).

Subject: E. Hernandez — Mexican-American tech entrepreneur, light brown
skin (moreno claro), Mexican facial features. Founder of getamano and
sibling project Tiangix.

Usage:
  cd /app/backend && python scripts/generate_founder_avatar.py
"""
import asyncio
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv  # noqa: E402
load_dotenv(BACKEND_DIR / ".env")

OUT_DIR = Path("/app/frontend/public/avatars")
OUT_DIR.mkdir(parents=True, exist_ok=True)
OUT_FILE = Path("/app/frontend/public/avatars/founder-e-hernandez.png")

PROMPT = (
    "A flat 2D vector portrait illustration of a young Mexican-American tech "
    "entrepreneur in his mid-20s (around 25 years old), light brown skin "
    "(moreno claro), Mexican facial features with warm friendly eyes, short "
    "neat dark hair with a modern fade, clean-shaven smooth face (NO beard, "
    "NO mustache, NO facial hair at all), wearing a smart casual navy "
    "button-up shirt. Shown from the chest up, looking at the viewer with a "
    "confident yet approachable smile that conveys youthful passion for "
    "technology and entrepreneurship. "
    "Solid background color: soft teal #B7D6D8. "
    "Style: minimalist modern flat illustration, soft rounded shapes, "
    "gentle clean line work, thick rounded strokes, no shading gradients "
    "beyond subtle highlights, similar to modern marketplace app avatars "
    "(Notion, Slack, Airbnb illustrations). "
    "Composition: subject centered, head fills upper two-thirds of frame, "
    "even padding. "
    "Strictly NO text, no letters, no logos, no numbers, no words anywhere "
    "in the image. "
    "Square 1:1 aspect ratio. Clean, professional, friendly, "
    "social-media-ready as a circular avatar (important content within the "
    "central circle, corners pure background color)."
)


async def main():
    from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        print("✗ EMERGENT_LLM_KEY missing")
        sys.exit(1)
    if OUT_FILE.exists():
        print(f"✓ {OUT_FILE} already exists ({OUT_FILE.stat().st_size} bytes)")
        return
    gen = OpenAIImageGeneration(api_key=api_key)
    print("→ Generating founder portrait...")
    images = await gen.generate_images(
        prompt=PROMPT,
        model="gpt-image-1",
        number_of_images=1,
    )
    if not images:
        print("✗ No image returned")
        sys.exit(1)
    OUT_FILE.write_bytes(images[0])
    print(f"✓ Saved {OUT_FILE} ({OUT_FILE.stat().st_size} bytes)")


if __name__ == "__main__":
    asyncio.run(main())
