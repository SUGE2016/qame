from __future__ import annotations

import re
import time

from fastapi import APIRouter, Depends

from .. import db
from ..auth_util import hash_password, require_admin
from ..resp import err, ok

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users")
async def list_users(page: int = 1, limit: int = 10, _admin=Depends(require_admin)):
    page = max(1, page)
    limit = min(max(1, limit), 100)
    offset = (page - 1) * limit
    rows = await db.fetch(
        "SELECT id, username, role, created_at FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2",
        limit,
        offset,
    )
    return ok({"users": [db.record_to_dict(r) for r in rows], "page": page, "limit": limit}, "获取用户列表成功")


@router.post("/users")
async def create_user(body: dict, _admin=Depends(require_admin)):
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    role = body.get("role") or "user"
    if not username or not password:
        return err(400, "用户名和密码不能为空")
    if not (3 <= len(username) <= 20):
        return err(400, "用户名长度必须在3-20个字符之间")
    if len(password) < 6:
        return err(400, "密码长度不能少于6个字符")
    if role not in ("user", "admin"):
        return err(400, "角色必须是user或admin")
    existing = await db.fetchrow("SELECT id FROM users WHERE username=$1", username)
    if existing:
        return err(409, "用户名已存在")
    row = await db.fetchrow(
        """
        INSERT INTO users (username, password_hash, role)
        VALUES ($1,$2,$3)
        RETURNING id, username, role, created_at
        """,
        username,
        hash_password(password),
        role,
    )
    u = db.record_to_dict(row)
    return ok(
        {"id": u["id"], "username": u["username"], "role": u["role"], "createdAt": u.get("created_at")},
        "创建用户成功",
    )


@router.put("/users/{user_id}")
async def update_user(user_id: int, body: dict, _admin=Depends(require_admin)):
    username = (body.get("username") or "").strip()
    role = body.get("role")
    if not username:
        return err(400, "用户名不能为空")
    if not (3 <= len(username) <= 20):
        return err(400, "用户名长度必须在3-20个字符之间")
    existing = await db.fetchrow("SELECT id FROM users WHERE username=$1 AND id<>$2", username, user_id)
    if existing:
        return err(409, "用户名已存在")
    if role is not None and role not in ("user", "admin"):
        return err(400, "角色必须是user或admin")
    if role in ("user", "admin"):
        row = await db.fetchrow(
            """
            UPDATE users SET username=$1, role=$2, updated_at=NOW()
            WHERE id=$3
            RETURNING id, username, role, created_at, updated_at
            """,
            username,
            role,
            user_id,
        )
    else:
        row = await db.fetchrow(
            """
            UPDATE users SET username=$1, updated_at=NOW()
            WHERE id=$2
            RETURNING id, username, role, created_at, updated_at
            """,
            username,
            user_id,
        )
    if not row:
        return err(404, "用户不存在")
    return ok(db.record_to_dict(row), "更新用户信息成功")


@router.delete("/users/{user_id}")
async def delete_user(user_id: int, admin=Depends(require_admin)):
    if user_id == admin["id"]:
        return err(400, "不能删除自己的账户")
    row = await db.fetchrow(
        "DELETE FROM users WHERE id=$1 RETURNING id, username, role, created_at",
        user_id,
    )
    if not row:
        return err(404, "用户不存在")
    return ok(db.record_to_dict(row), "删除用户成功")


@router.get("/stats")
async def admin_stats(_admin=Depends(require_admin)):
    row = await db.fetchrow(
        """
        SELECT
          (SELECT COUNT(*)::int FROM users) AS total_users,
          (SELECT COUNT(*)::int FROM users WHERE role='admin') AS admin_users,
          (SELECT COUNT(*)::int FROM games) AS total_games,
          (SELECT COUNT(*)::int FROM games WHERE status='active') AS active_games,
          (SELECT COUNT(*)::int FROM matches) AS total_matches,
          (SELECT COUNT(*)::int FROM matches WHERE status='playing') AS playing_matches,
          (SELECT COUNT(*)::int FROM players) AS total_players,
          (SELECT COUNT(*)::int FROM players WHERE player_type='human') AS human_players,
          (SELECT COUNT(*)::int FROM players WHERE player_type='ai') AS ai_players
        """
    )
    return ok(db.record_to_dict(row), "获取系统统计成功")


@router.post("/games")
async def create_game(body: dict, _admin=Depends(require_admin)):
    gid = (body.get("id") or "").strip() or None
    name = (body.get("name") or "").strip()
    description = body.get("description")
    min_players = int(body.get("min_players") or 2)
    max_players = int(body.get("max_players") or 2)
    status = body.get("status") or "active"

    if not name:
        return err(400, "游戏名称不能为空")
    if len(name) > 100:
        return err(400, "游戏名称不能超过100个字符")
    if description and len(description) > 500:
        return err(400, "游戏描述不能超过500个字符")
    if gid is not None:
        if not gid or len(gid) > 255:
            return err(400, "游戏ID不能为空且不能超过255个字符")
        if not re.fullmatch(r"[a-zA-Z0-9_-]+", gid):
            return err(400, "游戏ID只能包含字母、数字、下划线和连字符")
    if not (1 <= min_players <= 10) or not (1 <= max_players <= 10):
        return err(400, "玩家数必须在1-10之间")
    if min_players > max_players:
        return err(400, "最少玩家数不能大于最多玩家数")
    if status not in ("active", "inactive"):
        return err(400, "状态必须是active或inactive")

    if not gid:
        gid = f"game-{int(time.time() * 1000)}"
    try:
        row = await db.fetchrow(
            """
            INSERT INTO games (id, name, description, min_players, max_players, status)
            VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
            """,
            gid,
            name,
            description.strip() if isinstance(description, str) and description.strip() else None,
            min_players,
            max_players,
            status,
        )
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            return err(409, "游戏ID或名称已存在")
        raise
    return ok({"game": db.record_to_dict(row)}, "创建游戏成功")


@router.put("/games/{game_id}")
async def update_game(game_id: str, body: dict, _admin=Depends(require_admin)):
    existing = await db.fetchrow("SELECT * FROM games WHERE id=$1", game_id)
    if not existing:
        return err(404, "游戏不存在")
    name = body.get("name")
    description = body.get("description")
    min_players = body.get("min_players")
    max_players = body.get("max_players")
    status = body.get("status")

    if name is not None:
        name = name.strip()
        if not name:
            return err(400, "游戏名称不能为空")
        if len(name) > 100:
            return err(400, "游戏名称不能超过100个字符")
    if description is not None and description and len(description) > 500:
        return err(400, "游戏描述不能超过500个字符")
    final_min = int(min_players) if min_players is not None else existing["min_players"]
    final_max = int(max_players) if max_players is not None else existing["max_players"]
    if not (1 <= final_min <= 10) or not (1 <= final_max <= 10):
        return err(400, "玩家数必须在1-10之间")
    if final_min > final_max:
        return err(400, "最少玩家数不能大于最多玩家数")
    if status is not None and status not in ("active", "inactive"):
        return err(400, "状态必须是active或inactive")

    row = await db.fetchrow(
        """
        UPDATE games SET
          name=COALESCE($2, name),
          description=CASE WHEN $3::boolean THEN $4 ELSE description END,
          min_players=$5,
          max_players=$6,
          status=COALESCE($7, status),
          updated_at=NOW()
        WHERE id=$1
        RETURNING *
        """,
        game_id,
        name,
        description is not None,
        (description.strip() if isinstance(description, str) and description.strip() else None)
        if description is not None
        else None,
        final_min,
        final_max,
        status,
    )
    return ok({"game": db.record_to_dict(row)}, "更新游戏成功")


@router.delete("/games/{game_id}")
async def delete_game(game_id: str, _admin=Depends(require_admin)):
    existing = await db.fetchrow("SELECT id FROM games WHERE id=$1", game_id)
    if not existing:
        return err(404, "游戏不存在")
    cnt = await db.fetchrow("SELECT COUNT(*)::int AS c FROM matches WHERE game_id=$1", game_id)
    if cnt and cnt["c"] > 0:
        return err(400, f"无法删除游戏，还有 {cnt['c']} 个相关比赛记录")
    await db.execute("DELETE FROM games WHERE id=$1", game_id)
    return ok(None, "删除游戏成功")
