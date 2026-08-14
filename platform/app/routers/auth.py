from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Cookie, Depends
from fastapi.responses import JSONResponse

from .. import db
from ..auth_util import (
    create_access_token,
    get_current_user,
    new_refresh_token,
)
from ..resp import err, ok

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
    username = body.get("username")
    hashed = body.get("hashedPassword")
    if not username or not hashed:
        return err(400, "用户名和密码不能为空")
    row = await db.fetchrow("SELECT * FROM users WHERE username=$1", username)
    if not row or row["password_hash"] != hashed:
        return err(401, "用户名或密码错误")
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
    body = body or {}
    token = body.get("refreshToken") or refresh_token_cookie
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
    user = db.record_to_dict(user_row)
    access = create_access_token(user)
    resp = ok(
        {
            "user": {
                "id": user["id"],
                "username": user["username"],
                "role": user["role"],
                "createdAt": user.get("created_at"),
            },
            "accessToken": access,
            "expiresIn": "60m",
        },
        "Token刷新成功",
    )
    _set_auth_cookies(resp, access)
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
