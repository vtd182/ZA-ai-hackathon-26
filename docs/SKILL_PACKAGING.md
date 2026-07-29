# Skill packaging & portability

How PM Lifecycle Agent ships its skills, and whether they survive a move to another
machine. Mirrors the tldraw Desktop pattern (`~/.claude/skills/tldraw-offline`).

## TL;DR

- The **canvas collaborator skill** now auto-installs into the target machine's Claude
  agent folder (`~/.claude/skills/pm-lifecycle-canvas`) on every app launch. This is what
  lets an external Claude Code / Codex session on that machine draw on the live canvas.
- The **Figma craft skills** are not installed as agent skills; they are embedded inline
  into the Codex Figma worker prompt at runtime. They never depend on machine paths.
- Both are relocatable: no build-host absolute path is baked into shipped content.

## Skill inventory & portability verdict

| Skill | How it is used | Portable? | Notes |
| --- | --- | --- | --- |
| `pm-lifecycle-canvas` | Installed into `~/.claude/skills`; external AI calls the loopback Canvas Bridge | ✅ Yes | Helper referenced by absolute `$HOME/.claude/skills/...` path; descriptor read from `$HOME/.pm-lifecycle-agent/canvas-bridge.json`. Needs `node` + `curl` on the target machine. |
| `pm-lifecycle-figma-design` | Embedded in Figma worker prompt (`skill-packs.ts`) | ✅ Yes | Rendered inline; `references/*` bundled; only relative cross-ref is `../pm-lifecycle-figma-critic`, resolved by the app, not the shell. |
| `pm-lifecycle-figma-critic` | Embedded in Figma worker prompt | ✅ Yes | Same as above. |
| `*/agents/openai.yaml` | Codex CLI agent config | n/a | Deliberately **excluded** from packaging (`prepare-package-assets.mjs` filters `/agents/`). |

### Fixed portability issue

`pm-lifecycle-canvas/SKILL.md` previously told the AI to run `./pm-canvas.sh`, which only
works when the shell's CWD is the skill directory. Each Bash tool call runs in a fresh
shell, so this broke off-repo. It now uses the absolute, machine-agnostic form:

```bash
sh "$HOME/.claude/skills/pm-lifecycle-canvas/pm-canvas.sh" GET /api/threads
```

## Install mechanism

`apps/desktop/src/main/skill-installer.ts` → `installCanvasSkill(roots, home)`:

1. Resolves the skill source (packaged `resources/skill-packs/pm-lifecycle-canvas`, else
   repo `skills/pm-lifecycle-canvas`) via the shared `skillPackRootCandidates`.
2. Copies `SKILL.md` + `pm-canvas.sh` (mode `0755`) into `~/.claude/skills/pm-lifecycle-canvas`.
3. Writes `.pm-install.json` (`id`, `version`, `sha256 hash`, `installedAt`).
4. Idempotent & safe:
   - same hash already installed → `unchanged` (no write);
   - shipped skill changed → `updated`;
   - a same-named skill **without** our `installed-by:pm-lifecycle-agent` marker →
     `skipped` (never clobbers a user's own skill);
   - no source found → `skipped` with a reason.

Invoked on `app.whenReady` right after the Canvas Bridge starts
(`index.ts`). Failures are logged, never fatal.

Covered by `skill-installer.test.ts` (install / unchanged / update / skip-foreign /
no-source, plus a no-host-path-leak assertion).

## Packaging checklist

1. `./run.sh dist` or CI release builds the Figma MCP binary/plugin first, then runs
   `node scripts/prepare-package-assets.mjs --strict-figma`.
2. `apps/desktop/out/package-resources/` contains `skill-packs/`, `figma-runtime/`
   and `README.md`. The Figma runtime folder is intentionally minimal: binary,
   `plugin/manifest.json`, `plugin/dist/code.js` and `plugin/dist/index.html`.
3. electron-builder copies `out/package-resources/*` into Electron `process.resourcesPath`
   so that, on the target:
   - `resources/skill-packs/pm-lifecycle-figma-design/SKILL.md` exists (Figma worker), and
   - `resources/skill-packs/pm-lifecycle-canvas/SKILL.md` exists (canvas installer source), and
   - `resources/figma-runtime/plugin/manifest.json` plus the OS binary exist.
4. GitHub Release also attaches `za-talk-to-figma-<os>-<arch>.tar.gz` as a standalone
   MCP/plugin bundle for users who want to import/run the bridge outside the app.
5. First launch on the new machine auto-installs `~/.claude/skills/pm-lifecycle-canvas`.
   Nothing else is required for the AI-on-canvas surface.
6. Target machine needs `node` and `curl` on PATH for the helper (both are already
   assumed by the project toolchain).

## AI-on-canvas for developers

Once installed, any Claude Code / Codex session on the machine can:

```bash
# discover live threads
sh "$HOME/.claude/skills/pm-lifecycle-canvas/pm-canvas.sh" GET /api/threads
# read a thread's canvas
sh "$HOME/.claude/skills/pm-lifecycle-canvas/pm-canvas.sh" GET /api/threads/THREAD_ID/canvas
# draw a semantic workflow (create nodes, then connect)
sh "$HOME/.claude/skills/pm-lifecycle-canvas/pm-canvas.sh" POST /api/threads/THREAD_ID/programs '{"program":{...}}'
```

Guardrails are unchanged: the bridge is loopback-only + per-launch bearer token, controls
free canvas presentation only, never mutates ProductSpec, and the script worker has no
filesystem/network/Node/IPC/connector access. Promotion and external artifact writes stay
guarded in Agent Core.

### Follow-ups (not blocking)

- Visible in-app **bridge status + enable/disable toggle** before packaging
  (`DEV_CANVAS_BRIDGE.md` "Next hardening").
- Optional IPC `skills:install-canvas` for a manual "Repair dev skill" button.
- Persist a program inbox + idempotency key so bridge work survives a renderer restart.
</content>
