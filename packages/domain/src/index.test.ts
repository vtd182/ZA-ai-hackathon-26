import { describe, expect, it } from 'vitest'
import { extractJson, parseReasoningResult } from './index'

describe('reasoning result contract', () => {
  it('accepts a valid canvas command', () => {
    const result = parseReasoningResult({
      schemaVersion: 1,
      message: 'Đã chuẩn bị thay đổi.',
      commands: [{ type: 'remove_card', query: 'payment' }],
    })
    expect(result.commands[0]?.type).toBe('remove_card')
  })

  it('rejects an unknown command', () => {
    expect(() => parseReasoningResult({ message: 'No', commands: [{ type: 'write_figma' }] })).toThrow()
  })

  it('extracts fenced JSON', () => {
    expect(extractJson('```json\n{"message":"ok","commands":[]}\n```')).toEqual({
      message: 'ok',
      commands: [],
    })
  })
})
