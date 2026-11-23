#!/usr/bin/env python3
"""Generate the mannequin ('human model') versions of the cup-case photos
for film chapter 02, with gpt-image (same endpoint as scripts/generate_fig2_images.py).

The four source photos show a real person with no devices reaching for a mug.
For the film they are re-rendered with the person replaced by a life-size
white articulated mannequin — same room, same mug, same framing — so the
chapter stays about the loop, not about an identifiable person.

Usage:
    python3 video/build/gen_mannequin.py            # generate all four
    python3 video/build/gen_mannequin.py --only reach,grasp
Output: video/assets/cup/model-{think,reach,grasp,hold}.jpg
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image

API_URL = "https://zyapi.xmsxb.com/v1/images/generations"
MODEL = "gpt-image-2.5-flare"
ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "video" / "assets" / "cup"
OUT = SRC
STATE = Path(__file__).resolve().parent / ".mannequin-state.json"

BASE = (
    "Photo edit of an egocentric-manipulation dataset demonstration: replace the person "
    "in the photograph with a life-size white articulated mannequin (artist's mannequin: "
    "matte ivory-white finish, smooth jointed limbs, featureless smooth head with no face, "
    "no hair, no clothing, no seams of skin). Keep the room, the table, the mug, the "
    "lighting and the camera framing exactly as in the source photo. Muted cool palette, "
    "soft daylight, shallow depth of field, realistic and understated. No text, no "
    "lettering, no logos, no watermark, no UI overlay. The mannequin's pose must match "
    "the person's pose."
)

PHASES = {
    "think": "The mannequin stands at the table looking down at the mug, hands resting "
             "lightly on the table edge, still, as if deciding.",
    "reach": "The mannequin leans slightly toward the table, one arm extended toward the "
             "mug, fingers open and approaching the mug but not yet touching it.",
    "grasp": "The mannequin's articulated hand closes around the mug on the table, "
             "fingers wrapped, just lifting its weight.",
    "hold": "The mannequin lifts the mug off the table, holding it in front of its chest, "
             "arm raised, mug clearly in hand.",
}


def encode_image(path: Path) -> str:
    with Image.open(path) as im:
        im = im.convert("RGB")
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=90)
    return base64.b64encode(buf.getvalue()).decode()


def request(prompt: str, image_b64: str | None) -> Image.Image:
    body: dict = {"model": MODEL, "prompt": prompt, "size": "1536x1024"}
    if image_b64:
        body["image"] = [f"data:image/jpeg;base64,{image_b64}"]
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        API_URL,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {os.environ['IMAGE_API_KEY']}",
        },
    )
    with urllib.request.urlopen(req, timeout=600) as response:
        payload = json.loads(response.read())
    item = payload["data"][0]
    if "b64_json" in item:
        return Image.open(io.BytesIO(base64.b64decode(item["b64_json"]))).convert("RGB")
    if "url" in item:
        with urllib.request.urlopen(item["url"], timeout=120) as resp:
            return Image.open(io.BytesIO(resp.read())).convert("RGB")
    raise RuntimeError(f"unexpected payload keys: {sorted(item.keys())}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", help="comma-separated phase names")
    args = parser.parse_args()

    if "IMAGE_API_KEY" not in os.environ:
        sys.exit("IMAGE_API_KEY is not set")

    keys = list(PHASES)
    if args.only:
        wanted = {k.strip() for k in args.only.split(",") if k.strip()}
        keys = [k for k in keys if k in wanted]
        if not keys:
            sys.exit(f"no such phase; choose from {', '.join(PHASES)}")

    state = json.loads(STATE.read_text()) if STATE.exists() else {}
    for key in keys:
        src = SRC / f"{key}.jpg"
        dst = SRC / f"model-{key}.jpg"
        if not src.exists():
            print(f"{key:6s} SKIP (no source photo {src.name})")
            continue
        if dst.exists() and not args.only:
            print(f"{key:6s} SKIP (already generated; pass --only {key} to redo)")
            continue
        started = time.time()
        print(f"{key:6s} generating ...", flush=True)
        try:
            # Edit first: keep the source's framing. Fall back to pure generation.
            try:
                image = request(f"{BASE} Phase: {PHASES[key]}", encode_image(src))
            except (urllib.error.HTTPError, urllib.error.URLError) as exc:
                print(f"  edit call failed ({exc}); retrying as generation", flush=True)
                image = request(f"{BASE} Scene from scratch: {PHASES[key]}", None)
        except (urllib.error.HTTPError, urllib.error.URLError, KeyError, RuntimeError) as exc:
            print(f"{key:6s} FAILED: {exc}", flush=True)
            continue
        if image.width > 1280:
            image = image.resize((1280, round(image.height * 1280 / image.width)), Image.LANCZOS)
        image.save(dst, quality=88, optimize=True, progressive=True)
        state[key] = {
            "prompt": f"{BASE} Phase: {PHASES[key]}",
            "model": MODEL,
            "size": [image.width, image.height],
            "seconds": round(time.time() - started, 1),
        }
        STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n")
        print(f"{key:6s} wrote {dst.relative_to(ROOT)}  {time.time() - started:5.1f}s", flush=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
