import { describe, expect, it } from 'vitest'
import { parseSlashCommand, slashHelpMessage } from './slash-commands'

describe('slash commands', () => {
  it('parses deterministic Figma controls and aliases', () => {
    expect(parseSlashCommand('/figma prepare')).toEqual({ kind: 'figma_prepare' })
    expect(parseSlashCommand('/artifact approve')).toEqual({ kind: 'figma_approve' })
    expect(parseSlashCommand('/figma create')).toEqual({ kind: 'figma_create' })
    expect(parseSlashCommand('/figma status')).toEqual({ kind: 'figma_status' })
    expect(parseSlashCommand('/figma retry')).toEqual({ kind: 'figma_retry' })
  })

  it('preserves the optional canvas prompt', () => {
    expect(parseSlashCommand('/canvas prototype luồng nhắc backup')).toEqual({
      kind: 'canvas_prototype',
      prompt: 'luồng nhắc backup',
    })
  })

  it('parses explicit ProductSpec confirmation', () => {
    expect(parseSlashCommand('/spec confirm')).toEqual({ kind: 'spec_confirm' })
    expect(parseSlashCommand('/productspec approve')).toEqual({ kind: 'spec_confirm' })
    expect(parseSlashCommand('/spec chot')).toEqual({ kind: 'spec_confirm' })
  })

  it('parses explicit change impact controls', () => {
    expect(parseSlashCommand('/change remove payment')).toEqual({ kind: 'change_remove', query: 'payment' })
    expect(parseSlashCommand('/scope drop REQ-PAYMENT')).toEqual({ kind: 'change_remove', query: 'REQ-PAYMENT' })
    expect(parseSlashCommand('/change bo thanh toán')).toEqual({ kind: 'change_remove', query: 'thanh toán' })
  })

  it('parses explicit creative studio modes without guessing from prose', () => {
    expect(parseSlashCommand('/studio explore luồng nhắc backup')).toEqual({
      kind: 'studio_explore',
      prompt: 'luồng nhắc backup',
    })
    expect(parseSlashCommand('/studio critique màn OTP')).toEqual({
      kind: 'studio_critique',
      prompt: 'màn OTP',
    })
    expect(parseSlashCommand('/studio sketch onboarding')).toEqual({
      kind: 'studio_sketch',
      prompt: 'onboarding',
    })
    expect(parseSlashCommand('/studio refine làm CTA rõ hơn')).toEqual({
      kind: 'studio_refine',
      prompt: 'làm CTA rõ hơn',
    })
  })

  it('routes Figma regenerate and refine', () => {
    expect(parseSlashCommand('/figma regenerate')).toEqual({ kind: 'figma_regenerate' })
    expect(parseSlashCommand('/figma regen')).toEqual({ kind: 'figma_regenerate' })
    expect(parseSlashCommand('/figma refine làm hero to hơn, thêm bản đồ')).toEqual({ kind: 'figma_refine', prompt: 'làm hero to hơn, thêm bản đồ' })
    expect(parseSlashCommand('/figma refine')).toEqual({ kind: 'figma_refine', prompt: '' })
  })

  it('routes the extended diagram vocabulary', () => {
    expect(parseSlashCommand('/canvas sequence')).toEqual({ kind: 'canvas_diagram', diagram: 'sequence', prompt: '' })
    expect(parseSlashCommand('/canvas state')).toEqual({ kind: 'canvas_diagram', diagram: 'state', prompt: '' })
    expect(parseSlashCommand('/canvas mindmap')).toEqual({ kind: 'canvas_diagram', diagram: 'mindmap', prompt: '' })
    expect(parseSlashCommand('/canvas er data model')).toEqual({ kind: 'canvas_diagram', diagram: 'er', prompt: 'data model' })
  })

  it('returns null for natural language and guards unknown slash commands', () => {
    expect(parseSlashCommand('Tạo thiết kế trên Figma')).toBeNull()
    expect(parseSlashCommand('/figma destroy')).toEqual({ kind: 'invalid', command: '/figma destroy' })
    expect(parseSlashCommand('/canvas hologram')).toEqual({ kind: 'invalid', command: '/canvas hologram' })
  })

  it('explains the governed product loop in slash help', () => {
    const help = slashHelpMessage()

    expect(help).toContain('◆ CHANGE')
    expect(help).toContain('/change remove [target]')
    expect(help).toContain('impact preview')
    expect(help).toContain('read-back')
  })
})
