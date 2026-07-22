import { describe, expect, it } from 'vitest'
import { inferLocalCommands } from './index'

describe('mock provider command inference', () => {
  it('maps Vietnamese remove-payment intent', () => {
    const result = inferLocalCommands('Bỏ payment khỏi MVP')
    expect(result.commands).toEqual([{ type: 'remove_card', query: 'payment' }])
  })

  it('switches lifecycle view', () => {
    const result = inferLocalCommands('Mở view change impact')
    expect(result.commands).toContainEqual({ type: 'switch_view', view: 'change' })
  })

  it('returns deterministic phase-specific decision data', () => {
    const first = inferLocalCommands('Đề xuất phương án', 'decide')
    const second = inferLocalCommands('Đề xuất phương án', 'decide')
    expect(first).toEqual(second)
    expect(first).toMatchObject({ phase: 'decide', phaseData: { recommendedOptionId: 'OPT-LEAN' } })
  })

  it('limits discovery to three structured questions', () => {
    const result = inferLocalCommands('Bắt đầu discovery', 'discover')
    expect(result.phase).toBe('discover')
    if (result.phase === 'discover') expect(result.phaseData.questions).toHaveLength(3)
  })
})
