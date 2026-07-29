import { describe, expect, it } from 'vitest'
import { mealOrderingProductSpec } from '@pm-agent/fixture-meal-ordering'
import { syntheticZaloDesignSystem } from '@pm-agent/fixture-zalo-design-system'
import { createFigmaArtifactPlan, preflightFigmaArtifactPlan } from './figma-artifact-plan'
import type { FigmaJsonToolTransport } from './figma-mcp'
import {
  FIGMA_APPLY_MAX_TIMEOUT_MS,
  FIGMA_APPLY_MIN_TIMEOUT_MS,
  FigmaMcpAdapter,
  FigmaMcpError,
  figmaApplyTimeoutMs,
  interpretFigmaToolResult,
} from './figma-mcp'

class FakeTransport implements FigmaJsonToolTransport {
  calls: Array<{ name: string; args: Record<string, unknown>; timeoutMs: number }> = []

  constructor(private readonly responses: Record<string, unknown>) {}

  async connect(): Promise<void> {}

  async callJson(name: string, args: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    this.calls.push({ name, args, timeoutMs })
    return this.responses[name]
  }

  async close(): Promise<void> {}
}

const sessionId = 'figma:public-sandbox:session-1'
const health = {
  role: 'FOLLOWER',
  version: 'test',
  clientId: 'stdio:test',
  logLevel: 'WARN',
  pluginConnected: true,
  leaderReachable: true,
  activeSession: sessionId,
  sessionCount: 1,
  pendingCount: 0,
  sessions: [{ sessionId, fileName: '[PUBLIC] Sandbox', pageName: 'Page 1', selectionCount: 0 }],
}
const pages = { currentPageId: '0:1', pages: [{ id: '0:1', name: 'Page 1' }] }

describe('FigmaMcpAdapter', () => {
  it('scales apply timeout by estimated operations within explicit bounds', () => {
    expect(figmaApplyTimeoutMs(0)).toBe(FIGMA_APPLY_MIN_TIMEOUT_MS)
    expect(figmaApplyTimeoutMs(60)).toBe(10 * 60_000)
    expect(figmaApplyTimeoutMs(10_000)).toBe(FIGMA_APPLY_MAX_TIMEOUT_MS)
  })

  it('pins an immutable target only after live session and current page validation', async () => {
    const transport = new FakeTransport({ get_runtime_health: health, get_pages: pages })
    const adapter = new FigmaMcpAdapter({ binaryPath: '/unused' }, transport)

    const target = await adapter.pinTarget(sessionId, '0:1', '2026-07-22T12:00:00.000Z')

    expect(target).toMatchObject({
      schemaVersion: 1,
      sessionId,
      fileName: '[PUBLIC] Sandbox',
      pageId: '0:1',
      pageName: 'Page 1',
    })
    expect(target.targetHash).toMatch(/^[a-f0-9]{64}$/)
    expect(transport.calls.map((call) => call.name)).toEqual(['get_runtime_health', 'get_pages'])
  })

  it('rejects a stale page instead of silently switching the allowlist', async () => {
    const adapter = new FigmaMcpAdapter({ binaryPath: '/unused' }, new FakeTransport({
      get_runtime_health: { ...health, sessions: [{ ...health.sessions[0], pageName: 'Other page' }] },
      get_pages: pages,
    }))

    await expect(adapter.pinTarget(sessionId, '0:1')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      retryable: false,
    } satisfies Partial<FigmaMcpError>)
  })

  it('verifies the immutable target before every design-system capture', async () => {
    const capture = {
      sourceRoot: { id: '0:1', name: 'Page 1', type: 'PAGE' },
      relevantComponents: [],
      relevantComponentSets: [],
      relevantInstances: [],
      styles: {},
      variables: {},
      textNodes: [],
      semanticHints: [],
      warnings: [],
      executionReports: [],
      scannedNodes: [],
    }
    const transport = new FakeTransport({ get_runtime_health: health, get_pages: pages, capture_design_system_context: capture })
    const adapter = new FigmaMcpAdapter({ binaryPath: '/unused' }, transport)
    const target = await adapter.pinTarget(sessionId, '0:1', '2026-07-22T12:00:00.000Z')

    await expect(adapter.captureDesignSystem(target)).resolves.toEqual(capture)
    expect(transport.calls.map((call) => call.name)).toEqual([
      'get_runtime_health',
      'get_pages',
      'get_runtime_health',
      'get_pages',
      'capture_design_system_context',
    ])
    expect(transport.calls.at(-1)?.args).toEqual({ sessionId, sourcePageId: '0:1' })
  })

  it('keeps an allowlisted source valid while the user views an artifact page', async () => {
    const target = await new FigmaMcpAdapter(
      { binaryPath: '/unused' },
      new FakeTransport({ get_runtime_health: health, get_pages: pages }),
    ).pinTarget(sessionId, '0:1', '2026-07-22T12:00:00.000Z')
    const viewingArtifact = {
      currentPageId: '9:1',
      pages: [...pages.pages, { id: '9:1', name: 'PM · Output · v1' }],
    }
    const transport = new FakeTransport({
      get_runtime_health: {
        ...health,
        sessions: [{ ...health.sessions[0], pageName: 'PM · Output · v1' }],
      },
      get_pages: viewingArtifact,
      plan_design_system_screens: { schemaVersion: 1, allowed: true, planHash: 'a'.repeat(64), issues: [], plan: {} },
    })
    const adapter = new FigmaMcpAdapter({ binaryPath: '/unused' }, transport)

    await expect(adapter.verifyTarget(target)).resolves.toEqual(target)
  })

  it('validates the exact target before calling typed read-only MCP preflight', async () => {
    const bootstrap = new FakeTransport({ get_runtime_health: health, get_pages: pages })
    const bootstrapAdapter = new FigmaMcpAdapter({ binaryPath: '/unused' }, bootstrap)
    const target = await bootstrapAdapter.pinTarget(sessionId, '0:1', '2026-07-22T12:00:00.000Z')
    const plan = createFigmaArtifactPlan(mealOrderingProductSpec, target, syntheticZaloDesignSystem, {
      runId: 'RUN-TEST', threadId: 'THREAD-TEST', actionId: 'ACTION-FIGMA', idempotencyKey: 'figma:RUN-TEST:v1',
    })
    const preflight = preflightFigmaArtifactPlan(plan, syntheticZaloDesignSystem, target)
    const transport = new FakeTransport({
      get_runtime_health: health,
      get_pages: pages,
      plan_design_system_screens: preflight,
    })
    const adapter = new FigmaMcpAdapter({ binaryPath: '/unused' }, transport)

    await expect(adapter.preflightArtifactPlan(plan, syntheticZaloDesignSystem, target)).resolves.toEqual(preflight)
    expect(transport.calls.map((call) => call.name)).toEqual(['get_runtime_health', 'get_pages', 'plan_design_system_screens'])
    expect(transport.calls.at(-1)?.args).toMatchObject({ sessionId, artifactPlan: plan, allowedTarget: target })
  })

  it('pins the same page separately when no-ZDS free creative is selected', async () => {
    const transport = new FakeTransport({ get_runtime_health: health, get_pages: pages })
    const adapter = new FigmaMcpAdapter({ binaryPath: '/unused' }, transport)

    const zdsTarget = await adapter.pinTarget(sessionId, '0:1', '2026-07-22T12:00:00.000Z')
    const freeTarget = await adapter.pinTarget(sessionId, '0:1', '2026-07-22T12:00:00.000Z', 'free')

    expect(zdsTarget.creativeMode).toBeUndefined()
    expect(freeTarget.creativeMode).toBe('free')
    expect(freeTarget.targetHash).not.toBe(zdsTarget.targetHash)
  })

  it('applies, reads and audits only after revalidating the allowlisted target', async () => {
    const bootstrap = new FakeTransport({ get_runtime_health: health, get_pages: pages })
    const target = await new FigmaMcpAdapter({ binaryPath: '/unused' }, bootstrap)
      .pinTarget(sessionId, '0:1', '2026-07-22T12:00:00.000Z')
    const plan = createFigmaArtifactPlan(mealOrderingProductSpec, target, syntheticZaloDesignSystem, {
      runId: 'RUN-TEST', threadId: 'THREAD-TEST', actionId: 'ACTION-FIGMA', idempotencyKey: 'figma:RUN-TEST:v1',
    })
    const preflight = preflightFigmaArtifactPlan(plan, syntheticZaloDesignSystem, target)
    const snapshot = {
      schemaVersion: 1,
      targetHash: target.targetHash,
      planHash: preflight.planHash,
      idempotencyKey: plan.metadata.idempotencyKey,
      rootNodeIds: ['10:1'],
      artifactPageId: '9:1',
      artifactPageName: 'PM · SPEC-MEAL-ORDERING · v1',
      designConceptName: plan.designDirection.conceptName,
      screens: plan.screens.map((screen, index) => ({
        nodeId: `11:${index + 1}`,
        screenId: screen.screenId,
        name: screen.name,
        archetype: screen.presentation.archetype,
        sectionKeys: screen.presentation.sections.map((section) => section.key),
        componentKey: null,
        semanticRole: null,
        metadata: { ...plan.metadata, screenId: screen.screenId, requirementIds: screen.requirementIds, planHash: preflight.planHash },
        childSlots: preflight.plan.resolvedSlots.filter((slot) => slot.screenId === screen.screenId).map((slot) => ({
          slotKey: slot.slotKey,
          componentKey: slot.componentKey,
          componentBinding: slot.componentBinding,
          semanticRole: slot.semanticRole,
          primitiveFallback: false,
          instanceBacked: true,
        })),
      })),
      prototypeEdges: plan.screens.flatMap((screen) => screen.prototypeEdges),
      readAt: '2026-07-22T12:30:00.000Z',
    }
    const transport = new FakeTransport({
      get_runtime_health: health,
      get_pages: pages,
      apply_design_system_plan: { ...snapshot, idempotent: false },
      read_lifecycle_artifact: snapshot,
      audit_lifecycle_artifact: { verified: true, issues: [], snapshot },
    })
    const adapter = new FigmaMcpAdapter({ binaryPath: '/unused' }, transport)

    await expect(adapter.applyArtifactPlan(preflight, preflight.planHash)).resolves.toMatchObject({ idempotent: false })
    await expect(adapter.readArtifact(target, plan.metadata.idempotencyKey)).resolves.toEqual(snapshot)
    await expect(adapter.auditArtifact(preflight)).resolves.toMatchObject({ verified: true, issues: [] })
    expect(transport.calls.filter((call) => call.name === 'get_runtime_health')).toHaveLength(1)
    expect(transport.calls.map((call) => call.name)).toContain('apply_design_system_plan')
    expect(transport.calls.map((call) => call.name)).toContain('read_lifecycle_artifact')
    expect(transport.calls.map((call) => call.name)).toContain('audit_lifecycle_artifact')
    expect(transport.calls.find((call) => call.name === 'apply_design_system_plan')?.timeoutMs)
      .toBe(figmaApplyTimeoutMs(preflight.plan.estimatedOperations))
  })

  it('runs an independent product-craft audit against the approved session', async () => {
    const bootstrap = new FakeTransport({ get_runtime_health: health, get_pages: pages })
    const target = await new FigmaMcpAdapter({ binaryPath: '/unused' }, bootstrap)
      .pinTarget(sessionId, '0:1', '2026-07-22T12:00:00.000Z')
    const audit = {
      schemaVersion: 1,
      rootNodeId: '10:1',
      passed: true,
      metrics: {
        screenCount: 4,
        textCount: 24,
        visibleTextCount: 20,
        zdsInstanceCount: 12,
        prototypeLinkCount: 3,
        staleCopyCount: 0,
        forbiddenCopyCount: 0,
        clippedTextCount: 0,
        lowVisibilityTextCount: 0,
        componentDriftCount: 0,
        componentOverlapCount: 0,
        undersizedTouchTargetCount: 0,
        visitedNodes: 160,
      },
      issues: [],
    }
    const transport = new FakeTransport({
      get_runtime_health: health,
      get_pages: pages,
      audit_product_craft: audit,
    })
    const adapter = new FigmaMcpAdapter({ binaryPath: '/unused' }, transport)

    await expect(adapter.auditProductCraft({
      target,
      rootNodeId: '10:1',
      expectedScreenCount: 4,
      expectedPrototypeLinks: 3,
      forbiddenTerms: ['payment'],
    })).resolves.toEqual(audit)
    expect(transport.calls.at(-1)).toMatchObject({
      name: 'audit_product_craft',
      args: { sessionId, rootNodeId: '10:1', forbiddenTerms: ['payment'] },
    })
  })

  it('captures ZDS icon component sets cross-page into a reference-only catalog', async () => {
    const withIconPage = {
      currentPageId: '0:1',
      pages: [{ id: '0:1', name: 'Page 1' }, { id: '2591:110173', name: '      ↳ Icon' }],
    }
    const scan = {
      matchingNodes: [
        { id: '2591:1', name: 'zi_zds_ic_search', type: 'COMPONENT_SET' },
        { id: '2591:2', name: 'zi_zds_ic_chevron_right', type: 'COMPONENT_SET' },
        { id: '2591:3', name: 'zi_zds_ic_search=on', type: 'COMPONENT' }, // variant child → ignored
        { id: '2591:4', name: 'Layout Frame', type: 'FRAME' }, // wrong type → ignored
      ],
    }
    const transport = new FakeTransport({ get_runtime_health: health, get_pages: withIconPage, scan_nodes_by_types: scan })
    const adapter = new FigmaMcpAdapter({ binaryPath: '/unused' }, transport)
    const target = await adapter.pinTarget(sessionId, '0:1', '2026-07-22T12:00:00.000Z')

    const catalog = await adapter.captureIconCatalog(target)

    expect(catalog).toMatchObject({ pageId: '2591:110173', pageName: '      ↳ Icon', count: 2 })
    expect(catalog?.icons).toEqual([
      { name: 'zi_zds_ic_chevron_right', setId: '2591:2' },
      { name: 'zi_zds_ic_search', setId: '2591:1' },
    ])
    expect(catalog?.namePrefixes).toContain('zi_zds_ic_')
    // Cross-page: the scan roots at the icon Page id and never navigates.
    const scanCall = transport.calls.find((call) => call.name === 'scan_nodes_by_types')
    expect(scanCall?.args).toMatchObject({ sessionId, nodeId: '2591:110173' })
    expect(transport.calls.some((call) => call.name === 'navigate_to_page')).toBe(false)
  })

  it('returns null (never blocks the flow) when the file has no icon Page', async () => {
    const transport = new FakeTransport({ get_runtime_health: health, get_pages: pages })
    const adapter = new FigmaMcpAdapter({ binaryPath: '/unused' }, transport)
    const target = await adapter.pinTarget(sessionId, '0:1', '2026-07-22T12:00:00.000Z')

    await expect(adapter.captureIconCatalog(target)).resolves.toBeNull()
  })

  it('sends the runtime a free-mode plan when the host plan is reference', async () => {
    // The runtime's strict preflight only accepts strict|free; a reference plan reaching it as
    // "reference" is rejected with a plain-text error. The host concept must cross as "free".
    const bootstrap = new FakeTransport({ get_runtime_health: health, get_pages: pages })
    const target = await new FigmaMcpAdapter({ binaryPath: '/unused' }, bootstrap)
      .pinTarget(sessionId, '0:1', '2026-07-22T12:00:00.000Z')
    const referencePlan = createFigmaArtifactPlan(mealOrderingProductSpec, target, syntheticZaloDesignSystem, {
      runId: 'RUN-REF', threadId: 'THREAD-REF', actionId: 'ACTION-FIGMA', idempotencyKey: 'figma:RUN-REF:v1',
    }, 'reference')
    expect(referencePlan.mode).toBe('reference')
    const runtimePreflight = preflightFigmaArtifactPlan({ ...referencePlan, mode: 'free' }, syntheticZaloDesignSystem, target)
    const transport = new FakeTransport({ get_runtime_health: health, get_pages: pages, plan_design_system_screens: runtimePreflight })
    const adapter = new FigmaMcpAdapter({ binaryPath: '/unused' }, transport)

    await adapter.preflightArtifactPlan(referencePlan, syntheticZaloDesignSystem, target)

    const sent = transport.calls.at(-1)?.args as { artifactPlan: { mode: string } }
    expect(sent.artifactPlan.mode).toBe('free')
  })
})

describe('interpretFigmaToolResult', () => {
  it('surfaces a plain-text tool error instead of masking it as invalid JSON', () => {
    expect(() => interpretFigmaToolResult('plan_design_system_screens', {
      isError: true,
      content: [{ type: 'text', text: 'mode must be strict or free' }],
    })).toThrow(/mode must be strict or free/)
  })

  it('unwraps a JSON error envelope with its code and retryable flag', () => {
    expect(() => interpretFigmaToolResult('capture_design_system_context', {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'TIMEOUT', message: 'slow capture', retryable: true } }) }],
    })).toThrow(expect.objectContaining({ code: 'TIMEOUT', retryable: true, message: 'slow capture' }) as unknown as Error)
  })

  it('parses a normal JSON success payload', () => {
    expect(interpretFigmaToolResult('get_pages', { content: [{ type: 'text', text: '{"ok":1}' }] })).toEqual({ ok: 1 })
  })
})
