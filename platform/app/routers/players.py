from fastapi import APIRouter, Depends

from .. import db
from ..auth_util import get_current_user
from ..resp import err, ok

router = APIRouter(prefix="/api/players", tags=["players"])


@router.get("/me")
async def me(user=Depends(get_current_user)):
    row = await db.fetchrow(
        "SELECT * FROM players WHERE user_id=$1 AND player_type='human'", user["id"]
    )
    if not row:
        return err(404, "当前用户没有对应的玩家记录")
    return ok(db.record_to_dict(row), "获取当前用户玩家信息成功")


@router.post("/me/ensure")
async def ensure(user=Depends(get_current_user), body: dict | None = None):
    body = body or {}
    row = await db.fetchrow(
        "SELECT * FROM players WHERE user_id=$1 AND player_type='human'", user["id"]
    )
    if row:
        return ok(db.record_to_dict(row))
    name = body.get("player_name") or user["username"]
    row = await db.fetchrow(
        """
        INSERT INTO players (player_name, player_type, user_id, ai_player_id, status)
        VALUES ($1,'human',$2,NULL,'active') RETURNING *
        """,
        name,
        user["id"],
    )
    return ok(db.record_to_dict(row))


@router.get("")
@router.get("/")
async def list_players(
    player_type: str | None = None,
    status: str | None = None,
    limit: int = 100,
    offset: int = 0,
    _user=Depends(get_current_user),
):
    clauses = ["1=1"]
    args: list = []
    if player_type:
        args.append(player_type)
        clauses.append(f"player_type=${len(args)}")
    if status:
        args.append(status)
        clauses.append(f"status=${len(args)}")
    args.append(min(max(1, limit), 500))
    lim_i = len(args)
    args.append(max(0, offset))
    off_i = len(args)
    rows = await db.fetch(
        f"SELECT * FROM players WHERE {' AND '.join(clauses)} ORDER BY created_at DESC LIMIT ${lim_i} OFFSET ${off_i}",
        *args,
    )
    players = [db.record_to_dict(r) for r in rows]
    return ok({"players": players, "total": len(players)}, "获取玩家列表成功")


@router.get("/{player_id}")
async def get_player(player_id: int, _user=Depends(get_current_user)):
    row = await db.fetchrow("SELECT * FROM players WHERE id=$1", player_id)
    if not row:
        return err(404, "玩家不存在")
    return ok(db.record_to_dict(row), "获取玩家信息成功")


@router.patch("/{player_id}/status")
async def patch_status(player_id: int, body: dict, _user=Depends(get_current_user)):
    status = body.get("status")
    if status not in ("active", "inactive", "offline"):
        return err(400, "状态参数无效")
    row = await db.fetchrow(
        "UPDATE players SET status=$2, updated_at=NOW() WHERE id=$1 RETURNING *",
        player_id,
        status,
    )
    if not row:
        return err(404, "玩家不存在")
    return ok(db.record_to_dict(row), "更新玩家状态成功")
