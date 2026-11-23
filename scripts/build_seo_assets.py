#!/usr/bin/env python3
"""Build the social card and the tab icons.

Three assets, all derived from art the release already ships:

* ``public/og-cover.jpg`` — the 1200x630 card Open Graph and Twitter consumers
  render. It is a centre crop of the film's title frame (``film-poster.jpg``),
  chosen instead of a freshly composed card because the frame already carries
  the wordmark, the subtitle and the release numbers at print quality, so the
  card cannot drift from the film.
* ``public/favicon.ico`` / ``public/favicon-32.png`` — the tab mark: the
  wordmark's initial set in the navy sampled off the poster.
* ``public/apple-touch-icon.png`` — the same mark at 180 px, unpadded, because
  iOS applies its own corner mask.

The site's own faces (Jost, Montserrat) ship as woff2 only, which Pillow cannot
open, so the mark is drawn in DejaVu Sans Bold — at 16-32 px the difference in
letterform is not visible, and the tile keeps the brand colour.

Run from the repo root: ``python3 scripts/build_seo_assets.py``.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
POSTER = ROOT / 'public' / 'film' / 'film-poster.jpg'
PUBLIC = ROOT / 'public'

# Sampled from the wordmark on the film's title frame.
NAVY = (19, 33, 44)
WHITE = (255, 255, 255)

# 1200x630 is the ratio every social consumer crops to; the poster is 16:9, so
# the crop takes the full width and trims 36 px off the top and bottom, which
# keeps the title block centred and leaves one row of takes on either side.
CARD_SIZE = (1200, 630)


def build_card() -> None:
    poster = Image.open(POSTER).convert('RGB')
    w, h = poster.size
    target_ratio = CARD_SIZE[0] / CARD_SIZE[1]
    crop_h = round(w / target_ratio)
    top = (h - crop_h) // 2
    card = poster.crop((0, top, w, top + crop_h)).resize(CARD_SIZE, Image.LANCZOS)
    out = PUBLIC / 'og-cover.jpg'
    card.save(out, 'JPEG', quality=88, optimize=True, progressive=True)
    print(f'{out.relative_to(ROOT)}  {CARD_SIZE[0]}x{CARD_SIZE[1]}  {out.stat().st_size // 1024} KB')


def _font(size: int) -> ImageFont.FreeTypeFont:
    """DejaVu Sans Bold at the requested size, wherever the system keeps it."""
    for path in (
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
        '/Library/Fonts/DejaVuSans-Bold.ttf',
    ):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    raise SystemExit('DejaVu Sans Bold not found; install fonts-dejavu-core')


def build_mark() -> None:
    """Draw the tile at 1024 px, then resample — cheap anti-aliasing."""
    s = 1024
    tile = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(tile)
    d.rounded_rectangle((0, 0, s - 1, s - 1), radius=round(s * 0.22), fill=NAVY)

    font = _font(round(s * 0.74))
    # "C" in DejaVu Bold sits slightly high inside its em box; 'mm' anchors on
    # the glyph box, so a couple of pixels of optical centring is all it needs.
    d.text((s / 2, s * 0.505), 'C', font=font, fill=WHITE, anchor='mm')

    for size, name in ((180, 'apple-touch-icon.png'), (32, 'favicon-32.png')):
        out = PUBLIC / name
        tile.resize((size, size), Image.LANCZOS).save(out, 'PNG', optimize=True)
        print(f'{out.relative_to(ROOT)}  {size}x{size}  {out.stat().st_size // 1024} KB')

    ico = PUBLIC / 'favicon.ico'
    tile.resize((48, 48), Image.LANCZOS).save(
        ico, sizes=[(16, 16), (32, 32), (48, 48)]
    )
    print(f'{ico.relative_to(ROOT)}  16/32/48  {ico.stat().st_size // 1024} KB')


if __name__ == '__main__':
    build_card()
    build_mark()
