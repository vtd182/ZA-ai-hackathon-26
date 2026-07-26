import { describe, expect, it } from 'vitest'
import { parseSlashCommand } from './slash-commands'

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
})
