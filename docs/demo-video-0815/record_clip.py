#!/usr/bin/env python3
"""Record one scene (or all) from scenes/index.html at 1920x1080."""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
HTML = (ROOT / "scenes/index.html").resolve()
OUT_DIR = ROOT / "capture"
TL = json.loads((ROOT / "audio/timeline.json").read_text(encoding="utf-8"))
SCENE_IDS = [s["id"] for s in TL["scenes"]]


def find_chrome() -> str | None:
    env = os.environ.get("PLAYWRIGHT_CHROME")
    if env and Path(env).exists():
        return env
    cache = Path.home() / ".cache/ms-playwright"
    if cache.exists():
        hits = sorted(cache.glob("chromium-*/chrome-linux64/chrome"))
        if hits:
            return str(hits[-1])
        hits = sorted(cache.glob("chromium-*/chrome-linux/chrome"))
        if hits:
            return str(hits[-1])
    return None


def record_one(scene: str) -> Path:
    if scene not in SCENE_IDS:
        raise SystemExit(f"unknown scene {scene}; want {SCENE_IDS}")
    OUT_DIR.mkdir(exist_ok=True)
    dest = OUT_DIR / f"{scene}_silent.webm"
    chrome = find_chrome()
    launch = {"headless": True}
    if chrome:
        launch["executable_path"] = chrome
        print("using chrome", chrome)
    uri = HTML.as_uri() + f"?scene={scene}"
    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(**launch)
        except Exception as e:
            print("chromium launch failed:", e)
            print("try: .venv/bin/playwright install chromium")
            sys.exit(1)
        context = browser.new_context(
            viewport={"width": 1920, "height": 1080},
            record_video_dir=str(OUT_DIR),
            record_video_size={"width": 1920, "height": 1080},
        )
        page = context.new_page()
        page.goto(uri, wait_until="load")
        page.wait_for_function("() => window.__QAME_DEMO_DONE__ === true", timeout=180_000)
        time.sleep(0.35)
        video = page.video
        context.close()
        if video:
            video.save_as(str(dest))
        browser.close()
    if not dest.exists():
        print("no video written for", scene)
        sys.exit(1)
    print("wrote", dest, "bytes", dest.stat().st_size)
    return dest


def main() -> None:
    arg = sys.argv[1] if len(sys.argv) > 1 else "--all"
    scenes = SCENE_IDS if arg in {"--all", "all"} else [arg]
    for sid in scenes:
        record_one(sid)


if __name__ == "__main__":
    main()
