#!/usr/bin/env python3
"""Build the English narration track and the film timeline.

Audio-first production: each beat is synthesised separately (edge-tts), its
duration is measured, and every later beat is placed after it. The visual
timeline therefore follows the voice instead of the voice chasing a fixed
edit. Word boundaries come back with each beat, so the film can cut on a
spoken word and the caption track is exact.

Outputs
  video/audio/beats/*.wav        one clean mono wav per beat
  video/audio/narration.wav      the assembled track (48 kHz mono)
  video/audio/narration.m4a      delivery encode
  video/film-data.js             window.FILM = {timeline, cues, captions}
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
BEATS = AUDIO / 'beats'
VOICE = 'en-US-AndrewNeural'
RATE = '-4%'

# One entry per visual scene. `anchors` map a spoken phrase to a cue name the
# film engine reads; the phrase is matched against the beat's word stream.
SCRIPT = [
    dict(
        id='intro',
        gap_after=0.55,
        text='HumanCOIN. A dataset of human intent. '
             'Every demonstration records what happened; almost none record why.',
        anchors={},
    ),
    dict(
        id='gap',
        gap_after=0.55,
        text='A demonstration is usually stored as a pair: an observation, and the action '
             'that followed. A policy learns to map one to the other. But the same '
             'observation can precede a lift, a re-grip, a pause, an abandoned attempt. '
             'The frame does not say which. Something is missing in between: the '
             "operator's intent, the state that decides how the action unfolds. "
             'It is latent. No camera sees it directly.',
        anchors={
            'pair': 'pair',
            'map one to the other': 'policy',
            'lift': 'branch_lift',
            're-grip': 'branch_regrip',
            'pause': 'branch_pause',
            'abandoned': 'branch_abandon',
            'does not say which': 'branch_question',
            'missing in between': 'z',
            'intent': 'z_label',
            'latent': 'formula',
            'no camera': 'formula_note',
        },
    ),
    dict(
        id='pathway',
        gap_after=0.5,
        text='Take something ordinary: picking up a cup. It takes a decision, a glance, '
             'and a movement. Not three separate systems, one pathway. Cognition, '
             'vision, motor control, running from the decision to its effect. '
             'We call it the human intent pathway.',
        anchors={
            'picking up a cup': 'cup',
            'decision': 'station_decide',
            'glance': 'station_look',
            'movement': 'station_act',
            'cognition': 'label_cognition',
            'motor control': 'label_motor',
            'intent pathway': 'pathway_name',
        },
    ),
    dict(
        id='traces',
        gap_after=0.55,
        text='The pathway is a complex system, but it leaves traces as it flows. '
             'Cortex prepares the movement hundreds of milliseconds before the hand '
             'moves, and EEG can see it. Muscle loads before contact, and surface EMG '
             'carries the load. Gaze reaches the object before the fingers do, and eye '
             'tracking records it. Three stations. Three signals. One intent.',
        anchors={
            'leaves traces': 'timeline',
            'EEG': 'eeg',
            'surface EMG': 'emg',
            'eye tracking': 'gaze',
            'Three stations': 'sum',
            'One intent': 'sum_one',
        },
    ),
    dict(
        id='dataset',
        gap_after=0.55,
        text='This is the measurement HumanCOIN was built for. Twelve thousand five '
             'hundred hours, thirty-eight scene classes, and three tiers of intent '
             'proxies, on one task ontology and one clock.',
        anchors={
            'built for': 'built',
            'Twelve thousand': 'hours',
            'thirty-eight': 'scenes',
            'three tiers': 'tiers',
            'one clock': 'clock',
        },
    ),
    dict(
        id='tiers',
        gap_after=0.55,
        text='At the output end, L1: ten thousand hours of multi-view egocentric video, '
             'where gaze is inferred from the head camera before the hand departs. '
             'Midway, L2: two thousand hours, adding bilateral surface EMG, so load is '
             'readable before the object leaves the table. At the origin, L3: five '
             'hundred hours, adding scalp EEG, for preparation and error monitoring. '
             'Each tier inherits every proxy below it. Depth is an axis, not a separate dataset.',
        anchors={
            'L1': 'l1',
            'L2': 'l2',
            'L3': 'l3',
            'inherits': 'inherit',
            'axis': 'axis',
        },
    ),
    dict(
        id='episode',
        gap_after=0.55,
        text='One episode, on one clock. Four head views and two wrist views. Depth and '
             'point cloud from the stereo pair. Six-degree-of-freedom head and wrist '
             'pose; twenty joint angles per hand. Gaze, EMG and EEG at their native '
             'rates. In the controlled L3 setting these quantities are measured, not '
             'inferred, a reference the shallower tiers can be scored against.',
        anchors={
            'One episode': 'views',
            'four head views'.replace('four', 'Four'): 'views_more',
            'Depth': 'depth',
            'point cloud': 'cloud',
            'twenty joint': 'hand',
            'native rates': 'signals',
            'measured, not': 'measured',
        },
    ),
    dict(
        id='dist',
        gap_after=0.55,
        text='The corpus is not one kind of room. Thirty-eight scene classes across five '
             'zones: residential, commercial, professional, industrial, public, plus '
             'residual. Ninety-nine task verbs. Six hundred and thirty-five object '
             'classes. A long tail, deliberately kept. The deeper the tier, the more '
             'controlled the staging: L3 is roughly seventy percent bench-controlled.',
        anchors={
            'Thirty-eight': 'zones',
            'Ninety-nine': 'verbs',
            'Six hundred': 'objects',
            'long tail': 'tail',
            'controlled the staging': 'ctrl',
        },
    ),
    dict(
        id='format',
        gap_after=0.55,
        text='Storage is asynchronous by design. Each stream keeps its own clock, its own '
             'native rate, and its own parquet table, twenty-three of them, never '
             'resampled. A master index at thirty frames per second resolves every '
             'modality at query time: nearest sample, interpolation, or a window. '
             'The data declares its alignment; it does not bake it in.',
        anchors={
            'asynchronous': 'async',
            'twenty-three': 'tables',
            'master index': 'index',
            'nearest sample': 'modes',
            'declares': 'declare',
        },
    ),
    dict(
        id='community',
        gap_after=0.5,
        text='HumanCOIN is led by B A A I, with twenty-seven institutions across '
             'universities and industry, and recordings from six sites.',
        anchors={'B A A I': 'logos', 'twenty-seven': 'count', 'six sites': 'sites'},
    ),
    dict(
        id='outro',
        gap_after=3.2,
        text='The data, the browser and the client are open. One command to install. '
             'One episode to begin. Project page, report, and release are below. '
             'Welcome to HumanCOIN.',
        anchors={
            'One command': 'command',
            'Project page': 'links',
            'Welcome': 'welcome',
        },
    ),
]

# Visual scene boundaries: each beat owns the screen from its own start minus a
# small pre-roll to the next beat's start minus the same pre-roll.
PREROLL = 0.35


def run(cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def wav_duration(path):
    with wave.open(str(path), 'rb') as w:
        return w.getnframes() / float(w.getframerate())


async def synth(beat):
    text = beat['text'].replace('\n', ' ')
    out = BEATS / f"{beat['id']}.mp3"
    wav = BEATS / f"{beat['id']}.wav"
    cache = BEATS / f"{beat['id']}.json"
    key = f"{VOICE}|{RATE}|{text}"
    if wav.exists() and cache.exists():
        saved = json.loads(cache.read_text())
        if saved.get('key') == key:
            return saved['words'], wav
    words = []
    last = None
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
                            'offset': chunk['offset'] / 10_000_000,   # 100-ns → seconds
                            'dur': chunk['duration'] / 10_000_000,
                        })
            if out.stat().st_size > 2000:
                break
            raise RuntimeError('short audio')
        except Exception as exc:                      # transient service errors
            last = exc
            print(f'  retry {beat["id"]} ({attempt + 1}/5): {exc}')
            await asyncio.sleep(2.5 * (attempt + 1))
    else:
        raise SystemExit(f'tts failed for {beat["id"]}: {last}')
    run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(out),
         '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', str(wav)])
    out.unlink()
    cache.write_text(json.dumps({'key': key, 'words': words}))
    return words, wav


def find_anchor(words, phrase):
    """Time of the first word of `phrase` in a beat's word stream."""
    target = re.sub(r'[^a-z0-9 ]', '', phrase.lower()).split()
    stream = [(re.sub(r'[^a-z0-9 ]', '', w['text'].lower()), w) for w in words]
    for i in range(len(stream) - len(target) + 1):
        if all(stream[i + j][0] == target[j] for j in range(len(target))):
            return stream[i][1]['offset']
    # Fallback: substring match on the joined text, proportionally placed.
    joined = ' '.join(s[0] for s in stream)
    idx = joined.find(' '.join(target))
    if idx >= 0 and words:
        ratio = idx / max(len(joined), 1)
        return words[0]['offset'] + ratio * (words[-1]['offset'] + words[-1]['dur'] - words[0]['offset'])
    raise SystemExit(f'anchor not found: {phrase!r}')


def captions_from_words(words, start, end, text):
    """Group the spoken tokens into short caption lines, keeping the script's
    own punctuation. Word boundaries and tokens align one to one (checked at
    build time), so the caption text is the sentence that was written."""
    if not words:
        return []
    tokens = re.findall(r"\S+", text)
    if len(tokens) != len(words):
        tokens = [w['text'] for w in words]
    chunks, cur = [], []
    for tok, w in zip(tokens, words):
        cur.append((tok, w))
        joined = ' '.join(t for t, _ in cur)
        if (re.search(r'[.!?;:]$', tok) and len(joined) > 24) or len(cur) >= 9:
            chunks.append(cur)
            cur = []
        elif (re.search(r'[,]$', tok) and len(joined) > 42):
            chunks.append(cur)
            cur = []
    if cur:
        chunks.append(cur)
    caps = []
    for c in chunks:
        t0 = start + c[0][1]['offset']
        last = c[-1][1]
        t1 = min(end, start + last['offset'] + max(last['dur'], 0.22))
        caps.append({'t0': round(t0, 3), 't1': round(t1, 3),
                     'text': ' '.join(t for t, _ in c)})
    return caps


async def main():
    AUDIO.mkdir(parents=True, exist_ok=True)
    BEATS.mkdir(parents=True, exist_ok=True)

    results = []
    for beat in SCRIPT:
        words, wav = await synth(beat)
        results.append((beat, words, wav, wav_duration(wav)))

    beats, cues, captions = [], {}, []
    t = 0.8                      # lead-in silence
    for beat, words, wav, dur in results:
        start = t
        beat_cues = {}
        for phrase, cue in beat['anchors'].items():
            try:
                beat_cues[cue] = round(start + find_anchor(words, phrase), 3)
            except SystemExit as exc:
                raise SystemExit(f"{beat['id']}: {exc}")
        cues.update(beat_cues)
        captions.extend(captions_from_words(words, start, start + dur, beat['text']))
        beats.append({
            'id': beat['id'],
            'start': round(start, 3),
            'audio_end': round(start + dur, 3),
            'dur': round(dur, 3),
            'cues': beat_cues,
            'text': beat['text'],
        })
        t = start + dur + beat['gap_after']

    # Scene windows: audio start minus pre-roll, ending at the next scene's start.
    for i, b in enumerate(beats):
        b['scene_start'] = round(max(0.0, b['start'] - PREROLL), 3)
        if i + 1 < len(beats):
            b['scene_end'] = round(max(b['audio_end'], beats[i + 1]['start'] - PREROLL), 3)
        else:
            b['scene_end'] = round(b['audio_end'] + beat['gap_after'], 3)
        b['end'] = b['scene_end']

    total = beats[-1]['scene_end']

    # Assemble the master track: exact per-beat wavs plus silence gaps.
    silence = AUDIO / 'silence.wav'
    run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi',
         '-i', 'anullsrc=r=48000:cl=mono', '-t', '0.1', '-c:a', 'pcm_s16le', str(silence)])
    # Build a concat list with an exact-length silence before each beat.
    parts = []
    lead = AUDIO / 'lead.wav'
    run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi',
         '-i', 'anullsrc=r=48000:cl=mono', '-t', '0.8', '-c:a', 'pcm_s16le', str(lead)])
    parts.append(lead)
    for i, (beat, words, wav, dur) in enumerate(results):
        parts.append(wav)
        gap = beat['gap_after']
        if gap > 0:
            g = AUDIO / f"gap_{beat['id']}.wav"
            run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi',
                 '-i', 'anullsrc=r=48000:cl=mono', '-t', f'{gap:.3f}',
                 '-c:a', 'pcm_s16le', str(g)])
            parts.append(g)
    listfile = AUDIO / 'concat.txt'
    listfile.write_text(''.join(f"file '{p}'\n" for p in parts))
    master = AUDIO / 'narration.wav'
    run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0',
         '-i', str(listfile), '-c:a', 'pcm_s16le', str(master)])
    run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(master),
         '-c:a', 'aac', '-b:a', '192k', '-ac', '1', str(AUDIO / 'narration.m4a')])
    clip = AUDIO / 'narration.m4a'
    run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(clip), '-t', f'{total:.3f}',
         '-c', 'copy', str(AUDIO / 'narration-trim.m4a')])
    (AUDIO / 'narration-trim.m4a').replace(AUDIO / 'narration.m4a')

    data = {
        'total': total,
        'audio': 'audio/narration.m4a',
        'beats': beats,
        'cues': cues,
        'captions': captions,
    }
    (VIDEO / 'film-data.js').write_text(
        '/* generated by build/narration.py — do not edit */\n'
        'window.FILM = ' + json.dumps(data, indent=1, ensure_ascii=False) + ';\n')

    for b in beats:
        print(f"{b['id']:10s} {b['start']:7.2f}s → {b['end']:7.2f}s  ({b['dur']:.2f}s)")
    print(f"total {total:.2f}s = {int(total // 60)}:{total % 60:04.1f}")
    print(f"cues {len(cues)} · captions {len(captions)}")


if __name__ == '__main__':
    asyncio.run(main())
