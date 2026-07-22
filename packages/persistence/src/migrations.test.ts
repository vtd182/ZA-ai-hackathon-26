import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { mealOrderingProductSpec } from '@pm-agent/fixture-meal-ordering'
import { CORE_MIGRATION_IDS, HistoryStore, LifecycleStore } from './index'

const cleanup: string[] = []
afterEach(() => cleanup.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })))

describe('versioned SQLite migrations', () => {
  it('runs idempotently and round-trips turn events, canvas checkpoints and mappings', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pm-agent-migrations-'))
    cleanup.push(directory)
    const filename = join(directory, 'app.db')
    const history = new HistoryStore(filename)
    const thread = history.createThread()
    const turnId = history.startTurn(thread.id, 'Idea', '2026-07-22T06:00:00.000Z')
    const events = [
      { type: 'turn_started' as const, sequence: 0, at: '2026-07-22T06:00:00.000Z' },
      { type: 'turn_completed' as const, sequence: 1, at: '2026-07-22T06:00:01.000Z' },
    ]
    history.completeTurn(turnId, 'completed', events, '2026-07-22T06:00:01.000Z')
    history.saveCanvas(thread.id, { schemaVersion: 1, store: { shape: 'A' } })
    const lifecycle = new LifecycleStore(filename)
    lifecycle.initializeRun(thread.id, `run:${thread.id}`, mealOrderingProductSpec, '2026-07-22T06:00:02.000Z')
    lifecycle.close()
    history.close()

    const reopened = new HistoryStore(filename)
    expect(reopened.getTurn(turnId)).toMatchObject({ schemaVersion: 1, status: 'completed', events })
    expect(reopened.getLatestCanvasCheckpoint(thread.id)).toEqual({ schemaVersion: 1, store: { shape: 'A' } })
    reopened.close()
    const db = new Database(filename)
    expect((db.prepare('SELECT id FROM schema_migrations ORDER BY id').all() as Array<{ id: string }>).map((row) => row.id)).toEqual(CORE_MIGRATION_IDS)
    expect((db.prepare('SELECT COUNT(*) AS count FROM persisted_artifact_mappings WHERE thread_id = ?').get(thread.id) as { count: number }).count)
      .toBe(mealOrderingProductSpec.artifactMappings.length)
    db.close()
  })
})
