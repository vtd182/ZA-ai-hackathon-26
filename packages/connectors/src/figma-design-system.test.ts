import { describe, expect, it } from 'vitest'
import type { DesignSystemManifest, FigmaDesignSystemCapture, FigmaTargetBinding } from '@pm-agent/domain'
import { createFixtureFallbackDesignSystemContext, createLivePrimitiveFallbackManifest, normalizeFigmaDesignSystemContext } from './figma-design-system'

const target: FigmaTargetBinding = {
  schemaVersion: 1,
  targetHash: 'a'.repeat(64),
  sessionId: 'figma:sandbox:1',
  fileName: '[PUBLIC] Sandbox',
  pageId: '0:1',
  pageName: 'Page 1',
  allowedAt: '2026-07-22T12:00:00.000Z',
}

const fallback: DesignSystemManifest = {
  schemaVersion: 1,
  id: 'fixture',
  version: 'fixture-1',
  source: 'fixture',
  sourceLabel: 'Synthetic fixture',
  capturedAt: '2026-07-22T00:00:00.000Z',
  fingerprint: 'fixture-fingerprint',
  components: [{ key: 'fixture/button', name: 'Button', semanticRole: 'primary-button', variants: {}, deprecated: false }],
  tokens: { color: [], typography: [], spacing: [], radius: [] },
  forbiddenRawStyles: true,
}

function capture(components: FigmaDesignSystemCapture['relevantComponents']): FigmaDesignSystemCapture {
  return {
    sourceRoot: { id: '0:1', name: 'Page 1', type: 'PAGE' },
    relevantComponents: components,
    relevantComponentSets: [],
    styles: {
      paints: [{ name: 'Brand/Primary', paints: [{ type: 'SOLID', color: { r: 0, g: 0.4, b: 1, a: 1 } }] }],
      text: [{ name: 'Body', fontSize: 14, fontFamily: 'Inter', fontStyle: 'Medium' }],
    },
    variables: { collections: [] },
    textNodes: [{ id: '2:1', name: 'Label', characters: 'Continue' }],
    semanticHints: components.map((component) => ({ componentId: component.id, name: component.name, roles: ['primary-button'] })),
    warnings: [],
    executionReports: [{}],
    scannedNodes: [],
  }
}

describe('normalizeFigmaDesignSystemContext', () => {
  it('normalizes live components and style tokens into a deterministic manifest', () => {
    const input = capture([{ id: '1:2', name: 'Button / Primary', key: 'button-key', variantProperties: { State: 'Default' } }])
    const first = normalizeFigmaDesignSystemContext(input, target, fallback, '2026-07-22T13:00:00.000Z')
    const second = normalizeFigmaDesignSystemContext(input, target, fallback, '2026-07-22T14:00:00.000Z')

    expect(first.mode).toBe('live')
    expect(first.manifest.components[0]).toMatchObject({ key: 'button-key', semanticRole: 'primary-button', variants: { State: ['Default'] } })
    expect(first.manifest.tokens.color).toEqual([{ name: 'Brand/Primary', value: '#0066FF' }])
    expect(first.manifest.tokens.typography).toEqual([{ name: 'Body', value: '14 Inter Medium' }])
    expect(first.manifest.fingerprint).toBe(second.manifest.fingerprint)
  })

  it('uses a clearly labeled fixture fallback when the live source has no component map', () => {
    const context = normalizeFigmaDesignSystemContext(capture([]), target, fallback, '2026-07-22T13:00:00.000Z')

    expect(context.mode).toBe('fixture_fallback')
    expect(context.manifest).toEqual(fallback)
    expect(context.liveSummary).toMatchObject({ componentCount: 0, paintStyleCount: 1, textStyleCount: 1, textNodeCount: 1 })
    expect(context.fallbackReason).toContain('synthetic fixture guard')
  })

  it('removes fixture component keys before a free-mode live Figma write', () => {
    const manifest = createLivePrimitiveFallbackManifest(fallback)

    expect(manifest.components).toEqual([])
    expect(manifest.tokens).toEqual(fallback.tokens)
    expect(manifest.sourceLabel).toContain('live primitive fallback')
    expect(manifest.fingerprint).not.toBe(fallback.fingerprint)
  })

  it('records an explicit fallback when live capture exceeds its budget', () => {
    const context = createFixtureFallbackDesignSystemContext(
      target,
      fallback,
      'Live capture timed out; using a labeled synthetic fixture guard.',
      '2026-07-22T13:00:00.000Z',
    )

    expect(context.mode).toBe('fixture_fallback')
    expect(context.target).toEqual(target)
    expect(context.liveSummary.warnings).toContain('Live capture timed out; using a labeled synthetic fixture guard.')
    expect(context.fallbackReason).toContain('timed out')
  })
})
