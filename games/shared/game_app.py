"""通用游戏 Host：内存对局 + 标准 /v1 API。"""
from __future__ import annotations

import os
from typing import Any, Callable, Optional
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

CreateState = Callable[[dict], dict]
LegalMoves = Callable[[dict, str], list]
ApplyMove = Callable[[dict, str, Any], dict]
CheckEnd = Callable[[dict], Optional[dict]]


class CreateMatchBody(BaseModel):
    platform_match_id: str
    players: list[dict] = Field(default_factory=list)
    config: dict = Field(default_factory=dict)


class MoveBody(BaseModel):
    seat: str | int
    move: Any


class RestoreBody(BaseModel):
    G: dict
    turn: str | int = "0"
    status: str = "playing"
    result: Any = None
    ply: int = 0
    moves: list = Field(default_factory=list)
    players: list = Field(default_factory=list)


ViewState = Callable[[dict, Optional[str]], dict]


def build_game_app(
    *,
    game_id: str,
    game_name: str,
    create_state: CreateState,
    legal_moves: LegalMoves,
    apply_move: ApplyMove,
    check_end: CheckEnd,
    view_state: Optional[ViewState] = None,
) -> FastAPI:
    app = FastAPI(title=f"QAME Game: {game_name}", version="1.0.0")
    rooms: dict[str, dict] = {}

    @app.middleware("http")
    async def _internal_key(request: Request, call_next):
        if request.url.path.startswith("/v1/"):
            key = os.getenv("INTERNAL_SERVICE_KEY", "")
            if key and request.headers.get("x-internal-key") != key:
                return JSONResponse({"detail": "unauthorized"}, status_code=401)
        return await call_next(request)

    @app.get("/health")
    def health():
        return {"status": "ok", "gameId": game_id, "name": game_name}

    @app.post("/v1/matches")
    def create_match(body: CreateMatchBody):
        mid = body.platform_match_id or str(uuid4())
        if mid in rooms:
            raise HTTPException(409, "match already exists")
        G = create_state({"matchId": mid, **(body.config or {})})
        rooms[mid] = {
            "matchId": mid,
            "gameId": game_id,
            "G": G,
            "turn": "0",
            "status": "playing",
            "result": None,
            "ply": 0,
            "moves": [],
            "players": body.players or [],
        }
        return _public(rooms[mid])

    @app.get("/v1/matches/{match_id}")
    def get_match(match_id: str, seat: Optional[str] = None):
        room = rooms.get(match_id)
        if not room:
            raise HTTPException(404, "match not found")
        return _public(room, seat)

    @app.get("/v1/matches/{match_id}/snapshot")
    def get_snapshot(match_id: str):
        room = rooms.get(match_id)
        if not room:
            raise HTTPException(404, "match not found")
        return {
            "G": room["G"],
            "turn": room["turn"],
            "status": room["status"],
            "result": room["result"],
            "ply": room["ply"],
            "moves": room["moves"],
            "players": room["players"],
        }

    @app.put("/v1/matches/{match_id}")
    def restore_match(match_id: str, body: RestoreBody):
        rooms[match_id] = {
            "matchId": match_id,
            "gameId": game_id,
            "G": body.G,
            "turn": str(body.turn),
            "status": body.status or "playing",
            "result": body.result,
            "ply": int(body.ply or 0),
            "moves": body.moves or [],
            "players": body.players or [],
        }
        return _public(rooms[match_id])

    @app.post("/v1/matches/{match_id}/moves")
    def post_move(match_id: str, body: MoveBody):
        room = rooms.get(match_id)
        if not room:
            raise HTTPException(404, "match not found")
        if room["status"] != "playing" or room["result"]:
            raise HTTPException(400, "对局已结束")
        seat = str(body.seat)
        if room["turn"] != seat:
            raise HTTPException(400, "还没轮到该玩家")
        out = apply_move(room["G"], seat, body.move)
        if out.get("error"):
            raise HTTPException(400, out["error"])
        room["G"] = out["G"]
        room["ply"] += 1
        room["moves"].append({"ply": room["ply"], "seatIndex": int(seat), "move": body.move})
        end = check_end(room["G"])
        if end:
            room["result"] = end
            room["status"] = "finished"
        elif not out.get("extraTurn"):
            room["turn"] = "1" if seat == "0" else "0"
        pub = _public(room)
        pub["legalMoves"] = (
            legal_moves(room["G"], room["turn"]) if room["status"] == "playing" else []
        )
        return pub

    @app.delete("/v1/matches/{match_id}")
    def delete_match(match_id: str):
        rooms.pop(match_id, None)
        return {"ok": True}

    def _shape(G: dict, viewer: Optional[str]) -> dict:
        if not view_state:
            return G
        seat = None if viewer in (None, "") else str(viewer)
        return view_state(G, seat)

    def _public(room: dict, viewer: Optional[str] = None) -> dict:
        turn = room["turn"]
        return {
            "matchId": room["matchId"],
            "gameId": room["gameId"],
            "G": _shape(room["G"], viewer),
            "turn": turn,
            "status": room["status"],
            "result": room["result"],
            "ply": room["ply"],
            "moves": room["moves"],
            "players": room["players"],
            "legalMoves": legal_moves(room["G"], turn)
            if room["status"] == "playing" and not room["result"]
            else [],
        }

    return app
