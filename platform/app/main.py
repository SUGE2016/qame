from __future__ import annotations

import json

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

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
