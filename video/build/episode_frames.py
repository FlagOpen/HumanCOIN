#!/usr/bin/env python3
"""Prepare the episode's playable panels for the film.

For render mode (frame-accurate capture) the film cannot rely on <video>
seeking: each frame of the final MP4 must be deterministic. So every view is
additionally extracted to a JPEG sequence at 15 fps. The live web player keeps
using the MP4s.

Outputs under video/assets/l3/:
  vid/*.mp4           seven preview views, 640 px (L3-001 release)
  frames/<view>/      %05d.jpg frame sequences at 15 fps
"""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EP = ROOT / 'public/real/episode'
OUT = ROOT / 'video/assets/l3'
VID = OUT / 'vid'
FRAMES = OUT / 'frames'
FPS = 15

VIEWS = {
    'headband_left': 'main-headband-left.mp4',
    'headband_right': 'main-headband-right.mp4',
    'headband_bleft': 'main-headband-bleft.mp4',
    'headband_bright': 'main-headband-bright.mp4',
    'eye': 'main-eye.mp4',
    'wrist_left': 'main-wrist-left.mp4',
    'wrist_right': 'main-wrist-right.mp4',
}


def run(cmd):
    subprocess.run(list(map(str, cmd)), check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main():
    VID.mkdir(parents=True, exist_ok=True)
    FRAMES.mkdir(parents=True, exist_ok=True)

    for name, src in VIEWS.items():
        # live player copy
        out = VID / f'{name}.mp4'
        run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(EP / src),
             '-vf', 'scale=640:-2', '-an', '-c:v', 'libx264', '-preset', 'veryfast',
             '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(out)])

        # deterministic render frames at 15 fps
        d = FRAMES / name
        d.mkdir(parents=True, exist_ok=True)
        run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(EP / src),
             '-vf', f'fps={FPS},scale=640:-2', '-q:v', '3', str(d / '%05d.jpg')])
        n = len(list(d.glob('*.jpg')))
        print(f'{name:16s} mp4 {out.stat().st_size / 1e6:5.1f} MB · frames {n}')


if __name__ == '__main__':
    main()
