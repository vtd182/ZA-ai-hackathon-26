import { chmodSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const sourceRoot = join(root, 'skills')
const outputRoot = join(root, 'apps', 'desktop', 'out', 'package-resources')
const skillOutputRoot = join(outputRoot, 'skill-packs')
const figmaRuntimeSourceRoot = join(root, 'mcp-tool', 'za-talk-to-figma')
const figmaRuntimeOutputRoot = join(outputRoot, 'figma-runtime')
const strictFigma = process.argv.includes('--strict-figma')
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

function copyFigmaRuntime() {
  const binName = process.platform === 'win32' ? 'za-talk-to-figma.exe' : 'za-talk-to-figma'
  const binarySource = join(figmaRuntimeSourceRoot, 'bin', binName)
  const pluginSource = join(figmaRuntimeSourceRoot, 'plugin')
  const required = [
    binarySource,
    join(pluginSource, 'manifest.json'),
    join(pluginSource, 'dist', 'code.js'),
    join(pluginSource, 'dist', 'index.html'),
  ]
  const missing = required.filter((file) => !existsSync(file))
  if (missing.length > 0) {
    const message = [
      '[package-assets] Figma runtime/plugin build artifacts are missing:',
      ...missing.map((file) => `  - ${file}`),
      'Run ./run.sh setup or make -C mcp-tool/za-talk-to-figma build before packaging.',
    ].join('\n')
    if (strictFigma) throw new Error(message)
    console.warn(message)
    return false
  }

  rmSync(figmaRuntimeOutputRoot, { recursive: true, force: true })
  mkdirSync(join(figmaRuntimeOutputRoot, 'plugin', 'dist'), { recursive: true })
  cpSync(binarySource, join(figmaRuntimeOutputRoot, binName))
  if (process.platform !== 'win32') chmodSync(join(figmaRuntimeOutputRoot, binName), 0o755)
  cpSync(join(pluginSource, 'manifest.json'), join(figmaRuntimeOutputRoot, 'plugin', 'manifest.json'))
  cpSync(join(pluginSource, 'dist', 'code.js'), join(figmaRuntimeOutputRoot, 'plugin', 'dist', 'code.js'))
  cpSync(join(pluginSource, 'dist', 'index.html'), join(figmaRuntimeOutputRoot, 'plugin', 'dist', 'index.html'))
  writeFileSync(join(figmaRuntimeOutputRoot, 'README.md'), [
    '# ZA Talk To Figma packaged runtime',
    '',
    'Contains the platform MCP runtime binary and the minimal Figma plugin files needed for import:',
    '',
    '- `za-talk-to-figma` / `za-talk-to-figma.exe`',
    '- `plugin/manifest.json`',
    '- `plugin/dist/code.js`',
    '- `plugin/dist/index.html`',
    '',
  ].join('\n'))
  return true
}

const figmaCopied = copyFigmaRuntime()

writeFileSync(join(outputRoot, 'README.md'), [
  '# PM Lifecycle packaged resources',
  '',
  'Copy the contents of this directory into Electron `process.resourcesPath` when packaging.',
  'The app resolves global skill packs from `resources/skill-packs` in packaged mode.',
  'The packaged Figma runtime lives at `resources/figma-runtime`.',
  '',
].join('\n'))

console.log(`[package-assets] copied ${skillFolders.length} skill packs to ${skillOutputRoot}`)
if (figmaCopied) console.log(`[package-assets] copied Figma runtime/plugin to ${figmaRuntimeOutputRoot}`)
