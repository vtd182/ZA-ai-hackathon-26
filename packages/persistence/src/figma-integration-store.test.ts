import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { FigmaDesignSystemContext, FigmaTargetBinding } from '@pm-agent/domain'
import { FigmaIntegrationStore } from './figma-integration-store'

const directories: string[] = []
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })))

function target(hashCharacter: string, sessionId: string): FigmaTargetBinding {
  return {
    schemaVersion: 1,
    targetHash: hashCharacter.repeat(64),
    sessionId,
    fileName: '[PUBLIC] Sandbox',
    pageId: '0:1',
    pageName: 'Page 1',
    allowedAt: '2026-07-22T12:00:00.000Z',
  }
}

describe('FigmaIntegrationStore', () => {
  it('persists exactly one active allowlisted target and its normalized context', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pm-agent-figma-store-'))
    directories.push(directory)
    const databasePath = join(directory, 'test.sqlite')
    const store = new FigmaIntegrationStore(databasePath)
    const first = target('a', 'session-a')
    const second = target('b', 'session-b')
    store.saveActiveTarget(first)
    store.saveActiveTarget(second)

    const context: FigmaDesignSystemContext = {
      schemaVersion: 1,
      target: second,
      mode: 'fixture_fallback',
      iconCatalog: null,
      manifest: {
        schemaVersion: 1,
        id: 'fixture',
        version: 'fixture-1',
        source: 'fixture',
        sourceLabel: 'Synthetic fixture',
        capturedAt: '2026-07-22T00:00:00.000Z',
        fingerprint: 'fixture-fingerprint',
        components: [],
        tokens: { color: [], typography: [], spacing: [], radius: [] },
        forbiddenRawStyles: true,
      },
      liveSummary: {
        sourceRootId: '0:1',
        sourceRootName: 'Page 1',
        componentCount: 0,
        componentSetCount: 0,
        paintStyleCount: 6,
        textStyleCount: 3,
        variableCollectionCount: 0,
        textNodeCount: 312,
        warnings: ['No components'],
      },
      fallbackReason: 'No components',
      capturedAt: '2026-07-22T13:00:00.000Z',
    }
    store.saveContext(context)
    store.close()

    const reopened = new FigmaIntegrationStore(databasePath)
    expect(reopened.getActiveTarget()).toEqual(second)
    expect(reopened.getContext(second.targetHash)).toEqual(context)
    reopened.close()
  })
})
