import { describe, expect, it } from 'vitest'
import { extractJson, parsePhaseReasoningResult, parseReasoningResult } from './index'

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

  it('normalizes irrelevant provider view fields without failing the turn', () => {
    const result = parsePhaseReasoningResult({
      schemaVersion: 1,
      phase: 'discover',
      message: 'Đã phác thảo workflow.',
      commands: [
        { type: 'create_canvas_node', label: 'Nhận yêu cầu', nodeId: 'intake', nodeKind: 'process', view: 'workflow' },
        { type: 'create_canvas_node', label: 'Đủ dữ liệu?', nodeId: 'validate', nodeKind: 'decision', view: 'workflow' },
        { type: 'connect_canvas_nodes', fromId: 'intake', toId: 'validate', label: 'tiếp tục', view: 'workflow' },
        { type: 'switch_view', view: 'workflow' },
      ],
      phaseData: { questions: [], assumptions: [] },
    }, 'discover')

    expect(result.commands).toEqual([
      { type: 'create_canvas_node', label: 'Nhận yêu cầu', nodeId: 'intake', nodeKind: 'process' },
      { type: 'create_canvas_node', label: 'Đủ dữ liệu?', nodeId: 'validate', nodeKind: 'decision' },
      { type: 'connect_canvas_nodes', fromId: 'intake', toId: 'validate', label: 'tiếp tục' },
    ])
  })

  it('still rejects unknown provider commands after envelope normalization', () => {
    expect(() => parsePhaseReasoningResult({
      schemaVersion: 1,
      phase: 'discover',
      message: 'Unsafe command',
      commands: [{ type: 'execute_javascript', label: null, query: null, view: null }],
      phaseData: { questions: [], assumptions: [] },
    }, 'discover')).toThrow()
  })

  it('drops recognized legacy commands whose nullable fields do not form a command', () => {
    const result = parsePhaseReasoningResult({
      schemaVersion: 1,
      phase: 'discover',
      message: 'Canvas program remains usable.',
      commands: [
        { type: 'remove_card', label: null, query: null, view: null, nodeId: null, nodeKind: null, fromId: null, toId: null },
        { type: 'connect_canvas_nodes', label: null, query: null, view: null, nodeId: null, nodeKind: null, fromId: null, toId: null },
      ],
      canvasProgram: {
        schemaVersion: 1,
        mode: 'operations',
        summary: 'Flow',
        script: null,
        operations: [{ op: 'create_node', id: 'register', label: 'Đăng ký', kind: 'screen', fromId: null, toId: null, color: null, x: null, y: null }],
      },
      phaseData: { questions: [], assumptions: [] },
    }, 'discover')
    expect(result.commands).toEqual([])
    expect(result.canvasProgram?.operations).toHaveLength(1)
  })

  it('extracts fenced JSON', () => {
    expect(extractJson('```json\n{"message":"ok","commands":[]}\n```')).toEqual({
      message: 'ok',
      commands: [],
    })
  })
})
