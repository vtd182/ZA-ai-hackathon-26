import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { approveActions, createImpactPreview } from '@pm-agent/agent-core'
import { transitionRunState, type ChangeIntent } from '@pm-agent/domain'
import { mealOrderingProductSpec } from '@pm-agent/fixture-meal-ordering'
import { HistoryStore, LifecycleStore, OutboxStore } from './index'

const cleanup: string[] = []
afterEach(() => cleanup.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })))

function seededOutbox(filename: string): { runId: string; actionId: string } {
  const history = new HistoryStore(filename)
  const thread = history.createThread()
  const lifecycle = new LifecycleStore(filename)
  const at = '2026-07-22T03:00:00.000Z'
  const intent: ChangeIntent = { id: 'CHANGE-REMOVE-PAYMENT', operation: 'remove', targetEntityId: 'REQ-PAYMENT', reason: 'MVP' }
  let state = lifecycle.initializeRun(thread.id, 'RUN-OUTBOX', mealOrderingProductSpec, at)
  const preview = createImpactPreview(state.productSpec, intent, state.id, at)
  state = transitionRunState(state, 'REQUEST_CHANGE', at)
  state = transitionRunState({ ...state, pendingIntent: intent, pendingActions: preview.actions }, 'PREVIEW_READY', at)
  lifecycle.savePreview(state)
  const approved = approveActions(preview.actions, at)
  state = transitionRunState({ ...state, productSpec: preview.after, pendingIntent: null, pendingActions: approved.actions }, 'APPROVE', at)
  lifecycle.commitApprovedChange(state, approved.approvals)
  lifecycle.close()
  history.close()
  return { runId: state.id, actionId: approved.actions[0]!.id }
}

describe('OutboxStore receipt-first recovery', () => {
  it('recovers receipt-backed work as verifying and never loses the receipt', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pm-agent-outbox-'))
    cleanup.push(directory)
    const filename = join(directory, 'app.db')
    const { runId, actionId } = seededOutbox(filename)
    const first = new OutboxStore(filename)
    const claimed = first.claim(actionId, '2026-07-22T03:01:00.000Z')
    expect(claimed.status).toBe('executing')
    first.saveReceipt({
      schemaVersion: 1,
      id: `receipt:${actionId}`,
      actionId,
      target: 'figma',
      externalId: 'MOCK-FIGMA-1',
      payloadHash: claimed.action.payloadHash,
      idempotencyKey: 'figma:RUN-OUTBOX:v2',
      recordedAt: '2026-07-22T03:02:00.000Z',
    })
    first.close()

    const reopened = new OutboxStore(filename)
    expect(reopened.get(actionId)?.status).toBe('verifying')
    expect(reopened.getReceipt(actionId)?.externalId).toBe('MOCK-FIGMA-1')
    expect(reopened.claim(actionId, '2026-07-22T03:03:00.000Z').status).toBe('verifying')
    reopened.saveVerification({
      schemaVersion: 1,
      actionId,
      verified: true,
      issues: [],
      verifiedAt: '2026-07-22T03:04:00.000Z',
    })
    expect(reopened.summary(runId).actions.find((action) => action.actionId === actionId)?.status).toBe('verified')
    reopened.close()
  })

  it('keeps successful targets while exposing a partial failure', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pm-agent-outbox-partial-'))
    cleanup.push(directory)
    const filename = join(directory, 'app.db')
    const { runId } = seededOutbox(filename)
    const outbox = new OutboxStore(filename)
    const [figma, jira] = outbox.listRun(runId)
    outbox.claim(figma!.action.id, '2026-07-22T03:01:00.000Z')
    outbox.saveReceipt({
      schemaVersion: 1, id: `receipt:${figma!.action.id}`, actionId: figma!.action.id, target: 'figma',
      externalId: 'MOCK-FIGMA-1', payloadHash: figma!.action.payloadHash, idempotencyKey: 'figma:partial', recordedAt: '2026-07-22T03:02:00.000Z',
    })
    outbox.saveVerification({ schemaVersion: 1, actionId: figma!.action.id, verified: true, issues: [], verifiedAt: '2026-07-22T03:03:00.000Z' })
    outbox.claim(jira!.action.id, '2026-07-22T03:01:00.000Z')
    outbox.markFailure(jira!.action.id, 'Injected Jira failure', '2026-07-22T03:02:00.000Z')

    expect(outbox.summary(runId)).toMatchObject({
      status: 'partial_failure',
      actions: expect.arrayContaining([
        expect.objectContaining({ target: 'figma', status: 'verified' }),
        expect.objectContaining({ target: 'jira', status: 'failed' }),
      ]),
    })
    outbox.close()
  })
})
