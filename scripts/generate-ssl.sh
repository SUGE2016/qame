#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSL_DIR="$ROOT/nginx/ssl"
mkdir -p "$SSL_DIR"
if [[ -f "$SSL_DIR/cert.pem" && -f "$SSL_DIR/key.pem" ]]; then
  echo "SSL already exists: $SSL_DIR"
  exit 0
fi
openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
  -keyout "$SSL_DIR/key.pem" \
  -out "$SSL_DIR/cert.pem" \
  -subj "/CN=localhost"
echo "Generated $SSL_DIR/cert.pem and key.pem"
