import { describe, expect, it } from 'vitest'
import { mealOrderingProductSpec } from '@pm-agent/fixture-meal-ordering'
import { projectProductSpec, projectProductSpecGraph } from './index'

describe('ProductSpec canvas projection', () => {
  it('is deterministic and uses stable entity IDs', () => {
    const first = projectProductSpec(mealOrderingProductSpec)
    const second = projectProductSpec(structuredClone(mealOrderingProductSpec))
    expect(second).toEqual(first)
    expect(first.find((item) => item.entityId === 'REQ-PAYMENT')).toMatchObject({ view: 'deliver', tone: 'violet' })
    expect(new Set(first.map((item) => item.entityId)).size).toBe(first.length)
  })

  it('projects stable typed traceability edges without model-owned coordinates', () => {
    const first = projectProductSpecGraph(mealOrderingProductSpec)
    const second = projectProductSpecGraph(structuredClone(mealOrderingProductSpec))
    expect(second).toEqual(first)
    expect(first.edges).toHaveLength(mealOrderingProductSpec.relationships.length)
    expect(first.edges[0]).toMatchObject({
      shapeType: 'pm_traceability_edge',
      sourceView: expect.any(String),
      targetView: expect.any(String),
    })
    expect(first.edges.every((edge) => !('x' in edge) && !('y' in edge))).toBe(true)
    expect(new Set(first.edges.map((edge) => edge.relationshipId)).size).toBe(first.edges.length)
  })
})
