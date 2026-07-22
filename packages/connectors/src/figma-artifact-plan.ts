import { createHash } from 'node:crypto'
import {
  artifactIssueSchema,
  figmaArtifactPlanSchema,
  figmaPreflightPlanSchema,
  type ArtifactIssue,
  type DesignScreenRecipe,
  type DesignSlot,
  type DesignSystemManifest,
  type FigmaArtifactPlan,
  type FigmaPreflightPlan,
  type FigmaTargetBinding,
  type ProductSpec,
} from '@pm-agent/domain'
import { stableStringify, type JsonValue } from '@pm-agent/shared'
import type { PreflightResult } from './contract'

export interface FigmaPlanMetadataInput {
  runId: string
  threadId: string
  actionId: string
  idempotencyKey: string
}

function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function slotForRole(role: string, index: number, purpose: string): DesignSlot {
  return {
    key: `${String(index + 1).padStart(2, '0')}-${slug(role)}`,
    label: role.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' '),
    required: true,
    requiredRoles: [role],
    preferredRoles: [],
    variantProperties: {},
    content: index === 0 ? { purpose } : {},
    children: [],
  }
}

function recipesFor(spec: ProductSpec): DesignScreenRecipe[] {
  const activeRequirementIds = new Set(spec.requirements.filter((item) => item.status !== 'removed').map((item) => item.id))
  const screens = spec.screens.filter((screen) => screen.requirementIds.some((id) => activeRequirementIds.has(id)))
  return screens.map((screen, sequence) => {
    const next = screens[sequence + 1]
    return {
      schemaVersion: 1,
      screenId: screen.id,
      name: screen.title,
      purpose: screen.purpose,
      requirementIds: screen.requirementIds.filter((id) => activeRequirementIds.has(id)),
      layout: 'vertical',
      sequence,
      slots: screen.designSystemRoles.map((role, index) => slotForRole(role, index, screen.purpose)),
      prototypeEdges: next ? [{
        key: `edge:${screen.id}:${next.id}`,
        fromScreenId: screen.id,
        toScreenId: next.id,
        trigger: 'on_tap',
        action: 'navigate',
      }] : [],
    }
  })
}

export function createFigmaArtifactPlan(
  spec: ProductSpec,
  target: FigmaTargetBinding,
  manifest: DesignSystemManifest,
  metadata: FigmaPlanMetadataInput,
  mode: FigmaArtifactPlan['mode'] = 'strict',
): FigmaArtifactPlan {
  return figmaArtifactPlanSchema.parse({
    schemaVersion: 1,
    kind: 'figma_design_system_plan',
    mode,
    target,
    manifestFingerprint: manifest.fingerprint,
    requiredTokens: ['color/brand/primary', 'color/text/primary', 'color/surface/default', 'type/body/medium', 'space/4', 'radius/container'],
    metadata: {
      namespace: 'za.pm-lifecycle/v1',
      ...metadata,
      specId: spec.id,
      specVersion: spec.version,
    },
    screens: recipesFor(spec),
  })
}

export function hashFigmaPreflightPlan(plan: FigmaPreflightPlan): string {
  return createHash('sha256').update(stableStringify(plan as unknown as JsonValue)).digest('hex')
}

export function preflightFigmaArtifactPlan(
  input: FigmaArtifactPlan,
  manifest: DesignSystemManifest,
  allowedTarget: FigmaTargetBinding,
): PreflightResult<FigmaPreflightPlan> {
  const plan = figmaArtifactPlanSchema.parse(input)
  const issues: ArtifactIssue[] = []
  const targetMatches = plan.target.targetHash === allowedTarget.targetHash
    && plan.target.sessionId === allowedTarget.sessionId
    && plan.target.pageId === allowedTarget.pageId
  if (!targetMatches) {
    issues.push({ code: 'TARGET_NOT_ALLOWED', severity: 'error', message: 'Figma target does not match the active sandbox allowlist.' })
  }
  if (plan.manifestFingerprint !== manifest.fingerprint) {
    issues.push({ code: 'MANIFEST_CHANGED', severity: 'error', message: 'Design System manifest changed after the artifact plan was created.' })
  }

  const componentsByRole = new Map(manifest.components.map((component) => [component.semanticRole, component]))
  const resolvedSlots = plan.screens.flatMap((screen) => screen.slots.map((slot) => {
    const component = slot.requiredRoles.map((role) => componentsByRole.get(role)).find((item) => item && !item.deprecated)
    const deprecated = slot.requiredRoles.map((role) => componentsByRole.get(role)).find((item) => item?.deprecated)
    if (!component) {
      const severity = plan.mode === 'strict' && slot.required ? 'error' as const : 'warning' as const
      issues.push({
        code: deprecated ? 'DEPRECATED_COMPONENT' : 'MISSING_COMPONENT_ROLE',
        severity,
        message: deprecated
          ? `Only a deprecated component resolves slot ${slot.key}.`
          : `No component resolves required roles: ${slot.requiredRoles.join(', ')}.`,
        entityId: screen.screenId,
      })
    }
    return {
      screenId: screen.screenId,
      slotKey: slot.key,
      required: slot.required,
      componentKey: component?.key ?? null,
      semanticRole: component?.semanticRole ?? null,
      resolution: component ? 'component' as const : plan.mode === 'free' ? 'primitive_fallback' as const : 'missing' as const,
    }
  }))

  const allTokens = new Set(Object.values(manifest.tokens).flat().map((token) => token.name))
  const resolvedTokens = plan.requiredTokens.filter((name) => allTokens.has(name))
  for (const token of plan.requiredTokens) {
    if (!allTokens.has(token)) issues.push({ code: 'MISSING_TOKEN', severity: 'error', message: `Required token is missing: ${token}.` })
  }
  if (!manifest.forbiddenRawStyles) {
    issues.push({ code: 'RAW_STYLE_POLICY_DISABLED', severity: 'warning', message: 'Manifest does not explicitly forbid raw styles.' })
  }

  const preflightPlan = figmaPreflightPlanSchema.parse({
    schemaVersion: 1,
    source: plan,
    resolvedSlots,
    resolvedTokens,
    estimatedOperations: plan.screens.length + resolvedSlots.length + plan.screens.reduce((count, screen) => count + screen.prototypeEdges.length, 0),
  })
  const parsedIssues = issues.map((issue) => artifactIssueSchema.parse(issue))
  return {
    allowed: !parsedIssues.some((issue) => issue.severity === 'error'),
    plan: preflightPlan,
    planHash: hashFigmaPreflightPlan(preflightPlan),
    issues: parsedIssues,
  }
}
