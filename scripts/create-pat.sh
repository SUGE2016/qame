#!/usr/bin/env bash
# 登录一次并签发 PAT。用法: ./scripts/create-pat.sh <username> <password> [name]
set -euo pipefail
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY all_proxy ALL_PROXY || true
export NO_PROXY=127.0.0.1,localhost

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
QAME_URL="${QAME_URL:-http://127.0.0.1:8001}"
SALT="${QAME_PASSWORD_SALT:-${PASSWORD_SALT:-your_fixed_salt_here}}"
USER="${1:-}"
PASS="${2:-}"
NAME="${3:-mcp}"

if [[ -z "$USER" || -z "$PASS" ]]; then
  echo "Usage: $0 <username> <password> [name]" >&2
  echo "Then: export QAME_TOKEN=<printed token>" >&2
  exit 1
fi

HASH="$(printf '%s' "${PASS}${SALT}" | sha256sum | awk '{print $1}')"
LOGIN="$(curl -sf "${QAME_URL}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"${USER}\",\"hashedPassword\":\"${HASH}\"}")"
ACCESS="$(printf '%s' "$LOGIN" | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["accessToken"])')"
curl -sf "${QAME_URL}/api/auth/pats" \
  -H "Authorization: Bearer ${ACCESS}" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"${NAME}\"}" | python3 -c 'import json,sys; d=json.load(sys.stdin)["data"]; print(d["token"]); print("id=", d["id"], "prefix=", d["tokenPrefix"], file=sys.stderr)'
