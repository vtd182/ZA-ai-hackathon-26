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

function normalizeLiveManifest(
  capture: FigmaDesignSystemCapture,
  target: FigmaTargetBinding,
  capturedAt: string,
): DesignSystemManifest {
  const hints = new Map(capture.semanticHints.map((hint) => [hint.componentId, hint.roles]))
  const components = capture.relevantComponents.map((component) => ({
    key: component.key || component.id,
    name: component.name,
    semanticRole: hints.get(component.id)?.[0] ?? 'unmapped',
    variants: normalizeVariants(component.variantProperties),
    deprecated: false,
  })).sort((left, right) => left.key.localeCompare(right.key))
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
      componentCount: capture.relevantComponents.length,
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
