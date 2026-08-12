from fastapi import APIRouter, Depends

from .. import db
from ..auth_util import get_current_user
from ..resp import err, ok

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.get("/clients")
async def clients(_user=Depends(get_current_user)):
    rows = await db.fetch("SELECT * FROM ai_clients ORDER BY created_at DESC")
    return ok([db.record_to_dict(r) for r in rows], "获取成功")


@router.post("/clients")
async def create_client(body: dict, _user=Depends(get_current_user)):
    name, endpoint = body.get("name"), body.get("endpoint")
    games = body.get("supported_games") or []
    if not name or not endpoint:
        return err(400, "缺少必要参数：name、endpoint")
    cid = f"ai-client-{int(__import__('time').time()*1000)}"
    row = await db.fetchrow(
        """
        INSERT INTO ai_clients (id, name, endpoint, supported_games, description, status)
        VALUES ($1,$2,$3,$4::text[],$5,'active') RETURNING *
        """,
        cid,
        name,
        endpoint,
        games,
        body.get("description") or "",
    )
    return ok(db.record_to_dict(row), "创建成功")


@router.get("/players")
async def ai_players(_user=Depends(get_current_user)):
    rows = await db.fetch("SELECT * FROM ai_players ORDER BY created_at DESC")
    return ok([db.record_to_dict(r) for r in rows], "获取成功")


@router.post("/players")
async def create_ai_player(body: dict, _user=Depends(get_current_user)):
    name = body.get("player_name")
    client_id = body.get("ai_client_id")
    if not name or not client_id:
        return err(400, "缺少 player_name / ai_client_id")
    ap = await db.fetchrow(
        """
        INSERT INTO ai_players (player_name, ai_client_id, status)
        VALUES ($1,$2,'active') RETURNING *
        """,
        name,
        client_id,
    )
    p = await db.fetchrow(
        """
        INSERT INTO players (player_name, player_type, user_id, ai_player_id, status)
        VALUES ($1,'ai',NULL,$2,'active') RETURNING *
        """,
        name,
        ap["id"],
    )
    return ok({"aiPlayer": db.record_to_dict(ap), "player": db.record_to_dict(p)}, "创建成功")
