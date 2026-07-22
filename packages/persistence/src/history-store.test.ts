import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { mealOrderingProductSpec } from '@pm-agent/fixture-meal-ordering'
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
})
