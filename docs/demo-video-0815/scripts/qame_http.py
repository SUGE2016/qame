"""Minimal QAME HTTP client for live demo recording."""
from __future__ import annotations

import os
import urllib.error
import urllib.request
import json

BASE = os.environ.get("QAME_URL", "http://127.0.0.1:8001").rstrip("/")


def _req(method: str, path: str, token: str | None = None, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode()
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode()
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            raise RuntimeError(f"{method} {path} HTTP {e.code}: {raw[:300]}") from e
        raise RuntimeError(f"{method} {path}: {payload.get('message') or payload}") from e
    payload = json.loads(raw) if raw else {}
    if payload.get("code", 200) >= 400:
        raise RuntimeError(f"{method} {path}: {payload.get('message') or payload}")
    return payload.get("data")


def login(username: str, password: str) -> str:
    data = _req("POST", "/api/auth/login", body={"username": username, "password": password})
    return data["accessToken"]


def ensure_player(token: str) -> dict:
    try:
        return _req("GET", "/api/players/me", token)
    except RuntimeError:
        return _req("POST", "/api/players/me/ensure", token, {})


def create_user(admin_token: str, username: str, password: str) -> None:
    try:
        _req("POST", "/api/admin/users", admin_token, {"username": username, "password": password, "role": "user"})
    except RuntimeError as e:
        if "已存在" not in str(e):
            raise


def create_match(token: str, game_id: str) -> str:
    return _req("POST", "/api/matches", token, {"gameId": game_id})["id"]


def join_match(token: str, match_id: str, player_id: int, seat_index: int | None = None) -> dict:
    body = {"playerId": player_id}
    if seat_index is not None:
        body["seatIndex"] = seat_index
    return _req("POST", f"/api/matches/{match_id}/players", token, body)


def start_match(token: str, match_id: str) -> dict:
    return _req("POST", f"/api/matches/{match_id}/start", token, {})


def play_state(token: str, match_id: str) -> dict:
    return _req("GET", f"/api/play/{match_id}", token)


def play_move(token: str, match_id: str, move: int) -> dict:
    return _req("POST", f"/api/play/{match_id}/move", token, {"move": int(move)})


def list_matches(token: str, game_id: str | None = None, status: str | None = None) -> list:
    q = []
    if game_id:
        q.append(f"gameId={game_id}")
    if status:
        q.append(f"status={status}")
    path = "/api/matches" + (("?" + "&".join(q)) if q else "")
    data = _req("GET", path, token)
    if isinstance(data, dict) and "matches" in data:
        return data["matches"]
    return data or []
