import type { FigmaDesignSystemContextSummary, FigmaSession, FigmaTargetBinding } from './figma-integration'

export interface FigmaSetupStatus {
  runtime: 'missing' | 'stopped' | 'starting' | 'ready' | 'error'
  runtimeVersion: string | null
  binaryReady: boolean
  pluginBuilt: boolean
  pluginConnected: boolean
  sessionCount: number
  activeSession: string | null
  sessions: FigmaSession[]
  target: FigmaTargetBinding | null
  designSystem: FigmaDesignSystemContextSummary | null
  manifestPath: string
  controlPlaneUrl: string
  detail: string
}
