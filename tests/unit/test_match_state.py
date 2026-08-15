import importlib.util
from pathlib import Path

_path = Path(__file__).resolve().parents[2] / "platform" / "app" / "match_state.py"
_spec = importlib.util.spec_from_file_location("match_state", _path)
ms = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ms)


def test_waiting_can_start_or_cancel():
    assert ms.can_transition("waiting", "playing")
    assert ms.can_transition("waiting", "cancelled")
    assert not ms.can_transition("waiting", "finished")


def test_playing_can_finish_or_cancel():
    assert ms.can_transition("playing", "finished")
    assert ms.can_transition("playing", "cancelled")
    assert not ms.can_transition("playing", "waiting")


def test_terminal_is_closed():
    assert ms.TRANSITIONS["finished"] == frozenset()
    assert ms.TRANSITIONS["cancelled"] == frozenset()
    assert not ms.can_transition("finished", "cancelled")
    assert not ms.can_transition("cancelled", "playing")
