"""Package the transparent brick-style Spider-Man frames as animated WebP clips."""
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
FRAMES = ROOT / "tmp" / "spider-mascot-3d" / "frames"
OUTPUT = ROOT / "frontend" / "public" / "spider-mascot-3d"
CLIPS = ("idle", "walk", "jump", "wave", "swing")


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for clip in CLIPS:
        paths = sorted((FRAMES / clip).glob("*.png"))
        if not paths:
            raise FileNotFoundError(f"No rendered frames found for {clip}")
        images = [Image.open(path).convert("RGBA") for path in paths]
        images[0].save(OUTPUT / f"{clip}.webp", "WEBP", save_all=True, append_images=images[1:], duration=83, loop=0, quality=85, method=3)
        images[0].save(OUTPUT / f"{clip}-poster.webp", "WEBP", quality=91, method=4)


if __name__ == "__main__":
    main()
