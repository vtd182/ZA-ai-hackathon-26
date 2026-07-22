#!/usr/bin/env bash
set -euo pipefail

METHOD="${1:-GET}"
PATHNAME="${2:-/api/threads}"
BODY="${3:-}"
DESCRIPTOR="${PM_AGENT_CANVAS_BRIDGE_FILE:-$HOME/.pm-lifecycle-agent/canvas-bridge.json}"

if [[ ! -f "$DESCRIPTOR" ]]; then
  echo "PM Lifecycle Agent Canvas Bridge is not running: $DESCRIPTOR" >&2
  exit 1
fi

PORT="$(node -e 'const f=require(process.argv[1]); process.stdout.write(String(f.port))' "$DESCRIPTOR")"
TOKEN="$(node -e 'const f=require(process.argv[1]); process.stdout.write(f.token)' "$DESCRIPTOR")"

if [[ -n "$BODY" ]]; then
  exec curl --silent --show-error --fail-with-body \
    -X "$METHOD" "http://127.0.0.1:$PORT$PATHNAME" \
    -H "authorization: Bearer $TOKEN" \
    -H 'content-type: application/json' \
    --data "$BODY"
fi

exec curl --silent --show-error --fail-with-body \
  -X "$METHOD" "http://127.0.0.1:$PORT$PATHNAME" \
  -H "authorization: Bearer $TOKEN"

