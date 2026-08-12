from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Cookie, Depends, Header, Request
from fastapi.responses import JSONResponse

from .config import settings
from . import db
from .resp import err


def hash_password(password: str) -> str:
    salt = settings()["password_salt"]
    return hashlib.sha256((password + salt).encode("utf-8")).hexdigest()


def create_access_token(user: dict) -> str:
    payload = {
        "userId": user["id"],
        "username": user["username"],
        "role": user.get("role", "user"),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=60),
    }
    return jwt.encode(payload, settings()["jwt_secret"], algorithm="HS256")


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings()["jwt_secret"], algorithms=["HS256"])
    except Exception:
        return None


class AuthError(Exception):
    def __init__(self, code: int, message: str):
        self.code = code
        self.message = message


async def get_current_user(
    authorization: Optional[str] = Header(default=None),
    access_token: Optional[str] = Cookie(default=None),
) -> dict:
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    elif access_token:
        token = access_token
    if not token:
        raise AuthError(401, "请先登录")
    payload = decode_token(token)
    if not payload or not payload.get("userId"):
        raise AuthError(401, "令牌无效")
    row = await db.fetchrow("SELECT * FROM users WHERE id=$1", payload["userId"])
    if not row:
        raise AuthError(401, "用户不存在")
    return db.record_to_dict(row)


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise AuthError(403, "需要管理员权限")
    return user


async def auth_error_handler(_request: Request, exc: AuthError) -> JSONResponse:
    return err(exc.code, exc.message)


def new_refresh_token() -> str:
    return secrets.token_hex(64)


def issue_seat_token() -> str:
    return secrets.token_hex(24)
