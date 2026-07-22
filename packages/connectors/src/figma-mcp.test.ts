import { describe, expect, it } from 'vitest'
import { mealOrderingProductSpec } from '@pm-agent/fixture-meal-ordering'
import { syntheticZaloDesignSystem } from '@pm-agent/fixture-zalo-design-system'
import { createFigmaArtifactPlan, preflightFigmaArtifactPlan } from './figma-artifact-plan'
import type { FigmaJsonToolTransport } from './figma-mcp'
import { FigmaMcpAdapter, FigmaMcpError } from './figma-mcp'

class FakeTransport implements FigmaJsonToolTransport {
  calls: Array<{ name: string; args: Record<string, unknown> }> = []

  constructor(private readonly responses: Record<string, unknown>) {}

  async connect(): Promise<void> {}

  async callJson(name: string, args: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ name, args })
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
})
