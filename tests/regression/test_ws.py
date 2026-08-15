import asyncio
import json

import pytest
import websockets

from tests.conftest import BASE


def test_ws_join_and_state(user_factory):
    a = user_factory("ws_a")
    b = user_factory("ws_b")
    m = a.req("POST", "/api/matches", json={"gameId": "tic-tac-toe"})
    mid = m["data"]["id"]
    a.req("POST", f"/api/matches/{mid}/players", json={"playerId": a.player_id})
    b.req("POST", f"/api/matches/{mid}/players", json={"playerId": b.player_id})
    a.req("POST", f"/api/matches/{mid}/start")

    ws_base = BASE.replace("http://", "ws://").replace("https://", "wss://")
    uri = f"{ws_base}/ws"

    async def _run():
        async with websockets.connect(uri) as ws:
            await ws.send(json.dumps({"type": "join", "matchId": mid, "token": a.token}))
            raw = await asyncio.wait_for(ws.recv(), timeout=5)
            msg = json.loads(raw)
            assert msg.get("type") != "error", msg.get("message")
            assert msg.get("status") in ("playing", "waiting") or msg.get("matchId") == mid
            assert "G" in msg

    asyncio.get_event_loop().run_until_complete(_run())
    a.req("POST", f"/api/matches/{mid}/cancel")
    a.close()
    b.close()


def test_ws_spectator_readonly(user_factory):
    a = user_factory("sp_a")
    b = user_factory("sp_b")
    spec = user_factory("sp_w")
    mid = a.req("POST", "/api/matches", json={"gameId": "tic-tac-toe"})["data"]["id"]
    a.req("POST", f"/api/matches/{mid}/players", json={"playerId": a.player_id})
    b.req("POST", f"/api/matches/{mid}/players", json={"playerId": b.player_id})
    a.req("POST", f"/api/matches/{mid}/start")

    ws_base = BASE.replace("http://", "ws://").replace("https://", "wss://")
    uri = f"{ws_base}/ws"

    async def _run():
        async with websockets.connect(uri) as ws:
            await ws.send(json.dumps({"type": "join", "matchId": mid, "token": spec.token}))
            raw = await asyncio.wait_for(ws.recv(), timeout=5)
            msg = json.loads(raw)
            assert msg.get("type") != "error", msg.get("message")
            assert msg.get("spectator") is True
            assert msg.get("yourTurn") is False
            assert "G" in msg
            await ws.send(json.dumps({"type": "move", "matchId": mid, "move": 0}))
            deny = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
            assert deny.get("type") == "error"
            assert "旁观" in (deny.get("message") or "")

    asyncio.get_event_loop().run_until_complete(_run())
    a.req("POST", f"/api/matches/{mid}/cancel")
    a.close()
    b.close()
    spec.close()
