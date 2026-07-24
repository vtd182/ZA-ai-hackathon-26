import type {
  ActionReceipt,
  ArtifactExecutionStage,
  ArtifactProgressEvent,
  ArtifactVerification,
  OutboxItem,
  PlannedAction,
} from '@pm-agent/domain'
import type {
  ArtifactConnector,
  PreflightResult,
  VerificationResult,
} from '@pm-agent/connectors'

export interface ExecutionRepository {
  claim(actionId: string, claimedAt: string): OutboxItem
  getReceipt(actionId: string): ActionReceipt | null
  saveReceipt(receipt: ActionReceipt): ActionReceipt
  saveVerification(verification: ArtifactVerification): ArtifactVerification
  markFailure(actionId: string, error: string, failedAt: string): void
}

export interface ConnectorExecutionResult {
  actionId: string
  target: PlannedAction['target']
  status: 'verified' | 'failed' | 'verification_failed'
  receipt: ActionReceipt | null
  verification: VerificationResult | null
  error: string | null
  timings: Record<Exclude<ArtifactExecutionStage, 'planning' | 'complete'>, number> & { total: number }
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown connector failure'
  return message.replace(/(api[_-]?key|authorization|token)\s*[:=]\s*\S+/gi, '$1=[REDACTED]').slice(0, 1000)
}

export async function executeConnectorAction<TPlan, TPreparedPlan, TSnapshot>(input: {
  action: PlannedAction
  plan: TPlan
  preparedPreflight?: PreflightResult<TPreparedPlan>
  connector: ArtifactConnector<TPlan, TPreparedPlan, TSnapshot>
  repository: ExecutionRepository
  now?: () => string
  onProgress?: (event: Omit<ArtifactProgressEvent, 'schemaVersion' | 'threadId' | 'at'>) => void
}): Promise<ConnectorExecutionResult> {
  const now = input.now ?? (() => new Date().toISOString())
  const startedAt = Date.now()
  const timings: ConnectorExecutionResult['timings'] = {
    availability: 0,
    preflight: 0,
    write: 0,
    read_back: 0,
    verify: 0,
    total: 0,
  }
  let currentStage: Exclude<ArtifactExecutionStage, 'planning' | 'complete'> = 'availability'
  const emit = (
    stage: ArtifactExecutionStage,
    status: ArtifactProgressEvent['status'],
    message: string,
    stageElapsedMs = 0,
  ): void => {
    input.onProgress?.({
      target: input.action.target,
      stage,
      status,
      stageElapsedMs,
      totalElapsedMs: Date.now() - startedAt,
      message,
    })
  }
  const runStage = async <T>(
    stage: Exclude<ArtifactExecutionStage, 'planning' | 'complete'>,
    message: string,
    task: () => Promise<T>,
  ): Promise<T> => {
    currentStage = stage
    const stageStartedAt = Date.now()
    emit(stage, 'running', message)
    try {
      const result = await task()
      const elapsed = Date.now() - stageStartedAt
      timings[stage] = elapsed
      emit(stage, 'completed', message, elapsed)
      return result
    } catch (error) {
      const elapsed = Date.now() - stageStartedAt
      timings[stage] = elapsed
      emit(stage, 'failed', error instanceof Error ? error.message : message, elapsed)
      throw error
    }
  }
  input.repository.claim(input.action.id, now())
  let receipt = input.repository.getReceipt(input.action.id)
  try {
    const availability = await runStage('availability', 'Kiểm tra connector', () => input.connector.checkAvailability())
    if (!availability.available) throw new Error(availability.detail)
    const preflight: PreflightResult<TPreparedPlan> = input.preparedPreflight
      ? await runStage('preflight', 'Dùng immutable preflight đã duyệt', () => Promise.resolve(input.preparedPreflight!))
      : await runStage('preflight', 'Kiểm tra immutable plan', () => input.connector.preflight(input.plan))
    if (!preflight.allowed || preflight.issues.some((issue) => issue.severity === 'error')) {
      throw new Error(`Connector preflight blocked: ${preflight.issues.map((issue) => issue.code).join(', ')}`)
    }

    if (!receipt) {
      receipt = await runStage('write', 'Ghi artifact', () => input.connector.execute(input.action, preflight))
      receipt = input.repository.saveReceipt(receipt)
    } else {
      emit('write', 'completed', 'Dùng receipt đã lưu', 0)
    }

    const storedReceipt = receipt
    if (!storedReceipt) throw new Error('Connector execution did not produce a receipt')
    const snapshot = await runStage('read_back', 'Đọc lại artifact', () => input.connector.readBack(storedReceipt))
    const verification = await runStage('verify', 'Xác minh read-back', () => input.connector.verify(preflight.plan, snapshot))
    input.repository.saveVerification({
      schemaVersion: 1,
      actionId: input.action.id,
      verified: verification.verified,
      issues: verification.issues,
      verifiedAt: now(),
    })
    timings.total = Date.now() - startedAt
    emit('complete', verification.verified ? 'completed' : 'failed', verification.verified ? 'Đã verified' : 'Read-back không khớp')
    return {
      actionId: input.action.id,
      target: input.action.target,
      status: verification.verified ? 'verified' : 'verification_failed',
      receipt,
      verification,
      error: verification.verified ? null : verification.issues.map((issue) => issue.message).join('; '),
      timings,
    }
  } catch (error) {
    const message = safeError(error)
    input.repository.markFailure(input.action.id, message, now())
    timings.total = Date.now() - startedAt
    emit('complete', 'failed', `${currentStage}: ${message}`)
    return { actionId: input.action.id, target: input.action.target, status: 'failed', receipt, verification: null, error: message, timings }
  }
}
