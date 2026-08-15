#!/usr/bin/env python3
"""Record the real lobby + a live battleship match at 1920x1080.

Two agent accounts play via the same /api/play path as MCP.
The browser watches agent_a's seat (own fleet + fog on the opponent).
"""
from __future__ import annotations

import json
import os
import sys
import threading
import time
from pathlib import Path

import re

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "scripts"))
from battleship_hunter import Hunter, shot_at  # noqa: E402
from qame_http import (  # noqa: E402
    create_user,
    ensure_player,
    join_match,
    list_matches,
    login,
    play_move,
    play_state,
    start_match,
)

OUT = ROOT / "capture"
LOBBY = os.environ.get("QAME_LOBBY", "https://localhost/")
ADMIN_USER = os.environ.get("QAME_ADMIN_USER", "admin")
ADMIN_PASS = os.environ.get("QAME_ADMIN_PASS", "admin123")
USER_A = os.environ.get("QAME_AGENT_A", "agent_a")
USER_B = os.environ.get("QAME_AGENT_B", "agent_b")
PASS = os.environ.get("QAME_AGENT_PASS", "agent123")
MOVE_SEC = float(os.environ.get("QAME_MOVE_SEC", "0.65"))


def find_chrome() -> str | None:
    env = os.environ.get("PLAYWRIGHT_CHROME")
    if env and Path(env).exists():
        return env
    cache = Path.home() / ".cache/ms-playwright"
    hits = sorted(cache.glob("chromium-*/chrome-linux64/chrome")) if cache.exists() else []
    return str(hits[-1]) if hits else None


class Markers:
    def __init__(self) -> None:
        self.t0 = time.time()
        self.rows: list[dict] = []

    def mark(self, sid: str, note: str = "") -> None:
        rec = {"id": sid, "t": round(time.time() - self.t0, 3), "note": note}
        self.rows.append(rec)
        print("MARK", rec, flush=True)

    def dump(self, path: Path) -> None:
        path.write_text(json.dumps({"scenes": self.rows}, ensure_ascii=False, indent=2), encoding="utf-8")


def ensure_users() -> tuple[str, str, dict, dict]:
    admin = login(ADMIN_USER, ADMIN_PASS)
    create_user(admin, USER_A, PASS)
    create_user(admin, USER_B, PASS)
    ta, tb = login(USER_A, PASS), login(USER_B, PASS)
    pa, pb = ensure_player(ta), ensure_player(tb)
    return ta, tb, pa, pb


def agent_loop(token: str, match_id: str, seat: int, hunter: Hunter, stop: dict) -> None:
    while not stop.get("done"):
        try:
            st = play_state(token, match_id)
        except Exception as e:
            print("state err", seat, e, flush=True)
            time.sleep(0.4)
            continue
        if st.get("result") or st.get("status") == "finished":
            stop["done"] = True
            stop["result"] = st.get("result")
            return
        if not st.get("yourTurn"):
            time.sleep(0.25)
            continue
        legal = st.get("legalMoves") or []
        move = hunter.pick(legal)
        try:
            nxt = play_move(token, match_id, move)
        except Exception as e:
            print("move err", seat, move, e, flush=True)
            time.sleep(0.3)
            continue
        mark = shot_at(nxt.get("G") or st.get("G") or {}, seat, move)
        if mark is None:
            mark = shot_at(play_state(token, match_id).get("G") or {}, seat, move)
        hunter.observe(move, mark)
        print(f"seat{seat} fire {move} -> {mark}", flush=True)
        if nxt.get("result"):
            stop["done"] = True
            stop["result"] = nxt.get("result")
            return
        time.sleep(MOVE_SEC)


def main() -> None:
    os.environ.pop("http_proxy", None)
    os.environ.pop("https_proxy", None)
    os.environ.pop("HTTP_PROXY", None)
    os.environ.pop("HTTPS_PROXY", None)
    os.environ.pop("all_proxy", None)
    os.environ.pop("ALL_PROXY", None)

    OUT.mkdir(exist_ok=True)
    ta, tb, pa, pb = ensure_users()
    markers = Markers()
    dest = OUT / "live_silent.webm"
    chrome = find_chrome()
    launch = {"headless": True}
    if chrome:
        launch["executable_path"] = chrome
        print("using chrome", chrome)

    with sync_playwright() as p:
        browser = p.chromium.launch(**launch)
        context = browser.new_context(
            viewport={"width": 1920, "height": 1080},
            ignore_https_errors=True,
            record_video_dir=str(OUT),
            record_video_size={"width": 1920, "height": 1080},
        )
        page = context.new_page()
        page.goto(LOBBY, wait_until="domcontentloaded")
        page.get_by_label("用户名").fill(USER_A)
        page.get_by_label("密码").fill(PASS)
        page.get_by_role("button", name="进入大厅").click()
        page.get_by_role("heading", name="游戏大厅").wait_for(timeout=20_000)
        markers.mark("S0", "lobby")
        time.sleep(6.5)

        page.get_by_role("button", name=re.compile("大海战")).click()
        markers.mark("S1", "select battleship")
        time.sleep(3.5)

        page.get_by_role("button", name=re.compile("开一间房")).click()
        mid = None
        for _ in range(40):
            rooms = list_matches(ta, "battleship", "waiting")
            mine = [
                m for m in rooms
                if (m.get("creator_name") or m.get("creatorName") or m.get("creator")) == USER_A
            ]
            if mine:
                mid = mine[0]["id"]
                break
            time.sleep(0.25)
        if not mid:
            raise SystemExit("agent_a room not found after 开一间房")
        join_match(ta, mid, pa["id"], 0)
        join_match(tb, mid, pb["id"], 1)
        page.get_by_role("button", name="刷新").click()
        page.get_by_text(USER_B).wait_for(timeout=20_000)
        markers.mark("S2", f"seated {mid}")
        time.sleep(2.0)
        page.get_by_role("button", name="开局").click()
        page.get_by_role("heading", name="对局").wait_for(timeout=25_000)
        markers.mark("S3", "playing")

        stop = {"done": False}
        t1 = threading.Thread(target=agent_loop, args=(ta, mid, 0, Hunter(), stop), daemon=True)
        t2 = threading.Thread(target=agent_loop, args=(tb, mid, 1, Hunter(), stop), daemon=True)
        t1.start()
        t2.start()
        slept = 0.0
        while slept < 16 and not stop.get("done"):
            time.sleep(0.4)
            slept += 0.4
        markers.mark("S4", "hunt")
        deadline = time.time() + 180
        while not stop.get("done") and time.time() < deadline:
            time.sleep(0.4)
        t1.join(timeout=3)
        t2.join(timeout=3)
        markers.mark("S5", f"finished {stop.get('result')}")
        page.get_by_role("button", name="回放").click(timeout=15_000)
        time.sleep(12)
        page.get_by_role("button", name="返回大厅").click()
        page.get_by_role("heading", name="游戏大厅").wait_for(timeout=15_000)
        markers.mark("S6", "lobby games")
        time.sleep(7)
        markers.mark("S7", "hold")
        time.sleep(6)

        video = page.video
        context.close()
        if video:
            video.save_as(str(dest))
        browser.close()

    markers.dump(OUT / "live_markers.json")
    (OUT / "live_match.json").write_text(json.dumps({"matchId": mid}, indent=2), encoding="utf-8")
    print("wrote", dest, "bytes", dest.stat().st_size if dest.exists() else 0)


if __name__ == "__main__":
    main()
