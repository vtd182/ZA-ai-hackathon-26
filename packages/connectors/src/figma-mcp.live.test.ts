import { describe, expect, it } from 'vitest'
import { mealOrderingProductSpec } from '@pm-agent/fixture-meal-ordering'
import { syntheticZaloDesignSystem } from '@pm-agent/fixture-zalo-design-system'
import { createFigmaArtifactPlan } from './figma-artifact-plan'
import { createLivePrimitiveFallbackManifest, normalizeFigmaDesignSystemContext } from './figma-design-system'
import { FigmaMcpAdapter } from './figma-mcp'

const runLive = process.env.PM_AGENT_FIGMA_LIVE === '1' ? it : it.skip

describe('FigmaMcpAdapter live', () => {
  runLive('pins, writes and independently reads back a live Figma artifact', async () => {
    const binaryPath = process.env.PM_AGENT_FIGMA_BINARY
      ?? new URL('../../../mcp-tool/za-talk-to-figma/bin/za-talk-to-figma', import.meta.url).pathname
    const adapter = new FigmaMcpAdapter({ binaryPath })

    try {
      const health = await adapter.health()
      expect(health.pluginConnected).toBe(true)
      expect(health.sessions.length).toBeGreaterThan(0)
      const session = health.sessions.find((item) => item.sessionId === health.activeSession) ?? health.sessions[0]!
      const pages = await adapter.pages(session.sessionId)
      const target = await adapter.pinTarget(session.sessionId, pages.currentPageId, '2026-07-23T10:00:00.000Z')
      const capture = await adapter.captureDesignSystem(target)
      const context = normalizeFigmaDesignSystemContext(capture, target, syntheticZaloDesignSystem, new Date().toISOString())
      const manifest = context.mode === 'live' ? context.manifest : createLivePrimitiveFallbackManifest(context.manifest)
      const mode = context.mode === 'live' ? 'strict' as const : 'free' as const
      const plan = createFigmaArtifactPlan(mealOrderingProductSpec, target, manifest, {
        runId: 'RUN-LIVE-DEMO',
        threadId: 'THREAD-LIVE-DEMO',
        actionId: 'ACTION-LIVE-DEMO',
        idempotencyKey: 'figma:live-demo:v6',
      }, mode)
      const preflight = await adapter.preflightArtifactPlan(plan, manifest, target)

      expect(target.fileName).toBe(session.fileName)
      expect(target.targetHash).toMatch(/^[a-f0-9]{64}$/)
      expect(capture.sourceRoot.id).toBe(target.pageId)
      expect(capture.executionReports.length).toBeGreaterThan(0)
      expect(preflight.allowed).toBe(true)
      expect(preflight.planHash).toMatch(/^[a-f0-9]{64}$/)
      expect(preflight.plan.resolvedSlots.length).toBeGreaterThan(0)

      const applied = await adapter.applyArtifactPlan(preflight, preflight.planHash)
      const snapshot = await adapter.readArtifact(target, plan.metadata.idempotencyKey)
      const audit = await adapter.auditArtifact(preflight)

      expect(applied.rootNodeIds.length).toBeGreaterThan(0)
      expect(snapshot.rootNodeIds).toEqual(applied.rootNodeIds)
      expect(snapshot.screens).toHaveLength(plan.screens.length)
      expect(snapshot.screens.every((screen) => screen.metadata.runId === 'RUN-LIVE-DEMO')).toBe(true)
      expect(audit.verified).toBe(true)
      expect(audit.issues).toEqual([])
    } finally {
      await adapter.close()
    }
  }, 60_000)
})
