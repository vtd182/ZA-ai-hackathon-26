import { describe, expect, it } from 'vitest'
import { mealOrderingProductSpec } from '@pm-agent/fixture-meal-ordering'
import { projectProductSpec } from './index'

describe('ProductSpec canvas projection', () => {
  it('is deterministic and uses stable entity IDs', () => {
    const first = projectProductSpec(mealOrderingProductSpec)
    const second = projectProductSpec(structuredClone(mealOrderingProductSpec))
    expect(second).toEqual(first)
    expect(first.find((item) => item.entityId === 'REQ-PAYMENT')).toMatchObject({ view: 'deliver', tone: 'violet' })
    expect(new Set(first.map((item) => item.entityId)).size).toBe(first.length)
  })
})

