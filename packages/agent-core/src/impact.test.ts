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
import { approvalMatchesAction, approveActions, changeIntentFromCanvasCommand, createImpactPreview, invalidateChangedActions, rejectActions, resolveRemovalChangeIntent } from './index'

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
  it('resolves exact IDs and selected deictic targets before impact analysis', () => {
    expect(resolveRemovalChangeIntent(mealOrderingProductSpec, {
      query: 'REQ-PAYMENT', reason: 'MVP',
    })).toMatchObject({ status: 'resolved', intent: { targetEntityId: 'REQ-PAYMENT' } })
    expect(resolveRemovalChangeIntent(mealOrderingProductSpec, {
      query: 'cái này', reason: 'MVP', selectedEntityId: 'REQ-PICKUP',
    })).toMatchObject({ status: 'resolved', intent: { targetEntityId: 'REQ-PICKUP' } })
  })

  it('returns explicit ambiguity without creating an intent', () => {
    expect(resolveRemovalChangeIntent(mealOrderingProductSpec, {
      query: 'cái đó', reason: 'MVP',
    })).toEqual({
      status: 'needs_user_input',
      ambiguity: expect.stringContaining('REQ-PAYMENT'),
      candidateEntityIds: ['REQ-ORDER', 'REQ-PICKUP', 'REQ-PAYMENT'],
    })
  })

  it('validates a canvas delete proposal without mutating ProductSpec', () => {
    const before = structuredClone(mealOrderingProductSpec)
    expect(changeIntentFromCanvasCommand(mealOrderingProductSpec, {
      schemaVersion: 1,
      type: 'remove_entity',
      entityId: 'REQ-PAYMENT',
    })).toMatchObject({ operation: 'remove', targetEntityId: 'REQ-PAYMENT' })
    expect(mealOrderingProductSpec).toEqual(before)
  })

  it.each([
    { schemaVersion: 1, type: 'remove_entity', entityId: 'SCREEN-CHECKOUT' },
    { schemaVersion: 1, type: 'remove_entity', entityId: 'REQ-UNKNOWN' },
    { schemaVersion: 1, type: 'remove_entity', entityId: 'invalid id' },
  ])('rejects invalid canvas command %#', (command) => {
    expect(() => changeIntentFromCanvasCommand(mealOrderingProductSpec, command)).toThrow()
  })

  it('rejects a canvas delete proposal for an already removed requirement', () => {
    const removed = createImpactPreview(mealOrderingProductSpec, intent, 'RUN-TEST', timestamp).after
    expect(() => changeIntentFromCanvasCommand(removed, {
      schemaVersion: 1,
      type: 'remove_entity',
      entityId: 'REQ-PAYMENT',
    })).toThrow(/not removable/)
  })

  it('returns only the payment impact path and a valid next spec', () => {
    const preview = createImpactPreview(mealOrderingProductSpec, intent, 'RUN-TEST', timestamp)

    expect(preview.affectedEntityIds).toEqual([
      'DECISION-MVP-SCOPE',
      'DEP-WALLET-SDK',
      'IDEA-MEAL-ORDERING',
      'REQ-PAYMENT',
      'SCREEN-CHECKOUT',
      'SCREEN-WALLET-ERROR',
      'STORY-PAY-WALLET',
    ])
    expect(preview.after.version).toBe(2)
    expect(preview.after.requirements.find((item) => item.id === 'REQ-PAYMENT')).toMatchObject({ status: 'removed', priority: 'wont' })
    expect(preview.after.idea.summary).not.toMatch(/thanh toán|ví nội bộ/i)
    expect(preview.after.decisions.find((item) => item.id === 'DECISION-MVP-SCOPE')).toMatchObject({
      choice: 'MVP chưa gồm thanh toán ví nội bộ.',
    })
    expect(preview.after.screens.find((item) => item.id === 'SCREEN-CHECKOUT')).toMatchObject({
      purpose: 'Kiểm tra đơn trước khi xác nhận',
      requirementIds: ['REQ-ORDER'],
      designSystemRoles: ['app-header', 'order-summary', 'primary-button'],
    })
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
  it('pauses ambiguous changes for input and resumes impact analysis', () => {
    let state = initialRun()
    state = transitionRunState(state, 'START_DISCOVERY', timestamp)
    state = transitionRunState(state, 'REQUEST_DECISION', timestamp)
    state = transitionRunState(state, 'SELECT_OPTION', timestamp)
    state = transitionRunState(state, 'REQUEST_CHANGE', timestamp)
    state = transitionRunState(state, 'NEEDS_INPUT', timestamp)
    expect(state).toMatchObject({ phase: 'CHANGE_IMPACT', status: 'NEEDS_USER_INPUT', pendingActions: [] })
    state = transitionRunState(state, 'PROVIDE_INPUT', timestamp)
    expect(state).toMatchObject({ phase: 'CHANGE_IMPACT', status: 'ACTIVE' })
  })

  it('covers the complete happy lifecycle including change approval', () => {
    const events: WorkflowEvent[] = [
      'START_DISCOVERY', 'REQUEST_DECISION', 'SELECT_OPTION', 'REQUEST_CHANGE', 'PREVIEW_READY',
      'APPROVE', 'START_EXECUTION', 'START_VERIFICATION', 'VERIFY_SUCCESS',
    ]
    const completed = events.reduce((state, event) => transitionRunState(state, event, timestamp), initialRun())
    expect(completed).toMatchObject({ phase: 'DELIVERY', status: 'COMPLETED' })
  })

  it('returns a partial Delivery run to approval when an immutable artifact target changes', () => {
    const state = {
      ...initialRun(),
      phase: 'DELIVERY' as const,
      status: 'PARTIAL_FAILURE' as const,
    }
    expect(transitionRunState(state, 'REPREPARE_ARTIFACT', timestamp)).toMatchObject({
      phase: 'DELIVERY',
      status: 'WAITING_FOR_APPROVAL',
    })
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
