from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Cookie, Depends, Header, Request
from fastapi.responses import JSONResponse

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from .config import settings
from . import db
from .resp import err

_ph = PasswordHasher()


def client_digest(password: str) -> str:
    salt = settings()["password_salt"]
    return hashlib.sha256((password + salt).encode("utf-8")).hexdigest()


def hash_digest(digest: str) -> str:
    return _ph.hash(digest)


def hash_password(password: str) -> str:
    return hash_digest(client_digest(password))


def verify_password(stored: str, *, hashed: str | None = None, password: str | None = None) -> bool:
    candidate = hashed or (client_digest(password) if password else None)
    if not candidate or not stored:
        return False
    if stored.startswith("$argon2"):
        try:
            return _ph.verify(stored, candidate)
        except (VerifyMismatchError, ValueError):
            return False
    return stored == candidate


def needs_rehash(stored: str) -> bool:
    if not stored.startswith("$argon2"):
        return True
    try:
        return _ph.check_needs_rehash(stored)
    except Exception:
        return True


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


PAT_PREFIX = "qame_pat_"


def hash_pat(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def new_pat() -> str:
    return PAT_PREFIX + secrets.token_urlsafe(32)


async def user_from_access_token(token: str) -> Optional[dict]:
    if not token:
        return None
    if token.startswith(PAT_PREFIX):
        digest = hash_pat(token)
        row = await db.fetchrow(
            """
            SELECT u.* FROM personal_access_tokens t
            JOIN users u ON u.id = t.user_id
            WHERE t.token_hash=$1
              AND (t.expires_at IS NULL OR t.expires_at > NOW())
            """,
            digest,
        )
        if not row:
            return None
        await db.execute(
            "UPDATE personal_access_tokens SET last_used_at=NOW() WHERE token_hash=$1",
            digest,
        )
        return db.record_to_dict(row)
    payload = decode_token(token)
    if not payload or not payload.get("userId"):
        return None
    row = await db.fetchrow("SELECT * FROM users WHERE id=$1", payload["userId"])
    if not row:
        return None
    return db.record_to_dict(row)


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
    user = await user_from_access_token(token)
    if not user:
        raise AuthError(401, "令牌无效")
    return user


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
