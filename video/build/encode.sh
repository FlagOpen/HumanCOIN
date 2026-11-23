#!/usr/bin/env bash
# Encode the captured frames and the narration into the delivery MP4.
# Captions are burned into the frames by the render pass (?render=1 always
# shows the caption strip), so no soft subtitle track is muxed.
# Run from anywhere; paths resolve from the workspace root.
set -euo pipefail
cd "$(dirname "$0")/../.."

if [ ! -d .frames ] || [ -z "$(ls -A .frames 2>/dev/null)" ]; then
  echo "no frames in .frames — run: node video/build/render.mjs .frames" >&2
  exit 1
fi

ffmpeg -y -hide_banner -loglevel warning \
  -framerate 30 -i .frames/f%05d.jpg \
  -i video/audio/narration.m4a \
  -filter_complex "[1:a]loudnorm=I=-16:TP=-1.5:LRA=11[a]" \
  -map 0:v -map "[a]" \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -profile:v high -tune film \
  -c:a aac -b:a 192k -ac 1 -ar 48000 \
  -movflags +faststart \
  video/HumanCOIN-film.mp4

if [ -n "$(ls -A .frames-short 2>/dev/null)" ]; then
  ffmpeg -y -hide_banner -loglevel warning \
    -framerate 30 -i .frames-short/s%05d.jpg \
    -i video/audio/short.m4a \
    -filter_complex "[1:a]loudnorm=I=-16:TP=-1.5:LRA=11[a]" \
    -map 0:v -map "[a]" \
    -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -profile:v high -tune film \
    -c:a aac -b:a 192k -ac 1 -ar 48000 \
    -movflags +faststart \
    video/HumanCOIN-60s.mp4
fi

ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate \
  -of default=noprint_wrappers=1 video/HumanCOIN-film.mp4
