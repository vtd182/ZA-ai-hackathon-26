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
    relevantInstances: [],
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

  it('does not treat local components without semantic hints as a usable live source', () => {
    const input = capture([{ id: '1:2', name: 'Generated card', key: 'generated-card' }])
    input.semanticHints = []

    const context = normalizeFigmaDesignSystemContext(input, target, fallback, '2026-07-22T13:00:00.000Z')

    expect(context.mode).toBe('fixture_fallback')
    expect(context.liveSummary.componentCount).toBe(0)
  })

  it('normalizes copied same-file ZDS instances into strict semantic bindings', () => {
    const input = capture([])
    input.relevantInstances = [
      {
        id: '411:20533',
        name: '[ZDS] Button / Solid',
        type: 'INSTANCE',
        pageId: '0:1',
        mainComponentName: 'Size=Large, Level=Primary, State=Default, Dark Mode=Off',
        componentProperties: { Level: 'Primary', State: 'Default', 'Dark Mode': 'Off' },
        contextLabels: ['Primary'],
        ancestorNames: ['LM / Button'],
      },
      {
        id: '411:20450',
        name: '[ZDS] Input / Text',
        type: 'INSTANCE',
        pageId: '0:1',
        componentProperties: {},
        contextLabels: ['TextField'],
        ancestorNames: ['LM / Forms_Input'],
      },
      {
        id: '411:20598',
        name: 'MP-Header',
        type: 'INSTANCE',
        pageId: '0:1',
        componentProperties: {},
        contextLabels: [],
        ancestorNames: ['LM / Button'],
      },
    ]

    const context = normalizeFigmaDesignSystemContext(input, target, fallback, '2026-07-22T13:00:00.000Z')

    expect(context.mode).toBe('live')
    expect(context.manifest.components.find((component) => component.semanticRole === 'primary-button')).toMatchObject({
      binding: { kind: 'same_file_instance', nodeId: '411:20533', pageId: '0:1' },
    })
    expect(context.manifest.components.map((component) => component.semanticRole)).toEqual(expect.arrayContaining([
      'app-header',
      'primary-button',
      'text-input',
    ]))
  })

  it('captures the extended ZDS surfaces (sheet, card, tabs, chip, nav) as usable roles', () => {
    const input = capture([])
    const instance = (id: string, name: string): FigmaDesignSystemCapture['relevantInstances'][number] => ({
      id, name, type: 'INSTANCE', pageId: '0:1', componentProperties: {}, contextLabels: [], ancestorNames: [],
    })
    input.relevantInstances = [
      instance('1:1', '[ZDS] Bottom Sheet'),
      instance('1:2', '[ZDS] Card / Product'),
      instance('1:3', '[ZDS] Tabs'),
      instance('1:4', '[ZDS] Chip / Filter'),
      instance('1:5', 'Bottom Navigation'),
      instance('1:6', '[ZDS] Avatar'),
    ]

    const context = normalizeFigmaDesignSystemContext(input, target, fallback, '2026-07-22T13:00:00.000Z')
    const roles = context.manifest.components.map((component) => component.semanticRole)
    expect(roles).toEqual(expect.arrayContaining(['bottom-sheet', 'card', 'tabs', 'chip', 'bottom-navigation', 'avatar']))
  })

  it('prefers light default variants and classifies button levels from component properties', () => {
    const input = capture([])
    input.relevantInstances = [
      {
        id: '411:dark-secondary',
        name: '[ZDS] Button / Solid',
        type: 'INSTANCE',
        pageId: '0:1',
        mainComponentName: 'Size=Large, Level=Secondary, State=Default, Dark Mode=On',
        componentProperties: { Level: 'Secondary', State: 'Default', 'Dark Mode': 'On' },
        contextLabels: ['Primary'],
        ancestorNames: ['DM / Button'],
      },
      {
        id: '411:light-primary',
        name: '[ZDS] Button / Solid',
        type: 'INSTANCE',
        pageId: '0:1',
        mainComponentName: 'Size=Large, Level=Primary, State=Default, Dark Mode=Off',
        componentProperties: { Level: 'Primary', State: 'Default', 'Dark Mode': 'Off' },
        contextLabels: [],
        ancestorNames: ['LM / Button'],
      },
    ]

    const context = normalizeFigmaDesignSystemContext(input, target, fallback, '2026-07-22T13:00:00.000Z')

    expect(context.manifest.components.find((component) => component.semanticRole === 'primary-button')?.binding)
      .toEqual({ kind: 'same_file_instance', nodeId: '411:light-primary', pageId: '0:1' })
    expect(context.manifest.components.find((component) => component.semanticRole === 'secondary-button')?.binding)
      .toEqual({ kind: 'same_file_instance', nodeId: '411:dark-secondary', pageId: '0:1' })
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
