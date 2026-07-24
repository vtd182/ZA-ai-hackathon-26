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

  it('returns null for natural language and guards unknown slash commands', () => {
    expect(parseSlashCommand('Tạo thiết kế trên Figma')).toBeNull()
    expect(parseSlashCommand('/figma destroy')).toEqual({ kind: 'invalid', command: '/figma destroy' })
  })
})
