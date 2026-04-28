"""Generate icon16/48/128.png for the Claude Usage Bar extension."""
from PIL import Image, ImageDraw

CORAL = (217, 119, 87, 255)
CORAL_DEEP = (185, 81, 58, 255)
CREAM = (245, 244, 238, 255)
CREAM_BORDER = (232, 230, 220, 255)


def render(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    radius = int(size * 0.22)
    d.rounded_rectangle(
        [(0, 0), (size - 1, size - 1)],
        radius=radius,
        fill=CORAL,
    )

    pill_h = max(4, int(size * 0.28))
    pill_w = int(size * 0.7)
    pill_x = (size - pill_w) // 2
    pill_y = (size - pill_h) // 2
    pill_r = pill_h // 2

    d.rounded_rectangle(
        [(pill_x, pill_y), (pill_x + pill_w, pill_y + pill_h)],
        radius=pill_r,
        fill=CREAM,
        outline=CREAM_BORDER,
        width=max(1, size // 64),
    )

    fill_w = int(pill_w * 0.55)
    if fill_w >= 2 * pill_r:
        d.rounded_rectangle(
            [(pill_x, pill_y), (pill_x + fill_w, pill_y + pill_h)],
            radius=pill_r,
            fill=CORAL_DEEP,
        )

    return img


for s in (16, 48, 128):
    render(s).save(f"icon{s}.png")
    print(f"wrote icon{s}.png")
