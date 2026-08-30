"""Generate icon16/48/128.png for the Claude Usage Bar extension.

The mark is the context ring: a coral tile with a cream meter arc that starts
at twelve o'clock and runs 75% of the way round; the remaining quarter shows
as a translucent cream track, so the gap reads as "how much you have left".
Geometry mirrors the in-page donut in content.js (round cap, track behind the
arc) so the icon and the product agree.
"""
import math

from PIL import Image, ImageDraw

CORAL = (217, 119, 87, 255)
CREAM = (245, 244, 238, 255)
CREAM_TRACK = (245, 244, 238, 99)  # cream at ~39% alpha for the unfilled quarter

FILL = 0.75          # fraction of the ring the arc covers
SS = 8               # supersampling factor; the arc is drawn big and downscaled


def render(size: int) -> Image.Image:
    """Render one icon at `size` px, antialiased via an SS-times-larger canvas."""
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    d.rounded_rectangle([(0, 0), (s - 1, s - 1)], radius=int(s * 0.22), fill=CORAL)

    # The ring goes on its own layer and is alpha-composited over the tile;
    # drawing translucent cream straight onto the tile would replace the coral
    # pixels (and their alpha) instead of blending over them.
    ring = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(ring)

    # Ring geometry as a fraction of the tile, so every size is the same mark.
    stroke = s * 0.12
    radius = s * 0.32
    cx = cy = s / 2
    # PIL strokes an arc INWARD from its bounding box, so the box has to sit
    # half a stroke outside the centerline for the ring to land on `radius`.
    outer = radius + stroke / 2
    box = [cx - outer, cy - outer, cx + outer, cy + outer]

    # -90 puts the start at twelve o'clock; sweep clockwise from there.
    start = -90
    end = start + 360 * FILL

    d.arc(box, start=start, end=start + 360, fill=CREAM_TRACK, width=int(stroke))
    d.arc(box, start=start, end=end, fill=CREAM, width=int(stroke))

    # Round caps: PIL's arc has none, so cap both ends with a circle.
    cap_r = stroke / 2
    for angle in (start, end):
        a = math.radians(angle)
        px, py = cx + radius * math.cos(a), cy + radius * math.sin(a)
        d.ellipse([px - cap_r, py - cap_r, px + cap_r, py + cap_r], fill=CREAM)

    img = Image.alpha_composite(img, ring)
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    for s in (16, 48, 128):
        render(s).save(f"icon{s}.png")
        print(f"wrote icon{s}.png")
