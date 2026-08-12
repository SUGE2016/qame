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
    a.close()
    b.close()
