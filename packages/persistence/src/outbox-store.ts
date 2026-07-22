import Database from 'better-sqlite3'
import {
  actionExecutionStatusSchema,
  actionReceiptSchema,
  artifactVerificationSchema,
  executionSummarySchema,
  outboxItemSchema,
  plannedActionSchema,
  type ActionExecutionStatus,
  type ActionReceipt,
  type ArtifactVerification,
  type ExecutionSummary,
  type OutboxItem,
} from '@pm-agent/domain'

interface OutboxRow {
  id: string
  action_json: string
  status: OutboxItem['status']
  attempts: number
  last_error: string | null
  available_at: string
  created_at: string
  updated_at: string
}

function itemFromRow(row: OutboxRow): OutboxItem {
  return outboxItemSchema.parse({
    schemaVersion: 1,
    id: row.id,
    action: plannedActionSchema.parse(JSON.parse(row.action_json)),
    status: row.status,
    attempts: row.attempts,
    lastError: row.last_error,
    availableAt: row.available_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export class OutboxStore {
  private readonly db: Database.Database

  constructor(filename: string) {
    this.db = new Database(filename)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.migrate()
    this.recoverInterruptedWork()
  }

  close(): void { this.db.close() }

  get(actionId: string): OutboxItem | null {
    const row = this.db.prepare('SELECT * FROM action_outbox WHERE action_id = ?').get(actionId) as OutboxRow | undefined
    return row ? itemFromRow(row) : null
  }

  listRun(runId: string): OutboxItem[] {
    const rows = this.db.prepare('SELECT * FROM action_outbox WHERE run_id = ? ORDER BY target').all(runId) as OutboxRow[]
    return rows.map(itemFromRow)
  }

  claim(actionId: string, claimedAt: string): OutboxItem {
    const transaction = this.db.transaction(() => {
      const current = this.get(actionId)
      if (!current) throw new Error(`Outbox action not found: ${actionId}`)
      if (current.status === 'verified') return current
      const hasReceipt = Boolean(this.getReceipt(actionId))
      const status: OutboxItem['status'] = hasReceipt ? 'verifying' : 'executing'
      this.db.prepare(`
        UPDATE action_outbox
        SET status = ?, attempts = attempts + 1, last_error = NULL, updated_at = ?
        WHERE action_id = ?
      `).run(status, claimedAt, actionId)
      return this.get(actionId)!
    })
    return transaction()
  }

  saveReceipt(receiptInput: ActionReceipt): ActionReceipt {
    const receipt = actionReceiptSchema.parse(receiptInput)
    const transaction = this.db.transaction(() => {
      const existing = this.getReceipt(receipt.actionId)
      if (existing && (existing.payloadHash !== receipt.payloadHash || existing.externalId !== receipt.externalId)) {
        throw new Error(`Receipt conflict for action: ${receipt.actionId}`)
      }
      this.db.prepare(`
        INSERT OR IGNORE INTO action_receipts (
          id, action_id, target, external_id, payload_hash, idempotency_key, receipt_json, recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(receipt.id, receipt.actionId, receipt.target, receipt.externalId, receipt.payloadHash, receipt.idempotencyKey, JSON.stringify(receipt), receipt.recordedAt)
      this.db.prepare(`
        UPDATE action_outbox SET status = 'verifying', updated_at = ?, last_error = NULL WHERE action_id = ?
      `).run(receipt.recordedAt, receipt.actionId)
      return this.getReceipt(receipt.actionId)!
    })
    return transaction()
  }

  getReceipt(actionId: string): ActionReceipt | null {
    const row = this.db.prepare('SELECT receipt_json FROM action_receipts WHERE action_id = ?').get(actionId) as { receipt_json: string } | undefined
    return row ? actionReceiptSchema.parse(JSON.parse(row.receipt_json)) : null
  }

  saveVerification(input: ArtifactVerification): ArtifactVerification {
    const verification = artifactVerificationSchema.parse(input)
    const transaction = this.db.transaction(() => {
      if (!this.getReceipt(verification.actionId)) throw new Error(`Cannot verify action without receipt: ${verification.actionId}`)
      this.db.prepare(`
        INSERT INTO artifact_verifications (action_id, verified, verification_json, verified_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(action_id) DO UPDATE SET
          verified = excluded.verified,
          verification_json = excluded.verification_json,
          verified_at = excluded.verified_at
      `).run(verification.actionId, verification.verified ? 1 : 0, JSON.stringify(verification), verification.verifiedAt)
      this.db.prepare(`
        UPDATE action_outbox SET status = ?, last_error = ?, updated_at = ? WHERE action_id = ?
      `).run(
        verification.verified ? 'verified' : 'verification_failed',
        verification.verified ? null : verification.issues.map((issue) => issue.message).join('; '),
        verification.verifiedAt,
        verification.actionId,
      )
      return verification
    })
    return transaction()
  }

  getVerification(actionId: string): ArtifactVerification | null {
    const row = this.db.prepare('SELECT verification_json FROM artifact_verifications WHERE action_id = ?').get(actionId) as { verification_json: string } | undefined
    return row ? artifactVerificationSchema.parse(JSON.parse(row.verification_json)) : null
  }

  markFailure(actionId: string, error: string, failedAt: string): void {
    const result = this.db.prepare(`
      UPDATE action_outbox SET status = 'failed', last_error = ?, updated_at = ? WHERE action_id = ?
    `).run(error.slice(0, 1000), failedAt, actionId)
    if (result.changes !== 1) throw new Error(`Outbox action not found: ${actionId}`)
  }

  summary(runId: string): ExecutionSummary {
    const actions: ActionExecutionStatus[] = this.listRun(runId).map((item) => actionExecutionStatusSchema.parse({
      actionId: item.action.id,
      target: item.action.target,
      status: item.status,
      attempts: item.attempts,
      lastError: item.lastError,
      receipt: this.getReceipt(item.action.id),
      verification: this.getVerification(item.action.id),
    }))
    const verified = actions.filter((action) => action.status === 'verified').length
    const failed = actions.some((action) => action.status === 'failed' || action.status === 'verification_failed')
    const executing = actions.some((action) => action.status === 'executing' || action.status === 'verifying')
    return executionSummarySchema.parse({
      runId,
      status: actions.length === 0 ? 'idle'
        : verified === actions.length ? 'verified'
          : failed && verified > 0 ? 'partial_failure'
            : failed ? 'partial_failure'
              : executing ? 'executing'
                : 'queued',
      actions,
    })
  }

  reset(): void {
    const transaction = this.db.transaction(() => {
      this.db.prepare('DELETE FROM artifact_verifications').run()
      this.db.prepare('DELETE FROM action_receipts').run()
      this.db.prepare('DELETE FROM action_outbox').run()
    })
    transaction()
  }

  private recoverInterruptedWork(): void {
    this.db.prepare(`
      UPDATE action_outbox
      SET status = CASE
        WHEN EXISTS (SELECT 1 FROM action_receipts r WHERE r.action_id = action_outbox.action_id) THEN 'verifying'
        ELSE 'queued'
      END,
      updated_at = ?
      WHERE status IN ('executing', 'verifying')
    `).run(new Date().toISOString())
  }

  private migrate(): void {
    this.db.exec(`
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
