import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { mealOrderingProductSpec } from '@pm-agent/fixture-meal-ordering'
import { createHandoffPackage } from '@pm-agent/agent-core'
import { DEMO_FIXTURE_VERSION, DEMO_THREAD_ID, HistoryStore, LifecycleStore } from './index'

const cleanup: string[] = []
afterEach(() => cleanup.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })))

describe('deterministic demo reset', () => {
  it('replaces history and cascading lifecycle state with the same versioned fixture', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pm-agent-reset-'))
    cleanup.push(directory)
    const filename = join(directory, 'app.db')
    const history = new HistoryStore(filename)
    const lifecycle = new LifecycleStore(filename)
    const snapshots: string[] = []

    for (let index = 0; index < 3; index += 1) {
      const extra = history.createThread()
      lifecycle.initializeRun(extra.id, `run:${extra.id}`, mealOrderingProductSpec, '2026-07-22T03:10:00.000Z')
      const seeded = history.resetDemoWorkspace()
      snapshots.push(JSON.stringify(seeded))
      expect(history.listThreads()).toHaveLength(1)
      expect(lifecycle.getRunState(extra.id)).toBeNull()
    }

    expect(DEMO_FIXTURE_VERSION).toBe(1)
    expect(JSON.parse(snapshots[0]!).id).toBe(DEMO_THREAD_ID)
    expect(new Set(snapshots).size).toBe(1)
    lifecycle.close()
    history.close()
  })

  it('switches provider segments without changing thread, canvas or ProductSpec handoff state', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pm-agent-handoff-'))
    cleanup.push(directory)
    const filename = join(directory, 'app.db')
    const history = new HistoryStore(filename)
    const lifecycle = new LifecycleStore(filename)
    const thread = history.getThread(DEMO_THREAD_ID)
    history.saveCanvas(thread.id, { store: { demo: true } })
    const state = lifecycle.initializeRun(thread.id, `run:${thread.id}`, mealOrderingProductSpec, '2026-07-22T05:00:00.000Z')
    const target = history.getProfile('openai-api')
    const handoff = createHandoffPackage({
      thread: history.getThread(thread.id), state, toProfileId: target.id, toModelId: target.modelId, createdAt: '2026-07-22T05:01:00.000Z',
    })
    const capabilities = { structuredOutput: true, streaming: false, cancellation: true, remoteResume: false, usage: true }
    const switched = history.switchThreadProvider(thread.id, target.id, capabilities, handoff)

    expect(switched.id).toBe(thread.id)
    expect(switched.canvasSnapshot).toEqual({ store: { demo: true } })
    expect(lifecycle.getRunState(thread.id)?.productSpec).toEqual(mealOrderingProductSpec)
    expect(history.getActiveProviderHandoff(thread.id)).toEqual({ capabilities, handoff })
    lifecycle.close()
    history.close()
  })
})
