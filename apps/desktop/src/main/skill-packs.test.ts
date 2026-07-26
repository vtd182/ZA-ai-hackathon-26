import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { FIGMA_CRAFT_SKILL_PACK_ID, loadFigmaCraftSkillPack, renderSkillPackForPrompt, skillPackRootCandidates } from './skill-packs'

const createdRoots: string[] = []

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'pm-agent-skill-pack-'))
  createdRoots.push(root)
  return root
}

function writePackFile(root: string, relativePath: string, content: string): void {
  const filePath = join(root, relativePath)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content)
}

function writeFigmaPack(root: string): void {
  const files = {
    'pm-lifecycle-figma-design/SKILL.md': '# Design skill\nUse ZDS controls.',
    'pm-lifecycle-figma-design/references/experience-direction.md': '# Experience\nCreate a real journey.',
    'pm-lifecycle-figma-design/references/design-references.md': '# References\nAdapt best-in-class patterns.',
    'pm-lifecycle-figma-design/references/component-catalog.md': '# Catalog\nSheets, tabs, cards, chips.',
    'pm-lifecycle-figma-design/references/zds-craft.md': '# ZDS\nClone controls safely.',
    'pm-lifecycle-figma-design/references/product-fidelity.md': '# Product\nUse realistic data.',
    'pm-lifecycle-figma-design/references/visual-qa.md': '# QA\nNo overlap.',
    'pm-lifecycle-figma-critic/SKILL.md': '# Critic\nReject visible defects.',
    'pm-lifecycle-figma-design/references/report.schema.json': '{"type":"object","required":["schemaVersion"]}',
  }
  Object.entries(files).forEach(([path, content]) => writePackFile(root, path, content))
}

afterEach(() => {
  while (createdRoots.length > 0) {
    rmSync(createdRoots.pop()!, { recursive: true, force: true })
  }
})

describe('global skill packs', () => {
  it('loads the Figma craft pack from packaged resources before repo skills', () => {
    const resources = tempRoot()
    const repository = tempRoot()
    const packagedRoot = join(resources, 'skill-packs')
    writeFigmaPack(packagedRoot)

    const pack = loadFigmaCraftSkillPack({
      packaged: true,
      resourcesPath: resources,
      repositoryRoot: repository,
    })

    expect(pack).toMatchObject({
      schemaVersion: 1,
      id: FIGMA_CRAFT_SKILL_PACK_ID,
      rootPath: packagedRoot,
    })
    expect(pack.files.map((file) => file.path)).toContain('pm-lifecycle-figma-design/references/visual-qa.md')
    expect(pack.hash).toMatch(/^[a-f0-9]{64}$/)
    expect(renderSkillPackForPrompt(pack)).toContain('Skill pack hash:')
  })

  it('falls back to repository skills in development and errors clearly when missing', () => {
    const repository = tempRoot()
    writeFigmaPack(join(repository, 'skills'))

    expect(skillPackRootCandidates({ packaged: false, repositoryRoot: repository })).toEqual([
      join(repository, 'skills'),
    ])
    expect(loadFigmaCraftSkillPack({ packaged: false, repositoryRoot: repository }).rootPath)
      .toBe(join(repository, 'skills'))

    expect(() => loadFigmaCraftSkillPack({
      packaged: true,
      resourcesPath: tempRoot(),
      repositoryRoot: tempRoot(),
    })).toThrow(/Package skills\/pm-lifecycle-\*/)
  })
})
