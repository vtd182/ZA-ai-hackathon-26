import Database from 'better-sqlite3'
import {
  approvalSchema,
  plannedActionSchema,
  productSpecSchema,
  phaseReasoningResultSchema,
  runStateSchema,
  type Approval,
  type PlannedAction,
  type ProductSpec,
  type PhaseReasoningResult,
  type RunState,
} from '@pm-agent/domain'

interface JsonRow {
  state_json: string
}

interface VersionRow {
  spec_json: string
}

interface ReasoningCheckpointRow {
  run_id: string
  phase: PhaseReasoningResult['phase']
  result_json: string
  created_at: string
}

interface PersistedReasoningCheckpoint {
  schemaVersion: 1
  runId: string
  phase: PhaseReasoningResult['phase']
  result: PhaseReasoningResult
  createdAt: string
}

export class LifecycleStore {
  private readonly db: Database.Database

  constructor(filename: string) {
    this.db = new Database(filename)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.migrate()
  }

  close(): void {
    this.db.close()
  }

  initializeRun(
    threadId: string,
    runId: string,
    spec: ProductSpec,
    checkpointAt: string,
    initialPhase: RunState['phase'] = 'DELIVERY',
  ): RunState {
    const productSpec = productSpecSchema.parse(spec)
    const state = runStateSchema.parse({
      schemaVersion: 1,
      id: runId,
      threadId,
      phase: initialPhase,
      status: 'ACTIVE',
      productSpec,
      pendingIntent: null,
      pendingActions: [],
      lastCheckpointAt: checkpointAt,
    })
    const transaction = this.db.transaction(() => {
      this.insertSpecVersion(threadId, productSpec, checkpointAt)
      this.db.prepare(`
        INSERT INTO runs (id, thread_id, phase, status, current_spec_version, state_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          phase = excluded.phase,
          status = excluded.status,
          current_spec_version = excluded.current_spec_version,
          state_json = excluded.state_json,
          updated_at = excluded.updated_at
      `).run(state.id, threadId, state.phase, state.status, productSpec.version, JSON.stringify(state), checkpointAt)
      this.insertCheckpoint(state, checkpointAt)
    })
    transaction()
    return state
  }

  savePreview(stateInput: RunState): RunState {
    const state = runStateSchema.parse(stateInput)
    if (state.status !== 'WAITING_FOR_APPROVAL') throw new Error('Preview state must wait for approval')
    const transaction = this.db.transaction(() => {
      this.updateRun(state)
      for (const action of state.pendingActions) this.upsertAction(action)
      this.insertCheckpoint(state, state.lastCheckpointAt)
    })
    transaction()
    return state
  }

  commitApprovedChange(stateInput: RunState, approvalsInput: Approval[]): RunState {
    const state = runStateSchema.parse(stateInput)
    const approvals = approvalsInput.map((approval) => approvalSchema.parse(approval))
    const approvalByAction = new Map(approvals.map((approval) => [approval.actionId, approval]))
    for (const action of state.pendingActions) {
      const approval = approvalByAction.get(action.id)
      if (action.status !== 'approved' || !approval || approval.decision !== 'approved' || approval.payloadHash !== action.payloadHash) {
        throw new Error(`Approved action is missing a matching immutable approval: ${action.id}`)
      }
    }

    const transaction = this.db.transaction(() => {
      this.insertSpecVersion(state.threadId, state.productSpec, state.lastCheckpointAt)
      for (const action of state.pendingActions) this.upsertAction(action)
      for (const approval of approvals) {
        this.db.prepare(`
          INSERT INTO approvals (id, action_id, payload_hash, decision, approver, decided_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(approval.id, approval.actionId, approval.payloadHash, approval.decision, approval.approver, approval.decidedAt)
      }
      for (const action of state.pendingActions) {
        this.db.prepare(`
          INSERT OR IGNORE INTO action_outbox (
            id, action_id, run_id, target, action_json, status, attempts, last_error, available_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'queued', 0, NULL, ?, ?, ?)
        `).run(`outbox:${action.id}`, action.id, action.runId, action.target, JSON.stringify(action), state.lastCheckpointAt, state.lastCheckpointAt, state.lastCheckpointAt)
      }
      this.updateRun(state)
      this.insertCheckpoint(state, state.lastCheckpointAt)
    })
    transaction()
    return state
  }

  commitRejectedChange(stateInput: RunState, approvalsInput: Approval[]): RunState {
    const state = runStateSchema.parse(stateInput)
    const approvals = approvalsInput.map((approval) => approvalSchema.parse(approval))
    const approvalByAction = new Map(approvals.map((approval) => [approval.actionId, approval]))
    for (const action of state.pendingActions) {
      const approval = approvalByAction.get(action.id)
      if (action.status !== 'cancelled' || !approval || approval.decision !== 'rejected' || approval.payloadHash !== action.payloadHash) {
        throw new Error(`Rejected action is missing a matching immutable decision: ${action.id}`)
      }
    }
    const transaction = this.db.transaction(() => {
      for (const action of state.pendingActions) this.upsertAction(action)
      for (const approval of approvals) {
        this.db.prepare(`
          INSERT INTO approvals (id, action_id, payload_hash, decision, approver, decided_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(approval.id, approval.actionId, approval.payloadHash, approval.decision, approval.approver, approval.decidedAt)
      }
      this.updateRun(state)
      this.insertCheckpoint(state, state.lastCheckpointAt)
    })
    transaction()
    return state
  }

  getRunState(threadId: string): RunState | null {
    const row = this.db.prepare('SELECT state_json FROM runs WHERE thread_id = ? ORDER BY updated_at DESC LIMIT 1').get(threadId) as JsonRow | undefined
    return row ? runStateSchema.parse(JSON.parse(row.state_json)) : null
  }

  getSpecVersion(threadId: string, version: number): ProductSpec | null {
    const row = this.db.prepare('SELECT spec_json FROM product_spec_versions WHERE thread_id = ? AND version = ?').get(threadId, version) as VersionRow | undefined
    return row ? productSpecSchema.parse(JSON.parse(row.spec_json)) : null
  }

  listActions(runId: string): PlannedAction[] {
    const rows = this.db.prepare('SELECT action_json FROM planned_actions WHERE run_id = ? ORDER BY target').all(runId) as Array<{ action_json: string }>
    return rows.map((row) => plannedActionSchema.parse(JSON.parse(row.action_json)))
  }

  saveRunState(stateInput: RunState): RunState {
    const state = runStateSchema.parse(stateInput)
    const transaction = this.db.transaction(() => {
      this.updateRun(state)
      for (const action of state.pendingActions) this.upsertAction(action)
      this.insertCheckpoint(state, state.lastCheckpointAt)
    })
    transaction()
    return state
  }

  saveReasoningCheckpoint(stateInput: RunState, checkpointInput: PersistedReasoningCheckpoint): RunState {
    const state = runStateSchema.parse(stateInput)
    const result = phaseReasoningResultSchema.parse(checkpointInput.result)
    if (checkpointInput.runId !== state.id || checkpointInput.phase !== result.phase) {
      throw new Error('Reasoning checkpoint does not match run/phase')
    }
    const transaction = this.db.transaction(() => {
      this.updateRun(state)
      this.db.prepare(`
        INSERT INTO reasoning_checkpoints (run_id, phase, result_json, created_at)
        VALUES (?, ?, ?, ?)
      `).run(state.id, result.phase, JSON.stringify(result), checkpointInput.createdAt)
      this.insertCheckpoint(state, checkpointInput.createdAt)
    })
    transaction()
    return state
  }

  getLatestReasoningCheckpoint(runId: string): PersistedReasoningCheckpoint | null {
    const row = this.db.prepare(`
      SELECT run_id, phase, result_json, created_at FROM reasoning_checkpoints
      WHERE run_id = ? ORDER BY id DESC LIMIT 1
    `).get(runId) as ReasoningCheckpointRow | undefined
    if (!row) return null
    const result = phaseReasoningResultSchema.parse(JSON.parse(row.result_json))
    return { schemaVersion: 1, runId: row.run_id, phase: row.phase, result, createdAt: row.created_at }
  }

  private insertSpecVersion(threadId: string, spec: ProductSpec, createdAt: string): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO product_spec_versions (thread_id, version, schema_version, spec_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(threadId, spec.version, spec.schemaVersion, JSON.stringify(spec), createdAt)
    const upsertMapping = this.db.prepare(`
      INSERT INTO persisted_artifact_mappings (
        thread_id, mapping_id, schema_version, target, spec_version, mapping_json, updated_at
      ) VALUES (?, ?, 1, ?, ?, ?, ?)
      ON CONFLICT(thread_id, mapping_id) DO UPDATE SET
        target = excluded.target,
        spec_version = excluded.spec_version,
        mapping_json = excluded.mapping_json,
        updated_at = excluded.updated_at
    `)
    for (const mapping of spec.artifactMappings) {
      upsertMapping.run(threadId, mapping.id, mapping.target, spec.version, JSON.stringify(mapping), createdAt)
    }
  }

  private upsertAction(actionInput: PlannedAction): void {
    const action = plannedActionSchema.parse(actionInput)
    this.db.prepare(`
      INSERT INTO planned_actions (id, run_id, target, payload_hash, status, action_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        payload_hash = excluded.payload_hash,
        status = excluded.status,
        action_json = excluded.action_json,
        updated_at = excluded.updated_at
    `).run(action.id, action.runId, action.target, action.payloadHash, action.status, JSON.stringify(action), new Date().toISOString())
  }

  private updateRun(state: RunState): void {
    const result = this.db.prepare(`
      UPDATE runs SET phase = ?, status = ?, current_spec_version = ?, state_json = ?, updated_at = ? WHERE id = ?
    `).run(state.phase, state.status, state.productSpec.version, JSON.stringify(state), state.lastCheckpointAt, state.id)
    if (result.changes !== 1) throw new Error(`Run does not exist: ${state.id}`)
  }

  private insertCheckpoint(state: RunState, createdAt: string): void {
    this.db.prepare(`
      INSERT INTO thread_checkpoints (thread_id, run_id, spec_version, phase, status, state_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(state.threadId, state.id, state.productSpec.version, state.phase, state.status, JSON.stringify(state), createdAt)
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS product_spec_versions (
        thread_id TEXT NOT NULL REFERENCES conversation_threads(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        schema_version INTEGER NOT NULL,
        spec_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (thread_id, version)
      );

      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES conversation_threads(id) ON DELETE CASCADE,
        phase TEXT NOT NULL,
        status TEXT NOT NULL,
        current_spec_version INTEGER NOT NULL,
        state_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_runs_thread_updated ON runs(thread_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS planned_actions (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        target TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        action_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        action_id TEXT NOT NULL REFERENCES planned_actions(id) ON DELETE CASCADE,
        payload_hash TEXT NOT NULL,
        decision TEXT NOT NULL,
        approver TEXT NOT NULL,
        decided_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS thread_checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id TEXT NOT NULL REFERENCES conversation_threads(id) ON DELETE CASCADE,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        spec_version INTEGER NOT NULL,
        phase TEXT NOT NULL,
        status TEXT NOT NULL,
        state_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_checkpoints_thread_created ON thread_checkpoints(thread_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS reasoning_checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        phase TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_reasoning_checkpoints_run ON reasoning_checkpoints(run_id, id DESC);

      CREATE TABLE IF NOT EXISTS action_outbox (
        id TEXT PRIMARY KEY,
        action_id TEXT NOT NULL UNIQUE REFERENCES planned_actions(id) ON DELETE CASCADE,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        target TEXT NOT NULL,
        action_json TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        available_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_outbox_run_target ON action_outbox(run_id, target);
      CREATE INDEX IF NOT EXISTS idx_outbox_status_available ON action_outbox(status, available_at);

      CREATE TABLE IF NOT EXISTS action_receipts (
        id TEXT PRIMARY KEY,
        action_id TEXT NOT NULL UNIQUE REFERENCES planned_actions(id) ON DELETE CASCADE,
        target TEXT NOT NULL,
        external_id TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        receipt_json TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS artifact_verifications (
        action_id TEXT PRIMARY KEY REFERENCES planned_actions(id) ON DELETE CASCADE,
        verified INTEGER NOT NULL,
        verification_json TEXT NOT NULL,
        verified_at TEXT NOT NULL
      );
    `)
  }
}
