import { describe, expect, it } from 'vitest'
import { createDraftProductSpec, parseProductSpec, type ProductSpec } from '@pm-agent/domain'
import { mealOrderingProductSpec } from '@pm-agent/fixture-meal-ordering'
import { createImpactPreview } from '@pm-agent/agent-core'
import { workflowStateReceipt } from './workflow-state-receipt'

const at = '2026-07-30T00:00:00.000Z'

function approvedSpec(overrides: Partial<ProductSpec> = {}): ProductSpec {
  return parseProductSpec({
    ...structuredClone(mealOrderingProductSpec),
    ...overrides,
    status: 'approved',
  })
}

describe('workflow state receipt', () => {
  it('surfaces verified artifacts as read-back evidence', () => {
    const receipt = workflowStateReceipt({
      productSpec: approvedSpec({ version: 2 }),
      canvasItemCount: 0,
      sending: false,
      artifactBusy: false,
      execution: {
        runId: 'RUN-1',
        status: 'verified',
        actions: ['figma', 'jira', 'zdoc'].map((target) => ({
          actionId: `action-${target}`,
          target: target as 'figma' | 'jira' | 'zdoc',
          status: 'verified',
          attempts: 1,
          lastError: null,
          receipt: null,
          verification: null,
        })),
      },
    })

    expect(receipt).toMatchObject({
      tone: 'verified',
      title: 'Kickoff verified',
    })
    expect(receipt.status).toContain('read-back')
    expect(receipt.facts).toContain('3 artifact verified.')
  })

  it('prioritizes impact preview before generic ProductSpec readiness', () => {
    const preview = createImpactPreview(
      approvedSpec(),
      { id: 'CHANGE-REMOVE-PAYMENT', operation: 'remove', targetEntityId: 'REQ-PAYMENT', reason: 'Thu gọn MVP' },
      'RUN-1',
      at,
    )
    const receipt = workflowStateReceipt({
      productSpec: preview.before,
      preview,
      canvasItemCount: 8,
      sending: false,
      artifactBusy: false,
    })

    expect(receipt.title).toBe('Impact preview')
    expect(receipt.status).toContain('ProductSpec v1 -> v2')
    expect(receipt.facts).toContain('Chưa có external write nào chạy.')
  })

  it('keeps draft canvas/product work below the confirmation boundary', () => {
    const draft = createDraftProductSpec('THREAD-1', at)
    const receipt = workflowStateReceipt({
      productSpec: draft,
      canvasItemCount: 5,
      sending: false,
      artifactBusy: false,
    })

    expect(receipt.title).toBe('Draft ProductSpec')
    expect(receipt.status).toContain('đang chờ review')
    expect(receipt.facts).toContain('5 canvas item chưa tự động thành business truth.')
  })

  it('shows immutable artifact approval state before writes', () => {
    const action = createImpactPreview(
      approvedSpec(),
      { id: 'CHANGE-REMOVE-PAYMENT', operation: 'remove', targetEntityId: 'REQ-PAYMENT', reason: 'Thu gọn MVP' },
      'RUN-1',
      at,
    ).actions[0]!
    const receipt = workflowStateReceipt({
      productSpec: approvedSpec(),
      artifactActions: [action],
      canvasItemCount: 0,
      sending: false,
      artifactBusy: false,
    })

    expect(receipt.title).toBe('Kickoff plan ready')
    expect(receipt.status).toContain('Figma')
    expect(receipt.facts).toContain('Payload hash cố định; đổi payload sẽ mất approval.')
  })
})
