from __future__ import annotations

from typing import Any, Optional

import httpx

from . import db
from .config import settings


class GameClientError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status
        self.message = message


async def game_base(game_id: str) -> str:
    row = await db.fetchrow("SELECT host_url FROM games WHERE id=$1", game_id)
    if row and row["host_url"]:
        return str(row["host_url"]).rstrip("/")
    url = settings()["game_urls"].get(game_id)
    if not url:
        raise GameClientError(f"未配置游戏服务: {game_id}", 404)
    return url.rstrip("/")


def _headers() -> dict:
    key = settings()["internal_service_key"]
    return {"X-Internal-Key": key} if key else {}


async def create_host_match(game_id: str, match_id: str, players: list[dict]) -> dict:
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            f"{await game_base(game_id)}/v1/matches",
            headers=_headers(),
            json={"platform_match_id": match_id, "players": players, "config": {"matchId": match_id}},
        )
        if r.status_code >= 400:
            raise GameClientError(r.text or "创建游戏对局失败", r.status_code)
        return r.json()


async def get_host_state(game_id: str, match_id: str, seat: Optional[int | str] = None) -> dict:
    async with httpx.AsyncClient(timeout=15.0) as client:
        params = {"seat": str(seat)} if seat is not None and seat != "" else None
        r = await client.get(
            f"{await game_base(game_id)}/v1/matches/{match_id}",
            headers=_headers(),
            params=params,
        )
        if r.status_code == 404:
            raise GameClientError("对局未在游戏服务中", 404)
        if r.status_code >= 400:
            raise GameClientError(r.text or "获取状态失败", r.status_code)
        return r.json()


async def get_host_snapshot(game_id: str, match_id: str) -> dict:
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(
            f"{await game_base(game_id)}/v1/matches/{match_id}/snapshot",
            headers=_headers(),
        )
        if r.status_code >= 400:
            raise GameClientError(r.text or "获取快照失败", r.status_code)
        return r.json()


async def restore_host_match(game_id: str, match_id: str, snapshot: dict) -> dict:
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.put(
            f"{await game_base(game_id)}/v1/matches/{match_id}",
            headers=_headers(),
            json=snapshot,
        )
        if r.status_code >= 400:
            raise GameClientError(r.text or "恢复对局失败", r.status_code)
        return r.json()


async def host_move(game_id: str, match_id: str, seat: str, move: Any) -> dict:
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            f"{await game_base(game_id)}/v1/matches/{match_id}/moves",
            headers=_headers(),
            json={"seat": seat, "move": move},
        )
        if r.status_code >= 400:
            try:
                detail = r.json().get("detail") or r.text
            except Exception:
                detail = r.text
            raise GameClientError(str(detail), r.status_code)
        return r.json()


async def delete_host_match(game_id: str, match_id: str) -> None:
    async with httpx.AsyncClient(timeout=10.0) as client:
        await client.delete(f"{await game_base(game_id)}/v1/matches/{match_id}", headers=_headers())
