BOARD = 9
N = BOARD * BOARD


def create_state(options=None):
    options = options or {}
    return {"cells": [None] * N, "matchId": options.get("matchId"), "lastMove": None}


def legal_moves(G, player_id=None):
    cells = (G or {}).get("cells") or []
    return [i for i, c in enumerate(cells) if c is None]


def apply_move(G, player_id, move):
    if not isinstance(move, int) or move < 0 or move >= N:
        return {"error": "无效位置"}
    cells = list(G.get("cells") or [])
    if cells[move] is not None:
        return {"error": "格子已被占用"}
    cells[move] = str(player_id)
    return {"G": {**G, "cells": cells, "lastMove": move}}


def _victory(cells, player):
    dirs = [(0, 1), (1, 0), (1, 1), (1, -1)]

    def idx(r, c):
        return r * BOARD + c

    for i, cell in enumerate(cells):
        if cell != player:
            continue
        r, c = divmod(i, BOARD)
        for dr, dc in dirs:
            count = 1
            for step in range(1, 5):
                rr, cc = r + dr * step, c + dc * step
                if not (0 <= rr < BOARD and 0 <= cc < BOARD):
                    break
                if cells[idx(rr, cc)] == player:
                    count += 1
                else:
                    break
            for step in range(1, 5):
                rr, cc = r - dr * step, c - dc * step
                if not (0 <= rr < BOARD and 0 <= cc < BOARD):
                    break
                if cells[idx(rr, cc)] == player:
                    count += 1
                else:
                    break
            if count >= 5:
                return True
    return False


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
