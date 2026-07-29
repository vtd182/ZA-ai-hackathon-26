import { describe, expect, it } from 'vitest'
import { createArtifactBrief, inferProductSurface } from './artifact-brief'
import { parseProductSpec, type ProductSpec } from './product-spec'

const hash = 'a'.repeat(64)

function spec(overrides: Partial<ProductSpec> = {}): ProductSpec {
  return parseProductSpec({
    schemaVersion: 1,
    id: 'SPEC-BOOKING',
    version: 1,
    title: 'Admin booking dashboard',
    status: 'approved',
    idea: {
      id: 'IDEA-BOOKING',
      kind: 'idea',
      title: 'Booking ops',
      summary: 'Web dashboard cho đội ops quản lý booking, lọc trạng thái và xử lý exception.',
      productType: 'mini_app',
      targetUsers: ['Ops'],
    },
    goals: [],
    findings: [{
      id: 'FINDING-PRODUCT-SURFACE',
      kind: 'finding',
      title: 'Surface sản phẩm',
      evidence: 'admin_dashboard',
      sourceType: 'user_input',
    }],
    requirements: [{
      id: 'REQ-BOOKING-LIST',
      kind: 'requirement',
      title: 'Danh sách booking',
      description: 'Ops xem và lọc booking theo trạng thái',
      priority: 'must',
      status: 'in_scope',
      acceptanceCriteria: ['Lọc theo trạng thái'],
      dependsOn: [],
    }],
    screens: [{
      id: 'SCREEN-BOOKING-LIST',
      kind: 'screen',
      title: 'Danh sách booking',
      purpose: 'Quản lý booking realtime',
      requirementIds: ['REQ-BOOKING-LIST'],
      designSystemRoles: ['primary-button'],
    }],
    stories: [],
    dependencies: [],
    decisions: [],
    relationships: [],
    artifactMappings: [],
    createdAt: '2026-07-30T00:00:00.000Z',
    updatedAt: '2026-07-30T00:00:00.000Z',
    ...overrides,
  })
}

describe('ArtifactBrief', () => {
  it('uses explicit ProductSpec surface finding as artifact surface', () => {
    expect(inferProductSurface(spec())).toBe('admin_dashboard')
  })

  it('creates a no-ZDS Figma brief for selected-page adaptive design', () => {
    const brief = createArtifactBrief({
      spec: spec(),
      target: 'figma',
      sourcePayloadHash: hash,
      createdAt: '2026-07-30T00:00:00.000Z',
      figma: {
        connectorMode: 'live',
        planMode: 'free',
        pageStrategy: 'use_target_page',
      },
    })

    expect(brief).toMatchObject({
      mode: 'free_adaptive',
      surface: 'admin_dashboard',
      fidelity: 'product_grade',
      outputPolicy: 'selected_page',
      designSystemPolicy: 'none',
      sourcePayloadHash: hash,
    })
    expect(brief.verificationPolicy).toContain('primitive_composition_allowed')
    expect(brief.notes.join(' ')).toContain('should not receive component roles')
  })

  it('keeps ZDS reference mode separate from free creative mode', () => {
    const miniApp = spec({
      title: 'Mini App đặt xe',
      idea: {
        ...spec().idea,
        title: 'Đặt xe',
        summary: 'Mini App đặt xe nhanh trong Zalo.',
        productType: 'mini_app',
      },
      findings: [],
      requirements: [{
        id: 'REQ-RIDE',
        kind: 'requirement',
        title: 'Đặt chuyến',
        description: 'Hành khách nhập điểm đón, điểm đến và xác nhận chuyến',
        priority: 'must',
        status: 'in_scope',
        acceptanceCriteria: ['Tạo chuyến thành công'],
        dependsOn: [],
      }],
      screens: [{
        id: 'SCREEN-RIDE',
        kind: 'screen',
        title: 'Đặt chuyến',
        purpose: 'Tạo chuyến xe trong Mini App',
        requirementIds: ['REQ-RIDE'],
        designSystemRoles: ['app-header', 'primary-button'],
      }],
    })
    const brief = createArtifactBrief({
      spec: miniApp,
      target: 'figma',
      sourcePayloadHash: hash,
      createdAt: '2026-07-30T00:00:00.000Z',
      figma: {
        connectorMode: 'live',
        planMode: 'reference',
        pageStrategy: 'create_or_reuse_managed',
      },
    })

    expect(brief.mode).toBe('zds_reference')
    expect(brief.surface).toBe('mini_app')
    expect(brief.outputPolicy).toBe('managed_page')
    expect(brief.designSystemPolicy).toBe('reference')
  })

  it('labels unavailable live Figma as a mock artifact brief instead of free or ZDS', () => {
    const brief = createArtifactBrief({
      spec: spec(),
      target: 'figma',
      sourcePayloadHash: hash,
      createdAt: '2026-07-30T00:00:00.000Z',
      figma: {
        connectorMode: 'mock',
        planMode: 'free',
        pageStrategy: 'create_or_reuse_managed',
      },
    })

    expect(brief.mode).toBe('mock')
    expect(brief.outputPolicy).toBe('mock_store')
    expect(brief.verificationPolicy).toContain('mock_store_read_back')
  })
})
