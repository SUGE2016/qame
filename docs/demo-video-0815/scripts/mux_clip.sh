#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STYLE="FontName=Droid Sans Fallback,FontSize=9,PrimaryColour=&H00F2F2F2,OutlineColour=&H64000000,BorderStyle=1,Outline=0.8,Shadow=0,MarginL=120,MarginR=120,MarginV=12,Alignment=2,WrapStyle=2,Spacing=0"

mux_one() {
  local sid="$1"
  local screen="capture/${sid}_silent.webm"
  local out="capture/${sid}-dual-audio.mp4"
  local srt="subtitles/clips/${sid}.bilingual.srt"
  [[ -f "$screen" ]] || { echo "missing $screen"; exit 1; }
  [[ -f "audio/parts/${sid}_zh_mix.wav" ]] || { echo "missing audio for $sid"; exit 1; }

  local aud vid trim
  aud=$(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "audio/parts/${sid}_zh_mix.wav")
  vid=$(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$screen")
  trim=$(python3 -c "print(max(0.0, float('${vid}') - float('${aud}') - 0.45))")
  echo "$sid video=${vid}s audio=${aud}s trim_start=${trim}s"

  ffmpeg -y -nostdin \
    -ss "$trim" -i "$screen" \
    -i "audio/parts/${sid}_zh_mix.wav" \
    -i "audio/parts/${sid}_en_mix.wav" \
    -filter_complex "[0:v]subtitles=${srt}:force_style='${STYLE}'[v]" \
    -map "[v]" -map 1:a -map 2:a \
    -c:v libx264 -pix_fmt yuv420p -crf 18 -preset medium \
    -c:a aac -b:a 192k \
    -metadata:s:a:0 language=zho -metadata:s:a:0 title=Chinese -metadata:s:a:0 handler_name=Chinese \
    -metadata:s:a:1 language=eng -metadata:s:a:1 title=English -metadata:s:a:1 handler_name=English \
    -shortest \
    "$out"
  echo "wrote $out"
}

if [[ "${1:-}" == "--all" ]]; then
  mapfile -t ids < <(python3 -c "import json; print('\\n'.join(s['id'] for s in json.load(open('audio/timeline.json'))['scenes']))")
  for sid in "${ids[@]}"; do
    mux_one "$sid"
  done
else
  mux_one "${1:?usage: mux_clip.sh S0|S1|...|--all}"
fi
