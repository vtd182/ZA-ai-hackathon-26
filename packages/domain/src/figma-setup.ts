export interface FigmaSetupStatus {
  runtime: 'missing' | 'stopped' | 'starting' | 'ready' | 'error'
  runtimeVersion: string | null
  binaryReady: boolean
  pluginBuilt: boolean
  pluginConnected: boolean
  sessionCount: number
  activeSession: string | null
  manifestPath: string
  controlPlaneUrl: string
  detail: string
}

