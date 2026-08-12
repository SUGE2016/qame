from __future__ import annotations

import json

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from . import db
from .auth_util import AuthError, auth_error_handler, decode_token, hash_password
from .config import settings
from .match_service import load_match_players, play_view, apply_seat_move
from .routers import admin, ai, auth, games, matches, players, play, stats
from .ws_hub import hub

app = FastAPI(title="QAME Platform", version="3.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_exception_handler(AuthError, auth_error_handler)

app.include_router(auth.router)
app.include_router(games.router)
app.include_router(players.router)
app.include_router(matches.router)
app.include_router(play.router)
app.include_router(stats.router)
app.include_router(ai.router)
app.include_router(admin.router)


@app.on_event("startup")
async def startup():
    await db.init_pool()
    await db.run_migrations()
    # seed games
    await db.execute(
        """
        INSERT INTO games (id, name, description, min_players, max_players, status)
        VALUES ('tic-tac-toe','井字棋','经典井字棋',2,2,'active'),
               ('gomoku','五子棋','9x9五子棋',2,2,'active')
        ON CONFLICT (id) DO NOTHING
        """
    )
    admin = await db.fetchrow("SELECT * FROM users WHERE username='admin'")
    if not admin:
        pwd = hash_password(settings()["admin_password"])
        await db.execute(
            "INSERT INTO users (username, password_hash, role) VALUES ('admin',$1,'admin')",
            pwd,
        )


@app.on_event("shutdown")
async def shutdown():
    await db.close_pool()


@app.get("/", response_class=HTMLResponse)
async def root():
    games = ", ".join(settings()["game_urls"].keys()) or "(none)"
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>QAME Platform</title>
  <style>
    :root {{ color-scheme: light; --bg:#f4f6f8; --ink:#1a1f24; --muted:#5b6770; --line:#d7dee5; --accent:#0b6e4f; }}
    body {{ margin:0; font-family: "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif; background:linear-gradient(160deg,#eef3f1,#f7f4ef 50%,#e8eef5); color:var(--ink); min-height:100vh; }}
    main {{ max-width:40rem; margin:0 auto; padding:3.5rem 1.25rem; }}
    h1 {{ font-size:2rem; margin:0 0 .35rem; letter-spacing:.02em; }}
    p {{ color:var(--muted); line-height:1.55; }}
    ul {{ list-style:none; padding:0; margin:1.5rem 0; }}
    li {{ margin:.55rem 0; }}
    a {{ color:var(--accent); text-decoration:none; font-weight:600; border-bottom:1px solid transparent; }}
    a:hover {{ border-bottom-color:var(--accent); }}
    .card {{ background:rgba(255,255,255,.82); border:1px solid var(--line); border-radius:12px; padding:1.25rem 1.4rem; backdrop-filter:blur(6px); }}
    code {{ background:#e8eef2; padding:.1rem .35rem; border-radius:4px; font-size:.92em; }}
  </style>
</head>
<body>
  <main>
    <div class="card">
      <h1>QAME Platform</h1>
      <p>这是 API 服务（端口 8001），不是大厅前端。大厅请走 Nginx：<code>https://localhost/</code></p>
      <ul>
        <li><a href="/docs">OpenAPI 文档 (/docs)</a></li>
        <li><a href="/redoc">ReDoc (/redoc)</a></li>
        <li><a href="/health">健康检查 (/health)</a></li>
      </ul>
      <p>已配置游戏：{games}</p>
    </div>
  </main>
</body>
</html>"""


@app.get("/health")
@app.get("/api/health")
async def health():
    return {
        "code": 200,
        "message": "API服务器运行正常",
        "data": {
            "version": "3.0.0",
            "runtime": "python-platform",
            "games": list(settings()["game_urls"].keys()),
            "ws": "/ws",
        },
    }



@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    user = None
    match_id = None
    seat_index = None
    # cookie auth
    token = ws.cookies.get("access_token")
    if token:
        payload = decode_token(token)
        if payload and payload.get("userId"):
            row = await db.fetchrow("SELECT * FROM users WHERE id=$1", payload["userId"])
            if row:
                user = db.record_to_dict(row)
    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                await ws.send_text(json.dumps({"type": "error", "message": "无效 JSON"}))
                continue
            typ = msg.get("type")
            if typ == "join":
                if msg.get("token"):
                    payload = decode_token(msg["token"])
                    if payload and payload.get("userId"):
                        row = await db.fetchrow("SELECT * FROM users WHERE id=$1", payload["userId"])
                        if row:
                            user = db.record_to_dict(row)
                if not user:
                    await ws.send_text(json.dumps({"type": "error", "message": "未登录"}))
                    continue
                match_id = msg.get("matchId")
                seat = await db.fetchrow(
                    """
                    SELECT mp.seat_index FROM match_players mp
                    JOIN players p ON p.id=mp.player_id
                    WHERE mp.match_id=$1 AND p.user_id=$2 AND p.player_type='human'
                    """,
                    match_id,
                    user["id"],
                )
                if not seat:
                    await ws.send_text(json.dumps({"type": "error", "message": "您不在此对局中"}))
                    continue
                seat_index = seat["seat_index"]
                hub.subscribe(match_id, ws)
                try:
                    view = await play_view(match_id, seat_index)
                    await ws.send_text(json.dumps({**view, "type": "state"}, ensure_ascii=False))
                except Exception:
                    await ws.send_text(
                        json.dumps(
                            {
                                "type": "state",
                                "matchId": match_id,
                                "status": "waiting",
                                "G": None,
                                "message": "对局尚未开始",
                            }
                        )
                    )
            elif typ == "move":
                if user is None or seat_index is None or not match_id:
                    await ws.send_text(json.dumps({"type": "error", "message": "请先 join"}))
                    continue
                try:
                    await apply_seat_move(match_id, seat_index, msg.get("move"))
                except Exception as e:
                    await ws.send_text(json.dumps({"type": "error", "message": str(e)}))
            else:
                await ws.send_text(json.dumps({"type": "error", "message": f"未知类型 {typ}"}))
    except WebSocketDisconnect:
        hub.unsubscribe_all(ws)
