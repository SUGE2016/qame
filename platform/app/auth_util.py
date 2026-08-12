from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Cookie, Depends, Header, HTTPException

from .config import settings
from . import db


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
        raise HTTPException(status_code=401, detail="请先登录")
    payload = decode_token(token)
    if not payload or not payload.get("userId"):
        raise HTTPException(status_code=401, detail="令牌无效")
    row = await db.fetchrow("SELECT * FROM users WHERE id=$1", payload["userId"])
    if not row:
        raise HTTPException(status_code=401, detail="用户不存在")
    return db.record_to_dict(row)


def new_refresh_token() -> str:
    return secrets.token_hex(64)


def issue_seat_token() -> str:
    return secrets.token_hex(24)
