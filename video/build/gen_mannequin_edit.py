#!/usr/bin/env python3
"""Mannequin-edit the real cup-case photographs (chapter 02).

Source: the team's no-device photo set (D:/Downloads/不戴设备版/第二版):
观察/思考/眼动/发力/行动. Each frame is edited with gpt-image so the person
becomes a white articulated mannequin while the room, table, cup, lighting and
framing stay exactly as photographed.

Outputs:
  video/assets/cup/model-{observe,think,gaze,force,act}.jpg   the mannequin edits
  video/assets/cup/real-{observe,think,gaze,force,act}.jpg   copies of the originals
"""
import base64
import io
import json
import os
import sys
import urllib.request
import uuid
from pathlib import Path

from PIL import Image

API = "https://zyapi.xmsxb.com/v1/images/edits"
MODEL = "gpt-image-2.5-flare"
SIZE = "1024x1536"          # portrait, to match the source photos' framing
ROOT = Path(__file__).resolve().parents[2]
SRC = Path(r"D:\Downloads\不戴设备版\第二版")
OUT = ROOT / "video" / "assets" / "cup"

MAP = {
    "observe": "观察.jpg",
    "think": "思考.jpg",
    "gaze": "眼动.jpg",
    "force": "发力.jpg",
    "act": "行动.jpg",
}

PROMPT = (
    "Edit this photograph: replace the real person with a life-size white articulated "
    "mannequin (artist's mannequin: matte ivory-white finish, smooth jointed limbs, "
    "featureless smooth head, no face, no hair, no clothing). Keep the room, the table, "
    "the cup, every object, the lighting, the camera angle and the framing exactly as in "
    "the photo, and give the mannequin exactly the pose of the person. Realistic, muted "
    "cool palette, soft daylight. No text, no lettering, no logos, no watermark."
)


def boundary(fields, files):
    b = uuid.uuid4().hex
    buf = io.BytesIO()
    for k, v in fields.items():
        buf.write(f"--{b}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode())
    for k, (fn, data, ctype) in files.items():
        buf.write(f"--{b}\r\nContent-Disposition: form-data; name=\"{k}\"; filename=\"{fn}\"\r\nContent-Type: {ctype}\r\n\r\n".encode())
        buf.write(data)
        buf.write(b"\r\n")
    buf.write(f"--{b}--\r\n".encode())
    return buf.getvalue(), f"multipart/form-data; boundary={b}"


def edit(path: Path) -> Image.Image:
    im = Image.open(path).convert("RGB")
    # downscale very large sources first, keeping the aspect
    if im.height > 1600:
        im = im.resize((round(im.width * 1600 / im.height), 1600), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=92)
    data, ctype = boundary({"model": MODEL, "prompt": PROMPT, "size": SIZE},
                           {"image": ("in.jpg", buf.getvalue(), "image/jpeg")})
    req = urllib.request.Request(API, data=data,
                                 headers={"Content-Type": ctype,
                                          "Authorization": f"Bearer {os.environ['IMAGE_API_KEY']}"})
    with urllib.request.urlopen(req, timeout=600) as r:
        payload = json.loads(r.read())
    item = payload["data"][0]
    if "b64_json" in item:
        return Image.open(io.BytesIO(base64.b64decode(item["b64_json"]))).convert("RGB")
    with urllib.request.urlopen(item["url"], timeout=120) as r:
        return Image.open(io.BytesIO(r.read())).convert("RGB")


def main() -> int:
    if "IMAGE_API_KEY" not in os.environ:
        sys.exit("IMAGE_API_KEY is not set")
    OUT.mkdir(parents=True, exist_ok=True)
    for key, fname in MAP.items():
        src = SRC / fname
        if not src.exists():
            print(f"{key:8s} SKIP (missing {src})")
            continue
        # keep a copy of the original as the fallback
        real = OUT / f"real-{key}.jpg"
        Image.open(src).convert("RGB").save(real, quality=90)
        dst = OUT / f"model-{key}.jpg"
        for attempt in range(3):
            try:
                im = edit(src)
                im.save(dst, quality=90, optimize=True, progressive=True)
                print(f"{key:8s} wrote model-{key}.jpg {im.width}x{im.height}")
                break
            except Exception as exc:
                print(f"{key:8s} attempt {attempt + 1} failed: {exc}")
                if attempt == 2:
                    print(f"{key:8s} FALLING BACK to the original photo")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
