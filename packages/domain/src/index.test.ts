import { describe, expect, it } from 'vitest'
import { extractJson, parsePhaseReasoningResult, parseReasoningResult, reasoningJsonSchemaForPhase } from './index'

describe('reasoning result contract', () => {
  it('can omit the creative canvas contract for conversation-only turns', () => {
    const schema = reasoningJsonSchemaForPhase('discover', { includeCanvasProgram: false }) as {
      required: string[]
      properties: Record<string, unknown>
    }
    expect(schema.required).not.toContain('canvasProgram')
    expect(schema.properties).not.toHaveProperty('canvasProgram')
    expect(schema.required).toContain('intent')
    expect(schema.properties).toHaveProperty('intent')
  })

  it('can constrain a creative response to the LLM-routed intent', () => {
    const schema = reasoningJsonSchemaForPhase('discover', {
      includeCanvasProgram: true,
      intentKind: 'draw',
    }) as {
      properties: { intent: { properties: { kind: unknown } } }
    }
    expect(schema.properties.intent.properties.kind).toEqual({ type: 'string', const: 'draw' })
  })

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
    expect(result.intent.kind).toBe('conversation')
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

  it('keeps provider-authored scene and screen content', () => {
    const result = parsePhaseReasoningResult({
      schemaVersion: 1,
      phase: 'discover',
      message: 'Mình đã chuẩn bị một product concept để review.',
      commands: [],
      canvasProgram: {
        schemaVersion: 1,
        mode: 'operations',
        summary: 'Backup concept',
        sceneType: 'prototype',
        title: 'Backup Reminder',
        description: 'Quiet confidence',
        script: null,
        operations: [{
          op: 'create_node',
          id: 'prototype-home',
          label: 'Tổng quan',
          kind: 'screen',
          description: 'Cho người dùng biết dữ liệu đang an toàn.',
          badge: '01',
          lane: 'Người dùng',
          icon: 'shield',
          tone: 'success',
          screen: {
            eyebrow: 'BACKUP',
            title: 'Dữ liệu đang an toàn',
            subtitle: 'Lần gần nhất 22:30',
            blocks: [
              { id: 'health', kind: 'hero', label: 'Trạng thái', value: 'Đã bảo vệ', helper: '510 tệp', tone: 'success', span: 'full' },
              { id: 'next', kind: 'metric', label: 'Lần tiếp theo', value: '22:30', helper: null, tone: 'accent', span: 'half' },
            ],
            primaryAction: 'Backup ngay',
            secondaryAction: 'Xem lịch sử',
            navItems: ['Tổng quan', 'Lịch'],
            activeNav: 'Tổng quan',
          },
        }],
      },
      phaseData: { questions: [], assumptions: [] },
    }, 'discover')
    expect(result.canvasProgram).toMatchObject({
      sceneType: 'prototype',
      title: 'Backup Reminder',
      operations: [{ screen: { primaryAction: 'Backup ngay', blocks: [{ label: 'Trạng thái' }, { label: 'Lần tiếp theo' }] } }],
    })
  })

  it('extracts fenced JSON', () => {
    expect(extractJson('```json\n{"message":"ok","commands":[]}\n```')).toEqual({
      message: 'ok',
      commands: [],
    })
  })
})
