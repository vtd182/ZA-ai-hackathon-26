import type { ActionReceipt, PlannedAction } from '@pm-agent/domain'

export interface ConnectorStatus {
  available: boolean
  label: string
  detail: string
}

export interface PreflightIssue {
  code: string
  severity: 'warning' | 'error'
  message: string
  entityId?: string
}

export interface PreflightResult<TPlan> {
  allowed: boolean
  plan: TPlan
  planHash: string
  issues: PreflightIssue[]
}

export interface VerificationResult {
  verified: boolean
  issues: PreflightIssue[]
}

export interface ArtifactConnector<TPlan, TSnapshot> {
  readonly target: PlannedAction['target']
  checkAvailability(): Promise<ConnectorStatus>
  preflight(plan: TPlan): Promise<PreflightResult<TPlan>>
  execute(action: PlannedAction): Promise<ActionReceipt>
  readBack(receipt: ActionReceipt): Promise<TSnapshot>
  verify(plan: TPlan, snapshot: TSnapshot): Promise<VerificationResult>
}

export * from './figma-runtime'
