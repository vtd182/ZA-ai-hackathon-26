import { describe, expect, it } from 'vitest'
import { createDraftProductSpec, validateProductSpecInvariants, type ChatMessage, type PhaseReasoningResult } from '@pm-agent/domain'
import { extractProductBrief, synthesizeProductSpecFromBrief, synthesizeProductSpecFromDecision } from './product-spec-synthesis'

const at = '2026-07-23T09:00:00.000Z'
const decision: Extract<PhaseReasoningResult, { phase: 'decide' }> = {
  schemaVersion: 1,
  phase: 'decide',
  message: 'Chọn phương án',
  commands: [],
  intent: { kind: 'conversation', target: null, artifactAction: null },
  phaseData: {
    options: [
      { id: 'OPT-LEAN', title: 'MVP đặt xe tinh gọn', tradeoff: 'Ra mắt nhanh với luồng chính.' },
      { id: 'OPT-FULL', title: 'MVP đầy đủ', tradeoff: 'Nhiều tích hợp hơn.' },
    ],
    recommendedOptionId: 'OPT-LEAN',
  },
}

const messages: ChatMessage[] = [
  { id: 'm1', threadId: 'thread-ride', role: 'user', content: 'Tôi muốn kickoff Mini App đặt xe cho nhân viên', createdAt: at },
  {
    id: 'm2',
    threadId: 'thread-ride',
    role: 'user',
    content: 'Ai là người dùng chính?: Nhân viên văn phòng\nOutcome ưu tiên của MVP?: Giảm thời gian đặt xe\nConstraint nào cần khóa trước?: Mini App only',
    createdAt: at,
  },
]

describe('decision to ProductSpec synthesis', () => {
  it('extracts a clear admin dashboard brief and skips generic discovery inputs', () => {
    const clearBrief = extractProductBrief('Tôi cần admin web dashboard quản lý booking nội bộ cho ops. Có sidebar, bảng booking realtime, filter theo trạng thái, màn xử lý exception, phân quyền admin/staff. MVP chưa cần analytics.')
    expect(clearBrief).toMatchObject({
      clarity: 'clear',
      productSurface: 'admin_dashboard',
      targetUsers: expect.arrayContaining(['Ops nội bộ']),
      mvpScope: expect.arrayContaining(['Danh sách dữ liệu chính', 'Tìm kiếm và bộ lọc', 'Xử lý exception và recovery']),
      outOfScope: ['Analytics'],
    })

    expect(extractProductBrief('Tôi muốn làm miniapp đặt xe')).toBeNull()
    expect(extractProductBrief('Vẽ workflow onboarding gồm đăng ký và xác thực')).toBeNull()
  })

  it('creates a reviewable Draft ProductSpec directly from a clear web brief', () => {
    const brief = extractProductBrief('Tôi cần admin web dashboard quản lý booking nội bộ cho ops. Có sidebar, bảng booking realtime, filter theo trạng thái, màn xử lý exception, phân quyền admin/staff. MVP chưa cần analytics.')
    if (!brief) throw new Error('expected clear brief')
    const spec = synthesizeProductSpecFromBrief({
      current: createDraftProductSpec('thread-admin', at),
      threadTitle: 'Ý tưởng chưa đặt tên',
      brief,
      createdAt: at,
    })

    expect(spec.status).toBe('draft')
    expect(spec.title).toContain('Admin web dashboard')
    expect(spec.idea.productType).toBe('admin_dashboard')
    expect(spec.idea.summary).toContain('Out of scope: Analytics')
    expect(spec.requirements.map((item) => item.id)).toContain('REQ-EXCEPTION-QUEUE')
    expect(spec.screens.map((item) => item.title)).toContain('Hàng đợi exception')
    expect(spec.screens.every((screen) => screen.designSystemRoles.length === 0)).toBe(true)
    expect(spec.decisions.map((item) => item.id)).toContain('DECISION-CLEAR-BRIEF-DRAFT')
    expect(validateProductSpecInvariants(spec)).toEqual([])
  })

  it('creates a traceable domain-specific ProductSpec from normal thread context', () => {
    const spec = synthesizeProductSpecFromDecision({
      current: createDraftProductSpec('thread-ride', at),
      threadTitle: 'Mini App đặt xe cho nhân viên',
      messages,
      decision,
      selectedOptionId: 'OPT-LEAN',
      selectedAt: at,
    })

    expect(spec.idea.summary).toContain('đặt xe')
    expect(spec.idea.targetUsers).toEqual(['Nhân viên văn phòng'])
    expect(spec.requirements).toHaveLength(5)
    expect(spec.screens.map((screen) => screen.id)).toContain('SCREEN-TRACK')
    expect(spec.stories).toHaveLength(spec.requirements.length)
    expect(spec.decisions[0]).toMatchObject({ choice: 'MVP đặt xe tinh gọn', status: 'accepted' })
    expect(validateProductSpecInvariants(spec)).toEqual([])
  })

  it('supports a custom decision while keeping every must-have mapped', () => {
    const spec = synthesizeProductSpecFromDecision({
      current: createDraftProductSpec('thread-custom', at),
      threadTitle: 'Onboarding đối tác',
      messages: [{ id: 'm3', threadId: 'thread-custom', role: 'user', content: 'Vẽ onboarding gồm đăng ký, xác thực và hoàn tất', createdAt: at }],
      decision,
      selectedOptionId: 'CUSTOM',
      customTitle: 'Onboarding không cần KYC ở MVP',
      selectedAt: at,
    })

    expect(spec.screens.map((screen) => screen.id)).toEqual(['SCREEN-REGISTER', 'SCREEN-VERIFY', 'SCREEN-COMPLETE'])
    expect(spec.screens.map((screen) => screen.designSystemRoles)).toEqual([
      ['app-header', 'text-input', 'phone-input', 'primary-button'],
      ['app-header', 'otp-input', 'secondary-button', 'primary-button'],
      ['app-header', 'status-message', 'primary-button'],
    ])
    expect(spec.decisions[0]!.choice).toBe('Onboarding không cần KYC ở MVP')
    expect(validateProductSpecInvariants(spec)).toEqual([])
  })

  it('synthesizes a reviewable backup reminder journey instead of generic screens', () => {
    const spec = synthesizeProductSpecFromDecision({
      current: createDraftProductSpec('thread-backup', at),
      threadTitle: 'Remind backup',
      messages: [{
        id: 'm-backup',
        threadId: 'thread-backup',
        role: 'user',
        content: 'Tạo Mini App nhắc người dùng backup ảnh và tài liệu đúng hạn',
        createdAt: at,
      }],
      decision,
      selectedOptionId: 'OPT-LEAN',
      selectedAt: at,
    })

    expect(spec.screens.map((screen) => screen.id)).toEqual([
      'SCREEN-BACKUP-OVERVIEW',
      'SCREEN-BACKUP-SOURCE',
      'SCREEN-BACKUP-SCHEDULE',
      'SCREEN-BACKUP-REMINDER',
      'SCREEN-BACKUP-RESULT',
    ])
    expect(spec.screens.find((screen) => screen.id === 'SCREEN-BACKUP-REMINDER')?.designSystemRoles).toEqual([
      'app-header',
      'status-message',
      'primary-button',
      'secondary-button',
      'tertiary-button',
    ])
    expect(validateProductSpecInvariants(spec)).toEqual([])
  })
})
