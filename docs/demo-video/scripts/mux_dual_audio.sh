#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
SCREEN="${SCREEN:-capture/screen_silent.webm}"
OUT="${OUT:-capture/QAME-concept-dual-audio.mp4}"
mkdir -p capture

AUD=$(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 audio/zh.wav)
VID=$(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$SCREEN")
END_PAD="${END_PAD:-0.45}"
TRIM=$(python3 -c "print(max(0.0, float('${VID}') - float('${AUD}') - float('${END_PAD}')))")
echo "video=${VID}s audio=${AUD}s trim_start=${TRIM}s"

ffmpeg -y \
  -ss "$TRIM" -i "$SCREEN" \
  -i audio/zh.wav \
  -i audio/en.wav \
  -filter_complex "[0:v]subtitles=subtitles/bilingual.srt:force_style='FontName=Droid Sans Fallback,FontSize=9,PrimaryColour=&H00F2F2F2,OutlineColour=&H64000000,BorderStyle=1,Outline=0.8,Shadow=0,MarginL=120,MarginR=120,MarginV=12,Alignment=2,WrapStyle=2,Spacing=0'[v]" \
  -map "[v]" -map 1:a -map 2:a \
  -c:v libx264 -pix_fmt yuv420p -crf 18 -preset medium \
  -c:a aac -b:a 192k \
  -metadata:s:a:0 language=zho -metadata:s:a:0 title=Chinese -metadata:s:a:0 handler_name=Chinese \
  -metadata:s:a:1 language=eng -metadata:s:a:1 title=English -metadata:s:a:1 handler_name=English \
  -shortest \
  "$OUT"

echo "wrote $OUT"
ffprobe -hide_banner "$OUT"
