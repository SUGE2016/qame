"""通用游戏 Host：内存对局 + 标准 /v1 API。"""
from __future__ import annotations

from typing import Any, Callable, Optional
from uuid import uuid4

from fastapi import FastAPI, HTTPException
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


def build_game_app(
    *,
    game_id: str,
    game_name: str,
    create_state: CreateState,
    legal_moves: LegalMoves,
    apply_move: ApplyMove,
    check_end: CheckEnd,
) -> FastAPI:
    app = FastAPI(title=f"QAME Game: {game_name}", version="1.0.0")
    rooms: dict[str, dict] = {}

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
    def get_match(match_id: str):
        room = rooms.get(match_id)
        if not room:
            raise HTTPException(404, "match not found")
        return _public(room)

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
        else:
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

    def _public(room: dict) -> dict:
        turn = room["turn"]
        return {
            "matchId": room["matchId"],
            "gameId": room["gameId"],
            "G": room["G"],
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
