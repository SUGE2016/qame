"""Hunt/target shooter for 10x10 battleship (cells 0-99)."""
from __future__ import annotations

import random


def shot_at(G: dict, seat: int, cell: int) -> str | None:
    key = "shots1" if seat == 0 else "shots0"
    shots = (G or {}).get(key) or {}
    return shots.get(str(cell)) or shots.get(cell)


class Hunter:
    def __init__(self, rng: random.Random | None = None):
        self.rng = rng or random.Random()
        self.hits: list[int] = []
        self.sunk_hits: set[int] = set()

    def observe(self, cell: int, mark: str | None) -> None:
        if mark == "hit":
            if cell not in self.hits:
                self.hits.append(cell)
        elif mark == "miss":
            pass

    def pick(self, legal: list[int]) -> int:
        legal = [int(x) for x in legal]
        if not legal:
            raise RuntimeError("no legal moves")
        targets = self._line_targets(legal) or self._adj_targets(legal)
        if targets:
            return self.rng.choice(targets)
        checker = [m for m in legal if ((m // 10) + (m % 10)) % 2 == 0]
        pool = checker or legal
        return self.rng.choice(pool)

    def _active_hits(self) -> list[int]:
        return [h for h in self.hits if h not in self.sunk_hits]

    def _line_targets(self, legal: list[int]) -> list[int]:
        hits = self._active_hits()
        if len(hits) < 2:
            return []
        hits = sorted(hits)
        rows = {h // 10 for h in hits}
        cols = {h % 10 for h in hits}
        out: list[int] = []
        if len(rows) == 1:
            row = hits[0] // 10
            xs = [h % 10 for h in hits]
            for x in (min(xs) - 1, max(xs) + 1):
                if 0 <= x <= 9 and row * 10 + x in legal:
                    out.append(row * 10 + x)
        if len(cols) == 1:
            col = hits[0] % 10
            ys = [h // 10 for h in hits]
            for y in (min(ys) - 1, max(ys) + 1):
                if 0 <= y <= 9 and y * 10 + col in legal:
                    out.append(y * 10 + col)
        return out

    def _adj_targets(self, legal: list[int]) -> list[int]:
        out: list[int] = []
        for h in self._active_hits():
            r, c = divmod(h, 10)
            for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                nr, nc = r + dr, c + dc
                cell = nr * 10 + nc
                if 0 <= nr < 10 and 0 <= nc < 10 and cell in legal:
                    out.append(cell)
        return out
