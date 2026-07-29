import { describe, expect, it } from 'vitest'
import { mealOrderingProductSpec } from './index'

describe('meal-ordering demo fixture', () => {
  it('is deterministic and contains the payment impact path', () => {
    expect(mealOrderingProductSpec.version).toBe(1)
    expect(mealOrderingProductSpec.status).toBe('approved')
    expect(mealOrderingProductSpec.requirements.map((item) => item.id)).toContain('REQ-PAYMENT')
    expect(mealOrderingProductSpec.relationships.filter((edge) => edge.source.id === 'REQ-PAYMENT').map((edge) => edge.target.id).sort()).toEqual([
      'DEP-WALLET-SDK',
      'SCREEN-CHECKOUT',
      'SCREEN-WALLET-ERROR',
      'STORY-PAY-WALLET',
    ])
  })
})
