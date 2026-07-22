import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FigmaRuntimeManager } from './figma-runtime'

const cleanup: string[] = []
afterEach(() => cleanup.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })))

describe('FigmaRuntimeManager', () => {
  it('reports a built plugin and live plugin session from runtime overview', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'pm-agent-figma-'))
    cleanup.push(directory)
    const binaryPath = join(directory, 'za-talk-to-figma')
    const manifestPath = join(directory, 'plugin', 'manifest.json')
    mkdirSync(join(directory, 'plugin', 'dist'), { recursive: true })
    writeFileSync(binaryPath, '')
    writeFileSync(manifestPath, '{}')
    writeFileSync(join(directory, 'plugin', 'dist', 'code.js'), '')
    writeFileSync(join(directory, 'plugin', 'dist', 'index.html'), '')

    let connected = false
    const server = createServer((_request, response) => {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ version: 'test', connected, sessionCount: connected ? 1 : 0, activeSession: connected ? 'session-1' : '' }))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Test server has no TCP port')

    const manager = new FigmaRuntimeManager({ binaryPath, manifestPath, port: address.port })
    await expect(manager.status()).resolves.toMatchObject({ runtime: 'ready', pluginBuilt: true, pluginConnected: false })
    connected = true
    await expect(manager.status()).resolves.toMatchObject({ pluginConnected: true, sessionCount: 1, activeSession: 'session-1' })

    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  })

  it('reports missing build artifacts without attempting a process spawn', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'pm-agent-figma-missing-'))
    cleanup.push(directory)
    const manager = new FigmaRuntimeManager({
      binaryPath: join(directory, 'missing-binary'),
      manifestPath: join(directory, 'missing-manifest.json'),
      port: 65530,
    })
    await expect(manager.status()).resolves.toMatchObject({ runtime: 'missing', binaryReady: false, pluginBuilt: false })
  })
})

