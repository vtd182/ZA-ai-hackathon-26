import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { mealOrderingProductSpec } from '@pm-agent/fixture-meal-ordering'
import { HistoryStore, LifecycleStore } from './index'

const cleanup: string[] = []
afterEach(() => cleanup.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })))

describe('offline thread resume', () => {
  it('restores phase, ProductSpec, messages, canvas and replaces a stale opaque provider ref', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pm-agent-resume-'))
    cleanup.push(directory)
    const filename = join(directory, 'app.db')
    let history = new HistoryStore(filename)
    let lifecycle = new LifecycleStore(filename)
    const thread = history.createThread()
    history.addMessage(thread.id, 'user', 'Offline resume evidence')
    history.saveCanvas(thread.id, { schemaVersion: 1, store: { entityId: 'REQ-ORDER' } })
    history.saveProviderSegment(thread.id, 'codex-local', 'gpt-5.5', 'opaque-stale-ref')
    lifecycle.initializeRun(thread.id, `run:${thread.id}`, mealOrderingProductSpec, '2026-07-22T07:00:00.000Z')
    lifecycle.close()
    history.close()

    history = new HistoryStore(filename)
    lifecycle = new LifecycleStore(filename)
    expect(history.getThread(thread.id)).toMatchObject({
      id: thread.id,
      messages: expect.arrayContaining([expect.objectContaining({ content: 'Offline resume evidence' })]),
      canvasSnapshot: { schemaVersion: 1, store: { entityId: 'REQ-ORDER' } },
    })
    expect(lifecycle.getRunState(thread.id)).toMatchObject({ phase: 'DELIVERY', productSpec: { id: mealOrderingProductSpec.id, version: 1 } })
    expect(history.getActiveRemoteRef(thread.id, 'codex-local')).toBe('opaque-stale-ref')
    history.saveProviderSegment(thread.id, 'codex-local', 'gpt-5.5', 'opaque-fresh-ref')
    expect(history.getActiveRemoteRef(thread.id, 'codex-local')).toBe('opaque-fresh-ref')
    lifecycle.close()
    history.close()
  })
})
