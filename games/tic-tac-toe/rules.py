SIZE = 9


def create_state(options=None):
    options = options or {}
    return {"cells": [None] * SIZE, "matchId": options.get("matchId")}


def legal_moves(G, player_id=None):
    cells = (G or {}).get("cells") or []
    return [i for i, c in enumerate(cells) if c is None]


def apply_move(G, player_id, move):
    if not isinstance(move, int) or move < 0 or move >= SIZE:
        return {"error": "无效位置"}
    cells = list(G.get("cells") or [])
    if cells[move] is not None:
        return {"error": "格子已被占用"}
    cells[move] = str(player_id)
    return {"G": {**G, "cells": cells}}


def _victory(cells, player):
    lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6],
    ]
    return any(all(cells[i] == player for i in line) for line in lines)


def check_end(G):
    cells = (G or {}).get("cells") or []
    if not cells or all(c is None for c in cells):
        return None
    for p in ("0", "1"):
        if _victory(cells, p):
            return {"winner": p}
    if all(c is not None for c in cells):
        return {"draw": True}
    return None
