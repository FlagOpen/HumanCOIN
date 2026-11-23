# Encode the captured frames and narration into the delivery MP4s.
# The captions are already burned into the frames by the render pass
# (?render=1 always shows the caption strip), so no soft track is muxed.
# PowerShell port of encode.sh — run from the display repo root:
#   powershell -File video/build/encode.ps1
param([string]$Frames = ".frames", [string]$FramesShort = ".frames-short")

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

if (-not (Test-Path "$Frames\f00000.jpg")) { throw "no frames in $Frames — run: node video/build/render.mjs $Frames" }

Write-Host "encoding HumanCOIN-film.mp4 ..."
ffmpeg -y -hide_banner -loglevel warning `
  -framerate 30 -i "$Frames\f%05d.jpg" `
  -i video/audio/narration.m4a `
  -filter_complex "[1:a]loudnorm=I=-16:TP=-1.5:LRA=11[a]" `
  -map 0:v -map "[a]" `
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -profile:v high -tune film `
  -c:a aac -b:a 192k -ac 1 -ar 48000 `
  -movflags +faststart `
  video/HumanCOIN-film.mp4

if (Test-Path "$FramesShort\s00000.jpg") {
  Write-Host "encoding HumanCOIN-60s.mp4 ..."
  ffmpeg -y -hide_banner -loglevel warning `
    -framerate 30 -i "$FramesShort\s%05d.jpg" `
    -i video/audio/short.m4a `
    -filter_complex "[1:a]loudnorm=I=-16:TP=-1.5:LRA=11[a]" `
    -map 0:v -map "[a]" `
    -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -profile:v high -tune film `
    -c:a aac -b:a 192k -ac 1 -ar 48000 `
    -movflags +faststart `
    video/HumanCOIN-60s.mp4
}

ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate `
  -of default=noprint_wrappers=1 video/HumanCOIN-film.mp4
