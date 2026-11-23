#!/usr/bin/env python3
"""Build the 60-second cut.

Same footage, a new edit: ten short lines of narration, and a shot list that
jumps between the strongest moments of the long film. Because the long film
renders any time t on demand, the short film is just a mapping from output
time to source time — no re-authoring of scenes, no duplicated assets.

Outputs
  video/audio/short.m4a       the 60 s voice track
  video/short-data.js         beats, shots (output → source), captions
"""
import asyncio
import json
import re
import subprocess
import wave
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parents[2]
VIDEO = ROOT / 'video'
AUDIO = VIDEO / 'audio'
BEATS = AUDIO / 'short-beats'
VOICE = 'en-US-AndrewNeural'
RATE = '-2%'
PRE = 0.35          # picture leads the voice by a third of a second

# Ten lines. ~135 spoken words, about 56 seconds at this voice's pace.
SCRIPT = [
    ('s1', 'HumanCOIN. Twelve thousand five hundred hours of human intent.', 0.30),
    ('s2', 'A policy maps observation to action. But one frame precedes a lift, '
           'a pause, an abandoned attempt. Intent is missing.', 0.26),
    ('s3', 'In a person, intent is a pathway: cognition, gaze, movement.', 0.26),
    ('s4', 'It leaves traces. EEG before movement. EMG before contact. '
           'Gaze before the hand.', 0.26),
    ('s5', 'So we recorded three depths: ten thousand hours of attention, two '
           'thousand of exertion, five hundred of cognition, each inheriting '
           'the one below.', 0.26),
    ('s6', 'One clock. Six views. Depth, point cloud, twenty joint angles per hand.', 0.24),
    ('s7', 'Thirty-eight scenes, ninety-nine verbs, six hundred and thirty-five objects.', 0.24),
    ('s8', 'Twenty-three asynchronous tables, aligned at query time.', 0.24),
    ('s9', 'Led by BAAI, with twenty-seven institutions.', 0.24),
    ('s10', 'One command to install. Welcome to HumanCOIN.', 0.4),
]

# Where each beat looks in the long film. (source start, relative weight).
# Windows sit on fully-formed moments so a cut never lands mid-animation.
SHOTS = {
    's1': [(0.75, 1.0)],
    's2': [(15.40, 1.30), (22.00, 1.00), (26.40, 0.80)],
    's3': [(37.45, 1.0)],
    's4': [(70.35, 1.0)],
    's5': [(108.40, 1.0)],
    's6': [(125.10, 1.00), (129.75, 0.85), (134.90, 0.70)],
    's7': [(151.40, 1.00), (159.75, 0.95)],
    's8': [(191.20, 1.0)],
    's9': [(199.20, 1.0)],
    's10': [(213.90, 1.0)],
}


def run(cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def wav_duration(path):
    with wave.open(str(path), 'rb') as w:
        return w.getnframes() / float(w.getframerate())


async def synth(bid, text):
    out = BEATS / f'{bid}.mp3'
    wav = BEATS / f'{bid}.wav'
    cache = BEATS / f'{bid}.json'
    key = f'{VOICE}|{RATE}|{text}'
    if wav.exists() and cache.exists():
        saved = json.loads(cache.read_text())
        if saved.get('key') == key:
            return saved['words'], wav
    words, last = [], None
    for attempt in range(5):
        try:
            words = []
            communicate = edge_tts.Communicate(text, VOICE, rate=RATE, boundary='WordBoundary')
            with open(out, 'wb') as fh:
                async for chunk in communicate.stream():
                    if chunk['type'] == 'audio':
                        fh.write(chunk['data'])
                    elif chunk['type'] == 'WordBoundary':
                        words.append({
                            'text': chunk['text'],
                            'offset': chunk['offset'] / 10_000_000,
                            'dur': chunk['duration'] / 10_000_000,
                        })
            if out.stat().st_size > 2000:
                break
            raise RuntimeError('short audio')
        except Exception as exc:
            last = exc
            print(f'  retry {bid} ({attempt + 1}/5): {exc}')
            await asyncio.sleep(2.5 * (attempt + 1))
    else:
        raise SystemExit(f'tts failed for {bid}: {last}')
    run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(out),
         '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', str(wav)])
    out.unlink()
    cache.write_text(json.dumps({'key': key, 'words': words}))
    return words, wav


def captions(words, start, end, text):
    tokens = re.findall(r'\S+', text)
    if len(tokens) != len(words):
        tokens = [w['text'] for w in words]
    chunks, cur = [], []
    for tok, w in zip(tokens, words):
        cur.append((tok, w))
        joined = ' '.join(t for t, _ in cur)
        if (re.search(r'[.!?;:]$', tok) and len(joined) > 24) or len(cur) >= 9:
            chunks.append(cur); cur = []
        elif (re.search(r',', tok) and len(joined) > 42):
            chunks.append(cur); cur = []
    if cur:
        chunks.append(cur)
    out = []
    for c in chunks:
        t0 = start + c[0][1]['offset']
        last = c[-1][1]
        t1 = min(end, start + last['offset'] + max(last['dur'], 0.22))
        out.append({'t0': round(t0, 3), 't1': round(t1, 3), 'text': ' '.join(t for t, _ in c)})
    return out


async def main():
    BEATS.mkdir(parents=True, exist_ok=True)
    results = []
    for bid, text, gap in SCRIPT:
        words, wav = await synth(bid, text)
        results.append((bid, text, gap, words, wav, wav_duration(wav)))

    beats, caps = [], []
    t = 0.45
    for bid, text, gap, words, wav, dur in results:
        start = t
        beats.append({'id': bid, 'start': round(start, 3), 'audio_end': round(start + dur, 3),
                      'dur': round(dur, 3), 'text': text, 'shots': []})
        caps.extend(captions(words, start, start + dur, text))
        t = start + dur + gap

    total = round(t - results[-1][2] + 1.3, 3)   # hold the end card
    for i, b in enumerate(beats):
        b['scene_start'] = 0.0 if i == 0 else round(b['start'] - PRE, 3)
        b['end'] = round(beats[i + 1]['start'] - PRE, 3) if i + 1 < len(beats) else total
        vdur = b['end'] - b['scene_start']
        weights = SHOTS[b['id']]
        total_w = sum(w for _, w in weights)
        cursor = b['scene_start']
        for src, w in weights:
            sdur = vdur * w / total_w
            b['shots'].append({'src': round(src, 3), 'dur': round(sdur, 3), 'at': round(cursor, 3)})
            cursor += sdur
        b['shots'][-1]['dur'] = round(b['end'] - b['shots'][-1]['at'], 3)

    # assemble the voice track exactly
    parts = []
    lead = AUDIO / 'short-lead.wav'
    run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono',
         '-t', '0.45', '-c:a', 'pcm_s16le', str(lead)])
    parts.append(lead)
    for i, (bid, text, gap, words, wav, dur) in enumerate(results):
        parts.append(wav)
        if gap > 0:
            g = AUDIO / f'short-gap_{bid}.wav'
            run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono',
                 '-t', f'{gap:.3f}', '-c:a', 'pcm_s16le', str(g)])
            parts.append(g)
    listfile = AUDIO / 'short-concat.txt'
    listfile.write_text(''.join(f"file '{p}'\n" for p in parts))
    master = AUDIO / 'short.wav'
    run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', str(listfile),
         '-c:a', 'pcm_s16le', str(master)])
    run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(master), '-c:a', 'aac', '-b:a', '192k',
         '-ac', '1', '-ar', '48000', str(AUDIO / 'short.m4a')])
    run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(AUDIO / 'short.m4a'),
         '-t', f'{total:.3f}', '-c', 'copy', str(AUDIO / 'short-trim.m4a')])
    (AUDIO / 'short-trim.m4a').replace(AUDIO / 'short.m4a')

    data = {'total': total, 'audio': 'audio/short.m4a', 'beats': beats, 'captions': caps}
    (VIDEO / 'short-data.js').write_text(
        '/* generated by build/short.py — do not edit */\n'
        'window.SHORT = ' + json.dumps(data, indent=1, ensure_ascii=False) + ';\n')

    for b in beats:
        print(f"{b['id']:4s} {b['start']:6.2f} → {b['end']:6.2f}  ({b['dur']:5.2f}s)  "
              + ' | '.join(f"{s['src']:.2f}+{s['dur']:.2f}" for s in b['shots']))
    print(f'total {total:.2f}s')


if __name__ == '__main__':
    asyncio.run(main())
