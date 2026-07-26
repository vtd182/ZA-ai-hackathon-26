import { describe, expect, it } from 'vitest'
import type { CanvasDocumentContext, CanvasProgram } from '@pm-agent/domain'
import { canvasNodeDimensions, layoutCanvasProgram, lintCanvasDocument } from './scene-layout'

const emptyContext: CanvasDocumentContext = {
  schemaVersion: 1,
  revision: 1,
  selectedShapeIds: [],
  shapes: [],
  viewport: { x: 0, y: 0, width: 1_280, height: 800 },
}

function operationProgram(): CanvasProgram {
  return {
    schemaVersion: 1,
    mode: 'operations',
    summary: 'Onboarding',
    operations: [
      { op: 'create_node', id: 'dang-ky', label: 'Đăng ký', kind: 'screen' },
      { op: 'create_node', id: 'xac-thuc', label: 'Xác thực', kind: 'decision' },
      { op: 'create_node', id: 'hoan-tat', label: 'Hoàn tất', kind: 'screen' },
      { op: 'connect', id: 'edge-1', fromId: 'dang-ky', toId: 'xac-thuc' },
      { op: 'connect', id: 'edge-2', fromId: 'xac-thuc', toId: 'hoan-tat' },
    ],
    script: null,
  }
}

describe('scene-aware canvas layout', () => {
  it('reserves a stable mobile-frame size for prototype screens', () => {
    expect(canvasNodeDimensions('screen', 'Giỏ hàng', 'prototype-cart')).toEqual({ width: 360, height: 720 })
  })

  it('wraps a prototype journey into a readable two-row deck', () => {
    const nodes = ['discover', 'choose', 'cart', 'confirm', 'status']
    const operations: CanvasProgram['operations'] = nodes.flatMap((id, index) => [
      { op: 'create_node' as const, id: `prototype-${id}`, label: id, kind: 'screen' as const },
      ...(index > 0 ? [{
        op: 'connect' as const,
        id: `prototype-edge-${index}`,
        fromId: `prototype-${nodes[index - 1]}`,
        toId: `prototype-${id}`,
      }] : []),
    ])
    const result = layoutCanvasProgram({
      schemaVersion: 1,
      mode: 'operations',
      summary: 'Prototype low-fidelity',
      operations,
      script: null,
    }, emptyContext)
    const positioned = result.operations.filter((operation) => operation.op === 'create_node')
    const minX = Math.min(...positioned.map((node) => node.x!))
    const maxX = Math.max(...positioned.map((node) => node.x! + 320))
    const rows = new Set(positioned.map((node) => node.y))

    expect(rows.size).toBe(2)
    expect(maxX - minX).toBeLessThanOrEqual(1_280)
    expect(positioned[3]!.x).toBeGreaterThan(positioned[4]!.x!)
  })

  it('owns node coordinates and leaves visual breathing room', () => {
    const result = layoutCanvasProgram(operationProgram(), emptyContext)
    const nodes = result.operations.filter((operation) => operation.op === 'create_node')

    expect(nodes.every((node) => node.x !== undefined && node.y !== undefined)).toBe(true)
    for (let firstIndex = 0; firstIndex < nodes.length; firstIndex += 1) {
      const first = nodes[firstIndex]!
      const firstSize = canvasNodeDimensions(first.kind, first.label)
      for (let secondIndex = firstIndex + 1; secondIndex < nodes.length; secondIndex += 1) {
        const second = nodes[secondIndex]!
        const secondSize = canvasNodeDimensions(second.kind, second.label)
        const separated = first.x! + firstSize.width + 48 <= second.x!
          || second.x! + secondSize.width + 48 <= first.x!
          || first.y! + firstSize.height + 48 <= second.y!
          || second.y! + secondSize.height + 48 <= first.y!
        expect(separated).toBe(true)
      }
    }
  })

  it('places a new scene away from existing freeform content', () => {
    const context: CanvasDocumentContext = {
      ...emptyContext,
      shapes: [{
        id: 'shape:freehand',
        type: 'draw',
        label: '',
        x: 0,
        y: 0,
        width: 1_200,
        height: 760,
      }],
    }
    const result = layoutCanvasProgram(operationProgram(), context)
    const nodes = result.operations.filter((operation) => operation.op === 'create_node')

    expect(nodes.every((node) => node.x! >= 1_380)).toBe(true)
  })

  it('wraps a large workflow into a readable scene instead of one long strip', () => {
    const operations: CanvasProgram['operations'] = []
    for (let index = 0; index < 14; index += 1) {
      operations.push({ op: 'create_node', id: `step-${index}`, label: `Bước ${index + 1}`, kind: index % 4 === 2 ? 'decision' : 'process' })
      if (index > 0) operations.push({ op: 'connect', id: `edge-${index}`, fromId: `step-${index - 1}`, toId: `step-${index}` })
    }
    const result = layoutCanvasProgram({
      schemaVersion: 1,
      mode: 'operations',
      summary: 'Large flow',
      operations,
      script: null,
    }, emptyContext)
    const nodes = result.operations.filter((operation) => operation.op === 'create_node')
    const minX = Math.min(...nodes.map((node) => node.x!))
    const maxX = Math.max(...nodes.map((node) => node.x! + canvasNodeDimensions(node.kind, node.label).width))
    const distinctBands = new Set(nodes.map((node) => Math.floor(node.y! / 560)))

    expect(maxX - minX).toBeLessThan(2_400)
    expect(distinctBands.size).toBeGreaterThan(1)
  })

  it('arranges a sequence diagram into actor columns flowing downward', () => {
    const program: CanvasProgram = {
      schemaVersion: 1,
      mode: 'operations',
      sceneType: 'sequence',
      summary: 'Sequence',
      operations: [
        { op: 'create_node', id: 'a', label: 'A', kind: 'process', lane: 'Người dùng' },
        { op: 'create_node', id: 'b', label: 'B', kind: 'process', lane: 'Backend' },
        { op: 'create_node', id: 'c', label: 'C', kind: 'process', lane: 'Người dùng' },
        { op: 'connect', id: 'e1', fromId: 'a', toId: 'b' },
        { op: 'connect', id: 'e2', fromId: 'b', toId: 'c' },
      ],
      script: null,
    }
    const result = layoutCanvasProgram(program, emptyContext)
    const nodes = result.operations.filter((operation) => operation.op === 'create_node')
    const byId = Object.fromEntries(nodes.map((node) => [node.id, node]))

    expect(byId.a!.x).toBe(byId.c!.x) // same actor → same column
    expect(byId.a!.x).not.toBe(byId.b!.x) // different actor → different column
    expect(byId.c!.y!).toBeGreaterThan(byId.a!.y!) // time flows down
  })

  it('reports overlapping nodes and dangling semantic edges', () => {
    const issues = lintCanvasDocument({
      ...emptyContext,
      shapes: [
        { id: 'shape:a', semanticId: 'a', nodeKind: 'screen', type: 'geo', label: 'A', x: 0, y: 0, width: 240, height: 120 },
        { id: 'shape:b', semanticId: 'b', nodeKind: 'screen', type: 'geo', label: 'B', x: 100, y: 20, width: 240, height: 120 },
      ],
      bindings: [{ id: 'edge-a-missing', shapeId: 'shape:edge', fromId: 'a', toId: 'missing', label: '' }],
    })

    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['node_overlap', 'dangling_edge']))
  })
})
