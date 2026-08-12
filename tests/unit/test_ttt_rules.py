import importlib.util
from pathlib import Path

_path = Path(__file__).resolve().parents[2] / "games" / "tic-tac-toe" / "rules.py"
_spec = importlib.util.spec_from_file_location("ttt_rules", _path)
rules = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rules)


def test_create_and_legal():
    g = rules.create_state({"matchId": "m1"})
    assert len(g["cells"]) == 9
    assert rules.legal_moves(g) == list(range(9))


def test_apply_and_block():
    g = rules.create_state()
    out = rules.apply_move(g, "0", 4)
    assert out["G"]["cells"][4] == "0"
    bad = rules.apply_move(out["G"], "1", 4)
    assert bad.get("error")


def test_win_row():
    g = {"cells": ["0", "0", None, None, None, None, None, None, None]}
    g = rules.apply_move(g, "0", 2)["G"]
    assert rules.check_end(g) == {"winner": "0"}


def test_draw():
    g = {
        "cells": ["0", "1", "0", "0", "1", "1", "1", "0", "0"],
    }
    assert rules.check_end(g) == {"draw": True}


def test_invalid_move():
    g = rules.create_state()
    assert rules.apply_move(g, "0", 99).get("error")
    assert rules.apply_move(g, "0", "x").get("error")
