import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const sourceRoot = join(root, 'skills')
const outputRoot = join(root, 'apps', 'desktop', 'out', 'package-resources')
const skillOutputRoot = join(outputRoot, 'skill-packs')
const skillFolders = [
  'pm-lifecycle-canvas',
  'pm-lifecycle-figma-critic',
  'pm-lifecycle-figma-design',
]

if (!existsSync(sourceRoot)) {
  throw new Error(`Missing skills source directory: ${sourceRoot}`)
}

rmSync(skillOutputRoot, { recursive: true, force: true })
mkdirSync(skillOutputRoot, { recursive: true })

for (const folder of skillFolders) {
  const source = join(sourceRoot, folder)
  if (!existsSync(source)) throw new Error(`Missing skill pack source: ${source}`)
  cpSync(source, join(skillOutputRoot, folder), {
    recursive: true,
    filter: (sourcePath) => !sourcePath.includes('/agents/'),
  })
}

writeFileSync(join(outputRoot, 'README.md'), [
  '# PM Lifecycle packaged resources',
  '',
  'Copy the contents of this directory into Electron `process.resourcesPath` when packaging.',
  'The app resolves global skill packs from `resources/skill-packs` in packaged mode.',
  '',
].join('\n'))

console.log(`[package-assets] copied ${skillFolders.length} skill packs to ${skillOutputRoot}`)
