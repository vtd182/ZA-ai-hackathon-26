import { describe, expect, it } from 'vitest'
import { mealOrderingProductSpec } from '@pm-agent/fixture-meal-ordering'
import { syntheticZaloDesignSystem } from '@pm-agent/fixture-zalo-design-system'
import type { FigmaTargetBinding } from '@pm-agent/domain'
import { createFigmaArtifactPlan, preflightFigmaArtifactPlan } from './figma-artifact-plan'

const target: FigmaTargetBinding = {
  schemaVersion: 1,
  targetHash: 'a'.repeat(64),
  sessionId: 'figma:test',
  fileName: 'Synthetic sandbox',
  pageId: '1:2',
  pageName: 'PM Agent Demo',
  allowedAt: '2026-07-22T00:00:00.000Z',
}

const metadata = {
  runId: 'RUN-TEST',
  threadId: 'THREAD-TEST',
  actionId: 'ACTION-FIGMA-TEST',
  idempotencyKey: 'figma:RUN-TEST:v1',
}

describe('semantic Figma artifact planner', () => {
  it('creates four deterministic semantic recipes without pixel placement', () => {
    const first = createFigmaArtifactPlan(mealOrderingProductSpec, target, syntheticZaloDesignSystem, metadata)
    const second = createFigmaArtifactPlan(structuredClone(mealOrderingProductSpec), target, syntheticZaloDesignSystem, metadata)

    expect(second).toEqual(first)
    expect(first.screens).toHaveLength(4)
    expect(first.screens.map((screen) => screen.screenId)).toEqual([
      'SCREEN-MENU', 'SCREEN-CHECKOUT', 'SCREEN-CONFIRMATION', 'SCREEN-WALLET-ERROR',
    ])
    expect(first.screens[1]?.slots.map((slot) => slot.requiredRoles[0])).toEqual([
      'app-header', 'order-summary', 'payment-method', 'primary-button',
    ])
    expect(JSON.stringify(first)).not.toMatch(/\"(?:x|y|width|height)\"/)
  })

  it('strictly resolves fixture components and tokens', () => {
    const plan = createFigmaArtifactPlan(mealOrderingProductSpec, target, syntheticZaloDesignSystem, metadata)
    const result = preflightFigmaArtifactPlan(plan, syntheticZaloDesignSystem, target)

    expect(result.allowed).toBe(true)
    expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual([])
    expect(result.plan.resolvedSlots.every((slot) => slot.resolution === 'component')).toBe(true)
    expect(result.planHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('blocks missing roles and a different target before execution', () => {
    const missing = {
      ...syntheticZaloDesignSystem,
      components: syntheticZaloDesignSystem.components.filter((component) => component.semanticRole !== 'payment-method'),
    }
    const plan = createFigmaArtifactPlan(mealOrderingProductSpec, target, missing, metadata)
    const result = preflightFigmaArtifactPlan(plan, missing, { ...target, targetHash: 'b'.repeat(64) })

    expect(result.allowed).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['TARGET_NOT_ALLOWED', 'MISSING_COMPONENT_ROLE']))
    expect(result.plan.resolvedSlots.find((slot) => slot.slotKey.includes('payment-method'))?.resolution).toBe('missing')
  })
})
