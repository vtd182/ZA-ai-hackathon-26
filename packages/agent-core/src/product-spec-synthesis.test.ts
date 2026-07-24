import { describe, expect, it } from 'vitest'
import { createDraftProductSpec, validateProductSpecInvariants, type ChatMessage, type PhaseReasoningResult } from '@pm-agent/domain'
import { synthesizeProductSpecFromDecision } from './product-spec-synthesis'

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
