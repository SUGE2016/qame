from __future__ import annotations

import asyncio
import json
from typing import Any, Optional

from . import db, game_client
from .match_state import OPEN_STATUSES, TERMINAL_STATUSES, can_transition
from .ws_hub import hub


async def _save_snapshot(match_id: str, game_id: str) -> None:
    try:
        snap = await game_client.get_host_snapshot(game_id, match_id)
    except Exception:
        return
    await db.execute(
        "UPDATE matches SET host_snapshot=$2::jsonb, updated_at=CURRENT_TIMESTAMP WHERE id=$1",
        match_id,
        json.dumps(snap),
    )


async def restore_playing_matches() -> int:
    rows = await db.fetch(
        "SELECT id, game_id, host_snapshot FROM matches WHERE status='playing' AND host_snapshot IS NOT NULL"
    )
    n = 0
    for r in rows:
        snap = r["host_snapshot"]
        if isinstance(snap, str):
            try:
                snap = json.loads(snap)
            except Exception:
                continue
        if not isinstance(snap, dict) or not snap.get("G"):
            continue
        try:
            await game_client.restore_host_match(r["game_id"], r["id"], snap)
            n += 1
        except Exception:
            pass
    return n


async def load_match_players(match_id: str) -> list[dict]:
    rows = await db.fetch(
        """
        SELECT mp.*, p.user_id, p.player_type, p.player_name AS p_name,
               ac.endpoint AS client_endpoint, u.username AS user_name
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


async def cancel_match(match_id: str) -> dict:
    m = await db.fetchrow("SELECT * FROM matches WHERE id=$1", match_id)
    if not m:
        raise ValueError("Match不存在")
    m = db.record_to_dict(m)
    if m["status"] == "cancelled":
        return m
    if m["status"] == "finished":
        raise ValueError("已结束的游戏不能取消")
    if not can_transition(m["status"], "cancelled"):
        raise ValueError(f"不能从 {m['status']} 取消")
    try:
        await game_client.delete_host_match(m["game_id"], match_id)
    except Exception:
        pass
    await db.execute(
        """
        UPDATE matches SET status='cancelled', finished_at=COALESCE(finished_at, CURRENT_TIMESTAMP),
        updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status <> ALL($2::text[])
        """,
        match_id,
        list(TERMINAL_STATUSES),
    )
    row = await db.fetchrow("SELECT * FROM matches WHERE id=$1", match_id)
    out = db.record_to_dict(row)
    await hub.broadcast(match_id, {"type": "end", "matchId": match_id, "status": "cancelled"})
    return out


async def reconcile_match_roster(match_id: str) -> None:
    m = await db.fetchrow("SELECT * FROM matches WHERE id=$1", match_id)
    if not m:
        return
    m = db.record_to_dict(m)
    if m["status"] not in OPEN_STATUSES:
        return
    players = await load_match_players(match_id)
    if m["status"] in ("waiting", "ready") and len(players) == 0:
        await cancel_match(match_id)
        return
    if m["status"] == "playing" and len(players) < int(m["min_players"] or 2):
        await cancel_match(match_id)


async def reconcile_open_matches() -> int:
    rows = await db.fetch(
        "SELECT id FROM matches WHERE status = ANY($1::text[])",
        list(OPEN_STATUSES),
    )
    n = 0
    for r in rows:
        before = await db.fetchrow("SELECT status FROM matches WHERE id=$1", r["id"])
        await reconcile_match_roster(r["id"])
        after = await db.fetchrow("SELECT status FROM matches WHERE id=$1", r["id"])
        if before and after and before["status"] != after["status"]:
            n += 1
    return n


async def close_open_matches_for_user(user_id: int) -> int:
    rows = await db.fetch(
        """
        SELECT DISTINCT m.id
        FROM matches m
        LEFT JOIN match_players mp ON mp.match_id = m.id
        LEFT JOIN players p ON p.id = mp.player_id
        WHERE m.status = ANY($2::text[])
          AND (m.creator_id = $1 OR p.user_id = $1)
        """,
        user_id,
        list(OPEN_STATUSES),
    )
    n = 0
    for r in rows:
        try:
            await cancel_match(r["id"])
            n += 1
        except Exception:
            pass
    return n


async def start_match(match_id: str) -> dict:
    m = await db.fetchrow("SELECT * FROM matches WHERE id=$1", match_id)
    if not m:
        raise ValueError("Match不存在")
    m = db.record_to_dict(m)
    if m["status"] not in ("waiting", "ready"):
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
    await _save_snapshot(match_id, m["game_id"])
    msg = {**state, "type": "state", "players": players}
    await hub.broadcast(match_id, msg)
    asyncio.create_task(maybe_ai_turn(match_id))
    return state


async def apply_seat_move(match_id: str, seat_index: int, move: Any) -> dict:
    m = await db.fetchrow("SELECT * FROM matches WHERE id=$1", match_id)
    if not m:
        raise ValueError("Match不存在")
    m = db.record_to_dict(m)
    if m["status"] != "playing":
        raise ValueError("对局未在进行中")
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
    await _save_snapshot(match_id, m["game_id"])
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
        state = await game_client.get_host_state(m["game_id"], match_id, seat=turn)
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


async def play_view(match_id: str, seat_index: Optional[int]) -> dict:
    m = await db.fetchrow("SELECT * FROM matches WHERE id=$1", match_id)
    if not m:
        raise ValueError("Match不存在")
    m = db.record_to_dict(m)
    players = await load_match_players(match_id)
    spectator = seat_index is None
    try:
        state = await game_client.get_host_state(m["game_id"], match_id, seat=seat_index)
    except game_client.GameClientError:
        return {
            "matchId": match_id,
            "gameId": m["game_id"],
            "status": m["status"],
            "seatIndex": None if spectator else str(seat_index),
            "yourTurn": False,
            "spectator": spectator,
            "G": None,
            "turn": None,
            "legalMoves": [],
            "result": m.get("result"),
            "players": players,
        }
    your = (
        not spectator
        and state.get("status") == "playing"
        and not state.get("result")
        and str(state.get("turn")) == str(seat_index)
    )
    return {
        "matchId": match_id,
        "gameId": m["game_id"],
        "status": state.get("status") or m["status"],
        "seatIndex": None if spectator else str(seat_index),
        "yourTurn": your,
        "spectator": spectator,
        "G": state.get("G"),
        "turn": state.get("turn"),
        "legalMoves": state.get("legalMoves") if your else [],
        "result": state.get("result") or m.get("result"),
        "players": players,
    }
