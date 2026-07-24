import { describe, expect, it } from 'vitest'
import { assertProviderTurnAvailable } from './active-turns'

describe('global provider turn lock', () => {
  it('allows a turn when no thread is running', () => {
    expect(() => assertProviderTurnAvailable([], 'thread-b')).not.toThrow()
  })

  it('rejects a duplicate turn in the same thread', () => {
    expect(() => assertProviderTurnAvailable(['thread-a'], 'thread-a')).toThrow('Thread này đang có một turn chạy')
  })

  it('rejects a second turn from another thread', () => {
    expect(() => assertProviderTurnAvailable(['thread-a'], 'thread-b')).toThrow('Một thread khác đang reasoning')
  })
})
