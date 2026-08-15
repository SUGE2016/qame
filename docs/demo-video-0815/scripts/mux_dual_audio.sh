#!/usr/bin/env bash
# Concat accepted clips into the final dual-audio film.
# Do not run until every S0–S7 clip is accepted.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
OUT="${OUT:-capture/QAME-agents-dual-audio.mp4}"
LIST="$ROOT/capture/concat.txt"
mkdir -p capture

python3 - <<'PY'
import json
from pathlib import Path
root = Path(".")
ids = [s["id"] for s in json.loads((root / "audio/timeline.json").read_text())["scenes"]]
lines = []
for sid in ids:
    p = root / "capture" / f"{sid}-dual-audio.mp4"
    if not p.exists():
        raise SystemExit(f"missing accepted clip: {p}")
    lines.append(f"file '{p.resolve()}'")
(root / "capture/concat.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
print("concat", " ".join(ids))
PY

ffmpeg -y -f concat -safe 0 -i "$LIST" -c copy "$OUT"
echo "wrote $OUT"
ffprobe -hide_banner "$OUT"
