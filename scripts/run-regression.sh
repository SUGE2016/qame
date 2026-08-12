#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export QAME_URL="${QAME_URL:-http://127.0.0.1:8001}"
export PASSWORD_SALT="${PASSWORD_SALT:-$(grep '^PASSWORD_SALT=' .env 2>/dev/null | cut -d= -f2- || echo your_fixed_salt_here)}"
export QAME_ADMIN_PASSWORD="${QAME_ADMIN_PASSWORD:-$(grep '^ADMIN_PASSWORD=' .env 2>/dev/null | cut -d= -f2- || echo admin123)}"

PYTHON="${ROOT}/.venv/bin/python"
PIP="${ROOT}/.venv/bin/pip"
if [[ ! -x "$PYTHON" ]]; then
  python3 -m venv .venv
  PYTHON="${ROOT}/.venv/bin/python"
  PIP="${ROOT}/.venv/bin/pip"
fi
"$PIP" install -q -r tests/requirements.txt

echo "== unit =="
"$PYTHON" -m pytest tests/unit -q

echo "== regression against ${QAME_URL} =="
if ! curl -sf "${QAME_URL}/health" >/dev/null; then
  echo "ERROR: platform not healthy at ${QAME_URL}"
  echo "Start with: docker compose up -d postgres game-tic-tac-toe game-gomoku api-server"
  exit 1
fi
"$PYTHON" -m pytest tests/regression -q --tb=short
echo "OK: all regression passed"
