"""
One-shot script — Section 83.

Generate the 8 default avatar illustrations for getamano users without
a profile picture. Saves to /app/frontend/public/avatars/{name}.png.

Style: flat 2D illustration, latino-diverse, brand-aligned (teal/amber/cream
backgrounds, friendly faces, no text). Mix of perceived-male / perceived-female
appearances to give variety. The frontend assigns one to each user based on
a stable hash of user_id.

Usage:
  cd /app/backend && python scripts/generate_default_avatars.py
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

# Each entry: (filename, descriptor) — descriptor is human-readable for
# debugging; the prompt is composed below.
AVATARS = [
    # Perceived-male variants
    ("avatar-m1", "young latino man, warm bronze skin, short dark wavy hair, friendly smile, looking forward"),
    ("avatar-m2", "middle-aged hispanic man, mid-brown skin, short black hair, light beard, soft warm smile"),
    ("avatar-m3", "young latino man with light olive skin, curly dark brown hair, glasses, gentle expression"),
    ("avatar-m4", "mature hispanic man, salt-and-pepper hair, deep tan skin, kind eyes, professional look"),
    # Perceived-female variants
    ("avatar-w1", "young latina woman, long dark wavy hair, warm caramel skin, bright friendly smile"),
    ("avatar-w2", "middle-aged hispanic woman, shoulder-length dark hair, mid-brown skin, gentle expression"),
    ("avatar-w3", "young latina with curly dark hair, light bronze skin, hoop earrings, confident calm smile"),
    ("avatar-w4", "mature latina woman, elegant gray-streaked hair tied back, warm tan skin, serene expression"),
]

# Brand-aligned background colors (cycle through these for visual variety)
BG_COLORS = [
    "soft teal #B7D6D8",
    "warm cream #FBF6E9",
    "muted amber #FCD9A0",
    "warm peach #FFD2B7",
    "soft teal #B7D6D8",
    "warm cream #FBF6E9",
    "muted amber #FCD9A0",
    "warm peach #FFD2B7",
]


def build_prompt(person_descriptor: str, bg_color: str) -> str:
    """Compose the per-avatar prompt with consistent style across all 8."""
    return (
        f"A flat 2D vector portrait illustration of a {person_descriptor}, "
        "shown from the chest up, looking at the viewer with a warm friendly expression. "
        f"Solid background color: {bg_color}. "
        "Style: minimalist modern flat illustration, soft rounded shapes, gentle clean line work, "
        "thick rounded strokes, no shading gradients beyond subtle highlights, similar to modern "
        "marketplace app avatars (Notion, Slack, Airbnb illustrations). "
        "Composition: subject centered, head fills upper two-thirds of frame, even padding. "
        "Strictly NO text, no letters, no logos, no numbers, no words anywhere in the image. "
        "Square 1:1 aspect ratio. Clean, professional, friendly, social-media-ready as a circular "
        "avatar (so the important content is within the central circle and the corners are pure "
        "background color)."
    )


async def main():
    from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        print("✗ EMERGENT_LLM_KEY missing — cannot generate avatars.")
        sys.exit(1)
    gen = OpenAIImageGeneration(api_key=api_key)
    for i, (slug, descriptor) in enumerate(AVATARS):
        out = OUT_DIR / f"{slug}.png"
        if out.exists():
            print(f"  ✓ {slug} already exists, skipping")
            continue
        bg = BG_COLORS[i % len(BG_COLORS)]
        prompt = build_prompt(descriptor, bg)
        print(f"\n→ Generating {slug} ({descriptor[:50]}...)")
        try:
            images = await gen.generate_images(
                prompt=prompt,
                model="gpt-image-1",
                number_of_images=1,
            )
            if not images:
                print(f"  ✗ {slug} returned 0 images")
                continue
            out.write_bytes(images[0])
            print(f"  ✓ Saved {out} ({out.stat().st_size} bytes)")
        except Exception as exc:  # noqa: BLE001
            print(f"  ✗ {slug} failed: {exc}")

    print(f"\nDone. Generated avatars in {OUT_DIR}")


if __name__ == "__main__":
    asyncio.run(main())
