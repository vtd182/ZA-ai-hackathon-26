#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if command -v pnpm >/dev/null 2>&1; then
  PNPM=(pnpm)
elif command -v corepack >/dev/null 2>&1; then
  corepack enable pnpm >/dev/null 2>&1 || true
  if command -v pnpm >/dev/null 2>&1; then
    PNPM=(pnpm)
  else
    PNPM=(corepack pnpm)
  fi
else
  echo "Node.js Corepack hoặc pnpm là bắt buộc." >&2
  exit 1
fi

MODE="${1:-dev}"

if [[ ! -d node_modules || ! -f pnpm-lock.yaml ]]; then
  echo "[setup] Installing workspace dependencies..."
  "${PNPM[@]}" install
fi

if ! node -e "require('electron')" >/dev/null 2>&1; then
  echo "[setup] Installing Electron runtime binary..."
  "${PNPM[@]}" rebuild electron
fi

if [[ ! -f node_modules/.pm-agent-electron-native-ready ]]; then
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "electron-rebuild cần pnpm shim; chạy 'corepack enable pnpm' một lần." >&2
    exit 1
  fi
  echo "[setup] Rebuilding better-sqlite3 for Electron..."
  "${PNPM[@]}" exec electron-rebuild -f -w better-sqlite3
  touch node_modules/.pm-agent-electron-native-ready
fi

case "$MODE" in
  dev)
    unset ELECTRON_RUN_AS_NODE
    exec "${PNPM[@]}" dev
    ;;
  build)
    exec "${PNPM[@]}" build
    ;;
  smoke)
    unset ELECTRON_RUN_AS_NODE
    "${PNPM[@]}" build
    PM_AGENT_USER_DATA="${TMPDIR:-/tmp}/pm-agent-smoke-$$" \
      PM_AGENT_SMOKE_CAPTURE="${TMPDIR:-/tmp}/pm-agent-smoke.png" \
      exec "${PNPM[@]}" exec electron apps/desktop/out/main/index.js
    ;;
  test)
    exec "${PNPM[@]}" test
    ;;
  typecheck)
    exec "${PNPM[@]}" typecheck
    ;;
  *)
    echo "Usage: ./run.sh [dev|build|test|typecheck|smoke]" >&2
    exit 2
    ;;
esac
