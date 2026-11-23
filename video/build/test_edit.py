#!/usr/bin/env python3
"""Test the gpt-image *edit* endpoint on the real cup-case photos.

Tries, in order:
  1. POST /v1/images/edits  (multipart, OpenAI-style)  model=gpt-image-2.5-flare
  2. POST /v1/images/edits  model=gpt-image-1
  3. POST /v1/images/generations with {"image": [b64]} model=gpt-image-2.5-flare

Writes the first success for each source photo to
video/assets/cup/edit-test/<name>.jpg
"""
import base64
import io
import json
import mimetypes
import os
import sys
import urllib.request
import uuid
from pathlib import Path

from PIL import Image

API = "https://zyapi.xmsxb.com/v1"
SRC = Path(r"D:\Downloads\不戴设备版\第二版")
OUT = Path(r"C:\Projects\HumanCOIN\display\video\assets\cup\edit-test")
KEY = os.environ.get("IMAGE_API_KEY") or (sys.argv[1] if len(sys.argv) > 1 else None)
if not KEY:
    sys.exit("need IMAGE_API_KEY")

OUT.mkdir(parents=True, exist_ok=True)

PROMPT = (
    "Edit this photograph: replace the real person with a life-size white articulated mannequin "
    "(artist's mannequin: matte ivory-white finish, smooth jointed limbs, featureless smooth head, "
    "no face, no hair). Keep the room, table, objects, lighting, camera angle and framing exactly "
    "as in the photo; the mannequin's pose must match the person's pose. Realistic, muted cool "
    "palette, soft daylight. No text, no logos, no watermark."
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


def post_json(url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json",
                                          "Authorization": f"Bearer {KEY}"})
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.loads(r.read())


def post_edit(model, path):
    img = Image.open(path).convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=92)
    data, ctype = boundary({"model": model, "prompt": PROMPT, "size": "1536x1024"},
                           {"image": ("in.jpg", buf.getvalue(), "image/jpeg")})
    req = urllib.request.Request(f"{API}/images/edits", data=data,
                                 headers={"Content-Type": ctype, "Authorization": f"Bearer {KEY}"})
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.loads(r.read())


def save(payload, out):
    item = payload["data"][0]
    if "b64_json" in item:
        im = Image.open(io.BytesIO(base64.b64decode(item["b64_json"]))).convert("RGB")
    elif "url" in item:
        with urllib.request.urlopen(item["url"], timeout=120) as r:
            im = Image.open(io.BytesIO(r.read())).convert("RGB")
    else:
        raise RuntimeError(f"keys: {sorted(item.keys())}")
    im.save(out, quality=90)
    print(f"  wrote {out} {im.width}x{im.height}")


for name in ("观察", "思考", "眼动", "发力", "行动"):
    src = SRC / f"{name}.jpg"
    if not src.exists():
        continue
    print(f"{name}: ", end="", flush=True)
    ok = False
    for attempt, fn in (
        ("edits/gpt-image-2.5-flare", lambda: post_edit("gpt-image-2.5-flare", src)),
        ("edits/gpt-image-1", lambda: post_edit("gpt-image-1", src)),
        ("generations+image b64", lambda: post_json(f"{API}/images/generations", {
            "model": "gpt-image-2.5-flare", "prompt": PROMPT, "size": "1536x1024",
            "image": ["data:image/jpeg;base64," + base64.b64encode(open(src, "rb").read()).decode()]})),
    ):
        try:
            payload = fn()
            save(payload, OUT / f"{name}.jpg")
            print(f"    OK via {attempt}")
            ok = True
            break
        except Exception as exc:
            print(f"    {attempt}: {exc}")
    if not ok:
        print("    ALL FAILED")
