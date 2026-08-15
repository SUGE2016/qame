from __future__ import annotations

import re
import time

from fastapi import APIRouter, Depends, Request

import httpx

from .. import db
from ..audit import write_audit
from ..auth_util import hash_password, require_admin
from ..config import settings
from ..match_service import close_open_matches_for_user
from ..resp import err, ok
from ..schemas import CreateGameBody, CreateUserBody, UpdateGameBody, UpdateUserBody, parse_body

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users")
async def list_users(
    page: int = 1,
    limit: int = 20,
    q: str | None = None,
    role: str | None = None,
    order: str = "desc",
    _admin=Depends(require_admin),
):
    page = max(1, page)
    limit = min(max(1, limit), 100)
    offset = (page - 1) * limit
    clauses = ["1=1"]
    args: list = []
    if q and q.strip():
        args.append(f"%{q.strip()}%")
        n = len(args)
        clauses.append(f"(username ILIKE ${n} OR id::text ILIKE ${n})")
    if role in ("user", "admin"):
        args.append(role)
        clauses.append(f"role=${len(args)}")
    where = " AND ".join(clauses)
    order_sql = "ASC" if order == "asc" else "DESC"
    total = await db.fetchrow(f"SELECT COUNT(*)::int AS c FROM users WHERE {where}", *args)
    args.extend([limit, offset])
    rows = await db.fetch(
        f"SELECT id, username, role, created_at FROM users WHERE {where} ORDER BY created_at {order_sql} LIMIT ${len(args)-1} OFFSET ${len(args)}",
        *args,
    )
    return ok(
        {
            "users": [db.record_to_dict(r) for r in rows],
            "page": page,
            "limit": limit,
            "total": total["c"] if total else 0,
        },
        "获取用户列表成功",
    )


@router.post("/users")
async def create_user(body: dict, request: Request, admin=Depends(require_admin)):
    req, bad = parse_body(CreateUserBody, body)
    if bad:
        return bad
    username = (req.username or "").strip()
    password = req.password or ""
    role = req.role or "user"
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
    await write_audit(admin, "create", "user", u["id"], {"username": u["username"], "role": u["role"]}, request)
    return ok(
        {"id": u["id"], "username": u["username"], "role": u["role"], "createdAt": u.get("created_at")},
        "创建用户成功",
    )


@router.put("/users/{user_id}")
async def update_user(user_id: int, body: dict, request: Request, admin=Depends(require_admin)):
    req, bad = parse_body(UpdateUserBody, body)
    if bad:
        return bad
    username = (req.username or "").strip()
    role = req.role
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
    await write_audit(admin, "update", "user", user_id, {"username": username, "role": role}, request)
    return ok(db.record_to_dict(row), "更新用户信息成功")


@router.delete("/users/{user_id}")
async def delete_user(user_id: int, request: Request, admin=Depends(require_admin)):
    if user_id == admin["id"]:
        return err(400, "不能删除自己的账户")
    await close_open_matches_for_user(user_id)
    row = await db.fetchrow(
        "DELETE FROM users WHERE id=$1 RETURNING id, username, role, created_at",
        user_id,
    )
    if not row:
        return err(404, "用户不存在")
    deleted = db.record_to_dict(row)
    await write_audit(admin, "delete", "user", user_id, {"username": deleted.get("username")}, request)
    return ok(deleted, "删除用户成功")


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
          (SELECT COUNT(*)::int FROM players) AS total_players
        """
    )
    return ok(db.record_to_dict(row), "获取系统统计成功")


@router.post("/games")
async def create_game(body: dict, request: Request, admin=Depends(require_admin)):
    req, bad = parse_body(CreateGameBody, body)
    if bad:
        return bad
    gid = (req.id or "").strip() or None
    name = (req.name or "").strip()
    description = req.description
    min_players = int(req.min_players or 2)
    max_players = int(req.max_players or 2)
    status = req.status or "active"
    host_url = (req.host_url or "").strip() or None

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
            INSERT INTO games (id, name, description, min_players, max_players, status, host_url)
            VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
            """,
            gid,
            name,
            description.strip() if isinstance(description, str) and description.strip() else None,
            min_players,
            max_players,
            status,
            host_url,
        )
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            return err(409, "游戏ID或名称已存在")
        raise
    game = db.record_to_dict(row)
    await write_audit(admin, "create", "game", game.get("id"), {"name": game.get("name")}, request)
    return ok({"game": game}, "创建游戏成功")


@router.put("/games/{game_id}")
async def update_game(game_id: str, body: dict, request: Request, admin=Depends(require_admin)):
    req, bad = parse_body(UpdateGameBody, body)
    if bad:
        return bad
    existing = await db.fetchrow("SELECT * FROM games WHERE id=$1", game_id)
    if not existing:
        return err(404, "游戏不存在")
    name = req.name
    description = req.description
    min_players = req.min_players
    max_players = req.max_players
    status = req.status
    host_url = req.host_url

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
          host_url=CASE WHEN $8::boolean THEN $9 ELSE host_url END,
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
        host_url is not None,
        (host_url.strip() or None) if isinstance(host_url, str) else host_url,
    )
    game = db.record_to_dict(row)
    await write_audit(admin, "update", "game", game_id, {"name": game.get("name"), "status": game.get("status")}, request)
    return ok({"game": game}, "更新游戏成功")


@router.delete("/games/{game_id}")
async def delete_game(game_id: str, request: Request, admin=Depends(require_admin)):
    existing = await db.fetchrow("SELECT id FROM games WHERE id=$1", game_id)
    if not existing:
        return err(404, "游戏不存在")
    cnt = await db.fetchrow("SELECT COUNT(*)::int AS c FROM matches WHERE game_id=$1", game_id)
    if cnt and cnt["c"] > 0:
        return err(400, f"无法删除游戏，还有 {cnt['c']} 个相关比赛记录")
    await db.execute("DELETE FROM games WHERE id=$1", game_id)
    await write_audit(admin, "delete", "game", game_id, {}, request)
    return ok(None, "删除游戏成功")


async def _probe(url: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(f"{url.rstrip('/')}/health")
            return {"ok": r.status_code < 500, "statusCode": r.status_code}
    except Exception as e:
        return {"ok": False, "error": str(e)[:160]}


@router.get("/overview")
async def admin_overview(_admin=Depends(require_admin)):
    stats = await db.fetchrow(
        """
        SELECT
          (SELECT COUNT(*)::int FROM users) AS total_users,
          (SELECT COUNT(*)::int FROM users WHERE role='admin') AS admin_users,
          (SELECT COUNT(*)::int FROM games) AS total_games,
          (SELECT COUNT(*)::int FROM games WHERE status='active') AS active_games,
          (SELECT COUNT(*)::int FROM matches) AS total_matches,
          (SELECT COUNT(*)::int FROM matches WHERE status='waiting') AS waiting_matches,
          (SELECT COUNT(*)::int FROM matches WHERE status='playing') AS playing_matches,
          (SELECT COUNT(*)::int FROM matches WHERE status='finished') AS finished_matches,
          (SELECT COUNT(*)::int FROM matches WHERE status='cancelled') AS cancelled_matches,
          (SELECT COUNT(*)::int FROM players) AS total_players
        """
    )
    undermanned = await db.fetchrow(
        """
        SELECT COUNT(*)::int AS c
        FROM matches m
        WHERE m.status='playing'
          AND (
            SELECT COUNT(*) FROM match_players mp
            WHERE mp.match_id=m.id AND mp.status='joined'
          ) < m.min_players
        """
    )
    games = await db.fetch("SELECT id, name, status FROM games ORDER BY id")
    urls = settings()["game_urls"]
    health = {"platform": {"ok": True}}
    for g in games:
        gid = g["id"]
        base = urls.get(gid)
        health[gid] = await _probe(base) if base else {"ok": False, "error": "未配置游戏服务"}
    return ok(
        {
            "stats": db.record_to_dict(stats),
            "undermannedPlaying": (undermanned["c"] if undermanned else 0),
            "health": health,
        },
        "ok",
    )


@router.get("/audit")
async def list_audit(
    page: int = 1,
    limit: int = 20,
    q: str | None = None,
    action: str | None = None,
    _admin=Depends(require_admin),
):
    page = max(1, page)
    limit = min(max(1, limit), 100)
    offset = (page - 1) * limit
    clauses = ["1=1"]
    args: list = []
    if q and q.strip():
        args.append(f"%{q.strip()}%")
        n = len(args)
        clauses.append(
            f"(COALESCE(username,'') ILIKE ${n} OR action ILIKE ${n} OR resource ILIKE ${n} OR COALESCE(resource_id,'') ILIKE ${n} OR COALESCE(detail::text,'') ILIKE ${n})"
        )
    if action and action not in ("all",):
        args.append(action)
        clauses.append(f"action=${len(args)}")
    where = " AND ".join(clauses)
    total = await db.fetchrow(f"SELECT COUNT(*)::int AS c FROM admin_audit_logs WHERE {where}", *args)
    args.extend([limit, offset])
    rows = await db.fetch(
        f"""
        SELECT id, user_id, username, action, resource, resource_id, detail, ip, created_at
        FROM admin_audit_logs
        WHERE {where}
        ORDER BY created_at DESC
        LIMIT ${len(args)-1} OFFSET ${len(args)}
        """,
        *args,
    )
    return ok(
        {
            "logs": [db.record_to_dict(r) for r in rows],
            "page": page,
            "limit": limit,
            "total": total["c"] if total else 0,
        }
    )
