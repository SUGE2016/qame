import json
import uuid

from fastapi import APIRouter, Depends

from .. import db
from ..auth_util import get_current_user, issue_seat_token
from ..match_service import load_match_players, start_match
from ..resp import err, ok
from .. import game_client

router = APIRouter(prefix="/api/matches", tags=["matches"])


def _display_player(p: dict) -> dict:
    return {
        "id": p["id"],
        "seatIndex": p["seatIndex"],
        "playerId": p["playerId"],
        "playerType": p["playerType"],
        "isAI": p.get("isAI"),
        "playerName": p["playerName"],
        "clientEndpoint": p.get("clientEndpoint"),
        "userId": p.get("userId"),
    }


@router.get("")
@router.get("/")
async def list_matches(
    gameId: str | None = None,
    status: str | None = None,
    user=Depends(get_current_user),
):
    clauses = ["1=1"]
    args = []
    if gameId:
        args.append(gameId)
        clauses.append(f"m.game_id=${len(args)}")
    if status:
        args.append(status)
        clauses.append(f"m.status=${len(args)}")
    sql = f"""
        SELECT m.*, g.name AS game_name, u.username AS creator_name
        FROM matches m
        JOIN games g ON g.id = m.game_id
        JOIN users u ON u.id = m.creator_id
        WHERE {' AND '.join(clauses)}
        ORDER BY m.created_at DESC
        LIMIT 100
    """
    rows = await db.fetch(sql, *args)
    out = []
    for r in rows:
        m = db.record_to_dict(r)
        players = await load_match_players(m["id"])
        m["players"] = [_display_player(p) for p in players]
        m["currentPlayerCount"] = len(players)
        out.append(m)
    return ok(out, "获取match列表成功")


@router.post("")
@router.post("/")
async def create_match(body: dict, user=Depends(get_current_user)):
    game_id = body.get("gameId")
    if not game_id:
        return err(400, "游戏Id不能为空")
    game = await db.fetchrow("SELECT * FROM games WHERE id=$1 AND status='active'", game_id)
    if not game:
        return err(404, f"游戏{game_id}不存在或者未激活")
    mid = str(uuid.uuid4())
    row = await db.fetchrow(
        """
        INSERT INTO matches (id, game_id, creator_id, max_players, min_players, status)
        VALUES ($1,$2,$3,$4,$5,'waiting') RETURNING *
        """,
        mid,
        game_id,
        user["id"],
        game["max_players"],
        game["min_players"],
    )
    return ok(db.record_to_dict(row), "Match创建成功")


@router.get("/{match_id}/credentials")
async def credentials(match_id: str, user=Depends(get_current_user)):
    row = await db.fetchrow(
        """
        SELECT mp.seat_index FROM match_players mp
        JOIN players p ON p.id = mp.player_id
        WHERE mp.match_id=$1 AND p.user_id=$2 AND p.player_type='human'
        """,
        match_id,
        user["id"],
    )
    if not row:
        return err(404, "您不在此match中")
    return ok({"playerCredentials": None, "playerID": str(row["seat_index"])}, "获取座位成功")


@router.get("/{match_id}")
async def get_match(match_id: str, user=Depends(get_current_user)):
    row = await db.fetchrow(
        """
        SELECT m.*, g.name AS game_name, u.username AS creator_name
        FROM matches m
        JOIN games g ON g.id=m.game_id
        JOIN users u ON u.id=m.creator_id
        WHERE m.id=$1
        """,
        match_id,
    )
    if not row:
        return err(404, "Match不存在")
    m = db.record_to_dict(row)
    players = await load_match_players(match_id)
    m["players"] = [_display_player(p) for p in players]
    m["currentPlayerCount"] = len(players)
    return ok(m, "获取match详情成功")


@router.delete("/{match_id}")
async def delete_match(match_id: str, user=Depends(get_current_user)):
    m = await db.fetchrow("SELECT * FROM matches WHERE id=$1", match_id)
    if not m:
        return err(404, "Match不存在")
    if m["creator_id"] != user["id"] and user.get("role") != "admin":
        return err(403, "没有权限删除此match")
    try:
        await game_client.delete_host_match(m["game_id"], match_id)
    except Exception:
        pass
    await db.execute("DELETE FROM matches WHERE id=$1", match_id)
    return ok(None, "Match删除成功")


@router.post("/{match_id}/players")
async def add_player(match_id: str, body: dict, user=Depends(get_current_user)):
    player_id = body.get("playerId")
    seat_index = body.get("seatIndex")
    if not player_id:
        return err(400, "必须提供playerId")
    m = await db.fetchrow("SELECT * FROM matches WHERE id=$1", match_id)
    if not m:
        return err(404, "Match不存在")
    if m["status"] != "waiting":
        return err(400, "只能在等待状态下添加玩家")
    player = await db.fetchrow("SELECT * FROM players WHERE id=$1", player_id)
    if not player:
        return err(404, "玩家不存在")
    is_creator = m["creator_id"] == user["id"]
    if not is_creator and player["user_id"] != user["id"]:
        return err(403, "没有权限添加该玩家")

    if seat_index is None:
        occupied = await db.fetch(
            "SELECT seat_index FROM match_players WHERE match_id=$1", match_id
        )
        used = {r["seat_index"] for r in occupied}
        seat_index = next((i for i in range(m["max_players"]) if i not in used), None)
        if seat_index is None:
            return err(400, "座位已满")

    token = issue_seat_token()
    # 兼容有无 player_type/player_name 列
    try:
        row = await db.fetchrow(
            """
            INSERT INTO match_players (match_id, seat_index, player_id, player_credentials, status, player_type, player_name)
            VALUES ($1,$2,$3,$4,'joined',$5,$6) RETURNING *
            """,
            match_id,
            seat_index,
            player_id,
            token,
            player["player_type"],
            player["player_name"],
        )
    except Exception:
        row = await db.fetchrow(
            """
            INSERT INTO match_players (match_id, seat_index, player_id, player_credentials, status)
            VALUES ($1,$2,$3,$4,'joined') RETURNING *
            """,
            match_id,
            seat_index,
            player_id,
            token,
        )
    d = db.record_to_dict(row)
    return ok(
        {
            "id": d["id"],
            "seatIndex": d["seat_index"],
            "playerId": d["player_id"],
            "playerType": player["player_type"],
            "isAI": player["player_type"] == "ai",
            "playerName": player["player_name"],
            "seatToken": token,
        },
        "玩家添加成功",
    )


@router.delete("/{match_id}/players/{mp_id}")
async def remove_player(match_id: str, mp_id: int, user=Depends(get_current_user)):
    m = await db.fetchrow("SELECT * FROM matches WHERE id=$1", match_id)
    if not m:
        return err(404, "Match不存在")
    mp = await db.fetchrow("SELECT * FROM match_players WHERE id=$1", mp_id)
    if not mp or mp["match_id"] != match_id:
        return err(404, "玩家不存在")
    await db.execute("DELETE FROM match_players WHERE id=$1", mp_id)
    return ok(None, "玩家移除成功")


@router.post("/{match_id}/start")
async def start(match_id: str, user=Depends(get_current_user)):
    m = await db.fetchrow("SELECT * FROM matches WHERE id=$1", match_id)
    if not m:
        return err(404, "Match不存在")
    if m["creator_id"] != user["id"]:
        return err(403, "只有创建者可以开始游戏")
    try:
        await start_match(match_id)
    except Exception as e:
        return err(400, str(e))
    return ok(None, "游戏开始")


@router.post("/{match_id}/cancel")
async def cancel(match_id: str, user=Depends(get_current_user)):
    m = await db.fetchrow("SELECT * FROM matches WHERE id=$1", match_id)
    if not m:
        return err(404, "Match不存在")
    if m["creator_id"] != user["id"] and user.get("role") != "admin":
        return err(403, "只有创建者可以取消游戏")
    if m["status"] == "finished":
        return err(400, "已结束的游戏不能取消")
    try:
        await game_client.delete_host_match(m["game_id"], match_id)
    except Exception:
        pass
    await db.execute(
        """
        UPDATE matches SET status='cancelled', finished_at=COALESCE(finished_at, CURRENT_TIMESTAMP),
        updated_at=CURRENT_TIMESTAMP WHERE id=$1
        """,
        match_id,
    )
    return ok(None, "游戏已取消")


@router.post("/{match_id}/check-game-status")
async def check_game_status(match_id: str, user=Depends(get_current_user)):
    m = await db.fetchrow("SELECT * FROM matches WHERE id=$1", match_id)
    if not m:
        return err(404, "Match不存在")
    m = db.record_to_dict(m)
    if m["status"] != "playing":
        return ok({"status": m["status"], "result": m.get("result")}, "无运行时状态")
    try:
        state = await game_client.get_host_state(m["game_id"], match_id)
    except Exception:
        return ok({"status": m["status"], "result": m.get("result")}, "无运行时状态")

    if state.get("status") == "finished" or state.get("result"):
        await db.execute(
            """
            UPDATE matches SET status='finished', result=$2::jsonb,
            finished_at=COALESCE(finished_at, CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP
            WHERE id=$1 AND status='playing'
            """,
            match_id,
            json.dumps(state.get("result") or {}),
        )
        return ok(
            {
                "status": "finished",
                "turn": state.get("turn"),
                "result": state.get("result"),
                "G": state.get("G"),
            },
            "ok",
        )
    return ok(
        {
            "status": state.get("status") or "playing",
            "turn": state.get("turn"),
            "result": state.get("result"),
            "G": state.get("G"),
        },
        "ok",
    )
