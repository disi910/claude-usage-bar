"""
Chrome Web Store asset builder.

Reads source screenshots from store-assets/source/ and writes:
  - five 1280x800 24-bit PNGs (no alpha) for the listing's screenshot slots
  - one 440x280 small-promo-tile PNG with overlay text for the listing thumbnail

Run from the repo root:

    python3 scripts/make_store_assets.py

Source filenames should be 01-*.png, 02-*.png, ... (sorted alphabetically -> order on the listing).
The promo tile is built from the source named 04-* (the hover-panel shot) by default;
override with --promo-source.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

TARGET_W, TARGET_H = 1280, 800
PROMO_W, PROMO_H = 440, 280
MARQUEE_W, MARQUEE_H = 1400, 560

CORAL = (217, 119, 87)        # --cub-coral
CORAL_DEEP = (201, 100, 66)   # --cub-coral-deep
INK = (31, 27, 20)            # --cub-fg
PAPER = (245, 244, 238)       # --cub-bg (no alpha for export)


def fit_to_canvas(src: Image.Image, w: int, h: int, bg=PAPER) -> Image.Image:
    """Resize src to fit inside (w,h), letterbox-pad on bg to exact size, return RGB."""
    src = src.convert("RGB")
    sw, sh = src.size
    scale = min(w / sw, h / sh)
    new_w, new_h = max(1, int(sw * scale)), max(1, int(sh * scale))
    resized = src.resize((new_w, new_h), Image.LANCZOS)
    canvas = Image.new("RGB", (w, h), bg)
    canvas.paste(resized, ((w - new_w) // 2, (h - new_h) // 2))
    return canvas


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for candidate in [
        "/System/Library/Fonts/Supplemental/Charter.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
    ]:
        if Path(candidate).exists():
            try:
                return ImageFont.truetype(candidate, size=size)
            except OSError:
                continue
    return ImageFont.load_default()


def text_size(draw: ImageDraw.ImageDraw, text: str, font) -> tuple[int, int]:
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def build_promo_tile(src_path: Path, out_path: Path) -> None:
    """Marketing thumbnail: zoomed-in crop of the hover panel + overlay headline."""
    src = Image.open(src_path).convert("RGB")
    sw, sh = src.size

    # Crop a tight region around the hover panel area (top-center of the image).
    # Screenshots are ~2940x1660; the bar sits ~y=20..70 and the hover panel
    # extends to ~y=420. We crop just that band, narrow horizontally so the
    # panel dominates the frame.
    crop_l = int(sw * 0.28)
    crop_t = 0
    crop_r = int(sw * 0.72)
    crop_b = int(sh * 0.32)
    cropped = src.crop((crop_l, crop_t, crop_r, crop_b))

    # Soft blur + tint background, then composite the crop centered.
    bg = src.copy().filter(ImageFilter.GaussianBlur(radius=24))
    bg = bg.resize((PROMO_W, PROMO_H), Image.LANCZOS)
    overlay = Image.new("RGB", (PROMO_W, PROMO_H), PAPER)
    bg = Image.blend(bg, overlay, alpha=0.75)

    # Resize the crop to fit nicely.
    target_h = int(PROMO_H * 0.82)
    cw, ch = cropped.size
    scale = target_h / ch
    new_w = int(cw * scale)
    new_h = target_h
    if new_w > PROMO_W - 220:
        new_w = PROMO_W - 220
        scale = new_w / cw
        new_h = int(ch * scale)
    crop_resized = cropped.resize((new_w, new_h), Image.LANCZOS)

    # Position on the right
    paste_x = PROMO_W - new_w - 16
    paste_y = (PROMO_H - new_h) // 2
    bg.paste(crop_resized, (paste_x, paste_y))

    # Headline text on the left
    draw = ImageDraw.Draw(bg)
    title_font = load_font(28)
    sub_font = load_font(15)

    title_lines = ["Your Claude", "usage,", "at a glance."]
    sub = "Plan · context · cache"

    x = 22
    y = 38
    for line in title_lines:
        draw.text((x, y), line, fill=INK, font=title_font)
        _, lh = text_size(draw, line, title_font)
        y += lh + 4

    y += 10
    draw.text((x, y), sub, fill=CORAL_DEEP, font=sub_font)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    bg.save(out_path, format="PNG", optimize=True)
    print(f"  promo tile -> {out_path}  ({PROMO_W}x{PROMO_H})")


def build_marquee(src_path: Path, out_path: Path) -> None:
    """1400x560 marquee banner: headline left, screenshot right on a tinted blur."""
    src = Image.open(src_path).convert("RGB")

    bg = src.copy().filter(ImageFilter.GaussianBlur(radius=32))
    bg = bg.resize((MARQUEE_W, MARQUEE_H), Image.LANCZOS)
    overlay = Image.new("RGB", (MARQUEE_W, MARQUEE_H), PAPER)
    bg = Image.blend(bg, overlay, alpha=0.82)

    # Screenshot fills the right ~60%, letterboxed with a thin coral frame.
    shot_w = int(MARQUEE_W * 0.58)
    shot_h = MARQUEE_H - 80
    shot = fit_to_canvas(src, shot_w, shot_h)
    frame = Image.new("RGB", (shot_w + 4, shot_h + 4), CORAL)
    frame.paste(shot, (2, 2))
    bg.paste(frame, (MARQUEE_W - shot_w - 44, (MARQUEE_H - shot_h) // 2 - 2))

    draw = ImageDraw.Draw(bg)
    title_font = load_font(56)
    sub_font = load_font(26)

    x = 56
    y = 150
    for line in ["Your Claude usage,", "at a glance."]:
        draw.text((x, y), line, fill=INK, font=title_font)
        _, lh = text_size(draw, line, title_font)
        y += lh + 12

    y += 18
    draw.text((x, y), "Plan limits · context window · prompt cache", fill=CORAL_DEEP, font=sub_font)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    bg.save(out_path, format="PNG", optimize=True)
    print(f"  marquee -> {out_path}  ({MARQUEE_W}x{MARQUEE_H})")


def build_screenshot(src_path: Path, out_path: Path) -> None:
    img = Image.open(src_path)
    fitted = fit_to_canvas(img, TARGET_W, TARGET_H)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fitted.save(out_path, format="PNG", optimize=True)
    print(f"  screenshot -> {out_path}  ({TARGET_W}x{TARGET_H})")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        default="store-assets/source",
        help="directory of source PNGs (01-*.png, 02-*.png, ...)",
    )
    parser.add_argument(
        "--out",
        default="store-assets/output",
        help="output directory",
    )
    parser.add_argument(
        "--promo-source",
        default=None,
        help="explicit path to the source used for the promo tile (defaults to the 04-* file)",
    )
    args = parser.parse_args()

    src_dir = Path(args.source)
    out_dir = Path(args.out)

    if not src_dir.exists():
        print(f"source dir not found: {src_dir}", file=sys.stderr)
        return 1

    sources = sorted(p for p in src_dir.iterdir() if p.suffix.lower() in {".png", ".jpg", ".jpeg"})
    if not sources:
        print(f"no source images found in {src_dir}", file=sys.stderr)
        return 1

    print(f"found {len(sources)} source images in {src_dir}")
    for i, src in enumerate(sources[:5], 1):
        out_name = f"{i:02d}-{src.stem}-1280x800.png"
        build_screenshot(src, out_dir / out_name)

    promo_src = (
        Path(args.promo_source)
        if args.promo_source
        else next((p for p in sources if p.name.startswith("04")), sources[0])
    )
    build_promo_tile(promo_src, out_dir / "promo-tile-440x280.png")
    build_marquee(promo_src, out_dir / "marquee-1400x560.png")

    print("\ndone. upload these from store-assets/output/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
