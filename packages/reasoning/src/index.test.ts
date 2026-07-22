import { describe, expect, it } from 'vitest'
import { inferLocalCommands } from './index'

describe('mock provider command inference', () => {
  it('maps Vietnamese remove-payment intent', () => {
    const result = inferLocalCommands('Bỏ payment khỏi MVP')
    expect(result.commands).toEqual([{ type: 'remove_card', query: 'payment' }])
  })

  it('switches lifecycle view', () => {
    const result = inferLocalCommands('Mở view change impact')
    expect(result.commands).toContainEqual({ type: 'switch_view', view: 'change' })
  })
})
