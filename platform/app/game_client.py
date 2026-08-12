from __future__ import annotations

from typing import Any, Optional

import httpx

from .config import settings


class GameClientError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status
        self.message = message


def game_base(game_id: str) -> str:
    url = settings()["game_urls"].get(game_id)
    if not url:
        raise GameClientError(f"未配置游戏服务: {game_id}", 404)
    return url.rstrip("/")


async def create_host_match(game_id: str, match_id: str, players: list[dict]) -> dict:
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            f"{game_base(game_id)}/v1/matches",
            json={"platform_match_id": match_id, "players": players, "config": {"matchId": match_id}},
        )
        if r.status_code >= 400:
            raise GameClientError(r.text or "创建游戏对局失败", r.status_code)
        return r.json()


async def get_host_state(game_id: str, match_id: str) -> dict:
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(f"{game_base(game_id)}/v1/matches/{match_id}")
        if r.status_code == 404:
            raise GameClientError("对局未在游戏服务中", 404)
        if r.status_code >= 400:
            raise GameClientError(r.text or "获取状态失败", r.status_code)
        return r.json()


async def host_move(game_id: str, match_id: str, seat: str, move: Any) -> dict:
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            f"{game_base(game_id)}/v1/matches/{match_id}/moves",
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
        await client.delete(f"{game_base(game_id)}/v1/matches/{match_id}")


async def call_ai_move(endpoint: str, payload: dict) -> Any:
    url = endpoint.rstrip("/") + "/move"
    timeout = settings()["ai_timeout_ms"] / 1000.0
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(url, json=payload)
        if r.status_code >= 400:
            raise GameClientError(f"AI HTTP {r.status_code}: {r.text}", r.status_code)
        data = r.json()
        move = data.get("move")
        if move is None or move == -1:
            raise GameClientError("AI 返回无效 move")
        return move
