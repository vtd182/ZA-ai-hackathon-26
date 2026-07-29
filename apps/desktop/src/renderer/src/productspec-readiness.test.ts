import { describe, expect, it } from 'vitest'
import { createDraftProductSpec, parseProductSpec, type ProductSpec } from '@pm-agent/domain'
import { productSpecReadiness } from './productspec-readiness'

function approvedSpec(overrides: Partial<ProductSpec> = {}): ProductSpec {
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
      summary: 'Web dashboard cho ops quản lý booking nội bộ.',
      productType: 'admin_dashboard',
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
      description: 'Ops xem và lọc booking theo trạng thái.',
      priority: 'must',
      status: 'in_scope',
      acceptanceCriteria: ['Lọc theo trạng thái thành công'],
      dependsOn: [],
    }],
    screens: [{
      id: 'SCREEN-BOOKING-LIST',
      kind: 'screen',
      title: 'Danh sách booking',
      purpose: 'Quản lý booking realtime.',
      requirementIds: ['REQ-BOOKING-LIST'],
      designSystemRoles: [],
    }],
    stories: [{
      id: 'STORY-BOOKING-LIST',
      kind: 'story',
      title: 'Ops lọc booking',
      requirementIds: ['REQ-BOOKING-LIST'],
      acceptanceCriteria: ['Given có booking When lọc trạng thái Then danh sách cập nhật'],
    }],
    dependencies: [],
    decisions: [],
    relationships: [],
    artifactMappings: [],
    createdAt: '2026-07-30T00:00:00.000Z',
    updatedAt: '2026-07-30T00:00:00.000Z',
    ...overrides,
  })
}

describe('ProductSpec readiness', () => {
  it('blocks a fresh draft from artifact preparation', () => {
    const readiness = productSpecReadiness(createDraftProductSpec('THREAD-1', '2026-07-30T00:00:00.000Z'))

    expect(readiness.truthLabel).toBe('Draft truth')
    expect(readiness.artifactReady).toBe(false)
    expect(readiness.blockers).toContain('Chưa có requirement in-scope để tạo artifact.')
    expect(readiness.nextActions).toContain('Hoàn thiện ProductSpec')
  })

  it('marks an approved traced spec as artifact-ready', () => {
    const readiness = productSpecReadiness(approvedSpec())

    expect(readiness.surfaceLabel).toBe('admin_dashboard')
    expect(readiness.truthLabel).toBe('Confirmed truth')
    expect(readiness.artifactLabel).toBe('Artifact-ready')
    expect(readiness.artifactReady).toBe(true)
    expect(readiness.blockers).toEqual([])
  })

  it('keeps must-have traceability visible before external writes', () => {
    const readiness = productSpecReadiness(approvedSpec({ stories: [] }))

    expect(readiness.artifactReady).toBe(false)
    expect(readiness.blockers).toContain('Cần ít nhất một screen và một story map vào requirement.')
    expect(readiness.blockers).toContain('1 must-have requirement chưa đủ traceability.')
  })
})
