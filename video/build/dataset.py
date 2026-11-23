#!/usr/bin/env python3
"""Build the episode payload the film draws for chapter 05.

Everything comes from the released preview episode in public/real/episode
(L3-001, "sort candies by colour"): the glove skeleton at 15 fps, the measured
VIVE poses (head + both wrists, position and orientation) at 15 fps, the gaze
sample, the EEG/EMG preview waveforms, the annotated task steps, and a
measured point cloud back-projected from the depth video with the episode's
own intrinsics. Nothing is synthesised.

Outputs under video/assets/l3/:
  data.js              window.L3 = {poses, hands, gaze, waves, steps, cloud, ...}
  depth.jpg            colourised depth still (from the same episode)
  moments/*.jpg        five step hero stills, head view
  mosaic/*.jpg         five steps x seven views, for the opening mosaic
"""
import json
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
EP = ROOT / 'public/real/episode'
OUT = ROOT / 'video/assets/l3'
MOM = OUT / 'moments'
MOSAIC = ROOT / 'video/assets/mosaic'
TMP = ROOT / '.work/frames'
TMP.mkdir(parents=True, exist_ok=True)

# view key -> source video in the episode folder
VIEWS = {
    'headband_left': 'main-headband-left.mp4',
    'headband_right': 'main-headband-right.mp4',
    'headband_bleft': 'main-headband-bleft.mp4',
    'headband_bright': 'main-headband-bright.mp4',
    'eye': 'main-eye.mp4',
    'wrist_left': 'main-wrist-left.mp4',
    'wrist_right': 'main-wrist-right.mp4',
    'depth': 'main-depth-gray.mp4',
}


def run(cmd):
    subprocess.run(list(map(str, cmd)), check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def grab(video, t, out):
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', f'{t:.3f}',
                    '-i', str(EP / video), '-frames:v', '1', str(out)], check=True)
    return np.asarray(Image.open(out).convert('RGB'))


def main():
    MOM.mkdir(parents=True, exist_ok=True)
    MOSAIC.mkdir(parents=True, exist_ok=True)

    sample = json.loads((EP / 'sample.json').read_text(encoding='utf-8'))
    frames = sample['frames']
    fps = sample['fps']
    duration = sample['duration']

    # ---- measured VIVE poses: head + both wrists, position + euler, at 15 fps ----
    poses = {}
    for key in ('head', 'left', 'right'):
        ps = []
        for f in frames[::2]:
            p = f['poses'][key]
            ps.append({
                'p': [round(v, 4) for v in p['position']],
                'e': [round(v, 3) for v in p['euler']],
            })
        poses[key] = ps
    poseRate = fps / 2

    # ---- glove skeleton (two blocks of 25 nodes), every other frame ----
    hands = []
    for f in frames[::2]:
        pos = f['skeleton']['positions']
        hands.append([[round(c, 4) for c in p] for p in pos])

    gaze = [[round(f['gaze']['xy'][0], 1), round(f['gaze']['xy'][1], 1)] for f in frames]

    # ---- waveforms: keep four representative channels, every other sample ----
    waves = {}
    for key, chans in (('eeg', [0, 2, 4, 6]), ('leftEmg', [0, 2, 5, 7]), ('rightEmg', [0, 2, 5, 7])):
        w = sample['waveforms'][key]
        vals = w['values'][::2]
        waves[key] = {
            'channels': [w['channels'][i] for i in chans],
            'rate': w['sampleRate'] / 2,
            'series': [[round(v[i], 1) for v in vals] for i in chans],
        }

    # ---- annotated task steps (finer division of the episode) ----
    ann = json.loads((EP / 'annotations.json').read_text(encoding='utf-8'))
    # English labels for the film, trimmed of the annotation template's
    # duplicated "candies candy wrappers" phrasing.
    clean_labels = ['approach the table', 'reach for the candies', 'sort and group by colour',
                    'continue sorting', 'final placement']
    steps = [
        {'id': f'step{i + 1}', 'label': label, 't': round(seg['start'] + (seg['end'] - seg['start']) / 2, 2),
         't0': round(seg['start'], 2), 't1': round(seg['end'], 2)}
        for i, (label, seg) in enumerate(zip(clean_labels, ann['timing']['segments']))
    ]

    # ---- measured point cloud from one depth frame ----
    meta = json.loads((EP / 'depth.json').read_text(encoding='utf-8'))
    near, far = meta['nearM'], meta['farM']
    K = meta['intrinsics']
    depth_img = grab('main-depth-gray.mp4', 8.0, TMP / 'depth.png')
    color_img = grab('main-rect-left.mp4', 8.0, TMP / 'color.png')
    H, W = depth_img.shape[:2]
    GW, GH = 256, round(256 * H / W)
    d = np.asarray(Image.fromarray(depth_img).resize((GW, GH), Image.BILINEAR))[:, :, 0]
    c = np.asarray(Image.fromarray(color_img).resize((GW, GH), Image.BILINEAR))
    fx = K['fx'] * GW / K['width']
    fy = K['fy'] * GH / K['height']
    cx = K['cx'] * GW / K['width']
    cy = K['cy'] * GH / K['height']
    yy, xx = np.mgrid[0:GH, 0:GW]
    g = d.astype(np.float32) / 255.0
    z = near + g * (far - near)
    keep = (d > 6) & (z > near) & (z < far * 0.92)
    x = (xx + 0.5 - cx) / fx * z
    y = (yy + 0.5 - cy) / fy * z
    pts = np.stack([x[keep], y[keep], z[keep]], axis=1).astype(np.float32)
    cols = c[keep].astype(np.uint8)
    rng = np.random.default_rng(7)
    sel = rng.random(len(pts)) < 0.55
    pts, cols = pts[sel], cols[sel]
    q = np.round(pts * 1000).astype(np.int16)
    depths = np.round(np.clip((pts[:, 2] - near) / (far - near), 0, 1) * 255).astype(np.uint8)
    print(f'cloud {len(q)} points, depth range {near}-{far} m')

    # ---- colourised depth still (turbo) ----
    zc = np.clip((d.astype(np.float32) / 255.0 * (far - near) + near - near) / (far - near), 0, 1)
    stops = np.array([[0.19, 0.07, 0.23], [0.16, 0.47, 0.99], [0.10, 0.75, 0.82],
                      [0.98, 0.74, 0.22], [0.84, 0.19, 0.15], [0.48, 0.02, 0.08]])
    n = len(stops) - 1
    xi = np.clip(zc, 0, 1) * n
    i = np.clip(xi.astype(int), 0, n - 1)
    fr = (xi - i)[..., None]
    rgb = (stops[i] * (1 - fr) + stops[i + 1] * fr)
    Image.fromarray((rgb * 255).astype(np.uint8)).resize((480, 300), Image.LANCZOS).save(OUT / 'depth.jpg', quality=88)

    # ---- step hero stills + opening mosaic ----
    for st in steps:
        t = st['t']
        hero = grab('main-headband-left.mp4', t, TMP / 'hero.png')
        Image.fromarray(hero).thumbnail((640, 400))
        Image.fromarray(hero).save(MOM / f"{st['id']}.jpg", quality=86)
        for view, video in VIEWS.items():
            if view == 'depth':
                continue
            img = grab(video, t, TMP / 'mos.png')
            thumb = Image.fromarray(img)
            thumb.thumbnail((480, 300))
            thumb.save(MOSAIC / f"{st['id']}_{view}.jpg", quality=82)

    data = {
        'fps': fps,
        'frames': len(frames),
        'duration': round(duration, 2),
        'task': 'Sort candies by colour',
        'episode': 'L3-001',
        'poseRate': round(poseRate, 2),
        'poses': poses,
        'hands': hands,
        'handRate': round(fps / 2, 2),
        'gaze': gaze,
        'waves': waves,
        'steps': steps,
        'cloud': {
            'points': q.reshape(-1).tolist(),
            'colors': cols.reshape(-1).tolist(),
            'depths': depths.reshape(-1).tolist(),
            'near': near,
            'far': far,
        },
    }
    (OUT / 'data.js').write_text('window.L3 = ' + json.dumps(data, separators=(',', ':')) + ';\n')
    print('wrote', OUT / 'data.js', f"{(OUT / 'data.js').stat().st_size / 1e6:.2f} MB")
    print('steps:', ', '.join(s['label'] for s in steps))
    print('mosaic', len(list(MOSAIC.glob('*.jpg'))), 'stills')


if __name__ == '__main__':
    main()
