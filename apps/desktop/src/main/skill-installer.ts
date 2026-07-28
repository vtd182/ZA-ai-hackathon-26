import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { skillPackRootCandidates, type SkillPackRuntimeRoots } from './skill-packs'

/**
 * Installs the guarded Canvas Bridge skill into the machine's Claude agent folder
 * (`~/.claude/skills/pm-lifecycle-canvas`), mirroring how the tldraw desktop app
 * ships `~/.claude/skills/tldraw-offline`. Once installed, any Claude Code or Codex
 * session on the same machine can discover the skill and draw on the live PM
 * Lifecycle canvas through the loopback bridge — this is the developer-facing
 * "AI on canvas" surface. Installation is idempotent and never overwrites a
 * same-named skill the app did not author.
 */

export const CANVAS_SKILL_ID = 'pm-lifecycle-canvas'
export const CANVAS_SKILL_VERSION = '2026.07.28'
const INSTALL_MARKER = 'installed-by:pm-lifecycle-agent'
const MARKER_FILE = '.pm-install.json'

const canvasSkillFiles: ReadonlyArray<{ path: string; mode?: number }> = [
  { path: 'SKILL.md' },
  { path: 'pm-canvas.sh', mode: 0o755 },
  { path: 'references/flow-craft.md' },
]

export type CanvasSkillInstallStatus = 'installed' | 'updated' | 'unchanged' | 'skipped'

export interface CanvasSkillInstallResult {
  status: CanvasSkillInstallStatus
  skillDir: string
  version: string
  reason?: string
}

interface InstallMarker {
  id: string
  version: string
  hash: string
  installedAt: string
}

function resolveCanvasSkillSource(roots: SkillPackRuntimeRoots): string | null {
  return skillPackRootCandidates(roots)
    .map((root) => join(root, CANVAS_SKILL_ID))
    .find((dir) => existsSync(join(dir, 'SKILL.md'))) ?? null
}

function readSourceFiles(source: string): Array<{ path: string; mode?: number; content: string }> {
  return canvasSkillFiles.map((file) => {
    if (normalize(file.path) !== file.path || file.path.includes('..')) {
      throw new Error(`Invalid canvas skill file path: ${file.path}`)
    }
    return { ...file, content: readFileSync(join(source, file.path), 'utf8') }
  })
}

function contentHash(files: Array<{ path: string; content: string }>): string {
  const hash = createHash('sha256')
  hash.update(`${CANVAS_SKILL_ID}\n${CANVAS_SKILL_VERSION}\n`)
  for (const file of files) hash.update(`${file.path}\n${file.content.length}\n${file.content}\n`)
  return hash.digest('hex')
}

function readMarker(markerPath: string): InstallMarker | null {
  try {
    return JSON.parse(readFileSync(markerPath, 'utf8')) as InstallMarker
  } catch {
    return null
  }
}

/**
 * Copy the canvas skill into `~/.claude/skills/pm-lifecycle-canvas`.
 * - `installed`  — the skill was not present before.
 * - `updated`    — the shipped skill changed and the managed copy was refreshed.
 * - `unchanged`  — the installed content already matches this version.
 * - `skipped`    — no source was found, or a foreign same-named skill exists.
 */
export function installCanvasSkill(roots: SkillPackRuntimeRoots, homePath: string): CanvasSkillInstallResult {
  const skillDir = join(homePath, '.claude', 'skills', CANVAS_SKILL_ID)
  const source = resolveCanvasSkillSource(roots)
  if (!source) {
    return { status: 'skipped', skillDir, version: CANVAS_SKILL_VERSION, reason: 'canvas skill source not found' }
  }

  const files = readSourceFiles(source)
  const hash = contentHash(files)
  const markerPath = join(skillDir, MARKER_FILE)
  const skillMarkdownPath = join(skillDir, 'SKILL.md')
  const marker = existsSync(markerPath) ? readMarker(markerPath) : null

  // Refuse to overwrite a same-named skill the app did not author.
  if (existsSync(skillMarkdownPath) && !marker) {
    const existing = readFileSync(skillMarkdownPath, 'utf8')
    if (!existing.includes(INSTALL_MARKER)) {
      return {
        status: 'skipped',
        skillDir,
        version: CANVAS_SKILL_VERSION,
        reason: 'a different pm-lifecycle-canvas skill is already installed; not overwriting',
      }
    }
  }

  if (marker?.hash === hash) {
    return { status: 'unchanged', skillDir, version: CANVAS_SKILL_VERSION }
  }

  const existedBefore = existsSync(skillMarkdownPath)
  mkdirSync(skillDir, { recursive: true })
  for (const file of files) {
    const target = join(skillDir, file.path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, file.content, file.mode ? { mode: file.mode } : undefined)
    if (file.mode) chmodSync(target, file.mode)
  }
  const nextMarker: InstallMarker = {
    id: CANVAS_SKILL_ID,
    version: CANVAS_SKILL_VERSION,
    hash,
    installedAt: new Date().toISOString(),
  }
  writeFileSync(markerPath, JSON.stringify(nextMarker, null, 2), { mode: 0o600 })

  return { status: existedBefore ? 'updated' : 'installed', skillDir, version: CANVAS_SKILL_VERSION }
}
