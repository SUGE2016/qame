from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Response

from .. import db
from ..auth_util import (
    create_access_token,
    get_current_user,
    hash_password,
    new_refresh_token,
)
from ..config import settings
from ..resp import err, ok

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
async def login(body: dict, response: Response):
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
    response.set_cookie("access_token", access, httponly=True, samesite="strict", max_age=3600)
    response.set_cookie("refresh_token", refresh, httponly=True, samesite="strict", max_age=7 * 86400)
    return ok(
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


@router.get("/verify")
async def verify(user=Depends(get_current_user)):
    return ok({"user": {"id": user["id"], "username": user["username"], "role": user["role"]}})


@router.get("/profile")
async def profile(user=Depends(get_current_user)):
    return ok(user)


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return ok(None, "已退出")
