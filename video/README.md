# HumanCOIN — the film

An English film about HumanCOIN, built from the current project page and the
arXiv report (2611.26434), in two lengths:

- **`HumanCOIN-film.mp4`** — 3 min 42 s, 1920×1080 / 30 fps, with the
  narration and **burned-in English subtitles**.
- **`HumanCOIN-60s.mp4`** — the one-minute cut: 60.7 s, same frame, a new
  condensed narration, subtitles burned in, and 13 shots taken from the long
  film's strongest moments. Its player is **`short.html`**.

Both lengths also exist as web players over the same picture:

- **`index.html`** — the long film as a seekable, fixed 1920×1080 player:
  play/pause, scrub, chapter marks, captions, fullscreen.
- **`short.html`** — a compact player for the one-minute cut with cut marks on
  the scrub bar and the same caption track.

Everything on screen is a pure function of time, which is what makes the two
forms identical: the capture does not record a screen, it asks the film for
frame `i / 30` and keeps the result.

## Play it

Open `index.html` for the long film, or `short.html` for the one-minute cut
(Chrome or Chromium recommended). Sound is on; the first click is needed
because browsers do not autoplay audio.

If you plan to share the folder, serve it rather than opening the files:

```bash
cd video && node serve.mjs          # http://127.0.0.1:8000/
# or: python3 -m http.server 8000  (no Range support — seeking in the 60 s
#                                   player needs Range, so prefer serve.mjs)
```

`serve.mjs` is a 70-line static server that answers HTTP Range requests. That
matters for `short.html`: browsers can only seek inside an MP4 when the server
returns `206 Partial Content`. Opening `short.html` from disk (`file://`) also
seeks fine.

Keys: `space` play/pause · `←/→` ±5 s · `C` captions · `F` fullscreen.
The scrub bar carries a tick for every chapter.

## What is in the long film

| # | Chapter | What it does |
|---|---------|--------------|
| — | Opening | an 8 × 6 grid of real first-person stills; the title lands over it |
| 01 | The gap | three stacked paradigms: action policy `π(a|o)`, world model `p(ô'|o) → p(a|ô')`, and proxy-conditioned `p(z|o) → p(a|o,z)` — flowing arrows, the four branches one `o` can precede (lift / re-grip / pause / abandon), the latent-variable formula `p(a|o) = ∫ p(a|o,z) p(z|o) dz`, and the HumanCOIN proxy box `m_j = f_j(z_j,o)+ε_j` |
| 02 | The intent pathway | the cup case: a square flowchart with `o` and `a` on top, one wide "the world" band, and the intent box **below the band** so the three fan-out leads run unobstructed to the signal lanes (EEG · 16 channels, EMG · 2×8 channels, gaze · x/y); red step-by-step highlighting and flowing arrows throughout; the five real cup-case photographs with the person edited into a mannequin |
| 03 | The dataset | 12,500 hours, 38 scene classes, three tiers, one clock |
| 04 | Intent proxies | the three wearers enlarged, one row each: the wearer slides in, the hardware chips pop in (solid = open + controlled, dashed = controlled only), a `+` draws between rows, and a large modality matrix on the right shows what each tier adds, with a proxy legend below it |
| 05 | One episode | the released L3-001 ("sort candies by colour", 17.4 s): head-left / head-right / wrist-left / wrist-right play as video, a large 2×2 point cloud, the two hands in 3-D on their measured VIVE wrist trajectories (6-DOF pose, 20 joint angles per hand), the eye view with a live gaze trail, EEG/EMG/gaze drawn as **heatmaps**, and the five annotated task steps on the clock |
| 06 | Distributions | 38 scene classes by zone with a 12-photo gallery of real scene shots, 99 verbs as a ranked histogram, 635 objects as a rank curve, a high-frequency verb word cloud, hours and staging splits |
| 07 | The format | the write/read cycle after the project page: one master index at 30 fps, four streams stamped at their own rates, and a query cursor that resolves each lane — nearest, interpolation, or a window — over 23 parquet tables |
| 08 | Community | BAAI and the collaborating institutions, in colour |
| — | Outro | the authors, the **HumanCOIN DataManager** shown as a live browser window (panned, with cursor and call-outs), then a typed `pip install humancoin` |

Every number on screen is from the report (Tables 3–7, Figures 2 and 6). The
film uses source sets provided by the team:

- the **cup case** for chapter 02: the team's real no-device photographs
  (`D:/Downloads/不戴设备版/第二版`: observe / think / gaze / force / act),
  each edited with gpt-image so the person becomes a white articulated
  mannequin while the room, cup, lighting and framing stay exactly as
  photographed (prompts in `video/build/gen_mannequin_edit.py`; the originals
  are kept beside them as `real-*.jpg`);
- the **released L3-001 episode** (`public/real/episode`, "sort candies by
  colour") for chapter 05: seven view videos (live player) plus deterministic
  15 fps JPEG sequences (`video/assets/l3/frames/`) that the capture pass
  draws, the measured VIVE poses, glove skeleton, gaze, EEG/EMG previews, the
  five annotated steps and a point cloud back-projected from its depth frame;
- the **instrumentation v2** page of `humancoin.drawio`, for chapter 04: the
  three wearers are cropped out of the exported figure and the seven devices
  come from the figure's own legend (via `public/hardware`), so the chapter is
  assembled on the timeline instead of being one pasted image;
- the **HumanCOIN DataManager** (`flagopen.github.io/HumanCOIN-DataManager`),
  captured once to `video/assets/datamanager.jpg` for the outro's animated
  browser window (`video/build/shot-datamanager.mjs`).

The waveform lanes in chapter 02 are schematic — the chapter is about the
loop, not about a measured recording. Everything else in chapter 05 is the
released episode.

## Rebuild

Requirements: Python 3 with `edge-tts`, `pillow`, `numpy`; Node with
`playwright-core`; `ffmpeg`. The narration is cached per beat, so the
timeline only re-synthesises when a beat's text changes.

```bash
# 1. narration + timeline (network: edge-tts; results are cached per beat)
python3 video/build/narration.py

# 2. the episode payload the data chapter draws (reads public/real/episode)
python3 video/build/dataset.py
python3 video/build/episode_frames.py      # view MP4s + 15 fps JPEG sequences

# 2b. the mannequin cup photos (needs IMAGE_API_KEY; source: D:/Downloads/不戴设备版/第二版)
python3 video/build/gen_mannequin_edit.py

# 2c. the DataManager screenshot for the outro
node video/build/shot-datamanager.mjs

# 3. captions
cd video && node build/srt.mjs && cd ..

# 4. capture every frame — needs a static server on :8123
node video/build/serve-root.mjs 8123 &     # repo-root server with Range support
node video/build/render.mjs .frames

# 5. encode (subtitles are burned into the frames; see encode.sh / encode.ps1)
ffmpeg -y -framerate 30 -i .frames/f%05d.jpg -i video/audio/narration.m4a \
  -filter_complex "[1:a]loudnorm=I=-16:TP=-1.5:LRA=11[a]" \
  -map 0:v -map "[a]" -c:v libx264 -preset slow -crf 18 \
  -pix_fmt yuv420p -profile:v high -tune film -c:a aac -b:a 192k -ac 1 \
  -ar 48000 -movflags +faststart video/HumanCOIN-film.mp4

# --- and the one-minute cut ---
python3 video/build/short.py                 # new script + shot map + audio
cd video && node build/srt-short.mjs && cd ..
node video/build/render-short.mjs .frames-short
ffmpeg -y -framerate 30 -i .frames-short/s%05d.jpg -i video/audio/short.m4a \
  -filter_complex "[1:a]loudnorm=I=-16:TP=-1.5:LRA=11[a]" \
  -map 0:v -map "[a]" -c:v libx264 -preset slow -crf 18 \
  -pix_fmt yuv420p -c:a aac -b:a 192k -ac 1 -ar 48000 \
  -movflags +faststart video/HumanCOIN-60s.mp4
```

`video/build/shot.mjs` renders stills at arbitrary times, which is the quickest
way to iterate on a scene:

```bash
node video/build/shot.mjs .shots 12 39 137
```

Both capture scripts pick their Chromium automatically: the Playwright cache
under `$LOCALAPPDATA/ms-playwright` on Windows, `~/.cache/ms-playwright` on
Linux, or `CHROME_PATH` if set.

## Files

```
index.html            the long film's player
film.css film.js      the film (scenes, timeline, canvases)
film-data.js          generated: beats, cue times, captions  (from narration.py)
assets/               stills, clips, logos, fonts, thumbs, data.js
assets/cup/           cup-case photos + gpt-image mannequin versions
assets/scenes/        16 scene-class photos for the distributions chapter
assets/l3/            the released episode: vid/, frames/, moments/, mosaic/, data.js
audio/narration.m4a   the voice track
captions.srt          soft subtitles for the MP4
poster.jpg            the long film's title frame, for thumbnails
poster-60.jpg         the short's title frame
HumanCOIN-film.mp4    the long film (3:42, 1920×1080 / 30 fps)
HumanCOIN-60s.mp4     the one-minute cut (60.7 s)
short.html short.css short.js   the one-minute cut player
serve.mjs             Range-capable static server for the folder
short-data.js         generated: its beats, shots, captions
short.srt             its soft subtitles
build/                the scripts that produce all of the above
```

## Credits

Film, design and build: made for the HumanCOIN project page.
Dataset and report: BAAI · AhaData Group, *HumanCOIN: A 12,500-Hour Dataset for
Human Intent in Egocentric Manipulation*, arXiv:2611.26434.
Data licence: CC BY-NC 4.0. Code: Apache-2.0.
Narration: synthesized with edge-tts (`en-US-AndrewNeural`).
Mannequin images: gpt-image, illustrative only.
