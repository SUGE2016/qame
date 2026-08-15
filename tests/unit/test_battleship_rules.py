import importlib.util
from pathlib import Path

_path = Path(__file__).resolve().parents[2] / "games" / "battleship" / "rules.py"
_spec = importlib.util.spec_from_file_location("battleship_rules", _path)
rules = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rules)


def _cells(ships):
    out = []
    for ship in ships:
        out.extend(ship)
    return out


def test_create_fleet_and_legal():
    g = rules.create_state({"matchId": "m-sea"})
    assert g["size"] == 10
    assert [len(s) for s in g["ships0"]] == [5, 4, 3, 3, 2]
    assert [len(s) for s in g["ships1"]] == [5, 4, 3, 3, 2]
    assert len(set(_cells(g["ships0"]))) == 17
    assert len(set(_cells(g["ships1"]))) == 17
    assert rules.legal_moves(g, "0") == list(range(100))


def test_same_match_id_is_deterministic():
    a = rules.create_state({"matchId": "fixed-seed"})
    b = rules.create_state({"matchId": "fixed-seed"})
    assert a["ships0"] == b["ships0"]
    assert a["ships1"] == b["ships1"]


def test_fog_hides_enemy_ships():
    g = rules.create_state({"matchId": "fog"})
    mine = rules.view_state(g, "0")
    assert "ships0" in mine and "ships1" not in mine
    pub = rules.view_state(g, None)
    assert "ships0" not in pub and "ships1" not in pub
    assert pub["shots0"] == {} and pub["shots1"] == {}


def test_fire_hit_miss_and_block():
    g = rules.create_state({"matchId": "shot"})
    target = g["ships1"][0][0]
    empty = next(i for i in range(100) if i not in _cells(g["ships1"]))
    hit = rules.apply_move(g, "0", target)["G"]
    assert hit["shots1"][str(target)] == "hit"
    miss = rules.apply_move(hit, "0", empty)["G"]
    assert miss["shots1"][str(empty)] == "miss"
    assert rules.apply_move(miss, "0", target).get("error")
    assert target not in rules.legal_moves(miss, "0")


def test_sink_all_wins():
    g = rules.create_state({"matchId": "end"})
    for cell in _cells(g["ships1"]):
        g = rules.apply_move(g, "0", cell)["G"]
    end = rules.check_end(g)
    assert end["winner"] == "0"
    assert end["ships0"] and end["ships1"]


def test_invalid_move():
    g = rules.create_state({"matchId": "bad"})
    assert rules.apply_move(g, "0", 99).get("error") is None
    assert rules.apply_move(g, "0", 100).get("error")
    assert rules.apply_move(g, "0", "x").get("error")
    assert rules.apply_move(g, "0", True).get("error")
