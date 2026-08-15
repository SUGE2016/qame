#!/usr/bin/env bash
# Cut real-lobby ranges from capture/live_silent.webm using live_markers.json
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
python3 <<'PY'
import json, subprocess
from pathlib import Path

root = Path(".")
src = root / "capture/live_silent.webm"
marks = {m["id"]: float(m["t"]) for m in json.loads((root / "capture/live_markers.json").read_text())["scenes"]}
vid = float(subprocess.check_output([
    "ffprobe", "-v", "error", "-show_entries", "format=duration",
    "-of", "default=nk=1:nw=1", str(src),
], text=True).strip())

# live clips only; S0/S2/S7 stay synthetic
ranges = {
    "S1": (max(0.0, marks["S0"] - 0.2), marks["S2"]),
    "S3": (marks["S3"], marks["S4"]),
    "S4": (marks["S4"], marks["S5"]),
    "S5": (marks["S5"], marks["S6"]),
    "S6": (marks["S6"], marks.get("S7", vid)),
}
for sid, (start, end) in ranges.items():
    if end <= start + 0.4:
        end = min(vid, start + 2.0)
    out = root / "capture" / f"{sid}_silent.webm"
    subprocess.check_call([
        "ffmpeg", "-y", "-ss", f"{start:.3f}", "-to", f"{end:.3f}",
        "-i", str(src), "-an", "-c:v", "libvpx", "-b:v", "2M",
        "-deadline", "good", "-cpu-used", "2", str(out),
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"live {sid} {start:.2f}-{end:.2f}")
PY
