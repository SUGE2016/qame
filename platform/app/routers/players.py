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
