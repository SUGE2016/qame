#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PY="${ROOT}/.venv/bin/python"
EDGE="${ROOT}/.venv/bin/edge-tts"
if [[ ! -x "$EDGE" ]]; then
  echo "Install deps first: .venv/bin/pip install -r requirements.txt"
  exit 1
fi

mkdir -p audio/parts capture
"$PY" <<'PY'
import json, subprocess, wave, contextlib
from pathlib import Path

root = Path(".")
cfg = json.loads((root / "audio/scenes.json").read_text(encoding="utf-8"))
voices = json.loads((root / "audio/voices.json").read_text(encoding="utf-8"))
edge = root / ".venv/bin/edge-tts"
parts = root / "audio/parts"
parts.mkdir(parents=True, exist_ok=True)

def dur(path: Path) -> float:
    with contextlib.closing(wave.open(str(path), "rb")) as w:
        return w.getnframes() / float(w.getframerate())

def tts(text, voice, rate, out: Path):
    tmp = out.with_suffix(".mp3")
    subprocess.check_call(
        [str(edge), "--voice", voice, f"--rate={rate}", "--text", text, "--write-media", str(tmp)],
    )
    subprocess.check_call(
        ["ffmpeg", "-y", "-i", str(tmp), "-ar", "24000", "-ac", "1", str(out)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

def concat(wavs, out: Path):
    lst = out.with_suffix(".txt")
    lst.write_text("".join(f"file '{p.resolve()}'\n" for p in wavs), encoding="utf-8")
    subprocess.check_call(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(out)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

timeline = []
t = 0.0
zh_all, en_all = [], []
pad_after = cfg.get("pad_after") or {}

for sc in cfg["scenes"]:
    sid = sc["id"]
    zh_p = parts / f"{sid}_zh.wav"
    en_p = parts / f"{sid}_en.wav"
    tts(sc["zh"], voices["zh"]["voice"], voices["zh"]["rate"], zh_p)
    tts(sc["en"], voices["en"]["voice"], voices["en"]["rate"], en_p)
    d = max(dur(zh_p), dur(en_p)) + 0.35
    extra = float(pad_after.get(sid, 0) or 0)
    total = d + extra
    zh_mix = parts / f"{sid}_zh_mix.wav"
    en_mix = parts / f"{sid}_en_mix.wav"

    def pad_to(src: Path, dest: Path):
        subprocess.check_call(
            [
                "ffmpeg", "-y", "-i", str(src),
                "-af", f"apad=whole_dur={total:.3f}",
                "-ar", "24000", "-ac", "1",
                str(dest),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    pad_to(zh_p, zh_mix)
    pad_to(en_p, en_mix)
    zh_all.append(zh_mix)
    en_all.append(en_mix)
    timeline.append({"id": sid, "start": round(t, 3), "end": round(t + total, 3), "zh": sc["zh"], "en": sc["en"]})
    t += total

concat(zh_all, root / "audio/zh.wav")
concat(en_all, root / "audio/en.wav")
(root / "audio/timeline.json").write_text(
    json.dumps({"duration": round(t, 3), "scenes": timeline}, ensure_ascii=False, indent=2),
    encoding="utf-8",
)
(root / "scenes/timeline.js").write_text(
    "window.QAME_TIMELINE = " + json.dumps({"duration": round(t, 3), "scenes": timeline}, ensure_ascii=False) + ";\n",
    encoding="utf-8",
)
print(f"timeline {t:.2f}s, {len(timeline)} scenes")
PY

"$PY" "$ROOT/scripts/build_subtitles.py"
echo "audio ready: audio/zh.wav audio/en.wav"
