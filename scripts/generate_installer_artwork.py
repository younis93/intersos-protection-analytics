"""Generate deterministic high-DPI Inno Setup artwork from the application icon."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
INSTALLER = ROOT / "installer"
ICON = ROOT / "intersos-protection-analytics.ico"
BLUE = "#163F78"
ACCENT = "#4FA3D1"
WHITE = "#FFFFFF"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "segoeuib.ttf" if bold else "segoeui.ttf"
    return ImageFont.truetype(Path("C:/Windows/Fonts") / name, size)


def app_icon(size: int) -> Image.Image:
    source = Image.open(ICON)
    source.seek(getattr(source, "n_frames", 1) - 1)
    return source.convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)


def sidebar() -> Image.Image:
    image = Image.new("RGB", (328, 628), BLUE)
    draw = ImageDraw.Draw(image)
    draw.ellipse((190, -75, 430, 165), fill="#245996")
    draw.ellipse((-120, 485, 180, 785), fill="#0E315F")
    draw.rounded_rectangle((46, 63, 166, 183), radius=27, fill=WHITE)
    image.paste(app_icon(92), (60, 77), app_icon(92))
    draw.text((46, 226), "INTERSOS", fill=WHITE, font=font(30, True))
    draw.text((46, 270), "Protection\nAnalytics", fill=WHITE, font=font(27, True), spacing=4)
    draw.rectangle((46, 365, 114, 371), fill=ACCENT)
    draw.multiline_text((46, 395), "Secure analysis.\nClearer decisions.", fill="#DCEBFA", font=font(17), spacing=7)
    draw.text((46, 566), "WINDOWS DESKTOP", fill="#9EC8E4", font=font(11, True))
    return image


def header() -> Image.Image:
    image = Image.new("RGB", (328, 116), WHITE)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 108, 328, 116), fill=BLUE)
    draw.rounded_rectangle((218, 14, 298, 94), radius=18, fill="#EAF2FA")
    icon = app_icon(58)
    image.paste(icon, (229, 25), icon)
    draw.text((22, 27), "INTERSOS", fill=BLUE, font=font(21, True))
    draw.text((22, 58), "Protection Analytics", fill="#49657D", font=font(15))
    return image


if __name__ == "__main__":
    sidebar().save(INSTALLER / "wizard-sidebar.bmp", format="BMP")
    header().save(INSTALLER / "wizard-header.bmp", format="BMP")
    print("Generated installer/wizard-sidebar.bmp and installer/wizard-header.bmp")
