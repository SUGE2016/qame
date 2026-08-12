import importlib.util
from pathlib import Path

_path = Path(__file__).resolve().parents[2] / "games" / "gomoku" / "rules.py"
_spec = importlib.util.spec_from_file_location("gomoku_rules", _path)
rules = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rules)


def test_board_size():
    g = rules.create_state()
    assert len(g["cells"]) == 81
    assert len(rules.legal_moves(g)) == 81


def test_five_in_row_horizontal():
    cells = [None] * 81
    for c in range(4):
        cells[c] = "0"
    g = rules.apply_move({"cells": cells}, "0", 4)["G"]
    assert rules.check_end(g) == {"winner": "0"}


def test_occupied():
    g = rules.create_state()
    g = rules.apply_move(g, "0", 10)["G"]
    assert rules.apply_move(g, "1", 10).get("error")


def test_short_board_no_crash():
    """畸形短棋盘不应 IndexError。"""
    g = {"cells": ["0", "0", "0", None, None, None, None, None, None]}
    assert rules.check_end(g) is None
