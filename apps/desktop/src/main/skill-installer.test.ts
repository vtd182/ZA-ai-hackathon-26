import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { CANVAS_SKILL_ID, installCanvasSkill } from './skill-installer'

const createdRoots: string[] = []

function tempRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix))
  createdRoots.push(root)
  return root
}

function writeCanvasSkillSource(repositoryRoot: string, skillMarkdown = '---\nname: pm-lifecycle-canvas\n---\n<!-- installed-by:pm-lifecycle-agent -->\n\n# Canvas skill\nRun `sh "$HOME/.claude/skills/pm-lifecycle-canvas/pm-canvas.sh" GET /api/threads`.'): void {
  const dir = join(repositoryRoot, 'skills', CANVAS_SKILL_ID)
  mkdirSync(join(dir, 'references'), { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), skillMarkdown)
  writeFileSync(join(dir, 'pm-canvas.sh'), '#!/usr/bin/env bash\necho bridge\n')
  writeFileSync(join(dir, 'references', 'flow-craft.md'), '# Flow craft\nEvery decision needs >=2 labeled branches; no dead-ends.')
}

afterEach(() => {
  while (createdRoots.length > 0) rmSync(createdRoots.pop()!, { recursive: true, force: true })
})

describe('canvas skill installer', () => {
  it('installs the canvas skill into ~/.claude/skills and marks it installed', () => {
    const repositoryRoot = tempRoot('pm-agent-skill-src-')
    const home = tempRoot('pm-agent-home-')
    writeCanvasSkillSource(repositoryRoot)

    const result = installCanvasSkill({ packaged: false, repositoryRoot }, home)

    expect(result.status).toBe('installed')
    expect(result.skillDir).toBe(join(home, '.claude', 'skills', CANVAS_SKILL_ID))
    const installedMarkdown = readFileSync(join(result.skillDir, 'SKILL.md'), 'utf8')
    expect(installedMarkdown).toContain('installed-by:pm-lifecycle-agent')
    // helper is executable
    expect(statSync(join(result.skillDir, 'pm-canvas.sh')).mode & 0o111).not.toBe(0)
    // no absolute machine path from the build host leaks into the shipped skill
    expect(installedMarkdown).not.toContain('/Users/')
    expect(installedMarkdown).toContain('$HOME')
  })

  it('is idempotent: a second install with the same content reports unchanged', () => {
    const repositoryRoot = tempRoot('pm-agent-skill-src-')
    const home = tempRoot('pm-agent-home-')
    writeCanvasSkillSource(repositoryRoot)

    expect(installCanvasSkill({ packaged: false, repositoryRoot }, home).status).toBe('installed')
    expect(installCanvasSkill({ packaged: false, repositoryRoot }, home).status).toBe('unchanged')
  })

  it('refreshes the managed copy when the shipped skill changes', () => {
    const repositoryRoot = tempRoot('pm-agent-skill-src-')
    const home = tempRoot('pm-agent-home-')
    writeCanvasSkillSource(repositoryRoot)
    installCanvasSkill({ packaged: false, repositoryRoot }, home)

    writeCanvasSkillSource(repositoryRoot, '---\nname: pm-lifecycle-canvas\n---\n<!-- installed-by:pm-lifecycle-agent -->\n\n# Canvas skill v2\n$HOME helper.')
    const result = installCanvasSkill({ packaged: false, repositoryRoot }, home)

    expect(result.status).toBe('updated')
    expect(readFileSync(join(result.skillDir, 'SKILL.md'), 'utf8')).toContain('Canvas skill v2')
  })

  it('never overwrites a foreign same-named skill the app did not author', () => {
    const repositoryRoot = tempRoot('pm-agent-skill-src-')
    const home = tempRoot('pm-agent-home-')
    writeCanvasSkillSource(repositoryRoot)
    const skillDir = join(home, '.claude', 'skills', CANVAS_SKILL_ID)
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, 'SKILL.md'), '# My own canvas skill\nDo not touch.')

    const result = installCanvasSkill({ packaged: false, repositoryRoot }, home)

    expect(result.status).toBe('skipped')
    expect(readFileSync(join(skillDir, 'SKILL.md'), 'utf8')).toContain('Do not touch')
  })

  it('skips cleanly when no skill source is present', () => {
    const repositoryRoot = tempRoot('pm-agent-skill-src-')
    const home = tempRoot('pm-agent-home-')

    const result = installCanvasSkill({ packaged: false, repositoryRoot }, home)
    expect(result.status).toBe('skipped')
    expect(result.reason).toMatch(/not found/)
  })
})
