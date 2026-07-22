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
FIGMA_RUNTIME_DIR="$ROOT_DIR/mcp-tool/za-talk-to-figma"

prepare_figma() {
  if ! command -v go >/dev/null 2>&1; then
    echo "[setup] Go is required to build the local Figma runtime." >&2
    exit 1
  fi
  if ! command -v bun >/dev/null 2>&1; then
    echo "[setup] Bun is required to build the local Figma plugin." >&2
    exit 1
  fi
  echo "[setup] Building Figma runtime and local plugin..."
  make -C "$FIGMA_RUNTIME_DIR" build
  echo "[setup] Figma plugin is ready:"
  echo "        $FIGMA_RUNTIME_DIR/plugin/manifest.json"
}

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
  setup)
    prepare_figma
    echo "[setup] Done. Run './run.sh', then open Figma from the app toolbar."
    ;;
  dev)
    if [[ ! -x "$FIGMA_RUNTIME_DIR/bin/za-talk-to-figma" || ! -f "$FIGMA_RUNTIME_DIR/plugin/dist/code.js" || ! -f "$FIGMA_RUNTIME_DIR/plugin/dist/index.html" ]]; then
      prepare_figma
    fi
    unset ELECTRON_RUN_AS_NODE
    exec "${PNPM[@]}" dev
    ;;
  build)
    exec "${PNPM[@]}" build
    ;;
  smoke|smoke-recovery)
    unset ELECTRON_RUN_AS_NODE
    "${PNPM[@]}" build
    SMOKE_FAIL_TARGET="${PM_AGENT_SMOKE_FAIL_TARGET:-}"
    if [[ "$MODE" == "smoke-recovery" ]]; then
      SMOKE_FAIL_TARGET="jira"
    fi
    PM_AGENT_USER_DATA="${TMPDIR:-/tmp}/pm-agent-smoke-$$" \
      PM_AGENT_SMOKE_CAPTURE="${TMPDIR:-/tmp}/pm-agent-smoke.png" \
      PM_AGENT_SMOKE_FAIL_TARGET="$SMOKE_FAIL_TARGET" \
      exec "${PNPM[@]}" exec electron apps/desktop/out/main/index.js
    ;;
  test)
    exec "${PNPM[@]}" test
    ;;
  typecheck)
    exec "${PNPM[@]}" typecheck
    ;;
  *)
    echo "Usage: ./run.sh [setup|dev|build|test|typecheck|smoke|smoke-recovery]" >&2
    exit 2
    ;;
esac
