import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "shared"))

from game_app import build_game_app  # noqa: E402
import rules  # noqa: E402

app = build_game_app(
    game_id="tic-tac-toe",
    game_name="井字棋",
    create_state=rules.create_state,
    legal_moves=rules.legal_moves,
    apply_move=rules.apply_move,
    check_end=rules.check_end,
)
