"""Create a multi-resolution Windows icon from the approved INTERSOS app mark."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent
source = ROOT / "frontend" / "public" / "intersos-symbol-clear.png"
target = ROOT / "intersos-protection-analytics.ico"

image = Image.open(source).convert("RGBA")
image.save(target, format="ICO", sizes=[(16, 16), (20, 20), (24, 24), (32, 32), (40, 40), (48, 48), (64, 64), (128, 128), (256, 256)])
print(target)
