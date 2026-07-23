import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { approveActions, createImpactPreview, rejectActions } from '@pm-agent/agent-core'
import { createDraftProductSpec, parseProductSpec, transitionRunState, type ChangeIntent } from '@pm-agent/domain'
import { mealOrderingProductSpec } from '@pm-agent/fixture-meal-ordering'
import { HistoryStore, LifecycleStore, OutboxStore } from './index'

const cleanup: string[] = []
afterEach(() => {
  cleanup.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }))
})

describe('LifecycleStore', () => {
  it('atomically replaces only an empty v1 draft with a synthesized ProductSpec', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pm-agent-lifecycle-synthesis-'))
    cleanup.push(directory)
    const filename = join(directory, 'app.db')
    const history = new HistoryStore(filename)
    const thread = history.createThread()
    const store = new LifecycleStore(filename)
    const timestamp = '2026-07-22T02:00:00.000Z'
    const draft = createDraftProductSpec(thread.id, timestamp)
    const initial = store.initializeRun(thread.id, 'RUN-SYNTHESIS', draft, timestamp, 'IDEA_INTAKE')
    const synthesized = parseProductSpec({
      ...draft,
      title: 'Synthesized MVP',
      requirements: [{
        id: 'REQ-START', kind: 'requirement', title: 'Start', description: 'Start the journey',
        priority: 'must', status: 'in_scope', acceptanceCriteria: ['Journey starts'], dependsOn: [],
      }],
      screens: [{
        id: 'SCREEN-START', kind: 'screen', title: 'Start', purpose: 'Start the journey',
        requirementIds: ['REQ-START'], designSystemRoles: ['app-header', 'primary-button'],
      }],
      stories: [{
        id: 'STORY-START', kind: 'story', title: 'Start journey',
        requirementIds: ['REQ-START'], acceptanceCriteria: ['Journey starts'],
      }],
      relationships: [
        { id: 'REL-START-SCREEN', type: 'DESIGNED_BY', source: { kind: 'requirement', id: 'REQ-START' }, target: { kind: 'screen', id: 'SCREEN-START' } },
        { id: 'REL-START-STORY', type: 'IMPLEMENTS', source: { kind: 'requirement', id: 'REQ-START' }, target: { kind: 'story', id: 'STORY-START' } },
      ],
      updatedAt: timestamp,
    })
    const next = { ...initial, phase: 'DELIVERY' as const, productSpec: synthesized }

    expect(store.commitSynthesizedSpec(next).productSpec.title).toBe('Synthesized MVP')
    expect(store.getSpecVersion(thread.id, 1)?.requirements).toHaveLength(1)
    expect(() => store.commitSynthesizedSpec(next)).toThrow(/empty thread draft/)
    store.close()
    history.close()
  })

  it('persists ambiguity without a preview, action or ProductSpec mutation', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pm-agent-lifecycle-ambiguity-'))
    cleanup.push(directory)
    const filename = join(directory, 'app.db')
    const history = new HistoryStore(filename)
    const thread = history.createThread()
    let lifecycle = new LifecycleStore(filename)
    const timestamp = '2026-07-22T02:00:00.000Z'
    let state = lifecycle.initializeRun(thread.id, 'RUN-AMBIGUITY', mealOrderingProductSpec, timestamp)
    state = transitionRunState(state, 'REQUEST_CHANGE', timestamp)
    state = transitionRunState(state, 'NEEDS_INPUT', timestamp)
    lifecycle.saveRunState({ ...state, pendingClarification: 'Hãy chọn stable requirement ID.' })
    lifecycle.close()

    lifecycle = new LifecycleStore(filename)
    expect(lifecycle.getRunState(thread.id)).toMatchObject({
      status: 'NEEDS_USER_INPUT',
      pendingClarification: 'Hãy chọn stable requirement ID.',
      productSpec: { version: 1 },
      pendingActions: [],
    })
    expect(lifecycle.getSpecVersion(thread.id, 2)).toBeNull()
    expect(lifecycle.listActions(state.id)).toEqual([])
    lifecycle.close()
    history.close()
  })

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

  it('persists rejection without a new ProductSpec version or outbox work', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pm-agent-lifecycle-reject-'))
    cleanup.push(directory)
    const filename = join(directory, 'app.db')
    const history = new HistoryStore(filename)
    const thread = history.createThread()
    const lifecycle = new LifecycleStore(filename)
    const timestamp = '2026-07-22T02:00:00.000Z'
    const intent: ChangeIntent = { id: 'CHANGE-REJECT', operation: 'remove', targetEntityId: 'REQ-PAYMENT', reason: 'Review' }
    let state = lifecycle.initializeRun(thread.id, 'RUN-REJECT', mealOrderingProductSpec, timestamp)
    const preview = createImpactPreview(state.productSpec, intent, state.id, timestamp)
    state = transitionRunState(state, 'REQUEST_CHANGE', timestamp)
    state = transitionRunState({ ...state, pendingIntent: intent, pendingActions: preview.actions }, 'PREVIEW_READY', timestamp)
    lifecycle.savePreview(state)
    const rejected = rejectActions(state.pendingActions, timestamp)
    state = transitionRunState({ ...state, pendingIntent: null, pendingActions: rejected.actions }, 'REJECT', timestamp)
    lifecycle.commitRejectedChange(state, rejected.approvals)

    expect(lifecycle.getRunState(thread.id)).toMatchObject({ phase: 'DELIVERY', status: 'ACTIVE', productSpec: { version: 1 } })
    expect(lifecycle.getSpecVersion(thread.id, 2)).toBeNull()
    const outbox = new OutboxStore(filename)
    expect(outbox.listRun(state.id)).toEqual([])
    outbox.close()
    lifecycle.close()
    history.close()
  })
})
