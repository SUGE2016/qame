from __future__ import annotations

import random
import time

from fastapi import APIRouter, Depends

from .. import db
from ..auth_util import get_current_user
from ..resp import err, ok

router = APIRouter(prefix="/api/ai", tags=["ai"])

_AI_PLAYER_SELECT = """
SELECT
  ap.*,
  ac.name AS client_name,
  ac.endpoint AS client_endpoint,
  ac.supported_games AS client_supported_games
FROM ai_players ap
LEFT JOIN ai_clients ac ON ap.ai_client_id = ac.id
"""


@router.get("/clients")
async def clients(_user=Depends(get_current_user)):
    rows = await db.fetch("SELECT * FROM ai_clients ORDER BY created_at DESC")
    return ok([db.record_to_dict(r) for r in rows], "获取成功")


@router.get("/clients/{client_id}")
async def get_client(client_id: str, _user=Depends(get_current_user)):
    row = await db.fetchrow("SELECT * FROM ai_clients WHERE id=$1", client_id)
    if not row:
        return err(404, "AI客户端不存在")
    return ok(db.record_to_dict(row), "获取成功")


@router.post("/clients")
async def create_client(body: dict, _user=Depends(get_current_user)):
    name, endpoint = body.get("name"), body.get("endpoint")
    games = body.get("supported_games") or []
    if not name or not endpoint:
        return err(400, "缺少必要参数：name、endpoint")
    if not isinstance(games, list) or len(games) == 0:
        return err(400, "必须指定至少一个支持的游戏")
    cid = f"ai-client-{int(time.time() * 1000)}-{random.randint(1000, 9999)}"
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


@router.put("/clients/{client_id}")
async def update_client(client_id: str, body: dict, _user=Depends(get_current_user)):
    existing = await db.fetchrow("SELECT * FROM ai_clients WHERE id=$1", client_id)
    if not existing:
        return err(404, "AI客户端不存在")
    name = body.get("name", existing["name"])
    endpoint = body.get("endpoint", existing["endpoint"])
    games = body.get("supported_games", list(existing["supported_games"] or []))
    description = body.get("description", existing["description"])
    row = await db.fetchrow(
        """
        UPDATE ai_clients
        SET name=$2, endpoint=$3, supported_games=$4::text[], description=$5, updated_at=NOW()
        WHERE id=$1 RETURNING *
        """,
        client_id,
        name,
        endpoint,
        games,
        description,
    )
    return ok(db.record_to_dict(row), "更新成功")


@router.delete("/clients/{client_id}")
async def delete_client(client_id: str, _user=Depends(get_current_user)):
    row = await db.fetchrow("DELETE FROM ai_clients WHERE id=$1 RETURNING *", client_id)
    if not row:
        return err(404, "AI客户端不存在")
    return ok(None, "删除成功")


@router.get("/players/active")
async def ai_players_active(_user=Depends(get_current_user)):
    rows = await db.fetch(_AI_PLAYER_SELECT + " WHERE ap.status='active' ORDER BY ap.created_at DESC")
    return ok([db.record_to_dict(r) for r in rows], "获取成功")


@router.get("/players")
async def ai_players(_user=Depends(get_current_user)):
    rows = await db.fetch(_AI_PLAYER_SELECT + " ORDER BY ap.created_at DESC")
    return ok([db.record_to_dict(r) for r in rows], "获取成功")


@router.get("/players/{player_id}")
async def get_ai_player(player_id: int, _user=Depends(get_current_user)):
    row = await db.fetchrow(_AI_PLAYER_SELECT + " WHERE ap.id=$1", player_id)
    if not row:
        return err(404, "AI玩家不存在")
    return ok(db.record_to_dict(row), "获取成功")


@router.get("/clients/{client_id}/players")
async def players_by_client(client_id: str, _user=Depends(get_current_user)):
    rows = await db.fetch(
        _AI_PLAYER_SELECT + " WHERE ap.ai_client_id=$1 ORDER BY ap.created_at DESC",
        client_id,
    )
    return ok([db.record_to_dict(r) for r in rows], "获取成功")


@router.post("/players")
async def create_ai_player(body: dict, _user=Depends(get_current_user)):
    name = body.get("player_name")
    client_id = body.get("ai_client_id")
    if not name or not client_id:
        return err(400, "缺少必要参数：player_name、ai_client_id")
    client = await db.fetchrow("SELECT id FROM ai_clients WHERE id=$1", client_id)
    if not client:
        return err(400, "指定的AI客户端不存在")
    try:
        ap = await db.fetchrow(
            """
            INSERT INTO ai_players (player_name, ai_client_id, status)
            VALUES ($1,$2,'active') RETURNING *
            """,
            name,
            client_id,
        )
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            return err(400, "玩家名称已存在")
        raise
    p = await db.fetchrow(
        """
        INSERT INTO players (player_name, player_type, user_id, ai_player_id, status)
        VALUES ($1,'ai',NULL,$2,'active') RETURNING *
        """,
        name,
        ap["id"],
    )
    return ok({"aiPlayer": db.record_to_dict(ap), "player": db.record_to_dict(p)}, "创建成功")


@router.put("/players/{player_id}")
async def update_ai_player(player_id: int, body: dict, _user=Depends(get_current_user)):
    existing = await db.fetchrow("SELECT * FROM ai_players WHERE id=$1", player_id)
    if not existing:
        return err(404, "AI玩家不存在")
    player_name = body.get("player_name", existing["player_name"])
    status = body.get("status", existing["status"])
    try:
        row = await db.fetchrow(
            """
            UPDATE ai_players
            SET player_name=$2, status=$3, updated_at=NOW()
            WHERE id=$1 RETURNING *
            """,
            player_id,
            player_name,
            status,
        )
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            return err(400, "玩家名称已存在")
        raise
    await db.execute(
        "UPDATE players SET player_name=$2, status=$3, updated_at=NOW() WHERE ai_player_id=$1",
        player_id,
        player_name,
        status,
    )
    return ok(db.record_to_dict(row), "更新成功")


@router.delete("/players/{player_id}")
async def delete_ai_player(player_id: int, _user=Depends(get_current_user)):
    row = await db.fetchrow("DELETE FROM ai_players WHERE id=$1 RETURNING *", player_id)
    if not row:
        return err(404, "AI玩家不存在")
    return ok(None, "删除成功")


@router.get("/clients/{client_id}/supports/{game_type}")
async def client_supports(client_id: str, game_type: str, _user=Depends(get_current_user)):
    row = await db.fetchrow("SELECT supported_games FROM ai_clients WHERE id=$1", client_id)
    games = list(row["supported_games"] or []) if row else []
    return ok({"supports": game_type in games}, "检查成功")


@router.get("/players/{player_id}/supports/{game_type}")
async def player_supports(player_id: int, game_type: str, _user=Depends(get_current_user)):
    row = await db.fetchrow(_AI_PLAYER_SELECT + " WHERE ap.id=$1", player_id)
    games = list(row["client_supported_games"] or []) if row else []
    return ok({"supports": game_type in games}, "检查成功")


@router.get("/health")
async def ai_health():
    return ok({"service": "ai-manager", "runtime": "python-platform"}, "AI管理服务运行正常")
