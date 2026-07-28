import { describe, expect, it } from 'vitest'
import { mealOrderingProductSpec } from '@pm-agent/fixture-meal-ordering'
import { syntheticZaloDesignSystem } from '@pm-agent/fixture-zalo-design-system'
import { isManagedFigmaArtifactPage, missingFigmaRoles } from './figma-source-policy'

describe('Figma source policy', () => {
  it('recognizes only agent-owned artifact page names', () => {
    expect(isManagedFigmaArtifactPage('ZSpector · Mini App đặt xe · v1')).toBe(true)
    expect(isManagedFigmaArtifactPage('PM · Mini App đặt xe · v1')).toBe(true)
    expect(isManagedFigmaArtifactPage('PM Lifecycle · SPEC-1 · v1')).toBe(true)
    expect(isManagedFigmaArtifactPage('[PUBLIC] Zalo Mini App Framework 2.0 - dup')).toBe(false)
  })

  it('reports ProductSpec roles unavailable from the captured source', () => {
    expect(missingFigmaRoles(mealOrderingProductSpec, syntheticZaloDesignSystem)).toEqual([])
    expect(missingFigmaRoles(mealOrderingProductSpec, {
      ...syntheticZaloDesignSystem,
      components: syntheticZaloDesignSystem.components.filter((component) => component.semanticRole === 'primary-button'),
    })).toEqual(expect.arrayContaining(['app-header', 'order-summary']))
  })
})
