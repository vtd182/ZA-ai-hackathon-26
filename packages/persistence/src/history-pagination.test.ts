import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { afterEach, describe, expect, it } from 'vitest'
import { HistoryStore } from './index'

const cleanup: string[] = []
afterEach(() => cleanup.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })))

describe('paginated and searchable history', () => {
  it('queries 500 messages by cursor without loading the full transcript', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pm-agent-history-'))
    cleanup.push(directory)
    const history = new HistoryStore(join(directory, 'app.db'))
    const thread = history.createThread()
    for (let index = 0; index < 500; index += 1) history.addMessage(thread.id, index % 2 ? 'assistant' : 'user', `Synthetic transcript ${index} marker-${index}`)

    const started = performance.now()
    const first = history.listMessagesPage(thread.id, undefined, 50)
    const second = history.listMessagesPage(thread.id, first.nextCursor!, 50)
    const elapsed = performance.now() - started
    expect(first.items).toHaveLength(50)
    expect(second.items).toHaveLength(50)
    expect(new Set([...first.items, ...second.items].map((message) => message.id)).size).toBe(100)
    expect(history.getThread(thread.id).messages).toHaveLength(100)
    expect(history.listThreads('marker-377').map((item) => item.id)).toContain(thread.id)
    expect(elapsed).toBeLessThan(250)
    history.close()
  })
})
