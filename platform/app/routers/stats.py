from datetime import datetime

from fastapi import APIRouter, Depends

from .. import db
from ..auth_util import get_current_user
from ..match_service import load_match_players
from ..resp import err, ok
from .. import game_client

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("/me")
async def my_stats(period: str = "today", user=Depends(get_current_user)):
    args = [user["id"]]
    since_sql = ""
    if period == "today":
        since = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        args.append(since)
        since_sql = f" AND m.finished_at >= ${len(args)}"
    rows = await db.fetch(
        f"""
        SELECT m.id, m.game_id, m.status, m.result, m.finished_at, m.created_at, mp.seat_index
        FROM matches m
        JOIN match_players mp ON mp.match_id = m.id
        JOIN players p ON p.id = mp.player_id
        WHERE p.user_id=$1 AND p.player_type='human' AND mp.status='joined'
        {since_sql}
        ORDER BY COALESCE(m.finished_at, m.created_at) DESC
        LIMIT 200
        """,
        *args,
    )
    wins = losses = draws = playing = waiting = finished = 0
    matches = []
    for r in rows:
        d = db.record_to_dict(r)
        result = d.get("result") or {}
        if isinstance(result, str):
            import json

            try:
                result = json.loads(result)
            except Exception:
                result = {}
        st = d["status"]
        if st == "playing":
            playing += 1
        elif st in ("waiting", "ready"):
            waiting += 1
        elif st == "finished":
            finished += 1
            if result.get("draw"):
                draws += 1
            elif result.get("winner") is not None:
                if str(result["winner"]) == str(d["seat_index"]):
                    wins += 1
                else:
                    losses += 1
        matches.append(
            {
                "id": d["id"],
                "gameId": d["game_id"],
                "status": st,
                "result": result,
                "seatIndex": d["seat_index"],
                "finishedAt": d.get("finished_at"),
                "createdAt": d.get("created_at"),
            }
        )
    return ok(
        {
            "period": period,
            "totals": {
                "wins": wins,
                "losses": losses,
                "draws": draws,
                "finished": finished,
                "playing": playing,
                "waiting": waiting,
                "participated": len(matches),
            },
            "matches": matches,
        }
    )


@router.get("/leaderboard")
async def leaderboard(gameId: str | None = None, limit: int = 20, _user=Depends(get_current_user)):
    limit = min(max(limit, 1), 100)
    args = []
    game_sql = ""
    if gameId:
        args.append(gameId)
        game_sql = f" AND m.game_id=${len(args)}"
    args.append(limit)
    rows = await db.fetch(
        f"""
        SELECT p.id AS player_id, p.player_name, p.player_type, u.username,
          COUNT(*) FILTER (
            WHERE m.status='finished' AND m.result->>'winner' IS NOT NULL
              AND m.result->>'winner' = mp.seat_index::text
          )::int AS wins,
          COUNT(*) FILTER (
            WHERE m.status='finished' AND (m.result->>'draw') = 'true'
          )::int AS draws,
          COUNT(*) FILTER (
            WHERE m.status='finished' AND m.result->>'winner' IS NOT NULL
              AND m.result->>'winner' <> mp.seat_index::text
          )::int AS losses,
          COUNT(*) FILTER (WHERE m.status='finished')::int AS finished
        FROM match_players mp
        JOIN matches m ON m.id = mp.match_id
        JOIN players p ON p.id = mp.player_id
        LEFT JOIN users u ON u.id = p.user_id
        WHERE mp.status='joined' {game_sql}
        GROUP BY p.id, p.player_name, p.player_type, u.username
        HAVING COUNT(*) FILTER (WHERE m.status='finished') > 0
        ORDER BY wins DESC, draws DESC, losses ASC
        LIMIT ${len(args)}
        """,
        *args,
    )
    return ok({"gameId": gameId, "rankings": [db.record_to_dict(r) for r in rows]})


@router.get("/matches/{match_id}/history")
async def history(match_id: str, _user=Depends(get_current_user)):
    m = await db.fetchrow("SELECT * FROM matches WHERE id=$1", match_id)
    if not m:
        return err(404, "Match不存在")
    m = db.record_to_dict(m)
    moves = await db.fetch(
        "SELECT ply, seat_index, move, created_at FROM match_moves WHERE match_id=$1 ORDER BY ply",
        match_id,
    )
    players = await load_match_players(match_id)
    live = None
    try:
        live = await game_client.get_host_state(m["game_id"], match_id)
    except Exception:
        pass
    return ok(
        {
            "matchId": match_id,
            "gameId": m["game_id"],
            "status": m["status"],
            "result": m.get("result") or (live or {}).get("result"),
            "players": [
                {
                    "seatIndex": p["seatIndex"],
                    "playerName": p["playerName"],
                    "playerType": p["playerType"],
                }
                for p in players
            ],
            "moves": [
                {
                    "ply": r["ply"],
                    "seatIndex": r["seat_index"],
                    "move": r["move"] if not isinstance(r["move"], str) else r["move"],
                    "at": r["created_at"].isoformat() if r["created_at"] else None,
                }
                for r in moves
            ],
            "live": {
                "G": live.get("G"),
                "turn": live.get("turn"),
                "status": live.get("status"),
                "result": live.get("result"),
            }
            if live
            else None,
        }
    )
