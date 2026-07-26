import { describe, expect, it } from 'vitest'
import { mealOrderingProductSpec } from '@pm-agent/fixture-meal-ordering'
import { syntheticZaloDesignSystem } from '@pm-agent/fixture-zalo-design-system'
import type { FigmaCreativeBlueprint, FigmaTargetBinding } from '@pm-agent/domain'
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

function creativeBlueprint(): FigmaCreativeBlueprint {
  const screens = mealOrderingProductSpec.screens.map((screen, screenIndex) => {
    const rootId = `root-${screen.id}`
    return {
      screenId: screen.id,
      name: screen.title,
      purpose: screen.purpose,
      requirementIds: screen.requirementIds,
      width: 390,
      height: 844,
      background: screenIndex === 0 ? '#F2F7FF' : '#FFFFFF',
      presentationNote: `Product-specific composition ${screenIndex + 1}`,
      elements: [
        {
          id: rootId, kind: 'frame' as const, parentId: null, name: 'Screen composition', x: 0, y: 0, width: 390, height: 844,
          layout: 'vertical' as const, gap: 16, paddingTop: 24, paddingRight: 20, paddingBottom: 24, paddingLeft: 20,
          fill: '#FFFFFF', stroke: null, strokeWidth: 0, radius: 0, opacity: 1, text: null, fontSize: null,
          fontWeight: null, textAlign: null, componentRole: null, componentText: null, layoutGrow: 0,
        },
        {
          id: `hero-${screen.id}`, kind: 'rectangle' as const, parentId: rootId, name: 'Product visual', x: null, y: null, width: 350, height: 180,
          layout: 'none' as const, gap: 0, paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
          fill: '#EAF3FF', stroke: null, strokeWidth: 0, radius: 20, opacity: 1, text: null, fontSize: null,
          fontWeight: null, textAlign: null, componentRole: null, componentText: null, layoutGrow: 0,
        },
        {
          id: `title-${screen.id}`, kind: 'text' as const, parentId: rootId, name: 'Product headline', x: null, y: null, width: 350, height: 64,
          layout: 'none' as const, gap: 0, paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
          fill: '#101828', stroke: null, strokeWidth: 0, radius: 0, opacity: 1, text: screen.title, fontSize: 28,
          fontWeight: 'bold' as const, textAlign: 'left' as const, componentRole: null, componentText: null, layoutGrow: 0,
        },
        ...screen.designSystemRoles.map((role, roleIndex) => ({
          id: `${role}-${screen.id}-${roleIndex}`,
          kind: 'component' as const,
          parentId: rootId,
          name: `ZDS ${role}`,
          x: null,
          y: null,
          width: 350,
          height: 52,
          layout: 'none' as const,
          gap: 0,
          paddingTop: 0,
          paddingRight: 0,
          paddingBottom: 0,
          paddingLeft: 0,
          fill: null,
          stroke: null,
          strokeWidth: 0,
          radius: 0,
          opacity: 1,
          text: null,
          fontSize: null,
          fontWeight: null,
          textAlign: null,
          componentRole: role,
          componentText: role.includes('button') ? 'Tiếp tục' : screen.title,
          layoutGrow: 0,
        })),
      ],
    }
  })
  return {
    schemaVersion: 1,
    conceptName: 'Lunch without the queue',
    productPromise: 'Đặt món nhanh, nhận đúng giờ và luôn hiểu trạng thái đơn.',
    visualNarrative: 'A lively but focused Mini App using ZDS controls inside product-specific compositions.',
    principles: ['Ưu tiên món và thời gian nhận', 'Dùng trạng thái thật thay placeholder', 'ZDS cho mọi interaction control'],
    screens,
    prototypeEdges: [],
  }
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
    expect(first.designDirection.conceptName).toBe('Fast lunch, shared rhythm')
    expect(first.screens.every((screen) => screen.presentation.sections.length >= 2)).toBe(true)
    expect(JSON.stringify(first)).not.toMatch(/\"(?:x|y|width|height)\"/)
  })

  it('turns a reminder-backup ProductSpec into distinct product screen archetypes', () => {
    const backupSpec = structuredClone(mealOrderingProductSpec)
    const requirementId = backupSpec.requirements[0]!.id
    backupSpec.title = 'Remind backup'
    backupSpec.idea.title = 'Nhắc backup dữ liệu quan trọng'
    backupSpec.idea.summary = 'Mini App nhắc người dùng sao lưu dữ liệu đúng lúc mà không làm gián đoạn công việc.'
    backupSpec.screens = [
      {
        id: 'SCREEN-BACKUP-OVERVIEW',
        kind: 'screen',
        title: 'Tổng quan backup',
        purpose: 'Cho biết dữ liệu có an toàn và lần backup tiếp theo.',
        requirementIds: [requirementId],
        designSystemRoles: ['app-header', 'status-message', 'primary-button'],
      },
      {
        id: 'SCREEN-BACKUP-SOURCE',
        kind: 'screen',
        title: 'Nguồn backup',
        purpose: 'Chọn tài khoản, dữ liệu và điều kiện kết nối.',
        requirementIds: [requirementId],
        designSystemRoles: ['app-header', 'checkbox', 'primary-button'],
      },
      {
        id: 'SCREEN-BACKUP-SCHEDULE',
        kind: 'screen',
        title: 'Lịch và nhắc',
        purpose: 'Đặt lịch tự động và quy tắc nhắc lại.',
        requirementIds: [requirementId],
        designSystemRoles: ['app-header', 'date-input', 'switch', 'primary-button'],
      },
      {
        id: 'SCREEN-BACKUP-REMINDER',
        kind: 'screen',
        title: 'Nhắc backup',
        purpose: 'Cho người dùng hành động hoặc hoãn có chủ đích.',
        requirementIds: [requirementId],
        designSystemRoles: ['app-header', 'status-message', 'primary-button', 'secondary-button', 'tertiary-button'],
      },
      {
        id: 'SCREEN-BACKUP-RESULT',
        kind: 'screen',
        title: 'Kết quả backup',
        purpose: 'Xác nhận dữ liệu đã an toàn và cho biết lịch tiếp theo.',
        requirementIds: [requirementId],
        designSystemRoles: ['app-header', 'status-message', 'primary-button'],
      },
    ]

    const plan = createFigmaArtifactPlan(backupSpec, target, syntheticZaloDesignSystem, metadata)

    expect(plan.designDirection).toMatchObject({
      conceptName: 'Quiet confidence',
      palette: 'trust-green',
    })
    expect(plan.screens.map((screen) => screen.presentation.archetype)).toEqual([
      'dashboard',
      'selection',
      'configuration',
      'interrupt',
      'result',
    ])
    expect(plan.screens[3]?.presentation.sections.map((section) => section.key)).toEqual([
      'pending-backup',
      'impact',
    ])
    expect(plan.screens[4]?.presentation.headline).toBe('510 tệp đã an toàn')
  })

  it('strictly resolves fixture components and tokens', () => {
    const plan = createFigmaArtifactPlan(mealOrderingProductSpec, target, syntheticZaloDesignSystem, metadata)
    const result = preflightFigmaArtifactPlan(plan, syntheticZaloDesignSystem, target)

    expect(result.allowed).toBe(true)
    expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual([])
    expect(result.plan.resolvedSlots.every((slot) => slot.resolution === 'component')).toBe(true)
    expect(result.planHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('reference mode degrades a missing component to a labeled primitive instead of blocking', () => {
    const thinManifest = { ...syntheticZaloDesignSystem, components: syntheticZaloDesignSystem.components.slice(0, 1) }
    const plan = createFigmaArtifactPlan(mealOrderingProductSpec, target, thinManifest, metadata, 'reference')
    const result = preflightFigmaArtifactPlan(plan, thinManifest, target)

    expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual([])
    expect(result.plan.resolvedSlots.some((slot) => slot.resolution === 'primitive_fallback')).toBe(true)
  })

  it('strict mode still hard-blocks when the ref lacks a required component', () => {
    const thinManifest = { ...syntheticZaloDesignSystem, components: syntheticZaloDesignSystem.components.slice(0, 1) }
    const plan = createFigmaArtifactPlan(mealOrderingProductSpec, target, thinManifest, metadata, 'strict')
    const result = preflightFigmaArtifactPlan(plan, thinManifest, target)

    expect(result.issues.some((issue) => issue.severity === 'error')).toBe(true)
  })

  it('preflights a creative blueprint without constraining primitive composition', () => {
    const plan = createFigmaArtifactPlan(
      mealOrderingProductSpec,
      target,
      syntheticZaloDesignSystem,
      metadata,
      'strict',
      creativeBlueprint(),
    )
    const result = preflightFigmaArtifactPlan(plan, syntheticZaloDesignSystem, target)

    expect(result.allowed).toBe(true)
    expect(plan.creativeBlueprint?.screens[0]?.elements.some((element) => element.kind === 'rectangle')).toBe(true)
    expect(result.plan.resolvedSlots).toHaveLength(
      mealOrderingProductSpec.screens.reduce((sum, screen) => sum + screen.designSystemRoles.length, 0),
    )
    expect(result.plan.estimatedOperations).toBeGreaterThan(40)
  })

  it('rejects copy that cannot fit compact ZDS controls while leaving primitive copy free', () => {
    const blueprint = creativeBlueprint()
    const message = blueprint.screens
      .flatMap((screen) => screen.elements)
      .find((element) => element.componentRole === 'status-message')!
    message.componentText = 'A'.repeat(65)

    expect(() => createFigmaArtifactPlan(
      mealOrderingProductSpec,
      target,
      syntheticZaloDesignSystem,
      metadata,
      'strict',
      blueprint,
    )).toThrow(/content-fit limit/)
  })

  it('blocks generic placeholder content inside a creative blueprint', () => {
    const blueprint = creativeBlueprint()
    blueprint.screens[0]!.elements.find((element) => element.kind === 'text')!.text = 'Thông tin chính'
    const plan = createFigmaArtifactPlan(
      mealOrderingProductSpec,
      target,
      syntheticZaloDesignSystem,
      metadata,
      'strict',
      blueprint,
    )
    const result = preflightFigmaArtifactPlan(plan, syntheticZaloDesignSystem, target)

    expect(result.allowed).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toContain('CREATIVE_PLACEHOLDER_CONTENT')
  })

  it('allows presentation-only screens when they trace to an active requirement', () => {
    const blueprint = creativeBlueprint()
    const source = blueprint.screens[0]!
    blueprint.screens.push({
      ...structuredClone(source),
      screenId: 'SCREEN-MENU-DETAIL',
      name: 'Chi tiết món',
      purpose: 'Elaborate the selected meal without creating new business scope',
      elements: source.elements.map((element) => ({
        ...element,
        id: `${element.id}-detail`,
        parentId: element.parentId ? `${element.parentId}-detail` : null,
      })),
    })
    const plan = createFigmaArtifactPlan(
      mealOrderingProductSpec,
      target,
      syntheticZaloDesignSystem,
      metadata,
      'strict',
      blueprint,
    )
    const result = preflightFigmaArtifactPlan(plan, syntheticZaloDesignSystem, target)

    expect(result.allowed).toBe(true)
    expect(plan.screens.map((screen) => screen.screenId)).toContain('SCREEN-MENU-DETAIL')
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
