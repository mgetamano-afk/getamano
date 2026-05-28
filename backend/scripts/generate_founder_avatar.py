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
    "(moreno claro), Mexican facial features. "
    "IMPORTANT FACIAL REQUIREMENTS: The face must be perfectly symmetric and "
    "well-proportioned, viewed straight-on in a perfect frontal pose (NOT "
    "tilted, NOT angled, NOT three-quarter view). Both eyes equal size and "
    "perfectly aligned horizontally. Both eyebrows identical and balanced. "
    "Nose perfectly centered. Mouth centered and balanced. Both ears equal "
    "(if visible). Head perfectly upright, no tilt left or right. "
    "Hair: short neat dark hair, modern simple cut, evenly distributed "
    "across the head. Clean-shaven smooth face (NO beard, NO mustache, NO "
    "facial hair, NO stubble). Wearing a smart casual navy button-up shirt "
    "with a symmetric collar. "
    "Pose: shown from the chest up, head perfectly centered and frontal, "
    "looking directly at the viewer with a calm confident friendly smile. "
    "Solid background color: soft teal #B7D6D8. "
    "Style: minimalist modern flat illustration, soft rounded shapes, "
    "gentle clean line work, thick rounded strokes, no shading gradients "
    "beyond subtle highlights, similar to modern marketplace app avatars "
    "(Notion, Slack, Airbnb illustrations). "
    "Composition: subject perfectly centered horizontally, head fills "
    "upper two-thirds of frame, even padding on all sides, head and "
    "shoulders perfectly centered like a passport photo. "
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
