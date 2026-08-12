from __future__ import annotations

import json
from collections import defaultdict
from typing import Any

from fastapi import WebSocket


class Hub:
    def __init__(self):
        self.subs: dict[str, set[WebSocket]] = defaultdict(set)

    def subscribe(self, match_id: str, ws: WebSocket):
        self.subs[match_id].add(ws)

    def unsubscribe(self, match_id: str, ws: WebSocket):
        self.subs[match_id].discard(ws)
        if not self.subs[match_id]:
            self.subs.pop(match_id, None)

    def unsubscribe_all(self, ws: WebSocket):
        for mid in list(self.subs.keys()):
            self.unsubscribe(mid, ws)

    async def broadcast(self, match_id: str, message: dict[str, Any]):
        dead = []
        payload = json.dumps(message, ensure_ascii=False)
        for ws in list(self.subs.get(match_id, set())):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.unsubscribe(match_id, ws)


hub = Hub()
