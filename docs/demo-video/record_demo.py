#!/usr/bin/env python3
"""Record scenes/index.html at 1920x1080 until window.__QAME_DEMO_DONE__."""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
HTML = (ROOT / "scenes/index.html").resolve()
OUT_DIR = ROOT / "capture"
CHROME_CANDIDATES = [
    os.environ.get("PLAYWRIGHT_CHROME"),
    str(Path.home() / ".cache/ms-playwright"),
]


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


def main() -> None:
    OUT_DIR.mkdir(exist_ok=True)
    for old in OUT_DIR.glob("*.webm"):
        if old.name.startswith("screen"):
            old.unlink()
    chrome = find_chrome()
    launch = {"headless": True}
    if chrome:
        launch["executable_path"] = chrome
        print("using chrome", chrome)
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
        page.goto(HTML.as_uri(), wait_until="load")
        page.wait_for_function("() => window.__QAME_DEMO_DONE__ === true", timeout=240_000)
        time.sleep(0.4)
        video = page.video
        context.close()
        dest = OUT_DIR / "screen_silent.webm"
        if video:
            video.save_as(str(dest))
        browser.close()
        if not dest.exists():
            print("no video written")
            sys.exit(1)
        print("wrote", dest, "bytes", dest.stat().st_size)


if __name__ == "__main__":
    main()
