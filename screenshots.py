"""Build presentable Chrome Web Store screenshots from the raw PNGs.

Outputs:
  screenshots/01-home-1280.png       (1280x800, full Claude.ai home)
  screenshots/02-chat-1280.png       (1280x800, full Claude.ai chat)
  screenshots/03-closeup-1280.png    (1280x800, the bar centered on cream canvas)
  screenshots/01-home-640.png        (640x400, same content, smaller)
  screenshots/02-chat-640.png        (640x400)
  screenshots/03-closeup-640.png     (640x400)
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).parent
OUT = ROOT / "screenshots"
OUT.mkdir(exist_ok=True)

CREAM = (245, 244, 238, 255)
TARGETS = [(1280, 800), (640, 400)]


def center_crop_to_ratio(img: Image.Image, target_ratio: float) -> Image.Image:
    w, h = img.size
    cur = w / h
    if cur > target_ratio:
        new_w = int(h * target_ratio)
        x = (w - new_w) // 2
        return img.crop((x, 0, x + new_w, h))
    new_h = int(w / target_ratio)
    y = (h - new_h) // 2
    return img.crop((0, y, w, y + new_h))


def fit_full_screenshot(src_path: Path, target: tuple[int, int]) -> Image.Image:
    img = Image.open(src_path).convert("RGBA")
    cropped = center_crop_to_ratio(img, target[0] / target[1])
    return cropped.resize(target, Image.LANCZOS)


def build_closeup(src_path: Path, target: tuple[int, int]) -> Image.Image:
    src = Image.open(src_path).convert("RGBA")
    canvas = Image.new("RGBA", target, CREAM)

    margin_x = int(target[0] * 0.08)
    avail_w = target[0] - 2 * margin_x
    scale = avail_w / src.width
    new_w = avail_w
    new_h = int(src.height * scale)
    banner = src.resize((new_w, new_h), Image.LANCZOS)

    y = int(target[1] * 0.22)
    canvas.paste(banner, (margin_x, y), banner)

    draw = ImageDraw.Draw(canvas)
    title = "Always know how much Claude you have left."
    subtitle = "Live 5-hour usage, right where you work."

    title_size = max(18, int(target[1] * 0.055))
    sub_size = max(12, int(target[1] * 0.032))

    try:
        title_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Georgia.ttf", title_size)
        sub_font = ImageFont.truetype("/System/Library/Fonts/HelveticaNeue.ttc", sub_size)
    except OSError:
        title_font = ImageFont.load_default()
        sub_font = ImageFont.load_default()

    title_y = y + new_h + int(target[1] * 0.08)
    tw = draw.textlength(title, font=title_font)
    draw.text(
        ((target[0] - tw) / 2, title_y),
        title,
        font=title_font,
        fill=(31, 27, 20, 255),
    )

    sub_y = title_y + title_size + int(target[1] * 0.025)
    sw = draw.textlength(subtitle, font=sub_font)
    draw.text(
        ((target[0] - sw) / 2, sub_y),
        subtitle,
        font=sub_font,
        fill=(110, 102, 88, 255),
    )

    return canvas


def build_promo_tile() -> Image.Image:
    """Small promo tile for Chrome Web Store: 440x280, no alpha."""
    W, H = 440, 280
    CORAL = (217, 119, 87)
    CORAL_DEEP = (185, 81, 58)
    CREAM = (245, 244, 238)
    CREAM_BORDER = (232, 230, 220)
    INK = (31, 27, 20)
    MUTED = (110, 102, 88)

    canvas = Image.new("RGB", (W, H), CREAM)
    draw = ImageDraw.Draw(canvas)

    bar_w = int(W * 0.78)
    bar_h = 36
    bar_x = (W - bar_w) // 2
    bar_y = 64
    radius = bar_h // 2

    draw.rounded_rectangle(
        [(bar_x, bar_y), (bar_x + bar_w, bar_y + bar_h)],
        radius=radius,
        fill=CREAM,
        outline=CREAM_BORDER,
        width=2,
    )
    fill_w = int(bar_w * 0.62)
    if fill_w >= 2 * radius:
        draw.rounded_rectangle(
            [(bar_x, bar_y), (bar_x + fill_w, bar_y + bar_h)],
            radius=radius,
            fill=CORAL,
        )

    try:
        bar_font = ImageFont.truetype("/System/Library/Fonts/HelveticaNeue.ttc", 14)
        title_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Georgia.ttf", 30)
        sub_font = ImageFont.truetype("/System/Library/Fonts/HelveticaNeue.ttc", 15)
    except OSError:
        bar_font = title_font = sub_font = ImageFont.load_default()

    bar_text = "62 %  ·  resets in 2h 14m"
    tw = draw.textlength(bar_text, font=bar_font)
    draw.text(
        (bar_x + (bar_w - tw) / 2, bar_y + (bar_h - 14) / 2 - 1),
        bar_text,
        font=bar_font,
        fill=INK,
    )

    title = "Usage Bar for Claude"
    sub = "Always know how much you have left."

    title_w = draw.textlength(title, font=title_font)
    draw.text(((W - title_w) / 2, 150), title, font=title_font, fill=INK)

    sub_w = draw.textlength(sub, font=sub_font)
    draw.text(((W - sub_w) / 2, 200), sub, font=sub_font, fill=MUTED)

    return canvas


def main():
    src1 = ROOT / "claudeusage1.png"  # home / "Back at it, Didrik"
    src2 = ROOT / "claudeusage2.png"  # chat with tokens explanation
    src3 = ROOT / "claudeusage3.png"  # close-up banner

    for w, h in TARGETS:
        suffix = f"{w}.png"
        fit_full_screenshot(src1, (w, h)).save(OUT / f"01-home-{suffix}")
        fit_full_screenshot(src2, (w, h)).save(OUT / f"02-chat-{suffix}")
        build_closeup(src3, (w, h)).save(OUT / f"03-closeup-{suffix}")
        print(f"wrote 1280-pair set for {w}x{h}")

    promo = build_promo_tile()
    promo.save(OUT / "promo-tile-440x280.png")
    print("wrote promo-tile-440x280.png")

    print("done")


if __name__ == "__main__":
    main()
