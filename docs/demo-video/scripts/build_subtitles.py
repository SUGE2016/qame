#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
tl = json.loads((root / "audio/timeline.json").read_text(encoding="utf-8"))
out = root / "subtitles"
out.mkdir(exist_ok=True)


def ts(sec: float) -> str:
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = int(sec % 60)
    ms = int(round((sec - int(sec)) * 1000))
    if ms == 1000:
        s += 1
        ms = 0
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def write_srt(path: Path, key: str) -> None:
    lines = []
    for i, sc in enumerate(tl["scenes"], 1):
        # leave a little tail so lines don't slam into the next
        end = min(sc["end"] - 0.12, sc["end"])
        start = sc["start"] + 0.08
        lines.append(f"{i}\n{ts(start)} --> {ts(end)}\n{sc[key]}\n")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


write_srt(out / "zh.srt", "zh")
write_srt(out / "en.srt", "en")

bi = []
for i, sc in enumerate(tl["scenes"], 1):
    end = sc["end"] - 0.12
    start = sc["start"] + 0.08
    bi.append(f"{i}\n{ts(start)} --> {ts(end)}\n{sc['zh']}\\N{sc['en']}\n")
(out / "bilingual.srt").write_text("\n".join(bi) + "\n", encoding="utf-8")
print("wrote subtitles/zh.srt en.srt bilingual.srt")
