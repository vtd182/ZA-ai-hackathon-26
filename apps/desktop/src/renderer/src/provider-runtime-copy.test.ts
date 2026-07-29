import { describe, expect, it } from 'vitest'
import { providerRuntimeCopy } from './provider-runtime-copy'

describe('providerRuntimeCopy', () => {
  it('explains that AgentRouter can craft Figma but cannot write artifacts directly', () => {
    const copy = providerRuntimeCopy({ providerId: 'agentrouter', modelId: 'claude-opus-5', costMode: 'api_paid' })

    expect(copy.role).toContain('Figma craft')
    expect(copy.storage).toContain('không sửa Codex cá nhân')
    expect(copy.artifactBoundary).toContain('Agent Core approval')
    expect(copy.artifactBoundary).toContain('MCP')
    expect(copy.tags).toContain('remote resume')
  })

  it('keeps mock positioned as deterministic fallback with connector parity', () => {
    const copy = providerRuntimeCopy({ providerId: 'mock', modelId: 'deterministic-v1', costMode: 'mock' })

    expect(copy.role).toContain('offline')
    expect(copy.artifactBoundary).toContain('read-back parity')
  })
})
