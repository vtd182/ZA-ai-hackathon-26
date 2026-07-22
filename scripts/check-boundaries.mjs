import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const allowed = {
  shared: [],
  domain: ['shared'],
  connectors: ['domain', 'shared'],
  canvas: ['domain', 'shared'],
  persistence: ['domain', 'shared'],
  reasoning: ['domain', 'shared'],
  'agent-core': ['connectors', 'domain', 'reasoning', 'shared'],
}

function sourceFiles(directory) {
  const output = []
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) output.push(...sourceFiles(path))
    else if (/\.(?:ts|tsx)$/.test(entry) && !/\.test\.(?:ts|tsx)$/.test(entry)) output.push(path)
  }
  return output
}

const errors = []
for (const [owner, dependencies] of Object.entries(allowed)) {
  const source = join(root, 'packages', owner, 'src')
  for (const file of sourceFiles(source)) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/(?:from\s+|import\s*)['"]@pm-agent\/([^/'"]+)/g)) {
      const imported = match[1]
      if (imported !== owner && !dependencies.includes(imported)) {
        errors.push(`${relative(root, file)}: @pm-agent/${owner} cannot import @pm-agent/${imported}`)
      }
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log('Package boundaries OK')
