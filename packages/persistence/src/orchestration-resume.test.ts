import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { advanceReasoningPhase } from '@pm-agent/agent-core'
import { inferLocalCommands } from '@pm-agent/reasoning'
import { mealOrderingProductSpec } from '@pm-agent/fixture-meal-ordering'
import { HistoryStore, LifecycleStore } from './index'

const cleanup: string[] = []
afterEach(() => cleanup.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })))

describe('core orchestration resume', () => {
  it('runs Idea to WAITING_FOR_DECISION and restores the latest phase checkpoint', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pm-agent-orchestration-'))
    cleanup.push(directory)
    const filename = join(directory, 'app.db')
    const history = new HistoryStore(filename)
    const thread = history.createThread()
    const lifecycle = new LifecycleStore(filename)
    let state = lifecycle.initializeRun(
      thread.id,
      `run:${thread.id}`,
      mealOrderingProductSpec,
      '2026-07-22T04:00:00.000Z',
      'IDEA_INTAKE',
    )

    const discovery = advanceReasoningPhase(state, inferLocalCommands('Khám phá ý tưởng', 'discover'), '2026-07-22T04:01:00.000Z')
    lifecycle.saveReasoningCheckpoint(discovery.state, discovery.checkpoint)
    state = discovery.state
    const decision = advanceReasoningPhase(state, inferLocalCommands('Đề xuất phương án', 'decide'), '2026-07-22T04:02:00.000Z')
    lifecycle.saveReasoningCheckpoint(decision.state, decision.checkpoint)
    lifecycle.close()

    const reopened = new LifecycleStore(filename)
    expect(reopened.getRunState(thread.id)).toMatchObject({ phase: 'DECISION', status: 'WAITING_FOR_DECISION' })
    expect(reopened.getLatestReasoningCheckpoint(state.id)).toMatchObject({
      phase: 'decide',
      result: { phaseData: { recommendedOptionId: 'OPT-LEAN' } },
    })
    reopened.close()
    history.close()
  })
})
