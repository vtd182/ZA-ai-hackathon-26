import { describe, expect, it } from 'vitest'
import { mealOrderingProductSpec } from '@pm-agent/fixture-meal-ordering'
import { planExplicitCanvasRequest, projectProductSpec, projectProductSpecGraph, resolveCanvasSelection, synthesizeProductSpecFromCanvas } from './index'
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
  it('requires an LLM-routed intent before deterministic fallback can mutate canvas', () => {
    expect(planExplicitCanvasRequest('Vẽ workflow onboarding')).toBeUndefined()
    expect(planExplicitCanvasRequest('Vẽ workflow onboarding', undefined, { intent: 'draw' })).toMatchObject({
      mode: 'operations',
    })
  })

  it('resolves an explicitly named canvas target after intent routing', () => {
    expect(resolveCanvasSelection('Xác thực', {
      schemaVersion: 1,
      revision: 1,
      selectedShapeIds: [],
      shapes: [{ id: 'shape:xac-thuc', semanticId: 'xac-thuc', type: 'geo', label: 'Xác thực', x: 0, y: 0, width: 220, height: 110 }],
    })).toMatchObject({ entityId: 'xac-thuc' })
  })

  it('does not guess an accent-folded target when more than one shape matches', () => {
    expect(resolveCanvasSelection('doi', {
      schemaVersion: 1,
      revision: 1,
      selectedShapeIds: [],
      shapes: [
        { id: 'shape:doi-xe', semanticId: 'doi-xe', type: 'geo', label: 'Đổi xe', x: 0, y: 0, width: 220, height: 110 },
        { id: 'shape:doi-tac', semanticId: 'doi-tac', type: 'geo', label: 'Đối tác', x: 260, y: 0, width: 220, height: 110 },
      ],
    })).toBeUndefined()
  })

  it('turns the onboarding prompt into the requested workflow', () => {
    const program = planExplicitCanvasRequest(
      'Vẽ workflow onboarding người dùng gồm đăng ký, xác thực và màn hình hoàn tất',
      undefined,
      { intent: 'draw' },
    )
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
      intent: 'draw',
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
      intent: 'draw',
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

  it('creates a domain-specific backup reminder flow without transcript-shaped duplicate nodes', () => {
    const program = planExplicitCanvasRequest('Vẽ toàn bộ user flow cho ý tưởng remind backup', undefined, {
      intent: 'draw',
      recentMessages: [{
        id: 'message-backup',
        threadId: 'thread-backup',
        role: 'user',
        content: 'Tôi muốn nhắc người dùng backup dữ liệu đúng hạn',
        createdAt: '2026-07-23T00:00:00.000Z',
      }],
    })
    const nodes = program?.operations.filter((operation) => operation.op === 'create_node') ?? []
    const labels = nodes.map((operation) => operation.label)
    expect(nodes.length).toBeGreaterThanOrEqual(15)
    expect(labels).toContain('Mở tổng quan backup')
    expect(labels).toContain('Hoãn nhắc')
    expect(labels).toContain('Backup thất bại')
    expect(nodes.find((operation) => operation.id === 'backup-reminder')).toMatchObject({
      description: expect.stringContaining('dung lượng'),
      lane: 'Người dùng',
      tone: 'accent',
    })
    expect(new Set(labels.map((label) => label.toLowerCase())).size).toBe(labels.length)
    expect(labels.some((label) => label.includes('Tôi muốn'))).toBe(false)
  })

  it('turns the privacy tension in a care reminder conversation into a consent-first workflow', () => {
    const program = planExplicitCanvasRequest(
      'Vẽ user flow tập trung vào khoảnh khắc người dùng tự xử lý và khi họ chủ động nhờ hỗ trợ',
      undefined,
      {
        intent: 'draw',
        recentMessages: [{
          id: 'message-care',
          threadId: 'thread-care',
          role: 'user',
          content: 'Mini app giúp gia đình nhắc nhau uống thuốc nhưng không tạo cảm giác bị giám sát',
          createdAt: '2026-07-26T00:00:00.000Z',
        }],
      },
    )
    const nodes = program?.operations.filter((operation) => operation.op === 'create_node') ?? []
    const labels = nodes.map((operation) => operation.label)

    expect(program).toMatchObject({
      sceneType: 'workflow',
      title: 'Care Circle · Support without surveillance',
    })
    expect(nodes.length).toBeGreaterThanOrEqual(12)
    expect(labels).toEqual(expect.arrayContaining([
      'Nhắc riêng tư',
      'Tự xử lý hay cần hỗ trợ?',
      'Chủ động nhờ hỗ trợ',
      'Chọn điều được chia sẻ',
    ]))
    expect(nodes.find((operation) => operation.id === 'care-support-choice')).toMatchObject({
      lane: 'Người dùng',
      badge: 'BOUNDARY',
      tone: 'warning',
    })
    expect(program?.operations).toContainEqual(expect.objectContaining({
      op: 'connect',
      fromId: 'care-support-choice',
      toId: 'care-stay-private',
      label: 'Tôi tự xử lý',
    }))
  })

  it('creates a detailed care reminder prototype with distinct consent checkpoints', () => {
    const program = planExplicitCanvasRequest('Vẽ prototype cho ý tưởng nhắc uống thuốc', undefined, {
      intent: 'draw',
      recentMessages: [{
        id: 'message-care',
        threadId: 'thread-care',
        role: 'user',
        content: 'Nhắc thuốc riêng tư, chỉ nhờ gia đình khi người dùng chủ động',
        createdAt: '2026-07-26T00:00:00.000Z',
      }],
    })
    const screens = program?.operations.filter((operation) => operation.op === 'create_node') ?? []

    expect(program).toMatchObject({
      sceneType: 'prototype',
      title: 'Care Circle · Product Concept',
    })
    expect(screens.map((operation) => operation.label)).toEqual([
      'Nhịp hôm nay',
      'Lời nhắc riêng tư',
      'Check-in lần hai',
      'Review lời nhờ hỗ trợ',
      'Đã có người bên cạnh',
    ])
    expect(screens.every((operation) => operation.screen && operation.description)).toBe(true)
    expect(screens.find((operation) => operation.id === 'prototype-care-share')?.screen?.blocks)
      .toContainEqual(expect.objectContaining({ label: 'Thông tin được chia sẻ' }))
  })

  it('creates detailed backup reminder screens, replaces an old prototype and preserves the workflow', () => {
    const program = planExplicitCanvasRequest('Vẽ prototype cho remind backup', undefined, {
      intent: 'draw',
      recentMessages: [{
        id: 'message-backup',
        threadId: 'thread-backup',
        role: 'user',
        content: 'Ý tưởng remind backup dữ liệu',
        createdAt: '2026-07-23T00:00:00.000Z',
      }],
      canvas: {
        schemaVersion: 1,
        revision: 4,
        selectedShapeIds: [],
        shapes: [
          { id: 'shape:old-start', semanticId: 'bat-dau', nodeKind: 'note', type: 'geo', label: 'Bắt đầu', x: 0, y: 0, width: 220, height: 110 },
          { id: 'shape:old-input', semanticId: 'nhap-thong-tin', nodeKind: 'screen', type: 'geo', label: 'Nhập thông tin', x: 300, y: 0, width: 220, height: 110 },
          { id: 'shape:old-prototype', semanticId: 'prototype-home', nodeKind: 'screen', visualRole: 'prototype-screen', type: 'frame', label: 'Trang chủ', x: 0, y: 300, width: 320, height: 520 },
          { id: 'shape:old-prototype-button', visualRole: 'prototype-action', type: 'geo', label: 'Tiếp tục', x: 16, y: 726, width: 288, height: 48 },
          { id: 'shape:header', semanticId: 'prototype-scene-header', visualRole: 'prototype-scene-header', type: 'geo', label: 'Old prototype', x: 0, y: -120, width: 832, height: 82 },
        ],
        bindings: [
          { id: 'edge-workflow', shapeId: 'shape:edge-workflow', fromId: 'bat-dau', toId: 'nhap-thong-tin', label: '' },
          { id: 'edge-old-prototype', shapeId: 'shape:edge-old-prototype', fromId: 'prototype-home', toId: 'prototype-complete', label: '' },
        ],
      },
    })
    const screens = program?.operations.filter((operation) => operation.op === 'create_node') ?? []
    const deleted = program?.operations.filter((operation) => operation.op === 'delete').map((operation) => operation.id) ?? []
    expect(screens.map((operation) => operation.label)).toEqual([
      'Tổng quan backup',
      'Kết nối nguồn backup',
      'Lịch & nhắc backup',
      'Nhắc backup đến hạn',
      'Kết quả backup',
    ])
    expect(screens.every((operation) => operation.screen && operation.description)).toBe(true)
    expect(program).toMatchObject({ sceneType: 'prototype', title: 'Backup Reminder · Product Concept' })
    expect(deleted).toEqual(expect.arrayContaining([
      'prototype-home',
      'shape:old-prototype-button',
      'edge-old-prototype',
      'prototype-scene-header',
    ]))
    expect(deleted).not.toEqual(expect.arrayContaining(['bat-dau', 'nhap-thong-tin', 'edge-workflow']))
  })

  it('extends the selected verification node with OTP, retry and error paths', () => {
    const program = planExplicitCanvasRequest('Thêm OTP, retry và nhánh lỗi', { entityId: 'xac-thuc', label: 'xác thực' }, {
      intent: 'edit',
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

  it('refines copy on the exact selected canvas shape without rebuilding the scene', () => {
    const program = planExplicitCanvasRequest(
      'Sửa canvas đúng vùng đang chọn: đổi copy để nhấn mạnh quyền chủ động chia sẻ',
      { entityId: 'shape:privacy-status', label: 'Không tự động báo ai · Đang riêng tư' },
      { intent: 'edit' },
    )

    expect(program).toMatchObject({
      mode: 'operations',
      operations: [{
        op: 'update',
        id: 'shape:privacy-status',
        label: expect.stringContaining('CHỈ CHIA SẺ KHI BẠN CHỌN'),
      }],
    })
    expect(program?.operations).toHaveLength(1)
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
