import { createHash } from 'node:crypto'
import {
  actionReceiptSchema,
  mockJiraPlanSchema,
  mockJiraSnapshotSchema,
  mockZdocPlanSchema,
  mockZdocSnapshotSchema,
  type ActionReceipt,
  type ArtifactBrief,
  type ArtifactIssue,
  type LifecycleArtifactMetadata,
  type MockJiraPlan,
  type MockJiraSnapshot,
  type MockZdocPlan,
  type MockZdocSnapshot,
  type PlannedAction,
  type ProductSpec,
} from '@pm-agent/domain'
import { stableStringify, type JsonValue } from '@pm-agent/shared'
import { ConnectorError, type ArtifactConnector, type ConnectorStatus, type PreflightResult, type VerificationResult } from './contract'
import { hashConnectorPayload } from './figma-connector'
import { SqliteMockArtifactStore } from './mock-artifact-store'

export interface MockPlanMetadataInput {
  runId: string
  threadId: string
  actionId: string
  idempotencyKey: string
  artifactBrief: ArtifactBrief
}

function metadataFor(spec: ProductSpec, input: MockPlanMetadataInput): LifecycleArtifactMetadata {
  return {
    namespace: 'za.pm-lifecycle/v1',
    ...input,
    specId: spec.id,
    specVersion: spec.version,
  }
}

export function createMockJiraPlan(spec: ProductSpec, input: MockPlanMetadataInput): MockJiraPlan {
  const activeRequirements = spec.requirements.filter((requirement) => requirement.status !== 'removed')
  return mockJiraPlanSchema.parse({
    schemaVersion: 1,
    kind: 'mock_jira_plan',
    metadata: metadataFor(spec, input),
    artifactBrief: input.artifactBrief,
    epic: {
      title: `[Mock] ${spec.title} · v${spec.version}`,
      requirementIds: activeRequirements.map((requirement) => requirement.id),
    },
    stories: spec.stories.map((story) => ({
      storyId: story.id,
      title: story.title,
      requirementIds: story.requirementIds,
      acceptanceCriteria: story.acceptanceCriteria,
      status: story.requirementIds.every((id) => activeRequirements.some((requirement) => requirement.id === id)) ? 'active' : 'removed',
    })),
  })
}

export function createMockZdocPlan(spec: ProductSpec, input: MockPlanMetadataInput): MockZdocPlan {
  return mockZdocPlanSchema.parse({
    schemaVersion: 1,
    kind: 'mock_zdoc_plan',
    metadata: metadataFor(spec, input),
    artifactBrief: input.artifactBrief,
    title: `[Mock Zdoc] ${spec.title} · ProductSpec v${spec.version}`,
    summary: spec.idea.summary,
    requirementSections: spec.requirements.map((requirement) => ({
      requirementId: requirement.id,
      title: requirement.title,
      description: requirement.description,
      priority: requirement.priority,
      status: requirement.status,
      acceptanceCriteria: requirement.acceptanceCriteria,
      screenIds: spec.screens.filter((screen) => screen.requirementIds.includes(requirement.id)).map((screen) => screen.id),
      storyIds: spec.stories.filter((story) => story.requirementIds.includes(requirement.id)).map((story) => story.id),
    })),
  })
}

function preflight<T>(plan: T): PreflightResult<T> {
  return { allowed: true, plan, planHash: hashConnectorPayload(plan as Record<string, unknown>), issues: [] }
}

function assertApproved<T>(action: PlannedAction, target: 'jira' | 'zdoc', prepared: PreflightResult<T>): void {
  if (action.target !== target || action.status !== 'approved') {
    throw new ConnectorError(`${target} write requires an approved action.`, 'POLICY_REJECTED', false)
  }
  if (hashConnectorPayload(action.payload) !== action.payloadHash || action.payload.planHash !== prepared.planHash) {
    throw new ConnectorError('Action payload or plan hash changed after approval.', 'POLICY_REJECTED', false)
  }
}

function stableExternalId(prefix: string, idempotencyKey: string): string {
  return `${prefix}-${createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 8).toUpperCase()}`
}

function receipt(action: PlannedAction, externalId: string, idempotencyKey: string, recordedAt: string): ActionReceipt {
  return actionReceiptSchema.parse({
    schemaVersion: 1,
    id: `receipt:${action.id}`,
    actionId: action.id,
    target: action.target,
    externalId,
    payloadHash: action.payloadHash,
    idempotencyKey,
    recordedAt,
  })
}

abstract class MockConnectorBase {
  protected available = true
  protected failNext = false

  constructor(protected readonly store: SqliteMockArtifactStore, protected readonly now: () => string) {}

  setAvailable(available: boolean): void {
    this.available = available
  }

  failNextExecute(): void {
    this.failNext = true
  }

  protected assertAvailable(label: string): void {
    if (!this.available) throw new ConnectorError(`${label} is unavailable.`, 'UNAVAILABLE', true)
    if (this.failNext) {
      this.failNext = false
      throw new ConnectorError(`${label} injected execution failure.`, 'EXECUTION_FAILED', true)
    }
  }
}

export class MockJiraConnector extends MockConnectorBase implements ArtifactConnector<MockJiraPlan, MockJiraPlan, MockJiraSnapshot> {
  readonly target = 'jira' as const

  checkAvailability(): Promise<ConnectorStatus> {
    return Promise.resolve(this.available
      ? { available: true, label: 'Mock Jira ready', detail: 'SQLite external store' }
      : { available: false, label: 'Mock Jira unavailable', detail: 'Failure injection is enabled' })
  }

  preflight(plan: MockJiraPlan): Promise<PreflightResult<MockJiraPlan>> {
    return Promise.resolve(preflight(mockJiraPlanSchema.parse(plan)))
  }

  async execute(action: PlannedAction, prepared: PreflightResult<MockJiraPlan>): Promise<ActionReceipt> {
    this.assertAvailable('Mock Jira')
    assertApproved(action, this.target, prepared)
    const idempotencyKey = prepared.plan.metadata.idempotencyKey
    const existing = this.store.get<MockJiraSnapshot>(this.target, idempotencyKey)
    if (existing) {
      if (existing.planHash !== prepared.planHash) throw new ConnectorError('Mock Jira idempotency conflict.', 'CONFLICT', false)
      return receipt(action, existing.externalId, idempotencyKey, this.now())
    }
    const externalId = stableExternalId('MOCK-JIRA', idempotencyKey)
    const snapshot = mockJiraSnapshotSchema.parse({
      schemaVersion: 1,
      externalId,
      planHash: prepared.planHash,
      payloadHash: action.payloadHash,
      idempotencyKey,
      artifactBrief: prepared.plan.artifactBrief,
      epic: { ...prepared.plan.epic, key: externalId },
      stories: prepared.plan.stories.map((story, index) => ({ ...story, key: `${externalId}-${index + 1}`, epicKey: externalId })),
      readAt: this.now(),
    })
    this.store.insert({ target: this.target, idempotencyKey, externalId, planHash: prepared.planHash, payloadHash: action.payloadHash, snapshot, timestamp: this.now() })
    return receipt(action, externalId, idempotencyKey, this.now())
  }

  async readBack(actionReceipt: ActionReceipt): Promise<MockJiraSnapshot> {
    this.assertAvailable('Mock Jira')
    const found = this.store.get<MockJiraSnapshot>(this.target, actionReceipt.idempotencyKey)
    if (!found) throw new ConnectorError('Mock Jira artifact not found.', 'NOT_FOUND', false)
    return mockJiraSnapshotSchema.parse(structuredClone(found.snapshot))
  }

  verify(plan: MockJiraPlan, snapshot: MockJiraSnapshot): Promise<VerificationResult> {
    const issues: ArtifactIssue[] = []
    const add = (code: string, message: string, entityId?: string): void => { issues.push({ code, severity: 'error', message, ...(entityId ? { entityId } : {}) }) }
    const planHash = hashConnectorPayload(plan as unknown as Record<string, unknown>)
    if (snapshot.planHash !== planHash) add('PLAN_HASH_MISMATCH', 'Mock Jira plan hash does not match.')
    if (stableStringify(snapshot.artifactBrief as unknown as JsonValue) !== stableStringify(plan.artifactBrief as unknown as JsonValue)) {
      add('ARTIFACT_BRIEF_MISMATCH', 'Mock Jira ArtifactBrief does not match the approved plan.')
    }
    if (snapshot.epic.key !== snapshot.externalId) add('EPIC_LINK_MISMATCH', 'Mock Jira Epic key does not match external ID.')
    if (stableStringify([...snapshot.epic.requirementIds].sort() as JsonValue) !== stableStringify([...plan.epic.requirementIds].sort() as JsonValue)) {
      add('REQUIREMENT_IDS_MISMATCH', 'Mock Jira Epic requirement IDs do not match.')
    }
    const stories = new Map(snapshot.stories.map((story) => [story.storyId, story]))
    for (const expected of plan.stories) {
      const actual = stories.get(expected.storyId)
      if (!actual) add('MISSING_STORY', 'Mock Jira story is missing.', expected.storyId)
      else if (actual.epicKey !== snapshot.epic.key
        || stableStringify(actual.acceptanceCriteria as JsonValue) !== stableStringify(expected.acceptanceCriteria as JsonValue)
        || stableStringify([...actual.requirementIds].sort() as JsonValue) !== stableStringify([...expected.requirementIds].sort() as JsonValue)) {
        add('STORY_TRACEABILITY_MISMATCH', 'Mock Jira story Epic/requirement/AC traceability does not match.', expected.storyId)
      }
    }
    return Promise.resolve({ verified: issues.length === 0, issues })
  }

  artifactCount(): number { return this.store.count(this.target) }
  close(): void { this.store.close() }
  tamper(idempotencyKey: string, mutate: (snapshot: MockJiraSnapshot) => MockJiraSnapshot): void {
    const found = this.store.get<MockJiraSnapshot>(this.target, idempotencyKey)
    if (found) this.store.updateSnapshot(this.target, idempotencyKey, mutate(structuredClone(found.snapshot)), this.now())
  }
}

export class MockZdocConnector extends MockConnectorBase implements ArtifactConnector<MockZdocPlan, MockZdocPlan, MockZdocSnapshot> {
  readonly target = 'zdoc' as const

  checkAvailability(): Promise<ConnectorStatus> {
    return Promise.resolve(this.available
      ? { available: true, label: 'Mock Zdoc ready', detail: 'SQLite external store' }
      : { available: false, label: 'Mock Zdoc unavailable', detail: 'Failure injection is enabled' })
  }

  preflight(plan: MockZdocPlan): Promise<PreflightResult<MockZdocPlan>> {
    return Promise.resolve(preflight(mockZdocPlanSchema.parse(plan)))
  }

  async execute(action: PlannedAction, prepared: PreflightResult<MockZdocPlan>): Promise<ActionReceipt> {
    this.assertAvailable('Mock Zdoc')
    assertApproved(action, this.target, prepared)
    const idempotencyKey = prepared.plan.metadata.idempotencyKey
    const existing = this.store.get<MockZdocSnapshot>(this.target, idempotencyKey)
    if (existing) {
      if (existing.planHash !== prepared.planHash) throw new ConnectorError('Mock Zdoc idempotency conflict.', 'CONFLICT', false)
      return receipt(action, existing.externalId, idempotencyKey, this.now())
    }
    const externalId = stableExternalId('MOCK-ZDOC', idempotencyKey)
    const snapshot = mockZdocSnapshotSchema.parse({
      schemaVersion: 1,
      externalId,
      planHash: prepared.planHash,
      payloadHash: action.payloadHash,
      idempotencyKey,
      artifactBrief: prepared.plan.artifactBrief,
      title: prepared.plan.title,
      specVersion: prepared.plan.metadata.specVersion,
      summary: prepared.plan.summary,
      requirementSections: prepared.plan.requirementSections,
      traceability: {
        specId: prepared.plan.metadata.specId,
        runId: prepared.plan.metadata.runId,
        requirementIds: prepared.plan.requirementSections.map((section) => section.requirementId),
      },
      readAt: this.now(),
    })
    this.store.insert({ target: this.target, idempotencyKey, externalId, planHash: prepared.planHash, payloadHash: action.payloadHash, snapshot, timestamp: this.now() })
    return receipt(action, externalId, idempotencyKey, this.now())
  }

  async readBack(actionReceipt: ActionReceipt): Promise<MockZdocSnapshot> {
    this.assertAvailable('Mock Zdoc')
    const found = this.store.get<MockZdocSnapshot>(this.target, actionReceipt.idempotencyKey)
    if (!found) throw new ConnectorError('Mock Zdoc artifact not found.', 'NOT_FOUND', false)
    return mockZdocSnapshotSchema.parse(structuredClone(found.snapshot))
  }

  verify(plan: MockZdocPlan, snapshot: MockZdocSnapshot): Promise<VerificationResult> {
    const issues: ArtifactIssue[] = []
    const add = (code: string, message: string, entityId?: string): void => { issues.push({ code, severity: 'error', message, ...(entityId ? { entityId } : {}) }) }
    if (snapshot.planHash !== hashConnectorPayload(plan as unknown as Record<string, unknown>)) add('PLAN_HASH_MISMATCH', 'Mock Zdoc plan hash does not match.')
    if (stableStringify(snapshot.artifactBrief as unknown as JsonValue) !== stableStringify(plan.artifactBrief as unknown as JsonValue)) {
      add('ARTIFACT_BRIEF_MISMATCH', 'Mock Zdoc ArtifactBrief does not match the approved plan.')
    }
    if (snapshot.title !== plan.title || snapshot.specVersion !== plan.metadata.specVersion) add('DOCUMENT_IDENTITY_MISMATCH', 'Mock Zdoc title or ProductSpec version does not match.')
    const sections = new Map(snapshot.requirementSections.map((section) => [section.requirementId, section]))
    for (const expected of plan.requirementSections) {
      const actual = sections.get(expected.requirementId)
      if (!actual) add('MISSING_REQUIREMENT_SECTION', 'Mock Zdoc requirement section is missing.', expected.requirementId)
      else if (stableStringify(actual as unknown as JsonValue) !== stableStringify(expected as unknown as JsonValue)) {
        add('REQUIREMENT_SECTION_MISMATCH', 'Mock Zdoc requirement traceability section does not match.', expected.requirementId)
      }
    }
    const expectedIds = plan.requirementSections.map((section) => section.requirementId).sort()
    if (snapshot.traceability.specId !== plan.metadata.specId
      || snapshot.traceability.runId !== plan.metadata.runId
      || stableStringify([...snapshot.traceability.requirementIds].sort() as JsonValue) !== stableStringify(expectedIds as JsonValue)) {
      add('TRACEABILITY_MISMATCH', 'Mock Zdoc traceability metadata does not match.')
    }
    return Promise.resolve({ verified: issues.length === 0, issues })
  }

  artifactCount(): number { return this.store.count(this.target) }
  close(): void { this.store.close() }
  tamper(idempotencyKey: string, mutate: (snapshot: MockZdocSnapshot) => MockZdocSnapshot): void {
    const found = this.store.get<MockZdocSnapshot>(this.target, idempotencyKey)
    if (found) this.store.updateSnapshot(this.target, idempotencyKey, mutate(structuredClone(found.snapshot)), this.now())
  }
}
