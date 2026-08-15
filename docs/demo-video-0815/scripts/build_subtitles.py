#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
tl = json.loads((root / "audio/timeline.json").read_text(encoding="utf-8"))
out = root / "subtitles"
clips = out / "clips"
out.mkdir(exist_ok=True)
clips.mkdir(exist_ok=True)


def ts(sec: float) -> str:
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = int(sec % 60)
    ms = int(round((sec - int(sec)) * 1000))
    if ms == 1000:
        s += 1
        ms = 0
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def write_srt(path: Path, scenes: list, key: str, *, local: bool) -> None:
    lines = []
    for i, sc in enumerate(scenes, 1):
        if local:
            start = 0.08
            end = max(0.4, (sc["end"] - sc["start"]) - 0.12)
        else:
            start = sc["start"] + 0.08
            end = sc["end"] - 0.12
        text = sc[key] if key != "bi" else f"{sc['zh']}\\N{sc['en']}"
        lines.append(f"{i}\n{ts(start)} --> {ts(end)}\n{text}\n")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


write_srt(out / "zh.srt", tl["scenes"], "zh", local=False)
write_srt(out / "en.srt", tl["scenes"], "en", local=False)
write_srt(out / "bilingual.srt", tl["scenes"], "bi", local=False)

for sc in tl["scenes"]:
    sid = sc["id"]
    write_srt(clips / f"{sid}.zh.srt", [sc], "zh", local=True)
    write_srt(clips / f"{sid}.en.srt", [sc], "en", local=True)
    write_srt(clips / f"{sid}.bilingual.srt", [sc], "bi", local=True)

print("wrote subtitles + per-clip srt")
