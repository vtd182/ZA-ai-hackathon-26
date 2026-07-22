import { describe, expect, it } from 'vitest'
import { assertProviderSwitchAllowed } from './handoff'

describe('provider switch guards', () => {
  it('blocks active turns and unconfirmed paid APIs', () => {
    expect(() => assertProviderSwitchAllowed({ activeTurn: true, execution: null, targetCostMode: 'mock', confirmedPaid: false })).toThrow(/turn/)
    expect(() => assertProviderSwitchAllowed({ activeTurn: false, execution: null, targetCostMode: 'api_paid', confirmedPaid: false })).toThrow(/CONFIRMATION/)
  })

  it('blocks switching while an artifact is executing', () => {
    expect(() => assertProviderSwitchAllowed({
      activeTurn: false,
      targetCostMode: 'mock',
      confirmedPaid: false,
      execution: {
        runId: 'RUN', status: 'executing', actions: [{
          actionId: 'ACTION', target: 'figma', status: 'executing', attempts: 1,
          lastError: null, receipt: null, verification: null,
        }],
      },
    })).toThrow(/artifact write/)
  })

  it('allows a confirmed paid switch at a safe checkpoint', () => {
    expect(() => assertProviderSwitchAllowed({ activeTurn: false, execution: null, targetCostMode: 'api_paid', confirmedPaid: true })).not.toThrow()
  })
})
