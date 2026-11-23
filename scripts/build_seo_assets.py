#!/usr/bin/env python3
"""Build the social card and the tab icons.

Two inputs, both art the release already ships:

* the film's title frame (``public/film/film-poster.jpg``) — cropped to the
  1200x630 card Open Graph and Twitter consumers render. Chosen over a freshly
  composed card because the frame already carries the wordmark, the subtitle
  and the release numbers at print quality, so the card cannot drift from the
  film.
* the masthead mascot (``public/logos/humancoin-mark.png``) — the supplied art
  with its flat #e5e5e5 ground keyed out to alpha. That master is the source of
  truth; this script only derives the sizes browsers ask for. It is kept
  transparent, so a tab strip shows the mark directly rather than inside a
  white box, and a white-ink copy is emitted for dark tab strips where a black
  mark would disappear.

Run from the repo root: ``python3 scripts/build_seo_assets.py``.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / 'public'
POSTER = PUBLIC / 'film' / 'film-poster.jpg'
MARK = PUBLIC / 'logos' / 'humancoin-mark.png'

# 1200x630 is the ratio every social consumer crops to; the poster is 16:9, so
# the crop takes the full width and trims 36 px off the top and bottom, which
# keeps the title block centred and leaves one row of takes on either side.
CARD_SIZE = (1200, 630)

WHITE = (255, 255, 255)


def build_card() -> None:
    poster = Image.open(POSTER).convert('RGB')
    w, h = poster.size
    crop_h = round(w / (CARD_SIZE[0] / CARD_SIZE[1]))
    top = (h - crop_h) // 2
    card = poster.crop((0, top, w, top + crop_h)).resize(CARD_SIZE, Image.LANCZOS)
    out = PUBLIC / 'og-cover.jpg'
    card.save(out, 'JPEG', quality=88, optimize=True, progressive=True)
    print(f'{out.relative_to(ROOT)}  {CARD_SIZE[0]}x{CARD_SIZE[1]}  {out.stat().st_size // 1024} KB')


def _fit(mark: Image.Image, size: int, fill: float) -> Image.Image:
    """Scale the mark into a `size` square, keeping its aspect and some air."""
    w, h = mark.size
    scale = (size * fill) / max(w, h)
    return mark.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)


def _tile(size: int, *, fill: float, ground: tuple[int, int, int] | None = None,
          ink: tuple[int, int, int] | None = None) -> Image.Image:
    """The mark centred on a square, transparent unless `ground` asks otherwise."""
    mark = Image.open(MARK).convert('RGBA')
    glyph = _fit(mark, size, fill)
    if ink is not None:
        alpha = glyph.getchannel('A')
        glyph = Image.merge('RGBA', (Image.new('L', glyph.size, ink[0]),
                                     Image.new('L', glyph.size, ink[1]),
                                     Image.new('L', glyph.size, ink[2]), alpha))
    tile = Image.new('RGBA', (size, size), (*ground, 255) if ground else (0, 0, 0, 0))
    tile.alpha_composite(glyph, ((size - glyph.width) // 2, (size - glyph.height) // 2))
    return tile


def build_icons() -> None:
    if not MARK.exists():
        raise SystemExit(f'missing master art: {MARK}')

    # Favicons sit tight in their box — 16 px is not a place to waste margin.
    favicon = _tile(256, fill=0.96)
    ico = PUBLIC / 'favicon.ico'
    favicon.save(ico, sizes=[(16, 16), (32, 32), (48, 48)])
    print(f'{ico.relative_to(ROOT)}  16/32/48  {ico.stat().st_size // 1024} KB')

    for size, name, ink in (
        (32, 'favicon-32.png', None),
        (32, 'favicon-32-dark.png', WHITE),
    ):
        tile = favicon.resize((size, size), Image.LANCZOS) if ink is None else _tile(size, fill=0.96, ink=ink)
        out = PUBLIC / name
        tile.save(out, 'PNG', optimize=True)
        print(f'{out.relative_to(ROOT)}  {size}x{size}  {out.stat().st_size // 1024} KB')

    # iOS fills alpha with black, which would swallow a black mark, so this one
    # is the only icon that gets a ground.
    touch = _tile(180, fill=0.84, ground=WHITE)
    out = PUBLIC / 'apple-touch-icon.png'
    touch.convert('RGB').save(out, 'PNG', optimize=True)
    print(f'{out.relative_to(ROOT)}  180x180  {out.stat().st_size // 1024} KB')


if __name__ == '__main__':
    build_card()
    build_icons()
