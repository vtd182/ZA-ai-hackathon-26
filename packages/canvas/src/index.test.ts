import { describe, expect, it } from 'vitest'
import { mealOrderingProductSpec } from '@pm-agent/fixture-meal-ordering'
import { classifyCanvasInteraction, planExplicitCanvasRequest, projectProductSpec, projectProductSpecGraph, synthesizeProductSpecFromCanvas } from './index'
import { createDraftProductSpec } from '@pm-agent/domain'

describe('ProductSpec canvas projection', () => {
  it('is deterministic and uses stable entity IDs', () => {
    const first = projectProductSpec(mealOrderingProductSpec)
    const second = projectProductSpec(structuredClone(mealOrderingProductSpec))
    expect(second).toEqual(first)
    expect(first.find((item) => item.entityId === 'REQ-PAYMENT')).toMatchObject({ view: 'deliver', tone: 'violet' })
    expect(new Set(first.map((item) => item.entityId)).size).toBe(first.length)
  })

  it('projects stable typed traceability edges without model-owned coordinates', () => {
    const first = projectProductSpecGraph(mealOrderingProductSpec)
    const second = projectProductSpecGraph(structuredClone(mealOrderingProductSpec))
    expect(second).toEqual(first)
    expect(first.edges).toHaveLength(mealOrderingProductSpec.relationships.length)
    expect(first.edges[0]).toMatchObject({
      shapeType: 'pm_traceability_edge',
      sourceView: expect.any(String),
      targetView: expect.any(String),
    })
    expect(first.edges.every((edge) => !('x' in edge) && !('y' in edge))).toBe(true)
    expect(new Set(first.edges.map((edge) => edge.relationshipId)).size).toBe(first.edges.length)
  })
})

describe('tldraw-first canvas planning', () => {
  it('keeps ordinary product conversation off the canvas', () => {
    expect(classifyCanvasInteraction('Tôi đang muốn kickoff một ý tưởng miniapp đặt xe').kind).toBe('conversation')
    expect(planExplicitCanvasRequest('Tôi đang muốn kickoff một ý tưởng miniapp đặt xe')).toBeUndefined()
  })

  it('requires a selected or identified target for a vague canvas edit', () => {
    expect(classifyCanvasInteraction('tạo thêm đi chứ').kind).toBe('clarify_edit')
    expect(classifyCanvasInteraction('tạo thêm đi chứ', { entityId: 'xac-thuc', label: 'Xác thực' })).toMatchObject({
      kind: 'edit',
      selection: { entityId: 'xac-thuc' },
    })
  })

  it('resolves an explicitly named canvas target without a current selection', () => {
    expect(classifyCanvasInteraction('Thêm nhánh lỗi vào Xác thực', undefined, {
      schemaVersion: 1,
      revision: 1,
      selectedShapeIds: [],
      shapes: [{ id: 'shape:xac-thuc', semanticId: 'xac-thuc', type: 'geo', label: 'Xác thực', x: 0, y: 0, width: 220, height: 110 }],
    })).toMatchObject({ kind: 'edit', selection: { entityId: 'xac-thuc' } })
  })

  it('turns the onboarding prompt into the requested workflow', () => {
    const program = planExplicitCanvasRequest('Vẽ workflow onboarding người dùng gồm đăng ký, xác thực và màn hình hoàn tất')
    expect(program).toMatchObject({ mode: 'operations' })
    expect(program?.operations.filter((operation) => operation.op === 'create_node').map((operation) => operation.label)).toEqual([
      'đăng ký',
      'xác thực',
      'màn hình hoàn tất',
    ])
    expect(program?.operations.filter((operation) => operation.op === 'connect')).toHaveLength(2)
  })

  it('uses conversation context to draw a complete ride-booking flow', () => {
    const program = planExplicitCanvasRequest('cho tôi toàn bộ flow đi', undefined, {
      recentMessages: [{
        id: 'message-1',
        threadId: 'thread-1',
        role: 'user',
        content: 'Tôi đang muốn kickoff một ý tưởng miniapp đặt xe',
        createdAt: '2026-07-23T00:00:00.000Z',
      }],
    })
    expect(program?.operations.filter((operation) => operation.op === 'create_node').length).toBeGreaterThanOrEqual(14)
    expect(program?.operations.filter((operation) => operation.op === 'connect').length).toBeGreaterThanOrEqual(14)
    expect(program?.operations).toContainEqual(expect.objectContaining({ op: 'create_node', label: 'Không tìm thấy tài xế' }))
  })

  it('creates editable low-fidelity screen frames for a prototype request', () => {
    const program = planExplicitCanvasRequest('Vẽ cho tôi prototype các màn hình', undefined, {
      recentMessages: [{
        id: 'message-1',
        threadId: 'thread-1',
        role: 'user',
        content: 'Miniapp đặt suất ăn cho nhóm văn phòng',
        createdAt: '2026-07-23T00:00:00.000Z',
      }],
    })
    const nodes = program?.operations.filter((operation) => operation.op === 'create_node') ?? []
    expect(program?.summary).toMatch(/Prototype low-fidelity/)
    expect(nodes).toHaveLength(5)
    expect(nodes.every((operation) => operation.kind === 'screen' && operation.id.startsWith('prototype-'))).toBe(true)
    expect(program?.operations.filter((operation) => operation.op === 'connect')).toHaveLength(4)
    expect(nodes.map((operation) => operation.label)).toContain('Giỏ hàng')
    expect(nodes.map((operation) => operation.label)).not.toContain('Nhập thông tin')
  })

  it('extends the selected verification node with OTP, retry and error paths', () => {
    const program = planExplicitCanvasRequest('Thêm OTP, retry và nhánh lỗi', { entityId: 'xac-thuc', label: 'xác thực' }, {
      canvas: {
        schemaVersion: 1,
        revision: 2,
        selectedShapeIds: ['shape:xac-thuc'],
        shapes: [{ id: 'shape:xac-thuc', semanticId: 'xac-thuc', type: 'geo', label: 'Xác thực', x: 640, y: 220, width: 220, height: 110 }],
      },
    })
    expect(program?.operations.filter((operation) => operation.op === 'create_node')).toHaveLength(3)
    expect(program?.operations.filter((operation) => operation.op === 'connect')).toHaveLength(3)
    expect(program?.operations).toContainEqual(expect.objectContaining({ op: 'create_node', id: 'xac-thuc-otp' }))
    expect(program?.operations.filter((operation) => operation.op === 'create_node').every(
      (operation) => operation.x === undefined && operation.y === undefined
    )).toBe(true)
  })

  it('promotes normalized canvas nodes into a valid ProductSpec', () => {
    const at = '2026-07-23T00:00:00.000Z'
    const spec = synthesizeProductSpecFromCanvas(createDraftProductSpec('thread-1', at), {
      schemaVersion: 1,
      revision: 3,
      selectedShapeIds: [],
      shapes: [
        { id: 'shape:register', semanticId: 'register', type: 'geo', label: 'Đăng ký', nodeKind: 'screen', x: 0, y: 0, width: 220, height: 150 },
        { id: 'shape:verify', semanticId: 'verify', type: 'geo', label: 'Xác thực', nodeKind: 'screen', x: 300, y: 0, width: 220, height: 150 },
        { id: 'shape:prototype-header', semanticId: 'prototype-scene-header', visualRole: 'prototype-scene-header', type: 'geo', label: 'MVP Prototype', x: 0, y: -120, width: 520, height: 80 },
        { id: 'shape:button', visualRole: 'prototype-action', type: 'geo', label: 'Tiếp tục', x: 16, y: 90, width: 180, height: 40 },
      ],
    }, 'Onboarding người dùng', at)
    expect(spec.version).toBe(2)
    expect(spec.requirements).toHaveLength(2)
    expect(spec.screens).toHaveLength(2)
    expect(spec.relationships).toHaveLength(4)
  })
})
