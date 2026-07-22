#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "[build-and-reload] Building Go binary..."
go build -o bin/za-talk-to-figma ./cmd/za-talk-to-figma

echo "[build-and-reload] Reloading running MCP/runtime processes..."
"$ROOT/scripts/reload-mcp.sh"

echo "[build-and-reload] Done."
