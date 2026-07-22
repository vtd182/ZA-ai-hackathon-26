#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BINARY="$ROOT/bin/za-talk-to-figma"

if [[ ! -x "$BINARY" ]]; then
  echo "[reload-mcp] Binary not found or not executable: $BINARY" >&2
  exit 1
fi

pids=()
while IFS= read -r line; do
  pid="$(printf '%s' "$line" | awk '{print $1}')"
  cmd="$(printf '%s' "$line" | cut -d' ' -f2-)"
  if [[ -n "$pid" && "$cmd" == *"$BINARY"* ]]; then
    pids+=("$pid")
  fi
done < <(ps -ax -o pid= -o command= || true)

if [[ ${#pids[@]} -eq 0 ]]; then
  echo "[reload-mcp] No running za-talk-to-figma process found for $BINARY"
  exit 0
fi

echo "[reload-mcp] Reloading ${#pids[@]} process(es): ${pids[*]}"
for pid in "${pids[@]}"; do
  kill -HUP "$pid"
done
