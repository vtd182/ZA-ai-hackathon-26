import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { approveActions, createImpactPreview } from '@pm-agent/agent-core'
import { transitionRunState, type ChangeIntent } from '@pm-agent/domain'
import { mealOrderingProductSpec } from '@pm-agent/fixture-meal-ordering'
import { HistoryStore, LifecycleStore, OutboxStore } from './index'

const cleanup: string[] = []
afterEach(() => {
  cleanup.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }))
})

describe('LifecycleStore', () => {
  it('persists preview then commits approved spec/actions atomically', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pm-agent-lifecycle-'))
    cleanup.push(directory)
    const filename = join(directory, 'app.db')
    const history = new HistoryStore(filename)
    const thread = history.createThread()
    const lifecycle = new LifecycleStore(filename)
    const timestamp = '2026-07-22T02:00:00.000Z'
    const intent: ChangeIntent = {
      id: 'CHANGE-REMOVE-PAYMENT', operation: 'remove', targetEntityId: 'REQ-PAYMENT', reason: 'MVP scope',
    }

    let state = lifecycle.initializeRun(thread.id, 'RUN-PERSISTENCE', mealOrderingProductSpec, timestamp)
    const preview = createImpactPreview(state.productSpec, intent, state.id, timestamp)
    state = transitionRunState(state, 'REQUEST_CHANGE', timestamp)
    state = transitionRunState({ ...state, pendingIntent: intent, pendingActions: preview.actions }, 'PREVIEW_READY', timestamp)
    lifecycle.savePreview(state)

    expect(lifecycle.getRunState(thread.id)).toMatchObject({ status: 'WAITING_FOR_APPROVAL', pendingIntent: intent })
    expect(() => lifecycle.commitApprovedChange({ ...state, productSpec: preview.after }, [])).toThrow(/matching immutable approval/)
    expect(lifecycle.getSpecVersion(thread.id, 2)).toBeNull()

    const approved = approveActions(preview.actions, timestamp)
    state = transitionRunState({ ...state, productSpec: preview.after, pendingIntent: null, pendingActions: approved.actions }, 'APPROVE', timestamp)

    const duplicateApprovalIds = approved.approvals.map((approval, index) => index === 1
      ? { ...approval, id: approved.approvals[0]!.id }
      : approval)
    expect(() => lifecycle.commitApprovedChange(state, duplicateApprovalIds)).toThrow()
    expect(lifecycle.getSpecVersion(thread.id, 2)).toBeNull()

    lifecycle.commitApprovedChange(state, approved.approvals)

    expect(lifecycle.getSpecVersion(thread.id, 2)?.requirements.find((item) => item.id === 'REQ-PAYMENT')?.status).toBe('removed')
    expect(lifecycle.listActions(state.id).every((action) => action.status === 'approved')).toBe(true)
    const outbox = new OutboxStore(filename)
    expect(outbox.listRun(state.id).map((item) => item.action.target)).toEqual(['figma', 'jira', 'zdoc'])
    outbox.close()

    lifecycle.close()
    history.close()
  })
})
