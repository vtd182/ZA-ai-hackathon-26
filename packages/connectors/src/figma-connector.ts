import { createHash } from 'node:crypto'
import {
  actionReceiptSchema,
  figmaArtifactSnapshotSchema,
  type ActionReceipt,
  type ArtifactIssue,
  type DesignSystemManifest,
  type FigmaArtifactPlan,
  type FigmaArtifactSnapshot,
  type FigmaPreflightPlan,
  type FigmaTargetBinding,
  type PlannedAction,
} from '@pm-agent/domain'
import { stableStringify, type JsonValue } from '@pm-agent/shared'
import { ConnectorError, type ArtifactConnector, type ConnectorStatus, type PreflightResult, type VerificationResult } from './contract'
import { hashFigmaPreflightPlan, preflightFigmaArtifactPlan } from './figma-artifact-plan'
import type { FigmaMcpAdapter } from './figma-mcp'

export function hashConnectorPayload(payload: Record<string, unknown>): string {
  return createHash('sha256').update(stableStringify(payload as JsonValue)).digest('hex')
}

function assertApprovedAction(action: PlannedAction, preflight: PreflightResult<FigmaPreflightPlan>): void {
  if (action.target !== 'figma' || action.status !== 'approved') {
    throw new ConnectorError('Figma write requires an approved Figma action.', 'POLICY_REJECTED', false)
  }
  if (hashConnectorPayload(action.payload) !== action.payloadHash) {
    throw new ConnectorError('Action payload changed after approval.', 'POLICY_REJECTED', false)
  }
  if (action.payload.planHash !== preflight.planHash || hashFigmaPreflightPlan(preflight.plan) !== preflight.planHash) {
    throw new ConnectorError('Approved action does not cover this immutable Figma plan.', 'POLICY_REJECTED', false)
  }
  if (!preflight.allowed || preflight.issues.some((issue) => issue.severity === 'error')) {
    throw new ConnectorError('Figma preflight contains blocking compliance issues.', 'POLICY_REJECTED', false)
  }
}

function receiptFor(action: PlannedAction, preflight: PreflightResult<FigmaPreflightPlan>, externalId: string, recordedAt: string): ActionReceipt {
  return actionReceiptSchema.parse({
    schemaVersion: 1,
    id: `receipt:${action.id}`,
    actionId: action.id,
    target: 'figma',
    externalId,
    payloadHash: action.payloadHash,
    idempotencyKey: preflight.plan.source.metadata.idempotencyKey,
    recordedAt,
  })
}

export function verifyFigmaArtifactSnapshot(plan: FigmaPreflightPlan, snapshot: FigmaArtifactSnapshot): VerificationResult {
  const issues: ArtifactIssue[] = []
  const planHash = hashFigmaPreflightPlan(plan)
  const add = (code: string, message: string, entityId?: string): void => {
    issues.push({ code, severity: 'error', message, ...(entityId ? { entityId } : {}) })
  }
  if (snapshot.targetHash !== plan.source.target.targetHash) add('TARGET_MISMATCH', 'Read-back target does not match the approved sandbox.')
  if (snapshot.planHash !== planHash) add('PLAN_HASH_MISMATCH', 'Read-back plan hash does not match the approved plan.')
  if (snapshot.idempotencyKey !== plan.source.metadata.idempotencyKey) add('IDEMPOTENCY_MISMATCH', 'Read-back idempotency key does not match.')
  if (snapshot.rootNodeIds.length === 0) add('MISSING_ARTIFACT_ROOT', 'No lifecycle artifact root was found.')

  const screens = new Map(snapshot.screens.map((screen) => [screen.screenId, screen]))
  for (const expected of plan.source.screens) {
    const actual = screens.get(expected.screenId)
    if (!actual) {
      add('MISSING_SCREEN', 'Expected screen is missing from read-back.', expected.screenId)
      continue
    }
    if (actual.metadata.namespace !== 'za.pm-lifecycle/v1'
      || actual.metadata.runId !== plan.source.metadata.runId
      || actual.metadata.actionId !== plan.source.metadata.actionId
      || actual.metadata.screenId !== expected.screenId) {
      add('MISSING_LIFECYCLE_METADATA', 'Lifecycle scope metadata does not match.', expected.screenId)
    }
    if (stableStringify([...actual.metadata.requirementIds].sort() as JsonValue)
      !== stableStringify([...expected.requirementIds].sort() as JsonValue)) {
      add('REQUIREMENT_METADATA_MISMATCH', 'Requirement traceability metadata does not match.', expected.screenId)
    }
    const slots = new Map(actual.childSlots.map((slot) => [slot.slotKey, slot]))
    for (const expectedSlot of plan.resolvedSlots.filter((slot) => slot.screenId === expected.screenId)) {
      const slot = slots.get(expectedSlot.slotKey)
      if (!slot) {
        add('MISSING_SLOT', `Missing slot ${expectedSlot.slotKey}.`, expected.screenId)
        continue
      }
      if (slot.componentKey !== expectedSlot.componentKey || slot.semanticRole !== expectedSlot.semanticRole) {
        add('COMPONENT_BINDING_MISMATCH', `Slot ${expectedSlot.slotKey} binding does not match.`, expected.screenId)
      }
      if (plan.source.mode === 'strict' && slot.primitiveFallback) {
        add('PRIMITIVE_FALLBACK', `Strict slot ${expectedSlot.slotKey} used a primitive fallback.`, expected.screenId)
      }
    }
  }
  const actualEdges = new Set(snapshot.prototypeEdges.map((edge) => edge.key))
  for (const edge of plan.source.screens.flatMap((screen) => screen.prototypeEdges)) {
    if (!actualEdges.has(edge.key)) add('MISSING_PROTOTYPE_EDGE', `Missing prototype edge ${edge.key}.`)
  }
  return { verified: issues.length === 0, issues }
}

export class FigmaMcpArtifactConnector implements ArtifactConnector<FigmaArtifactPlan, FigmaPreflightPlan, FigmaArtifactSnapshot> {
  readonly target = 'figma' as const

  constructor(
    private readonly adapter: FigmaMcpAdapter,
    private readonly manifest: DesignSystemManifest,
    private readonly allowedTarget: FigmaTargetBinding,
  ) {}

  async checkAvailability(): Promise<ConnectorStatus> {
    try {
      await this.adapter.verifyTarget(this.allowedTarget)
      return { available: true, label: 'Figma sandbox ready', detail: `${this.allowedTarget.fileName} · ${this.allowedTarget.pageName}` }
    } catch (error) {
      return { available: false, label: 'Figma unavailable', detail: error instanceof Error ? error.message : 'Unknown Figma error' }
    }
  }

  preflight(plan: FigmaArtifactPlan): Promise<PreflightResult<FigmaPreflightPlan>> {
    return this.adapter.preflightArtifactPlan(plan, this.manifest, this.allowedTarget)
  }

  async execute(action: PlannedAction, preflight: PreflightResult<FigmaPreflightPlan>): Promise<ActionReceipt> {
    assertApprovedAction(action, preflight)
    const result = await this.adapter.applyArtifactPlan(preflight, preflight.planHash)
    const externalId = result.rootNodeIds[0]
    if (!externalId) throw new ConnectorError('Figma apply returned no artifact root.', 'EXECUTION_FAILED', true)
    return receiptFor(action, preflight, externalId, new Date().toISOString())
  }

  readBack(receipt: ActionReceipt): Promise<FigmaArtifactSnapshot> {
    return this.adapter.readArtifact(this.allowedTarget, receipt.idempotencyKey)
  }

  async verify(plan: FigmaPreflightPlan, snapshot: FigmaArtifactSnapshot): Promise<VerificationResult> {
    return verifyFigmaArtifactSnapshot(plan, snapshot)
  }
}

export interface MockFigmaOptions {
  available?: boolean
  now?: () => string
}

export class MockFigmaArtifactConnector implements ArtifactConnector<FigmaArtifactPlan, FigmaPreflightPlan, FigmaArtifactSnapshot> {
  readonly target = 'figma' as const
  private available: boolean
  private readonly snapshots = new Map<string, FigmaArtifactSnapshot>()
  private readonly now: () => string

  constructor(
    private readonly manifest: DesignSystemManifest,
    private readonly allowedTarget: FigmaTargetBinding,
    options: MockFigmaOptions = {},
  ) {
    this.available = options.available ?? true
    this.now = options.now ?? (() => new Date().toISOString())
  }

  setAvailable(available: boolean): void {
    this.available = available
  }

  checkAvailability(): Promise<ConnectorStatus> {
    return Promise.resolve(this.available
      ? { available: true, label: 'Mock Figma ready', detail: 'SQLite-compatible deterministic artifact store' }
      : { available: false, label: 'Mock Figma unavailable', detail: 'Failure injection is enabled' })
  }

  preflight(plan: FigmaArtifactPlan): Promise<PreflightResult<FigmaPreflightPlan>> {
    return Promise.resolve(preflightFigmaArtifactPlan(plan, this.manifest, this.allowedTarget))
  }

  async execute(action: PlannedAction, preflight: PreflightResult<FigmaPreflightPlan>): Promise<ActionReceipt> {
    if (!this.available) throw new ConnectorError('Mock Figma is unavailable.', 'UNAVAILABLE', true)
    assertApprovedAction(action, preflight)
    const idempotencyKey = preflight.plan.source.metadata.idempotencyKey
    if (!this.snapshots.has(idempotencyKey)) {
      const digest = createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 12)
      const snapshot = figmaArtifactSnapshotSchema.parse({
        schemaVersion: 1,
        targetHash: preflight.plan.source.target.targetHash,
        planHash: preflight.planHash,
        idempotencyKey,
        rootNodeIds: [`MOCK-FIGMA-${digest}`],
        screens: preflight.plan.source.screens.map((screen, index) => ({
          nodeId: `MOCK-FIGMA-${digest}-SCREEN-${index + 1}`,
          screenId: screen.screenId,
          name: screen.name,
          componentKey: null,
          semanticRole: null,
          metadata: { ...preflight.plan.source.metadata, screenId: screen.screenId, requirementIds: screen.requirementIds, planHash: preflight.planHash },
          childSlots: preflight.plan.resolvedSlots.filter((slot) => slot.screenId === screen.screenId).map((slot) => ({
            slotKey: slot.slotKey,
            componentKey: slot.componentKey,
            semanticRole: slot.semanticRole,
            primitiveFallback: slot.resolution === 'primitive_fallback',
          })),
        })),
        prototypeEdges: preflight.plan.source.screens.flatMap((screen) => screen.prototypeEdges),
        readAt: this.now(),
      })
      this.snapshots.set(idempotencyKey, snapshot)
    }
    return receiptFor(action, preflight, this.snapshots.get(idempotencyKey)!.rootNodeIds[0]!, this.now())
  }

  async readBack(receipt: ActionReceipt): Promise<FigmaArtifactSnapshot> {
    if (!this.available) throw new ConnectorError('Mock Figma is unavailable.', 'UNAVAILABLE', true)
    const snapshot = this.snapshots.get(receipt.idempotencyKey)
    if (!snapshot) throw new ConnectorError('Mock Figma artifact was not found.', 'NOT_FOUND', false)
    return structuredClone(snapshot)
  }

  verify(plan: FigmaPreflightPlan, snapshot: FigmaArtifactSnapshot): Promise<VerificationResult> {
    return Promise.resolve(verifyFigmaArtifactSnapshot(plan, snapshot))
  }

  tamper(idempotencyKey: string, mutate: (snapshot: FigmaArtifactSnapshot) => FigmaArtifactSnapshot): void {
    const snapshot = this.snapshots.get(idempotencyKey)
    if (snapshot) this.snapshots.set(idempotencyKey, mutate(structuredClone(snapshot)))
  }

  artifactCount(): number {
    return this.snapshots.size
  }
}
