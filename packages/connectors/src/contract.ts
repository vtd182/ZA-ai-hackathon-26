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
  entityId?: string | undefined
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

export interface ArtifactConnector<TPlan, TPreparedPlan, TSnapshot> {
  readonly target: PlannedAction['target']
  checkAvailability(): Promise<ConnectorStatus>
  preflight(plan: TPlan): Promise<PreflightResult<TPreparedPlan>>
  execute(action: PlannedAction, preflight: PreflightResult<TPreparedPlan>): Promise<ActionReceipt>
  readBack(receipt: ActionReceipt): Promise<TSnapshot>
  verify(plan: TPreparedPlan, snapshot: TSnapshot): Promise<VerificationResult>
}

export class ConnectorError extends Error {
  constructor(
    message: string,
    readonly code: 'UNAVAILABLE' | 'POLICY_REJECTED' | 'CONFLICT' | 'NOT_FOUND' | 'EXECUTION_FAILED',
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'ConnectorError'
  }
}
