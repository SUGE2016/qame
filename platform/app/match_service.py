from __future__ import annotations

import asyncio
import json
from typing import Any, Optional

from . import db, game_client
from .ws_hub import hub


async def load_match_players(match_id: str) -> list[dict]:
    rows = await db.fetch(
        """
        SELECT mp.*, p.user_id, p.player_type, p.player_name AS p_name,
               ac.endpoint AS client_endpoint, ac.name AS ai_client_name,
               u.username AS user_name
        FROM match_players mp
        LEFT JOIN players p ON p.id = mp.player_id
        LEFT JOIN users u ON u.id = p.user_id
        LEFT JOIN ai_players ap ON ap.id = p.ai_player_id
        LEFT JOIN ai_clients ac ON ac.id = ap.ai_client_id
        WHERE mp.match_id=$1 AND mp.status='joined'
        ORDER BY mp.seat_index
        """,
        match_id,
    )
    out = []
    for r in rows:
        d = db.record_to_dict(r)
        ptype = d.get("player_type") or "human"
        pname = d.get("player_name") or d.get("p_name") or "?"
        out.append(
            {
                "id": d["id"],
                "seatIndex": d["seat_index"],
                "playerId": d["player_id"],
                "playerType": ptype,
                "playerName": pname,
                "userId": d.get("user_id"),
                "clientEndpoint": d.get("client_endpoint"),
                "isAI": ptype == "ai",
            }
        )
    return out


async def start_match(match_id: str) -> dict:
    m = await db.fetchrow("SELECT * FROM matches WHERE id=$1", match_id)
    if not m:
        raise ValueError("Match不存在")
    m = db.record_to_dict(m)
    if m["status"] != "waiting":
        raise ValueError("Match状态不正确")
    players = await load_match_players(match_id)
    if len(players) < m["min_players"]:
        raise ValueError("玩家不足")

    host_players = [
        {"seat": str(p["seatIndex"]), "name": p["playerName"], "type": p["playerType"]}
        for p in players
    ]
    state = await game_client.create_host_match(m["game_id"], match_id, host_players)
    await db.execute(
        """
        UPDATE matches SET status='playing', started_at=COALESCE(started_at, CURRENT_TIMESTAMP),
        updated_at=CURRENT_TIMESTAMP, bgio_match_id=$2 WHERE id=$1
        """,
        match_id,
        match_id,
    )
    msg = {**state, "type": "state", "players": players}
    await hub.broadcast(match_id, msg)
    asyncio.create_task(maybe_ai_turn(match_id))
    return state


async def apply_seat_move(match_id: str, seat_index: int, move: Any) -> dict:
    m = await db.fetchrow("SELECT * FROM matches WHERE id=$1", match_id)
    if not m:
        raise ValueError("Match不存在")
    m = db.record_to_dict(m)
    state = await game_client.host_move(m["game_id"], match_id, str(seat_index), move)

    ply = state.get("ply") or 0
    await db.execute(
        """
        INSERT INTO match_moves (match_id, ply, seat_index, move)
        VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT (match_id, ply) DO NOTHING
        """,
        match_id,
        ply,
        int(seat_index),
        json.dumps(move),
    )

    if state.get("status") == "finished" or state.get("result"):
        await db.execute(
            """
            UPDATE matches SET status='finished', result=$2::jsonb,
            finished_at=COALESCE(finished_at, CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP
            WHERE id=$1
            """,
            match_id,
            json.dumps(state.get("result") or {}),
        )
        await hub.broadcast(match_id, {**state, "type": "end"})
        await hub.broadcast(match_id, {**state, "type": "state"})
    else:
        players = await load_match_players(match_id)
        await hub.broadcast(match_id, {**state, "type": "state", "players": players})
        asyncio.create_task(maybe_ai_turn(match_id))
    return state


async def maybe_ai_turn(match_id: str):
    try:
        m = await db.fetchrow("SELECT * FROM matches WHERE id=$1", match_id)
        if not m:
            return
        m = db.record_to_dict(m)
        if m["status"] != "playing":
            return
        state = await game_client.get_host_state(m["game_id"], match_id)
        if state.get("result") or state.get("status") != "playing":
            return
        turn = str(state.get("turn"))
        players = await load_match_players(match_id)
        current = next((p for p in players if str(p["seatIndex"]) == turn), None)
        if not current or current["playerType"] != "ai":
            return
        endpoint = current.get("clientEndpoint")
        if not endpoint:
            return
        move = await game_client.call_ai_move(
            endpoint,
            {
                "game_id": m["game_id"],
                "match_id": match_id,
                "player_id": turn,
                "G": state.get("G"),
                "ctx": {"currentPlayer": turn},
                "metadata": {"turn": turn},
            },
        )
        await apply_seat_move(match_id, int(turn), move)
    except Exception as e:
        await hub.broadcast(match_id, {"type": "error", "matchId": match_id, "message": f"AI 行动失败: {e}"})


async def play_view(match_id: str, seat_index: int) -> dict:
    m = await db.fetchrow("SELECT * FROM matches WHERE id=$1", match_id)
    if not m:
        raise ValueError("Match不存在")
    m = db.record_to_dict(m)
    players = await load_match_players(match_id)
    try:
        state = await game_client.get_host_state(m["game_id"], match_id)
    except game_client.GameClientError:
        return {
            "matchId": match_id,
            "gameId": m["game_id"],
            "status": m["status"],
            "seatIndex": str(seat_index),
            "yourTurn": False,
            "G": None,
            "turn": None,
            "legalMoves": [],
            "result": m.get("result"),
            "players": players,
        }
    your = state.get("status") == "playing" and not state.get("result") and str(state.get("turn")) == str(seat_index)
    return {
        "matchId": match_id,
        "gameId": m["game_id"],
        "status": state.get("status") or m["status"],
        "seatIndex": str(seat_index),
        "yourTurn": your,
        "G": state.get("G"),
        "turn": state.get("turn"),
        "legalMoves": state.get("legalMoves") if your else [],
        "result": state.get("result") or m.get("result"),
        "players": players,
    }
