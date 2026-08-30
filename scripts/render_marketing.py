"""Render the marketing templates in marketing/templates/ to final PNGs.

Each template is captured with headless Chrome at 2x device scale and
downscaled with Lanczos for crisp type, then saved as 24-bit RGB (the
Chrome Web Store rejects screenshots with an alpha channel).

Run from the repo root:

    python3 scripts/render_marketing.py

Outputs land in marketing/output/store/ and marketing/output/reddit/.
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ROOT = Path(__file__).resolve().parent.parent
TEMPLATES = ROOT / "marketing" / "templates"
OUT = ROOT / "marketing" / "output"

# template stem -> (width, height, output subpath)
ASSETS = {
    "slide-01-hero": (1280, 800, "store/slide-01-hero-1280x800.png"),
    "slide-02-plan": (1280, 800, "store/slide-02-plan-1280x800.png"),
    "slide-03-context": (1280, 800, "store/slide-03-context-1280x800.png"),
    "slide-04-inline": (1280, 800, "store/slide-04-inline-1280x800.png"),
    "slide-05-private": (1280, 800, "store/slide-05-private-1280x800.png"),
    "promo-tile": (440, 280, "store/promo-tile-440x280.png"),
    "marquee": (1400, 560, "store/marquee-1400x560.png"),
    "reddit-feed-a": (1200, 628, "reddit/reddit-feed-a-1200x628.png"),
    "reddit-feed-b": (1200, 628, "reddit/reddit-feed-b-1200x628.png"),
    "reddit-square": (1080, 1080, "reddit/reddit-square-1080x1080.png"),
}


def render(stem: str, w: int, h: int, out_rel: str) -> None:
    template = TEMPLATES / f"{stem}.html"
    if not template.exists():
        print(f"  SKIP {stem}: template missing", file=sys.stderr)
        return
    out_path = OUT / out_rel
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        shot = Path(tmp) / "shot.png"
        subprocess.run(
            [
                CHROME,
                "--headless=new",
                "--disable-gpu",
                "--hide-scrollbars",
                "--force-device-scale-factor=2",
                f"--window-size={w},{h}",
                f"--screenshot={shot}",
                template.as_uri(),
            ],
            check=True,
            capture_output=True,
        )
        img = Image.open(shot).convert("RGB")
        if img.size != (w * 2, h * 2):
            print(f"  WARN {stem}: captured {img.size}, expected {(w*2, h*2)}", file=sys.stderr)
        img = img.resize((w, h), Image.LANCZOS)
        img.save(out_path, format="PNG", optimize=True)
    print(f"  {out_rel}  ({w}x{h})")


def main() -> int:
    if not Path(CHROME).exists():
        print(f"Chrome not found at {CHROME}", file=sys.stderr)
        return 1
    for stem, (w, h, out_rel) in ASSETS.items():
        render(stem, w, h, out_rel)
    print("\ndone. store assets in marketing/output/store/, ads in marketing/output/reddit/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
