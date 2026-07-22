import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { HistoryStore } from './index'

const cleanup: string[] = []
afterEach(() => cleanup.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })))

describe('CanvasDocument ownership', () => {
  it('keeps one stable document per thread while saves create checkpoints', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pm-agent-canvas-'))
    cleanup.push(directory)
    const filename = join(directory, 'app.db')
    let history = new HistoryStore(filename)
    const a = history.createThread()
    const b = history.createThread()
    history.saveCanvas(a.id, { entity: 'A-v1' })
    history.saveCanvas(a.id, { entity: 'A-v2' })
    history.saveCanvas(b.id, { entity: 'B-v1' })
    history.close()

    history = new HistoryStore(filename)
    expect(history.getLatestCanvasCheckpoint(a.id)).toEqual({ entity: 'A-v2' })
    expect(history.getLatestCanvasCheckpoint(b.id)).toEqual({ entity: 'B-v1' })
    history.close()
    const db = new Database(filename)
    expect((db.prepare('SELECT COUNT(*) AS count FROM canvas_documents WHERE thread_id IN (?, ?)').get(a.id, b.id) as { count: number }).count).toBe(2)
    expect((db.prepare('SELECT COUNT(*) AS count FROM canvas_checkpoints').get() as { count: number }).count).toBe(3)
    db.close()
  })
})
