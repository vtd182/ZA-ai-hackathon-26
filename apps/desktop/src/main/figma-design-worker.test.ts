import { describe, expect, it } from 'vitest'
import type { FigmaDesignWorkerTask } from './figma-design-worker'
import type { SkillPackBundle } from './skill-packs'
import {
  approveFigmaWorkerElicitation,
  buildFigmaDesignWorkerPrompt,
  parseFigmaDesignWorkerReport,
} from './figma-design-worker'

const taskScope = {
  artifactPageName: 'PM · Login · v1',
  rootNodeId: '490:1',
}

const skillPack: SkillPackBundle = {
  schemaVersion: 1,
  id: 'pm-lifecycle-figma-craft',
  displayName: 'PM Lifecycle Figma Craft',
  version: '2026.07.26',
  rootPath: '/repo/skills',
  hash: 'f'.repeat(64),
  reportSchema: { type: 'object' },
  files: [{
    path: 'pm-lifecycle-figma-design/SKILL.md',
    content: '# PM Lifecycle Figma design\n\nUse this skill for an approved Figma design task.',
  }, {
    path: 'pm-lifecycle-figma-critic/SKILL.md',
    content: '# PM Lifecycle Figma critic\n\nCritique the rendered artifact.',
  }],
}

describe('Figma design worker', () => {
  it('only approves writes while the approved output Page is active', () => {
    const scope = {
      sessionId: 'figma:session',
      sourcePageName: 'Page 1',
      artifactPageName: taskScope.artifactPageName,
      currentPageName: 'Page 1',
    }
    const elicitation = (toolName: string, toolParams: Record<string, unknown> = {}) => ({
      serverName: 'za-talk-to-figma',
      message: `Allow the za-talk-to-figma MCP server to run tool "${toolName}"?`,
      _meta: { tool_params: { sessionId: scope.sessionId, ...toolParams } },
    })

    expect(approveFigmaWorkerElicitation(elicitation('create_frame'), scope).approved).toBe(false)
    expect(approveFigmaWorkerElicitation(elicitation('get_nodes_info'), scope).approved).toBe(true)
    expect(approveFigmaWorkerElicitation(elicitation('audit_product_craft'), scope).approved).toBe(true)
    expect(approveFigmaWorkerElicitation(elicitation('set_fill_color'), scope)).toMatchObject({
      approved: false,
      reason: expect.stringContaining('read-only ZDS source'),
    })
    expect(approveFigmaWorkerElicitation(elicitation('navigate_to_page', { pageName: taskScope.artifactPageName }), scope).approved).toBe(true)
    expect(scope.currentPageName).toBe(taskScope.artifactPageName)
    expect(approveFigmaWorkerElicitation(elicitation('create_frame'), scope).approved).toBe(true)
    expect(approveFigmaWorkerElicitation(elicitation('navigate_to_page', { pageName: 'Unapproved' }), scope).approved).toBe(false)
    expect(approveFigmaWorkerElicitation(elicitation('add_page'), scope).approved).toBe(false)
    expect(approveFigmaWorkerElicitation(elicitation('apply_design_system_plan'), scope).approved).toBe(false)
  })

  it('rejects other MCP servers and mismatched Figma sessions', () => {
    const scope = {
      sessionId: 'figma:session',
      sourcePageName: 'Page 1',
      artifactPageName: taskScope.artifactPageName,
      currentPageName: taskScope.artifactPageName,
    }
    expect(approveFigmaWorkerElicitation({
      serverName: 'zdoc',
      message: 'Allow tool "get_page"?',
    }, scope).approved).toBe(false)
    expect(approveFigmaWorkerElicitation({
      serverName: 'za-talk-to-figma',
      message: 'Allow tool "create_frame"?',
      _meta: { tool_params: { sessionId: 'figma:other' } },
    }, scope).approved).toBe(false)
  })

  it('requires visual review evidence and preserves the approved scope', () => {
    expect(parseFigmaDesignWorkerReport({
      schemaVersion: 1,
      artifactPageName: taskScope.artifactPageName,
      rootNodeId: taskScope.rootNodeId,
      screenCount: 5,
      zdsInstanceCount: 10,
      prototypeLinkCount: 4,
      screenshotsReviewed: 3,
      refinementPasses: 1,
      removedRequirementMentions: 0,
      visualQaPassed: true,
      summary: 'Refined the login journey.',
    }, taskScope)).toMatchObject({
      screenCount: 5,
      screenshotsReviewed: 3,
      visualQaPassed: true,
    })

    expect(() => parseFigmaDesignWorkerReport({
      schemaVersion: 1,
      artifactPageName: 'Other Page',
      rootNodeId: taskScope.rootNodeId,
      screenCount: 5,
      zdsInstanceCount: 10,
      prototypeLinkCount: 4,
      screenshotsReviewed: 1,
      refinementPasses: 0,
      removedRequirementMentions: 0,
      visualQaPassed: true,
      summary: 'Done.',
    }, taskScope)).toThrow(/approved artifact Page/)
  })

  it('builds a prompt that names the exact writable and read-only Pages', () => {
    const prompt = buildFigmaDesignWorkerPrompt({
      modelId: 'gpt-5.5',
      workingDirectory: '/tmp/pm-agent',
      mcpBinaryPath: '/repo/mcp-tool/za-talk-to-figma/bin/za-talk-to-figma',
      skillPack,
      sessionId: 'figma:session',
      sourcePageId: '0:1',
      sourcePageName: 'Page 1',
      artifactPageName: taskScope.artifactPageName,
      rootNodeId: taskScope.rootNodeId,
      idempotencyKey: 'figma:run',
      timeoutMs: 1_200_000,
      plan: {
        schemaVersion: 1,
        source: {
          schemaVersion: 1,
          kind: 'figma_design_system_plan',
          mode: 'strict',
          target: {
            schemaVersion: 1,
            targetHash: 'a'.repeat(64),
            sessionId: 'figma:session',
            fileName: 'Sandbox',
            pageId: '0:1',
            pageName: 'Page 1',
            allowedAt: '2026-07-24T00:00:00.000Z',
          },
          manifestFingerprint: 'manifest',
          requiredTokens: [],
          metadata: {
            namespace: 'za.pm-lifecycle/v1',
            runId: 'run',
            threadId: 'thread',
            actionId: 'action',
            specId: 'spec',
            specVersion: 1,
            idempotencyKey: 'figma:run',
            artifactPageName: taskScope.artifactPageName,
          },
          designDirection: {
            conceptName: 'Trusted entry',
            productPromise: 'Login with confidence',
            tone: 'confident',
            density: 'comfortable',
            palette: 'zalo-blue',
            principles: [
              { title: 'Trust', detail: 'Explain every data exchange.' },
              { title: 'Control', detail: 'Let users decide.' },
            ],
          },
          screens: [{
            schemaVersion: 1,
            screenId: 'SCREEN-1',
            name: 'Login',
            purpose: 'Enter the Mini App',
            requirementIds: ['REQ-1'],
            layout: 'vertical',
            sequence: 0,
            presentation: {
              archetype: 'form',
              eyebrow: 'Welcome',
              headline: 'Login',
              supportingText: 'Use your Zalo account.',
              sections: [{ key: 'trust', kind: 'info', title: 'Private', body: '', tone: 'brand', items: [] }],
              navigationLabel: 'Continue',
            },
            slots: [{
              key: 'cta',
              label: 'CTA',
              required: true,
              requiredRoles: ['primary-button'],
              preferredRoles: [],
              variantProperties: {},
              content: { text: 'Continue' },
              children: [],
            }],
            prototypeEdges: [],
          }],
        },
        resolvedSlots: [{
          screenId: 'SCREEN-1',
          slotKey: 'cta',
          required: true,
          componentKey: 'zds-button',
          componentBinding: { kind: 'same_file_instance', nodeId: '411:1', pageId: '0:1' },
          semanticRole: 'primary-button',
          resolution: 'component',
        }],
        resolvedTokens: [],
        estimatedOperations: 12,
      },
      manifest: {
        schemaVersion: 1,
        id: 'zds',
        version: '1',
        source: 'allowed_sandbox',
        sourceLabel: 'Page 1',
        capturedAt: '2026-07-24T00:00:00.000Z',
        fingerprint: 'manifest',
        components: [{
          key: 'zds-button',
          name: 'Button',
          semanticRole: 'primary-button',
          variants: {},
          deprecated: false,
          binding: { kind: 'same_file_instance', nodeId: '411:1', pageId: '0:1' },
        }],
        tokens: { color: [], typography: [], spacing: [], radius: [] },
        forbiddenRawStyles: false,
      },
      productTruth: {
        idea: {
          id: 'IDEA-1',
          title: 'Trusted login',
          summary: 'Login with a Zalo identity.',
          targetUsers: ['Mini App users'],
        },
        activeRequirements: [{
          id: 'REQ-1',
          title: 'Account login',
          description: 'Use a Zalo identity to enter.',
          acceptanceCriteria: ['The user reaches the Mini App.'],
        }],
        removedRequirements: [{
          id: 'REQ-OLD',
          title: 'Password login',
          description: 'Enter a standalone password.',
        }],
        decisions: [{
          id: 'DEC-1',
          question: 'Which identity?',
          choice: 'Zalo account',
          rationale: 'Reduces friction.',
          status: 'accepted',
        }],
      },
    } satisfies FigmaDesignWorkerTask)

    expect(prompt).toContain('The only writable Page is "PM · Login · v1"')
    expect(prompt).toContain('read-only ZDS source is "Page 1"')
    expect(prompt).toContain('Use the embedded global skill pack')
    expect(prompt).toContain('Skill pack ID: pm-lifecycle-figma-craft')
    expect(prompt).toContain('pm-lifecycle-figma-design/SKILL.md')
    expect(prompt).not.toContain('Read and follow the design skill at /repo')
    expect(prompt).toContain('at least one refinement')
    expect(prompt).toContain('intentionally sparse')
    expect(prompt).toContain('Password login')
    expect(prompt).toContain('removed requirements are forbidden')
    expect(prompt).toContain('call audit_product_craft')
  })

  it('rejects a report that still mentions removed requirements', () => {
    expect(() => parseFigmaDesignWorkerReport({
      schemaVersion: 1,
      artifactPageName: taskScope.artifactPageName,
      rootNodeId: taskScope.rootNodeId,
      screenCount: 4,
      zdsInstanceCount: 8,
      prototypeLinkCount: 3,
      screenshotsReviewed: 2,
      refinementPasses: 1,
      removedRequirementMentions: 1,
      visualQaPassed: true,
      summary: 'Visual QA passed but semantic audit did not.',
    }, taskScope)).toThrow(/removed ProductSpec requirements/)
  })

  it('requires observed MCP screenshots, a between-shot refinement and product audit', () => {
    const report = {
      schemaVersion: 1,
      artifactPageName: taskScope.artifactPageName,
      rootNodeId: taskScope.rootNodeId,
      screenCount: 4,
      zdsInstanceCount: 8,
      prototypeLinkCount: 3,
      screenshotsReviewed: 2,
      refinementPasses: 1,
      removedRequirementMentions: 0,
      visualQaPassed: true,
      summary: 'Crafted and independently audited.',
    }
    expect(parseFigmaDesignWorkerReport(report, taskScope, {
      screenshotCalls: [4, 12],
      writeCalls: [2, 8],
      productAuditCalls: 1,
    })).toMatchObject({ visualQaPassed: true })
    expect(() => parseFigmaDesignWorkerReport(report, taskScope, {
      screenshotCalls: [4, 12],
      writeCalls: [2],
      productAuditCalls: 1,
    })).toThrow(/observed write/)
    expect(() => parseFigmaDesignWorkerReport(report, taskScope, {
      screenshotCalls: [4, 12],
      writeCalls: [8],
      productAuditCalls: 0,
    })).toThrow(/product-craft audit/)
  })
})
