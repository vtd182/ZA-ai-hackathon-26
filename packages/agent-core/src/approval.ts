import type { Approval, PlannedAction } from '@pm-agent/domain'
import { hashActionPayload } from './impact'

export interface ApprovedActionSet {
  actions: PlannedAction[]
  approvals: Approval[]
}

export function approveActions(actions: PlannedAction[], decidedAt: string): ApprovedActionSet {
  const approved = actions.map((action) => {
    if (hashActionPayload(action.payload) !== action.payloadHash) {
      throw new Error(`Action payload changed before approval: ${action.id}`)
    }
    return { ...action, status: 'approved' as const }
  })
  return {
    actions: approved,
    approvals: approved.map((action) => ({
      schemaVersion: 1,
      id: `approval:${action.id}`,
      actionId: action.id,
      payloadHash: action.payloadHash,
      decision: 'approved',
      approver: 'local_user',
      decidedAt,
    })),
  }
}

export function rejectActions(actions: PlannedAction[], decidedAt: string): ApprovedActionSet {
  const rejected = actions.map((action) => {
    if (hashActionPayload(action.payload) !== action.payloadHash) {
      throw new Error(`Action payload changed before rejection: ${action.id}`)
    }
    return { ...action, status: 'cancelled' as const }
  })
  return {
    actions: rejected,
    approvals: rejected.map((action) => ({
      schemaVersion: 1,
      id: `rejection:${action.id}:${decidedAt}`,
      actionId: action.id,
      payloadHash: action.payloadHash,
      decision: 'rejected',
      approver: 'local_user',
      decidedAt,
    })),
  }
}

export function approvalMatchesAction(approval: Approval, action: PlannedAction): boolean {
  return approval.decision === 'approved'
    && approval.actionId === action.id
    && approval.payloadHash === action.payloadHash
    && action.payloadHash === hashActionPayload(action.payload)
}

export function invalidateChangedActions(actions: PlannedAction[], approvals: Approval[]): PlannedAction[] {
  const approvalByAction = new Map(approvals.map((approval) => [approval.actionId, approval]))
  return actions.map((action) => {
    const approval = approvalByAction.get(action.id)
    return approval && approvalMatchesAction(approval, action) ? action : { ...action, status: 'pending_approval' }
  })
}
