import { createHash } from 'node:crypto'
import {
  designSystemManifestSchema,
  figmaDesignSystemContextSchema,
  type DesignSystemManifest,
  type FigmaDesignSystemCapture,
  type FigmaDesignSystemContext,
  type FigmaTargetBinding,
} from '@pm-agent/domain'
import { stableStringify, type JsonValue } from '@pm-agent/shared'

type TokenCategory = keyof DesignSystemManifest['tokens']

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function countArrayProperty(value: unknown, key: string): number {
  const source = record(value)
  return source ? array(source[key]).length : 0
}

function channel(value: unknown): number {
  return Math.max(0, Math.min(255, Math.round((typeof value === 'number' ? value : 0) * 255)))
}

function colorValue(value: unknown): string | null {
  const color = record(value)
  if (!color || typeof color.r !== 'number' || typeof color.g !== 'number' || typeof color.b !== 'number') return null
  const hex = [color.r, color.g, color.b].map((item) => channel(item).toString(16).padStart(2, '0')).join('').toUpperCase()
  const alpha = typeof color.a === 'number' ? channel(color.a).toString(16).padStart(2, '0').toUpperCase() : ''
  return `#${hex}${alpha === 'FF' ? '' : alpha}`
}

function normalizePaintTokens(styles: unknown): DesignSystemManifest['tokens']['color'] {
  const source = record(styles)
  return array(source?.paints).flatMap((item) => {
    const style = record(item)
    const paint = record(array(style?.paints)[0])
    const value = paint?.type === 'SOLID' ? colorValue(paint.color) : null
    return typeof style?.name === 'string' && value ? [{ name: style.name, value }] : []
  })
}

function normalizeTextTokens(styles: unknown): DesignSystemManifest['tokens']['typography'] {
  const source = record(styles)
  return array(source?.text).flatMap((item) => {
    const style = record(item)
    if (!style || typeof style.name !== 'string') return []
    const parts = [style.fontSize, style.fontFamily, style.fontStyle].filter((part) => typeof part === 'string' || typeof part === 'number')
    return parts.length > 0 ? [{ name: style.name, value: parts.join(' ') }] : []
  })
}

function variableTokenCategory(name: string, resolvedType: unknown): TokenCategory | null {
  const normalized = name.toLowerCase()
  if (resolvedType === 'COLOR') return 'color'
  if (normalized.includes('radius') || normalized.includes('corner')) return 'radius'
  if (normalized.includes('space') || normalized.includes('spacing') || normalized.includes('gap')) return 'spacing'
  if (normalized.includes('font') || normalized.includes('type')) return 'typography'
  return null
}

function normalizeVariableTokens(variables: unknown): DesignSystemManifest['tokens'] {
  const output: DesignSystemManifest['tokens'] = { color: [], typography: [], spacing: [], radius: [] }
  const source = record(variables)
  for (const collectionValue of array(source?.collections)) {
    const collection = record(collectionValue)
    for (const variableValue of array(collection?.variables)) {
      const variable = record(variableValue)
      if (!variable || typeof variable.name !== 'string') continue
      const category = variableTokenCategory(variable.name, variable.resolvedType)
      if (!category) continue
      const values = record(variable.valuesByMode)
      const firstValue = values ? Object.values(values)[0] : variable.value
      const normalized = category === 'color' ? colorValue(firstValue) : String(firstValue ?? '')
      if (normalized) output[category].push({ name: variable.name, value: normalized })
    }
  }
  return output
}

function uniqueTokens(tokens: DesignSystemManifest['tokens'][TokenCategory]): DesignSystemManifest['tokens'][TokenCategory] {
  return [...new Map(tokens.map((token) => [token.name, token])).values()].sort((left, right) => left.name.localeCompare(right.name))
}

function normalizeTokens(capture: FigmaDesignSystemCapture): DesignSystemManifest['tokens'] {
  const variables = normalizeVariableTokens(capture.variables)
  return {
    color: uniqueTokens([...normalizePaintTokens(capture.styles), ...variables.color]),
    typography: uniqueTokens([...normalizeTextTokens(capture.styles), ...variables.typography]),
    spacing: uniqueTokens(variables.spacing),
    radius: uniqueTokens(variables.radius),
  }
}

function normalizeVariants(value: Record<string, unknown> | undefined): Record<string, string[]> {
  if (!value) return {}
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [
    key,
    Array.isArray(item) ? item.map(String).sort() : [String(item)],
  ]))
}

function normalizedName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function rolesForCatalogInstance(instance: FigmaDesignSystemCapture['relevantInstances'][number]): string[] {
  const name = normalizedName(instance.name)
  const variant = normalizedName([
    instance.mainComponentName ?? '',
    ...Object.entries(instance.componentProperties).map(([key, value]) => `${key}=${value}`),
  ].join(' '))

  if (name === 'mp-header' || name.includes('app header')) return ['app-header']
  if (name.includes('[zds] button')) {
    if (variant.includes('level=secondary')) return ['secondary-button']
    if (variant.includes('level=tertiary')) return ['tertiary-button']
    return ['primary-button']
  }
  if (name.includes('[zds] input / otp')) return ['otp-input', 'pickup-code']
  if (name.includes('[zds] input / password')) return ['password-input']
  if (name.includes('[zds] input / search')) return ['search-input']
  if (name.includes('[zds] input / dropdown')) return ['select-input']
  if (name.includes('[zds] input / date')) return ['date-input']
  if (name.includes('[zds] input / phone')) return ['phone-input']
  if (name.includes('[zds] input / textarea')) return ['textarea-input']
  if (name.includes('[zds] input / text')) return ['text-input']
  if (name.includes('[zds] list / item')) return ['list-item', 'menu-card', 'order-summary', 'payment-method']
  if (name.includes('snackbar')) return ['status-message', 'error-message']
  if (name.includes('[zds] modal')) return ['modal']
  if (name.includes('[zds] checkbox')) return ['checkbox']
  if (name.includes('[zds] radio')) return ['radio-button']
  if (name.includes('[zds] switch')) return ['switch']
  if (name.includes('[zds] slider')) return ['slider']
  if (name === 'calendar' || name.includes('[zds] calendar')) return ['calendar']
  return []
}

function catalogCandidateScore(
  instance: FigmaDesignSystemCapture['relevantInstances'][number],
  semanticRole: string,
): number {
  const detail = normalizedName([
    instance.mainComponentName ?? '',
    ...Object.entries(instance.componentProperties).map(([key, value]) => `${key}=${value}`),
    ...instance.contextLabels,
    ...instance.ancestorNames,
  ].join(' '))
  let score = 0
  if (detail.includes('dark mode=off') || detail.includes('darkmode=off')) score += 40
  if (detail.includes('dark mode=on') || detail.includes('darkmode=on')) score -= 40
  if (detail.includes('state=default')) score += 20
  if (detail.includes('size=large')) score += 10
  if (detail.includes('icon=none')) score += 8
  if (detail.includes('type=danger')) score -= 30
  if (semanticRole === 'primary-button' && detail.includes('level=primary')) score += 50
  if (semanticRole === 'secondary-button' && detail.includes('level=secondary')) score += 50
  if (semanticRole === 'tertiary-button' && detail.includes('level=tertiary')) score += 50
  return score
}

function normalizeCatalogComponents(
  capture: FigmaDesignSystemCapture,
): DesignSystemManifest['components'] {
  const byRole = new Map<string, {
    score: number
    component: DesignSystemManifest['components'][number]
  }>()
  for (const instance of capture.relevantInstances) {
    for (const semanticRole of rolesForCatalogInstance(instance)) {
      const score = catalogCandidateScore(instance, semanticRole)
      const current = byRole.get(semanticRole)
      if (current && current.score >= score) continue
      byRole.set(semanticRole, { score, component: {
        key: `same-file:${instance.pageId}:${instance.id}:${semanticRole}`,
        name: instance.name,
        semanticRole,
        variants: {},
        deprecated: false,
        binding: {
          kind: 'same_file_instance',
          nodeId: instance.id,
          pageId: instance.pageId,
        },
      } })
    }
  }
  return [...byRole.values()].map(({ component }) => component)
}

function normalizeLiveManifest(
  capture: FigmaDesignSystemCapture,
  target: FigmaTargetBinding,
  capturedAt: string,
): DesignSystemManifest {
  const hints = new Map(capture.semanticHints.map((hint) => [hint.componentId, hint.roles]))
  const localComponents: DesignSystemManifest['components'] = capture.relevantComponents.map((component) => ({
    key: component.key || component.id,
    name: component.name,
    semanticRole: hints.get(component.id)?.[0] ?? 'unmapped',
    variants: normalizeVariants(component.variantProperties),
    deprecated: false,
    binding: {
      kind: 'component_key' as const,
      key: component.key || component.id,
    },
  }))
  const components = [...localComponents, ...normalizeCatalogComponents(capture)]
    .sort((left, right) => left.key.localeCompare(right.key))
  const tokens = normalizeTokens(capture)
  const sourceLabel = `${target.fileName} / ${target.pageName}`
  const fingerprintPayload = { sourceLabel, components, tokens, forbiddenRawStyles: true }
  const fingerprint = createHash('sha256').update(stableStringify(fingerprintPayload as JsonValue)).digest('hex')

  return designSystemManifestSchema.parse({
    schemaVersion: 1,
    id: `figma-${createHash('sha256').update(`${target.fileName}:${target.pageId}`).digest('hex').slice(0, 16)}`,
    version: `live-${fingerprint.slice(0, 12)}`,
    source: 'allowed_sandbox',
    sourceLabel,
    capturedAt,
    fingerprint,
    components,
    tokens,
    forbiddenRawStyles: true,
  })
}

export function normalizeFigmaDesignSystemContext(
  capture: FigmaDesignSystemCapture,
  target: FigmaTargetBinding,
  fixtureFallback: DesignSystemManifest,
  capturedAt = new Date().toISOString(),
): FigmaDesignSystemContext {
  const liveManifest = normalizeLiveManifest(capture, target, capturedAt)
  const useFallback = liveManifest.components.length === 0
  const fallbackReason = useFallback
    ? 'Live source không có component mapping trong subtree đã allowlist; đang dùng synthetic fixture guard.'
    : null

  return figmaDesignSystemContextSchema.parse({
    schemaVersion: 1,
    target,
    mode: useFallback ? 'fixture_fallback' : 'live',
    manifest: useFallback ? fixtureFallback : liveManifest,
    liveSummary: {
      sourceRootId: capture.sourceRoot.id,
      sourceRootName: capture.sourceRoot.name,
      componentCount: liveManifest.components.length,
      componentSetCount: capture.relevantComponentSets.length,
      paintStyleCount: countArrayProperty(capture.styles, 'paints'),
      textStyleCount: countArrayProperty(capture.styles, 'text'),
      variableCollectionCount: countArrayProperty(capture.variables, 'collections'),
      textNodeCount: capture.textNodes.length,
      warnings: capture.warnings,
    },
    fallbackReason,
    capturedAt,
  })
}

export function createFixtureFallbackDesignSystemContext(
  target: FigmaTargetBinding,
  fixture: DesignSystemManifest,
  reason: string,
  capturedAt = new Date().toISOString(),
): FigmaDesignSystemContext {
  return figmaDesignSystemContextSchema.parse({
    schemaVersion: 1,
    target,
    mode: 'fixture_fallback',
    manifest: fixture,
    liveSummary: {
      sourceRootId: target.pageId,
      sourceRootName: target.pageName,
      componentCount: 0,
      componentSetCount: 0,
      paintStyleCount: 0,
      textStyleCount: 0,
      variableCollectionCount: 0,
      textNodeCount: 0,
      warnings: [reason],
    },
    fallbackReason: reason,
    capturedAt,
  })
}

export function createLivePrimitiveFallbackManifest(fixture: DesignSystemManifest): DesignSystemManifest {
  const components: DesignSystemManifest['components'] = []
  const fingerprintPayload = {
    sourceLabel: `${fixture.sourceLabel} · live primitive fallback`,
    components,
    tokens: fixture.tokens,
    forbiddenRawStyles: fixture.forbiddenRawStyles,
  }
  const fingerprint = createHash('sha256').update(stableStringify(fingerprintPayload as JsonValue)).digest('hex')
  return designSystemManifestSchema.parse({
    ...fixture,
    id: `${fixture.id}-live-primitives`,
    version: `${fixture.version}-live-primitives`,
    sourceLabel: `${fixture.sourceLabel} · live primitive fallback`,
    fingerprint,
    components,
  })
}
