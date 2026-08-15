from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Cookie, Depends
from fastapi.responses import JSONResponse

from .. import db
from ..auth_util import (
    create_access_token,
    get_current_user,
    hash_digest,
    hash_password,
    hash_pat,
    needs_rehash,
    new_pat,
    new_refresh_token,
    verify_password,
)
from ..resp import err, ok
from ..schemas import CreatePatBody, LoginBody, RefreshBody, parse_body

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_auth_cookies(resp: JSONResponse, access: str, refresh: str | None = None):
    # 必须写在返回的 JSONResponse 上；写在注入的 Response 上会被丢掉
    resp.set_cookie(
        "access_token",
        access,
        httponly=True,
        samesite="lax",
        path="/",
        max_age=3600,
    )
    if refresh is not None:
        resp.set_cookie(
            "refresh_token",
            refresh,
            httponly=True,
            samesite="lax",
            path="/",
            max_age=7 * 86400,
        )


@router.post("/login")
async def login(body: dict):
    req, bad = parse_body(LoginBody, body)
    if bad:
        return bad
    username = req.username.strip()
    hashed = req.hashed_password
    password = req.password
    if not username or (not hashed and not password):
        return err(400, "用户名和密码不能为空")
    row = await db.fetchrow("SELECT * FROM users WHERE username=$1", username)
    stored = row["password_hash"] if row else None
    if not stored or not verify_password(stored, hashed=hashed, password=password):
        return err(401, "用户名或密码错误")
    if needs_rehash(stored):
        upgraded = hash_password(password) if password else hash_digest(hashed)
        await db.execute("UPDATE users SET password_hash=$2 WHERE id=$1", row["id"], upgraded)
    user = db.record_to_dict(row)
    access = create_access_token(user)
    refresh = new_refresh_token()
    exp = datetime.now(timezone.utc) + timedelta(days=7)
    await db.execute(
        "INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1,$2,$3)",
        user["id"],
        refresh,
        exp.replace(tzinfo=None),
    )
    resp = ok(
        {
            "user": {
                "id": user["id"],
                "username": user["username"],
                "role": user["role"],
                "createdAt": user.get("created_at"),
            },
            "accessToken": access,
            "refreshToken": refresh,
            "expiresIn": "60m",
        },
        "登录成功",
    )
    _set_auth_cookies(resp, access, refresh)
    return resp


@router.post("/refresh")
async def refresh_token(
    body: dict | None = None,
    refresh_token_cookie: Optional[str] = Cookie(default=None, alias="refresh_token"),
):
    parsed, _bad = parse_body(RefreshBody, body or {})
    token = (parsed.refresh_token if parsed else None) or refresh_token_cookie
    if not token:
        return err(401, "Refresh Token不存在")
    row = await db.fetchrow(
        "SELECT user_id FROM refresh_tokens WHERE token=$1 AND expires_at > NOW()",
        token,
    )
    if not row:
        return err(401, "Refresh Token无效")
    user_row = await db.fetchrow("SELECT * FROM users WHERE id=$1", row["user_id"])
    if not user_row:
        return err(401, "用户不存在")
    await db.execute("DELETE FROM refresh_tokens WHERE token=$1", token)
    user = db.record_to_dict(user_row)
    access = create_access_token(user)
    refresh = new_refresh_token()
    exp = datetime.now(timezone.utc) + timedelta(days=7)
    await db.execute(
        "INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1,$2,$3)",
        user["id"],
        refresh,
        exp.replace(tzinfo=None),
    )
    resp = ok(
        {
            "user": {
                "id": user["id"],
                "username": user["username"],
                "role": user["role"],
                "createdAt": user.get("created_at"),
            },
            "accessToken": access,
            "refreshToken": refresh,
            "expiresIn": "60m",
        },
        "Token刷新成功",
    )
    _set_auth_cookies(resp, access, refresh)
    return resp


@router.get("/verify")
async def verify(user=Depends(get_current_user)):
    return ok({"user": {"id": user["id"], "username": user["username"], "role": user["role"]}})


@router.get("/profile")
async def profile(user=Depends(get_current_user)):
    return ok(user)


@router.post("/logout")
async def logout(
    refresh_token_cookie: Optional[str] = Cookie(default=None, alias="refresh_token"),
):
    if refresh_token_cookie:
        await db.execute("DELETE FROM refresh_tokens WHERE token=$1", refresh_token_cookie)
    resp = ok(None, "已退出")
    resp.delete_cookie("access_token", path="/")
    resp.delete_cookie("refresh_token", path="/")
    return resp


def _pat_public(row) -> dict:
    d = db.record_to_dict(row)
    return {
        "id": d["id"],
        "name": d["name"],
        "tokenPrefix": d["token_prefix"],
        "expiresAt": d.get("expires_at"),
        "lastUsedAt": d.get("last_used_at"),
        "createdAt": d.get("created_at"),
    }


@router.post("/pats")
async def create_pat(body: dict | None = None, user=Depends(get_current_user)):
    req, bad = parse_body(CreatePatBody, body or {})
    if bad:
        return bad
    name = (req.name or "mcp").strip()[:80] or "mcp"
    days = req.expires_in_days
    expires_at = None
    if days is not None:
        try:
            days_i = int(days)
        except (TypeError, ValueError):
            return err(400, "expiresInDays 必须是数字")
        if days_i <= 0:
            return err(400, "expiresInDays 必须大于 0")
        expires_at = datetime.now(timezone.utc) + timedelta(days=days_i)
    raw = new_pat()
    row = await db.fetchrow(
        """
        INSERT INTO personal_access_tokens (user_id, name, token_hash, token_prefix, expires_at)
        VALUES ($1,$2,$3,$4,$5)
        RETURNING id, name, token_prefix, expires_at, last_used_at, created_at
        """,
        user["id"],
        name,
        hash_pat(raw),
        raw[:14],
        expires_at.replace(tzinfo=None) if expires_at else None,
    )
    data = _pat_public(row)
    data["token"] = raw
    data["note"] = "token 只显示一次，请写入 QAME_TOKEN，不要提交到仓库"
    return ok(data, "已创建访问令牌")


@router.get("/pats")
async def list_pats(user=Depends(get_current_user)):
    rows = await db.fetch(
        """
        SELECT id, name, token_prefix, expires_at, last_used_at, created_at
        FROM personal_access_tokens
        WHERE user_id=$1
        ORDER BY created_at DESC
        """,
        user["id"],
    )
    return ok([_pat_public(r) for r in rows])


@router.delete("/pats/{pat_id}")
async def revoke_pat(pat_id: int, user=Depends(get_current_user)):
    row = await db.fetchrow(
        """
        DELETE FROM personal_access_tokens
        WHERE id=$1 AND user_id=$2
        RETURNING id
        """,
        pat_id,
        user["id"],
    )
    if not row:
        return err(404, "令牌不存在")
    return ok({"id": pat_id}, "已撤销")
