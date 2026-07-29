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
  it('seeds AgentRouter with the allowed model choices', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pm-agent-agentrouter-'))
    cleanup.push(directory)
    const history = new HistoryStore(join(directory, 'app.db'))

    expect(history.getProfile('agentrouter-api')).toMatchObject({
      displayName: 'AgentRouter',
      modelId: 'gpt-5.6-sol',
      modelOptions: [
        { id: 'gpt-5.6-sol', label: 'gpt-5.6-sol', detail: expect.any(String) },
        { id: 'claude-opus-4-8', label: 'claude-opus-4-8', detail: expect.any(String) },
        { id: 'claude-opus-5', label: 'claude-opus-5', detail: expect.any(String) },
      ],
    })

    history.close()
  })

  it('migrates old generic AgentRouter defaults to the account model while preserving Claude choices', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pm-agent-agentrouter-legacy-'))
    cleanup.push(directory)
    const filename = join(directory, 'app.db')
    const first = new HistoryStore(filename)
    first.configureProfile('agentrouter-api', 'gpt-5.5')
    const thread = first.createThread()
    first.setThreadProvider(thread.id, 'agentrouter-api')
    first.close()

    const reopened = new HistoryStore(filename)
    expect(reopened.getProfile('agentrouter-api')).toMatchObject({
      displayName: 'AgentRouter',
      modelId: 'gpt-5.6-sol',
    })
    expect(reopened.getThread(thread.id).modelId).toBe('gpt-5.6-sol')
    reopened.close()
  })

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
    expect(JSON.parse(snapshots[0]!)).toMatchObject({
      id: DEMO_THREAD_ID,
      phase: 'deliver',
    })
    expect(new Set(snapshots).size).toBe(1)
    lifecycle.close()
    history.close()
  })

  it('reuses an untouched empty thread instead of spamming duplicates', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pm-agent-empty-'))
    cleanup.push(directory)
    const history = new HistoryStore(join(directory, 'app.db'))

    const first = history.createThread()
    // A second "new conversation" while the first is still blank must not create a duplicate.
    expect(history.createThread().id).toBe(first.id)

    // Once the thread has real content, a new conversation gets its own fresh thread.
    history.addMessage(first.id, 'user', 'ý tưởng đầu tiên')
    expect(history.createThread().id).not.toBe(first.id)

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

  it('ignores a stale canvas save after demo reset deletes the old thread', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pm-agent-stale-canvas-'))
    cleanup.push(directory)
    const history = new HistoryStore(join(directory, 'app.db'))
    const stale = history.createThread()

    history.resetDemoWorkspace()

    expect(() => history.saveCanvas(stale.id, { store: { stale: true } })).not.toThrow()
    expect(history.listThreads()).toHaveLength(1)
    expect(history.listThreads()[0]?.id).toBe(DEMO_THREAD_ID)

    history.close()
  })
})

describe('createThread reuses empty threads', () => {
  it('focuses an existing message-less thread instead of spamming new ones', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pm-agent-reuse-'))
    cleanup.push(directory)
    const history = new HistoryStore(join(directory, 'app.db'))

    const first = history.createThread()
    // "New conversation" on an untouched thread must return the SAME thread, not a duplicate.
    expect(history.createThread().id).toBe(first.id)
    expect(history.createThread().id).toBe(first.id)
    expect(history.listThreads().filter((thread) => thread.title === 'Ý tưởng chưa đặt tên')).toHaveLength(1)

    // A blank canvas alone is not a conversation → still reusable.
    history.saveCanvas(first.id, { store: { doodle: true } })
    expect(history.createThread().id).toBe(first.id)

    // Once it holds a real message, the next "new conversation" is a distinct thread.
    // (A seeded demo thread also exists, so assert on the freshly-created default-title ones.)
    history.addMessage(first.id, 'user', 'Ý tưởng đầu tiên')
    const second = history.createThread()
    expect(second.id).not.toBe(first.id)
    // Exactly two user threads exist now (first + second), plus the seeded demo thread.
    expect(history.listThreads().filter((thread) => thread.id !== DEMO_THREAD_ID)).toHaveLength(2)

    history.close()
  })
})
