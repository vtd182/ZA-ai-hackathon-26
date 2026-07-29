import type { ProviderProfile } from '@pm-agent/domain'

export interface ProviderRuntimeCopy {
  role: string
  storage: string
  artifactBoundary: string
  tags: string[]
}

export function providerRuntimeCopy(profile: Pick<ProviderProfile, 'providerId' | 'costMode' | 'modelId'>): ProviderRuntimeCopy {
  if (profile.providerId === 'agentrouter') {
    return {
      role: 'Reasoning + Figma craft qua Codex Responses bridge.',
      storage: 'Dùng app-managed Codex home; không sửa Codex cá nhân của user.',
      artifactBoundary: 'Figma/Jira/Zdoc write vẫn qua Agent Core approval, MCP và read-back.',
      tags: ['AgentRouter', 'remote resume', 'guarded write'],
    }
  }
  if (profile.providerId === 'codex') {
    return {
      role: 'Reasoning + Figma craft bằng phiên Codex CLI local.',
      storage: 'Dùng đăng nhập Codex hiện tại; app chỉ lưu opaque remote ref/checkpoint.',
      artifactBoundary: 'Provider chỉ đề xuất; external write vẫn cần approval và verification.',
      tags: ['local login', 'remote resume', 'guarded write'],
    }
  }
  if (profile.providerId === 'mock') {
    return {
      role: 'Deterministic offline provider cho demo fallback và test.',
      storage: 'Không gửi dữ liệu ra ngoài; mọi state nằm trong SQLite local.',
      artifactBoundary: 'Mock artifacts vẫn đi qua preflight, receipt và read-back parity.',
      tags: ['offline', 'deterministic', 'mock parity'],
    }
  }
  return {
    role: `Native ${profile.providerId} API dùng cho reasoning có structured output.`,
    storage: profile.costMode === 'api_paid'
      ? 'API key ở Keychain/env; app-owned history giữ quyền resume/switch.'
      : 'App-owned history giữ quyền resume/switch tại checkpoint an toàn.',
    artifactBoundary: 'Provider không gọi connector trực tiếp; Agent Core giữ approval + execution.',
    tags: ['native API', 'app checkpoint', 'guarded write'],
  }
}
