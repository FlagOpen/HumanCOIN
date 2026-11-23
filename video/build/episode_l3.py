#!/usr/bin/env python3
"""Build the L3-003 (sandwich) payload for the film.

Source (read-only, provided by the team):
  .../L3-003-2026-11-10-16-55-24 (3)

Outputs under video/assets/l3/:
  vid/*.mp4          seven preview views, 640 px, 37.5 s
  depth.jpg          colourised depth at the grasp frame
  moments/*.jpg      five key moments, head view
  data.js            hand skeleton, gaze, EEG, EMG, point cloud
Mosaic stills for the opening go to video/assets/mosaic/.
"""
import json
import subprocess
from pathlib import Path

import numpy as np
import pyarrow.parquet as pq
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
BASE = Path('/home/baai/文档/xwechat_files/wxid_587esexgaddy22_38af/msg/file/2026-11/L3-003-2026-11-10-16-55-24 (3)')
OUT = ROOT / 'video/assets/l3'
VID = OUT / 'vid'
MOM = OUT / 'moments'
MOSAIC = ROOT / 'video/assets/mosaic'
DATA = BASE / 'data/chunk-000/episode_000000'
FPS = 30
FRAMES = 1126
DUR = FRAMES / FPS

VIEWS = {
    'headband_left': 'observation.images.headband_left_rgb',
    'headband_right': 'observation.images.headband_right_rgb',
    'headband_bleft': 'observation.images.headband_bleft_rgb',
    'headband_bright': 'observation.images.headband_bright_rgb',
    'wrist_left': 'observation.images.left_wrist_rgb',
    'wrist_right': 'observation.images.right_wrist_rgb',
    'eye': 'observation.images.eye_rgb',
}
MOMENTS = [('start', 300, 'start'), ('reach', 814, ''), ('grasp', 829, 'grasp'),
           ('place', 852, ''), ('end', 1123, 'assemble')]


def run(cmd):
    subprocess.run(list(map(str, cmd)), check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def nearest(ts, target):
    i = np.searchsorted(ts, target).clip(1, len(ts) - 1)
    return np.where(np.abs(ts[i - 1] - target) <= np.abs(ts[i] - target), i - 1, i)


def turbo(t):
    stops = np.array([[0.19, 0.07, 0.23], [0.16, 0.47, 0.99], [0.10, 0.75, 0.82],
                      [0.98, 0.74, 0.22], [0.84, 0.19, 0.15], [0.48, 0.02, 0.08]])
    n = len(stops) - 1
    x = np.clip(t, 0, 1) * n
    i = np.clip(x.astype(int), 0, n - 1)
    f = (x - i)[..., None]
    return stops[i] * (1 - f) + stops[i + 1] * f


def main():
    for d in (VID, MOM, MOSAIC):
        d.mkdir(parents=True, exist_ok=True)

    # ---- preview videos ----
    for name, feat in VIEWS.items():
        out = VID / f'{name}.mp4'
        if out.exists():
            continue
        src = BASE / 'videos/chunk-000' / feat / 'episode_000000.mp4'
        run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-t', f'{DUR:.2f}',
             '-vf', 'scale=640:-2', '-an', '-c:v', 'libx264', '-preset', 'veryfast',
             '-crf', '27', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out])

    # ---- depth still, colourised ----
    depth = np.asarray(Image.open(BASE / 'png/814_reach/depth_mm.png')).astype(np.float32)
    z = np.clip((depth - 250) / (1150 - 250), 0, 1)
    rgb = (turbo(1 - z) * 255).astype(np.uint8)
    depth_img = Image.fromarray(rgb).resize((960, 592), Image.LANCZOS)
    depth_img.save(OUT / 'depth.jpg', quality=90)

    # ---- point cloud at the grasp frame ----
    gx, gy = 240, 148
    small = np.asarray(Image.open(BASE / 'png/814_reach/depth_mm.png').resize((gx, gy), Image.BILINEAR)).astype(np.float32)
    color = np.asarray(Image.open(BASE / 'png/814_reach/headband_left_rgb_rectified.png').resize((gx, gy), Image.BILINEAR))
    fx, fy, cx, cy = 793.8082633621543, 793.8082633621543, 931.0771331787109, 599.3062973022461
    yy, xx = np.mgrid[0:gy, 0:gx]
    zz = small / 1000.0
    keep = (zz > 0.22) & (zz < 1.1)
    X = (xx + 0.5) / gx * 1920
    Y = (yy + 0.5) / gy * 1184
    pts = np.stack([(X - cx) / fx * zz, (Y - cy) / fy * zz, zz], axis=2)[keep]
    cols = color[keep]
    depths = np.clip((pts[:, 2] - 0.22) / (1.1 - 0.22), 0, 1)
    sel = np.random.default_rng(3).random(len(pts)) < 0.7
    pts, cols, depths = pts[sel], cols[sel], depths[sel]
    print('cloud', len(pts))

    # ---- signals ----
    tsk = pq.read_table(DATA / 'observation.hand_skeleton.parquet')
    ts = tsk.column('timestamp').to_numpy()
    cols_names = tsk.column_names
    node_cols = [c for c in cols_names if c.startswith('node')]
    skel = np.array([tsk.column(c).to_numpy() for c in node_cols]).T.reshape(-1, 50, 6)[:, :, :3]
    master_t = np.arange(FRAMES) / FPS
    idx = nearest(ts, master_t)
    skel30 = skel[idx]
    skel15 = skel30[::2]

    tg = pq.read_table(DATA / 'observation.eye_gaze.parquet')
    gt = tg.column('timestamp').to_numpy()
    gaze = np.stack([tg.column('x').to_numpy(), tg.column('y').to_numpy()], axis=1)[nearest(gt, master_t)]

    def series(feature, cols, rate=60):
        t = pq.read_table(DATA / f'{feature}.parquet')
        tt = t.column('timestamp').to_numpy()
        arr = np.mean([t.column(c).to_numpy() for c in cols], axis=0)
        bins = np.arange(0, DUR, 1 / rate)
        out = np.interp(bins, tt, arr)
        return [round(float(v), 1) for v in out]

    eeg_cols = [c for c in pq.read_table(DATA / 'observation.eeg.parquet').column_names if c in ('C3', 'C4')]
    emg_cols = [f'dim_{i}' for i in range(8)]
    def multi(feature, cols, rate=60, scale=1.0):
        t = pq.read_table(DATA / f'{feature}.parquet')
        tt = t.column('timestamp').to_numpy()
        bins = np.arange(0, DUR, 1 / rate)
        out = []
        for c in cols:
            arr = t.column(c).to_numpy() * scale
            out.append([round(float(v), 1) for v in np.interp(bins, tt, arr)])
        return out

    waves = {
        'eeg': {'label': 'EEG', 'rate': 60, 'channels': ['C3', 'C4', 'P3', 'P4'],
                'series': multi('observation.eeg', ['C3', 'C4', 'P3', 'P4'])},
        'emg': {'label': 'EMG', 'rate': 60, 'channels': ['ch1', 'ch2', 'ch3', 'ch4'],
                'series': multi('observation.left_wrist_emg', ['dim_0', 'dim_1', 'dim_2', 'dim_3'])},
        'gaze': {'label': 'GAZE', 'rate': 60, 'channels': ['x', 'y'],
                 'series': multi('observation.eye_gaze', ['x', 'y'])},
    }

    # ---- moments + mosaic ----
    moment_meta = []
    for name, idx, label in MOMENTS:
        t = idx / FPS
        moment_meta.append({'id': name, 't': round(t, 2), 'label': label})
    for name, idx, label in MOMENTS:
        for view, feat in VIEWS.items():
            src = BASE / 'png' / f'{idx}_{name}' / f'{view.replace("wrist_", "")}_rgb.png'
            # the png folders use left_wrist_rgb / right_wrist_rgb
            if not src.exists():
                src = BASE / 'png' / f'{idx}_{name}' / ('left_wrist_rgb.png' if view == 'wrist_left' else
                                                          'right_wrist_rgb.png' if view == 'wrist_right' else
                                                          f'{view}_rgb.png')
            if not src.exists():
                continue
            im = Image.open(src)
            im.thumbnail((480, 300))
            im.save(MOSAIC / f'{name}_{view}.jpg', quality=82)
    # moments hero stills: headband_left
    for name, idx, label in MOMENTS:
        src = BASE / 'png' / f'{idx}_{name}' / 'headband_left_rgb.png'
        if src.exists():
            im = Image.open(src)
            im.thumbnail((640, 400))
            im.save(MOM / f'{name}.jpg', quality=86)

    data = {
        'fps': FPS, 'frames': FRAMES, 'duration': round(DUR, 2),
        'hands': [[[round(float(v) * 1000) for v in node] for node in frame] for frame in skel15],
        'handRate': 15,
        'gaze': [[round(float(x), 1), round(float(y), 1)] for x, y in gaze],
        'waves': waves,
        'cloud': {
            'points': np.round(pts * 1000).astype(np.int16).reshape(-1).tolist(),
            'colors': [int(v) for v in cols.reshape(-1)],
            'depths': [int(v) for v in (depths * 255).astype(np.uint8).reshape(-1)],
        },
        'moments': moment_meta,
        'task': 'Assemble a sandwich',
        'episode': 'L3-003-2026-11-10-16-55-24',
    }
    (OUT / 'data.js').write_text('window.L3 = ' + json.dumps(data, separators=(',', ':')) + ';\n')
    print('wrote', OUT / 'data.js', f"{(OUT / 'data.js').stat().st_size / 1e6:.2f} MB")
    print('mosaic', len(list(MOSAIC.glob('*.jpg'))), 'stills')


if __name__ == '__main__':
    main()
