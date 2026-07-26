import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, normalize } from 'node:path'

export const FIGMA_CRAFT_SKILL_PACK_ID = 'pm-lifecycle-figma-craft'

export interface SkillPackFile {
  path: string
  content: string
}

export interface SkillPackBundle {
  schemaVersion: 1
  id: string
  displayName: string
  version: string
  rootPath: string
  files: SkillPackFile[]
  hash: string
  reportSchema: Record<string, unknown>
}

export interface SkillPackRuntimeRoots {
  packaged: boolean
  resourcesPath?: string
  repositoryRoot: string
}

const figmaCraftSkillFiles = [
  'pm-lifecycle-figma-design/SKILL.md',
  'pm-lifecycle-figma-design/references/experience-direction.md',
  'pm-lifecycle-figma-design/references/zds-craft.md',
  'pm-lifecycle-figma-design/references/product-fidelity.md',
  'pm-lifecycle-figma-design/references/visual-qa.md',
  'pm-lifecycle-figma-critic/SKILL.md',
]

const reportSchemaPath = 'pm-lifecycle-figma-design/references/report.schema.json'

export function skillPackRootCandidates(roots: SkillPackRuntimeRoots): string[] {
  const candidates = roots.packaged && roots.resourcesPath
    ? [
        join(roots.resourcesPath, 'skill-packs'),
        join(roots.resourcesPath, 'app.asar.unpacked', 'skill-packs'),
        join(roots.resourcesPath, 'app', 'skill-packs'),
      ]
    : []
  return [
    ...candidates,
    join(roots.repositoryRoot, 'skills'),
  ]
}

function resolveSkillPackRoot(roots: SkillPackRuntimeRoots): string {
  const root = skillPackRootCandidates(roots)
    .find((candidate) => existsSync(join(candidate, 'pm-lifecycle-figma-design', 'SKILL.md')))
  if (!root) {
    throw new Error(
      `Global skill pack "${FIGMA_CRAFT_SKILL_PACK_ID}" is missing. `
      + 'Package skills/pm-lifecycle-* into resources/skill-packs before creating a production app.',
    )
  }
  return root
}

function readSkillFile(rootPath: string, relativePath: string): SkillPackFile {
  if (relativePath.includes('..') || normalize(relativePath) !== relativePath) {
    throw new Error(`Invalid skill pack path: ${relativePath}`)
  }
  const filePath = join(rootPath, relativePath)
  if (!existsSync(filePath)) throw new Error(`Missing skill pack file: ${relativePath}`)
  return {
    path: relativePath,
    content: readFileSync(filePath, 'utf8'),
  }
}

function skillPackHash(input: Pick<SkillPackBundle, 'id' | 'version' | 'files'>): string {
  const hash = createHash('sha256')
  hash.update(`${input.id}\n${input.version}\n`)
  for (const file of input.files) {
    hash.update(`${file.path}\n${file.content.length}\n${file.content}\n`)
  }
  return hash.digest('hex')
}

export function loadFigmaCraftSkillPack(roots: SkillPackRuntimeRoots): SkillPackBundle {
  const rootPath = resolveSkillPackRoot(roots)
  const files = figmaCraftSkillFiles.map((relativePath) => readSkillFile(rootPath, relativePath))
  const reportSchemaFile = readSkillFile(rootPath, reportSchemaPath)
  const reportSchema = JSON.parse(reportSchemaFile.content) as Record<string, unknown>
  const bundleWithoutHash = {
    schemaVersion: 1 as const,
    id: FIGMA_CRAFT_SKILL_PACK_ID,
    displayName: 'PM Lifecycle Figma Craft',
    version: '2026.07.26',
    rootPath,
    files,
    reportSchema,
  }
  return {
    ...bundleWithoutHash,
    hash: skillPackHash(bundleWithoutHash),
  }
}

export function renderSkillPackForPrompt(bundle: SkillPackBundle): string {
  const files = bundle.files
    .map((file) => [
      `### ${file.path}`,
      '```markdown',
      file.content.trim(),
      '```',
    ].join('\n'))
    .join('\n\n')
  return [
    `Skill pack: ${bundle.displayName}`,
    `Skill pack ID: ${bundle.id}`,
    `Skill pack version: ${bundle.version}`,
    `Skill pack hash: ${bundle.hash}`,
    '',
    files,
  ].join('\n')
}
