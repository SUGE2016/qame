from __future__ import annotations

import json

from fastapi import Request

from . import db


async def write_audit(
    user: dict,
    action: str,
    resource: str,
    resource_id,
    detail: dict | None = None,
    request: Request | None = None,
) -> None:
    ip = None
    if request is not None:
        ip = request.client.host if request.client else None
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            ip = forwarded.split(",")[0].strip()
    await db.execute(
        """
        INSERT INTO admin_audit_logs (user_id, username, action, resource, resource_id, detail, ip)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
        """,
        user.get("id"),
        user.get("username"),
        action,
        resource,
        str(resource_id) if resource_id is not None else None,
        json.dumps(detail or {}),
        ip,
    )
