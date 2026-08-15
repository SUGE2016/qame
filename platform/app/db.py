from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

import asyncpg

from .config import settings

_pool: Optional[asyncpg.Pool] = None


async def init_pool():
    global _pool
    s = settings()
    _pool = await asyncpg.create_pool(
        host=s["db_host"],
        port=s["db_port"],
        user=s["db_user"],
        password=s["db_password"],
        database=s["db_name"],
        min_size=1,
        max_size=10,
    )


async def close_pool():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


def pool() -> asyncpg.Pool:
    assert _pool is not None, "DB pool not initialized"
    return _pool


async def fetchrow(sql: str, *args):
    async with pool().acquire() as conn:
        return await conn.fetchrow(sql, *args)


async def fetch(sql: str, *args):
    async with pool().acquire() as conn:
        return await conn.fetch(sql, *args)


async def execute(sql: str, *args):
    async with pool().acquire() as conn:
        return await conn.execute(sql, *args)


async def run_migrations():
    mig_dir = Path(__file__).resolve().parents[1] / "migrations"
    files = sorted(p for p in mig_dir.glob("*.sql") if p.name[:3].isdigit())
    async with pool().acquire() as conn:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                filename TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        applied = {r["filename"] for r in await conn.fetch("SELECT filename FROM schema_migrations")}
        if not applied:
            has_users = await conn.fetchval("SELECT to_regclass('public.users')")
            if has_users:
                for f in files:
                    if f.name < "005_":
                        await conn.execute(
                            "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING",
                            f.name,
                        )
                applied = {r["filename"] for r in await conn.fetch("SELECT filename FROM schema_migrations")}
        for f in files:
            if f.name in applied:
                continue
            sql = f.read_text(encoding="utf-8")
            if sql.strip():
                await conn.execute(sql)
            await conn.execute("INSERT INTO schema_migrations (filename) VALUES ($1)", f.name)


def record_to_dict(row) -> dict[str, Any]:
    if row is None:
        return {}
    d = dict(row)
    for k, v in list(d.items()):
        if hasattr(v, "isoformat"):
            d[k] = v.isoformat()
        elif isinstance(v, str) and k == "result":
            try:
                d[k] = json.loads(v)
            except Exception:
                pass
    # asyncpg may return jsonb as str or dict
    if "result" in d and isinstance(d["result"], str):
        try:
            d["result"] = json.loads(d["result"])
        except Exception:
            pass
    return d
