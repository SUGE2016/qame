import json
import uuid

from fastapi import APIRouter, Depends, Request

from .. import db
from ..audit import write_audit
from ..auth_util import get_current_user, issue_seat_token
from ..match_service import cancel_match, load_match_players, reconcile_match_roster, start_match
from ..resp import err, ok
from .. import game_client
from ..schemas import AddPlayerBody, BatchDeleteBody, CreateMatchBody, parse_body

router = APIRouter(prefix="/api/matches", tags=["matches"])


def _display_player(p: dict) -> dict:
    return {
        "id": p["id"],
        "seatIndex": p["seatIndex"],
        "playerId": p["playerId"],
        "playerType": p["playerType"],
        "playerName": p["playerName"],
        "userId": p.get("userId"),
    }


@router.get("")
@router.get("/")
async def list_matches(
    gameId: str | None = None,
    status: str | None = None,
    q: str | None = None,
    scope: str | None = None,
    page: int | None = None,
    limit: int = 20,
    order: str = "desc",
    user=Depends(get_current_user),
):
    clauses = ["1=1"]
    args: list = []
    if gameId:
        args.append(gameId)
        clauses.append(f"m.game_id=${len(args)}")
    if status:
        args.append(status)
        clauses.append(f"m.status=${len(args)}")
    elif scope == "live":
        clauses.append("m.status IN ('waiting','playing')")
    elif scope == "done":
        clauses.append("m.status IN ('finished','cancelled')")
    if q and q.strip():
        args.append(f"%{q.strip()}%")
        n = len(args)
        clauses.append(
            f"""(
              m.id ILIKE ${n} OR m.game_id ILIKE ${n} OR g.name ILIKE ${n}
              OR COALESCE(u.username,'') ILIKE ${n}
              OR EXISTS (
                SELECT 1 FROM match_players mp
                LEFT JOIN players p ON p.id = mp.player_id
                WHERE mp.match_id = m.id AND COALESCE(p.player_name,'') ILIKE ${n}
              )
            )"""
        )
    where = " AND ".join(clauses)
    order_sql = "ASC" if order == "asc" else "DESC"
    from_sql = """
        FROM matches m
        JOIN games g ON g.id = m.game_id
        LEFT JOIN users u ON u.id = m.creator_id
        WHERE
    """
    paged = page is not None
    if paged:
        page = max(1, page)
        limit = min(max(1, limit), 100)
        offset = (page - 1) * limit
        total = await db.fetchrow(f"SELECT COUNT(*)::int AS c {from_sql} {where}", *args)
        args.extend([limit, offset])
        sql = f"""
            SELECT m.*, g.name AS game_name, u.username AS creator_name
            {from_sql} {where}
            ORDER BY m.created_at {order_sql}
            LIMIT ${len(args)-1} OFFSET ${len(args)}
        """
    else:
        total = None
        sql = f"""
            SELECT m.*, g.name AS game_name, u.username AS creator_name
            {from_sql} {where}
            ORDER BY m.created_at {order_sql}
            LIMIT 100
        """
    rows = await db.fetch(sql, *args)
    out = []
    for r in rows:
        m = db.record_to_dict(r)
        m.pop("host_snapshot", None)
        players = await load_match_players(m["id"])
        m["players"] = [_display_player(p) for p in players]
        m["currentPlayerCount"] = len(players)
        out.append(m)
    if not paged:
        return ok(out, "获取match列表成功")
    return ok(
        {"matches": out, "page": page, "limit": limit, "total": total["c"] if total else 0},
        "获取match列表成功",
    )


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
        LEFT JOIN users u ON u.id=m.creator_id
        WHERE m.id=$1
        """,
        match_id,
    )
    if not row:
        return err(404, "Match不存在")
    m = db.record_to_dict(row)
    m.pop("host_snapshot", None)
    players = await load_match_players(match_id)
    m["players"] = [_display_player(p) for p in players]
    m["currentPlayerCount"] = len(players)
    return ok(m, "获取match详情成功")


def _delete_denied(user: dict, m) -> str | None:
    status = m["status"]
    is_admin = user.get("role") == "admin"
    is_creator = m["creator_id"] == user["id"]
    if status == "playing":
        return "进行中的对局不能删除"
    if status == "waiting":
        return None if (is_admin or is_creator) else "无权限"
    if status in ("finished", "cancelled"):
        return None if is_admin else "无权限"
    return "当前状态不允许删除"


@router.post("/batch-delete")
async def batch_delete(body: dict, request: Request, user=Depends(get_current_user)):
    req, bad = parse_body(BatchDeleteBody, body)
    if bad:
        return bad
    ids = req.ids
    if not ids:
        return err(400, "ids 不能为空")
    if len(ids) > 100:
        return err(400, "一次最多删除 100 条")
    deleted: list[str] = []
    skipped: list[dict] = []
    for match_id in ids:
        if not isinstance(match_id, str) or not match_id:
            skipped.append({"id": match_id, "reason": "无效 id"})
            continue
        m = await db.fetchrow("SELECT * FROM matches WHERE id=$1", match_id)
        if not m:
            skipped.append({"id": match_id, "reason": "不存在"})
            continue
        reason = _delete_denied(user, m)
        if reason:
            skipped.append({"id": match_id, "reason": reason})
            continue
        try:
            await game_client.delete_host_match(m["game_id"], match_id)
        except Exception:
            pass
        await db.execute("DELETE FROM matches WHERE id=$1", match_id)
        deleted.append(match_id)
    if deleted:
        await write_audit(user, "delete", "match", None, {"ids": deleted, "count": len(deleted)}, request)
    return ok({"deleted": deleted, "skipped": skipped, "deletedCount": len(deleted)}, "批量删除完成")


@router.delete("/{match_id}")
async def delete_match(match_id: str, request: Request, user=Depends(get_current_user)):
    m = await db.fetchrow("SELECT * FROM matches WHERE id=$1", match_id)
    if not m:
        return err(404, "Match不存在")
    reason = _delete_denied(user, m)
    if reason:
        return err(403, reason)
    try:
        await game_client.delete_host_match(m["game_id"], match_id)
    except Exception:
        pass
    await db.execute("DELETE FROM matches WHERE id=$1", match_id)
    await write_audit(user, "delete", "match", match_id, {"status": m["status"]}, request)
    return ok(None, "Match删除成功")


@router.post("/{match_id}/players")
async def add_player(match_id: str, body: dict, user=Depends(get_current_user)):
    req, bad = parse_body(AddPlayerBody, body)
    if bad:
        return bad
    player_id = req.player_id
    seat_index = req.seat_index
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
    player = await db.fetchrow("SELECT * FROM players WHERE id=$1", mp["player_id"])
    is_admin = user.get("role") == "admin"
    is_creator = m["creator_id"] == user["id"]
    is_self = bool(
        player and player["player_type"] == "human" and player["user_id"] == user["id"]
    )
    status = m["status"]
    if status == "playing":
        if not is_admin:
            return err(403, "进行中不能移出玩家")
    elif status == "waiting":
        if not (is_admin or is_creator or is_self):
            return err(403, "无权限")
    else:
        return err(400, "当前状态不能移出玩家")
    await db.execute("DELETE FROM match_players WHERE id=$1", mp_id)
    await reconcile_match_roster(match_id)
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
    try:
        await cancel_match(match_id)
    except Exception as e:
        return err(400, str(e))
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
