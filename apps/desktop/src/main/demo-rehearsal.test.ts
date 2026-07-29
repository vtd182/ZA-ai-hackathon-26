import { describe, expect, it } from 'vitest'
import { extractProductBrief, synthesizeProductSpecFromBrief } from '@pm-agent/agent-core'
import {
  createArtifactBrief,
  createDraftProductSpec,
  parseProductSpec,
  validateProductSpecInvariants,
  type FigmaTargetBinding,
} from '@pm-agent/domain'
import {
  createFigmaArtifactPlan,
  createLivePrimitiveFallbackManifest,
  hashConnectorPayload,
  preflightFigmaArtifactPlan,
} from '@pm-agent/connectors'
import { syntheticZaloDesignSystem } from '@pm-agent/fixture-zalo-design-system'

const at = '2026-07-30T10:00:00.000Z'

const freeFigmaTarget: FigmaTargetBinding = {
  schemaVersion: 1,
  targetHash: 'd'.repeat(64),
  sessionId: 'figma:demo-rehearsal',
  fileName: 'Demo sandbox',
  pageId: '12:34',
  pageName: 'Admin dashboard rehearsal',
  allowedAt: at,
  creativeMode: 'free',
}

describe('demo rehearsal path', () => {
  it('turns a clear admin brief into an approved no-ZDS Figma plan without mobile/ZDS assumptions', () => {
    const brief = extractProductBrief(
      'Tôi cần admin web dashboard quản lý booking nội bộ cho ops. '
      + 'Có sidebar, bảng booking realtime, filter theo trạng thái, màn xử lý exception, phân quyền admin/staff. '
      + 'MVP chưa cần analytics.',
    )
    if (!brief) throw new Error('expected a clear product brief')

    const draftSpec = synthesizeProductSpecFromBrief({
      current: createDraftProductSpec('thread-demo-admin', at),
      threadTitle: 'Admin booking ops',
      brief,
      createdAt: at,
    })
    const approvedSpec = parseProductSpec({ ...draftSpec, status: 'approved', updatedAt: at })
    const sourcePayloadHash = hashConnectorPayload(approvedSpec as unknown as Record<string, unknown>)
    const artifactBrief = createArtifactBrief({
      spec: approvedSpec,
      target: 'figma',
      sourcePayloadHash,
      createdAt: at,
      figma: {
        connectorMode: 'live',
        planMode: 'free',
        pageStrategy: 'use_target_page',
      },
    })
    const primitiveManifest = createLivePrimitiveFallbackManifest(syntheticZaloDesignSystem)
    const plan = createFigmaArtifactPlan(
      approvedSpec,
      freeFigmaTarget,
      primitiveManifest,
      {
        runId: 'RUN-DEMO-REHEARSAL',
        threadId: 'thread-demo-admin',
        actionId: 'ACTION-FIGMA-DEMO',
        idempotencyKey: `figma:demo:${sourcePayloadHash.slice(0, 12)}`,
        pageStrategy: 'use_target_page',
      },
      'free',
    )
    const preflight = preflightFigmaArtifactPlan(plan, primitiveManifest, freeFigmaTarget)

    expect(validateProductSpecInvariants(approvedSpec)).toEqual([])
    expect(approvedSpec.status).toBe('approved')
    expect(approvedSpec.idea.productType).toBe('admin_dashboard')
    expect(approvedSpec.screens.every((screen) => screen.designSystemRoles.length === 0)).toBe(true)
    expect(artifactBrief).toMatchObject({
      mode: 'free_adaptive',
      surface: 'admin_dashboard',
      fidelity: 'product_grade',
      outputPolicy: 'selected_page',
      designSystemPolicy: 'none',
    })
    expect(artifactBrief.sourcePayloadHash).toBe(sourcePayloadHash)
    expect(plan.metadata.pageStrategy).toBe('use_target_page')
    expect(plan.screens.every((screen) => screen.slots.length === 0)).toBe(true)
    expect(preflight.allowed).toBe(true)
    expect(preflight.plan.resolvedSlots).toEqual([])
    expect(preflight.issues.map((issue) => issue.code)).not.toContain('MISSING_COMPONENT_ROLE')
  })
})
