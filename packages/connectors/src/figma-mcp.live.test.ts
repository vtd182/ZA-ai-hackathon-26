import { describe, expect, it } from 'vitest'
import { mealOrderingProductSpec } from '@pm-agent/fixture-meal-ordering'
import { syntheticZaloDesignSystem } from '@pm-agent/fixture-zalo-design-system'
import { createFigmaArtifactPlan } from './figma-artifact-plan'
import { normalizeFigmaDesignSystemContext } from './figma-design-system'
import { FigmaMcpAdapter } from './figma-mcp'

const runLive = process.env.PM_AGENT_FIGMA_LIVE === '1' ? it : it.skip

describe('FigmaMcpAdapter live', () => {
  runLive('pins the active page and performs a bounded design-system capture', async () => {
    const binaryPath = process.env.PM_AGENT_FIGMA_BINARY
      ?? new URL('../../../mcp-tool/za-talk-to-figma/bin/za-talk-to-figma', import.meta.url).pathname
    const adapter = new FigmaMcpAdapter({ binaryPath })

    try {
      const health = await adapter.health()
      expect(health.pluginConnected).toBe(true)
      expect(health.sessions.length).toBeGreaterThan(0)
      const session = health.sessions.find((item) => item.sessionId === health.activeSession) ?? health.sessions[0]!
      const pages = await adapter.pages(session.sessionId)
      const target = await adapter.pinTarget(session.sessionId, pages.currentPageId)
      const capture = await adapter.captureDesignSystem(target)
      const context = normalizeFigmaDesignSystemContext(capture, target, syntheticZaloDesignSystem, new Date().toISOString())
      const plan = createFigmaArtifactPlan(mealOrderingProductSpec, target, context.manifest, {
        runId: 'RUN-LIVE-PREFLIGHT',
        threadId: 'THREAD-LIVE-PREFLIGHT',
        actionId: 'ACTION-LIVE-PREFLIGHT',
        idempotencyKey: 'figma:live-preflight:v1',
      })
      const preflight = await adapter.preflightArtifactPlan(plan, context.manifest, target)

      expect(target.fileName).toBe(session.fileName)
      expect(target.targetHash).toMatch(/^[a-f0-9]{64}$/)
      expect(capture.sourceRoot.id).toBe(target.pageId)
      expect(capture.executionReports.length).toBeGreaterThan(0)
      expect(preflight.allowed).toBe(true)
      expect(preflight.planHash).toMatch(/^[a-f0-9]{64}$/)
      expect(preflight.plan.resolvedSlots.length).toBeGreaterThan(0)
    } finally {
      await adapter.close()
    }
  }, 60_000)
})
