"""大海战：10×10，开局自动布舰，格子下标开火。"""
from __future__ import annotations

from random import Random

SIZE = 10
N = SIZE * SIZE
FLEET = (5, 4, 3, 3, 2)


def _place_fleet(rng: Random) -> list[list[int]]:
    occupied: set[int] = set()
    ships: list[list[int]] = []
    for length in FLEET:
        placed = False
        for _ in range(400):
            horiz = rng.choice((True, False))
            if horiz:
                r = rng.randrange(SIZE)
                c = rng.randrange(SIZE - length + 1)
                cells = [r * SIZE + c + i for i in range(length)]
            else:
                r = rng.randrange(SIZE - length + 1)
                c = rng.randrange(SIZE)
                cells = [(r + i) * SIZE + c for i in range(length)]
            if occupied.intersection(cells):
                continue
            occupied.update(cells)
            ships.append(cells)
            placed = True
            break
        if not placed:
            raise RuntimeError("failed to place fleet")
    return ships


def create_state(options=None):
    options = options or {}
    seed = options.get("matchId") or options.get("seed") or 0
    rng = Random(str(seed))
    return {
        "size": SIZE,
        "matchId": options.get("matchId"),
        "ships0": _place_fleet(rng),
        "ships1": _place_fleet(rng),
        "shots0": {},
        "shots1": {},
    }


def _parse_cell(move):
    if isinstance(move, bool):
        return None
    if isinstance(move, int):
        cell = move
    elif isinstance(move, str) and move.isdigit():
        cell = int(move)
    else:
        return None
    if cell < 0 or cell >= N:
        return None
    return cell


def _target_key(seat) -> str:
    return "shots1" if str(seat) == "0" else "shots0"


def _ship_cells(ships) -> set[int]:
    out: set[int] = set()
    for ship in ships or []:
        out.update(int(c) for c in ship)
    return out


def legal_moves(G, player_id=None):
    key = _target_key(player_id)
    shots = (G or {}).get(key) or {}
    return [i for i in range(N) if str(i) not in shots]


def apply_move(G, player_id, move):
    cell = _parse_cell(move)
    if cell is None:
        return {"error": "无效位置"}
    key = _target_key(player_id)
    shots = dict((G or {}).get(key) or {})
    if str(cell) in shots:
        return {"error": "该格已经开过火"}
    opp = "ships1" if str(player_id) == "0" else "ships0"
    hit = cell in _ship_cells(G.get(opp))
    shots[str(cell)] = "hit" if hit else "miss"
    return {"G": {**G, key: shots}, "extraTurn": hit}


def _sunk(ships, shots) -> bool:
    if not ships:
        return False
    for ship in ships:
        for cell in ship:
            if (shots or {}).get(str(cell)) != "hit":
                return False
    return True


def check_end(G):
    G = G or {}
    result = None
    if _sunk(G.get("ships1"), G.get("shots1")):
        result = {"winner": "0"}
    elif _sunk(G.get("ships0"), G.get("shots0")):
        result = {"winner": "1"}
    if not result:
        return None
    result["ships0"] = G.get("ships0") or []
    result["ships1"] = G.get("ships1") or []
    return result


def view_state(G, seat=None):
    G = G or {}
    out = {
        "size": G.get("size", SIZE),
        "matchId": G.get("matchId"),
        "shots0": dict(G.get("shots0") or {}),
        "shots1": dict(G.get("shots1") or {}),
    }
    if seat == "0":
        out["ships0"] = G.get("ships0") or []
    elif seat == "1":
        out["ships1"] = G.get("ships1") or []
    return out
