import { describe, expect, it } from 'vitest'
import {
  parseProductSpec,
  transitionRunState,
  validateProductSpecInvariants,
  type ChangeIntent,
  type RunState,
  type WorkflowEvent,
} from '@pm-agent/domain'
import { mealOrderingProductSpec } from '@pm-agent/fixture-meal-ordering'
import { approvalMatchesAction, approveActions, createImpactPreview, invalidateChangedActions, rejectActions } from './index'

const timestamp = '2026-07-22T01:00:00.000Z'
const intent: ChangeIntent = {
  id: 'CHANGE-REMOVE-PAYMENT',
  operation: 'remove',
  targetEntityId: 'REQ-PAYMENT',
  reason: 'Thu gọn phạm vi MVP',
}

function initialRun(): RunState {
  return {
    schemaVersion: 1,
    id: 'RUN-TEST',
    threadId: 'THREAD-TEST',
    phase: 'IDEA_INTAKE',
    status: 'ACTIVE',
    productSpec: mealOrderingProductSpec,
    pendingIntent: null,
    pendingActions: [],
    lastCheckpointAt: timestamp,
  }
}

describe('deterministic change impact', () => {
  it('returns only the payment impact path and a valid next spec', () => {
    const preview = createImpactPreview(mealOrderingProductSpec, intent, 'RUN-TEST', timestamp)

    expect(preview.affectedEntityIds).toEqual([
      'DEP-WALLET-SDK',
      'REQ-PAYMENT',
      'SCREEN-CHECKOUT',
      'SCREEN-WALLET-ERROR',
      'STORY-PAY-WALLET',
    ])
    expect(preview.after.version).toBe(2)
    expect(preview.after.requirements.find((item) => item.id === 'REQ-PAYMENT')).toMatchObject({ status: 'removed', priority: 'wont' })
    expect(preview.after.screens.find((item) => item.id === 'SCREEN-CHECKOUT')?.requirementIds).toEqual(['REQ-ORDER'])
    expect(preview.after.screens.some((item) => item.id === 'SCREEN-WALLET-ERROR')).toBe(false)
    expect(preview.after.stories.some((item) => item.id === 'STORY-PAY-WALLET')).toBe(false)
    expect(preview.after.dependencies.some((item) => item.id === 'DEP-WALLET-SDK')).toBe(false)
    expect(preview.actions.map((action) => action.target)).toEqual(['figma', 'jira', 'zdoc'])
    expect(preview.actions.every((action) => action.payloadHash.length === 64)).toBe(true)
  })

  it('invalidates approval when any payload changes', () => {
    const preview = createImpactPreview(mealOrderingProductSpec, intent, 'RUN-TEST', timestamp)
    const approved = approveActions(preview.actions, timestamp)
    expect(approved.actions.every((action, index) => approvalMatchesAction(approved.approvals[index]!, action))).toBe(true)

    const changed = approved.actions.map((action, index) => index === 0
      ? { ...action, payload: { ...action.payload, unexpected: true } }
      : action)
    const invalidated = invalidateChangedActions(changed, approved.approvals)
    expect(invalidated[0]?.status).toBe('pending_approval')
    expect(invalidated.slice(1).every((action) => action.status === 'approved')).toBe(true)
  })

  it('rejects immutable actions without approving a write', () => {
    const preview = createImpactPreview(mealOrderingProductSpec, intent, 'RUN-TEST', timestamp)
    const rejected = rejectActions(preview.actions, timestamp)
    expect(rejected.actions.every((action) => action.status === 'cancelled')).toBe(true)
    expect(rejected.approvals.every((approval) => approval.decision === 'rejected')).toBe(true)
  })
})

describe('workflow state machine', () => {
  it('covers the complete happy lifecycle including change approval', () => {
    const events: WorkflowEvent[] = [
      'START_DISCOVERY', 'REQUEST_DECISION', 'SELECT_OPTION', 'REQUEST_CHANGE', 'PREVIEW_READY',
      'APPROVE', 'START_EXECUTION', 'START_VERIFICATION', 'VERIFY_SUCCESS',
    ]
    const completed = events.reduce((state, event) => transitionRunState(state, event, timestamp), initialRun())
    expect(completed).toMatchObject({ phase: 'DELIVERY', status: 'COMPLETED' })
  })

  it.each(['APPROVE', 'START_EXECUTION', 'VERIFY_SUCCESS', 'REQUEST_CHANGE', 'SELECT_OPTION'] satisfies WorkflowEvent[])(
    'rejects invalid event %s from idea intake',
    (event) => expect(() => transitionRunState(initialRun(), event, timestamp)).toThrow(/Invalid workflow transition/),
  )
})

describe('ProductSpec invariants', () => {
  it('reports a must-have requirement without both screen and story mappings', () => {
    const unmapped = parseProductSpec({
      ...structuredClone(mealOrderingProductSpec),
      stories: mealOrderingProductSpec.stories.map((story) => story.id === 'STORY-ORDER-MEAL'
        ? { ...story, requirementIds: ['REQ-PICKUP'] }
        : story),
    })
    expect(validateProductSpecInvariants(unmapped)).toContainEqual(expect.objectContaining({
      code: 'UNMAPPED_MUST_HAVE',
      entityId: 'REQ-ORDER',
    }))
  })
})
