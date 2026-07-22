import Database from 'better-sqlite3'

interface ArtifactRow {
  external_id: string
  plan_hash: string
  payload_hash: string
  snapshot_json: string
}

export class SqliteMockArtifactStore {
  private readonly db: Database.Database

  constructor(filename: string) {
    this.db = new Database(filename)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS mock_external_artifacts (
        target TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        external_id TEXT NOT NULL,
        plan_hash TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (target, idempotency_key),
        UNIQUE (target, external_id)
      );
      CREATE INDEX IF NOT EXISTS idx_mock_artifacts_target_external
        ON mock_external_artifacts(target, external_id);
    `)
  }

  close(): void {
    this.db.close()
  }

  count(target: 'jira' | 'zdoc'): number {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM mock_external_artifacts WHERE target = ?').get(target) as { count: number }
    return row.count
  }

  get<T>(target: 'jira' | 'zdoc', idempotencyKey: string): { externalId: string; planHash: string; payloadHash: string; snapshot: T } | null {
    const row = this.db.prepare(`
      SELECT external_id, plan_hash, payload_hash, snapshot_json
      FROM mock_external_artifacts WHERE target = ? AND idempotency_key = ?
    `).get(target, idempotencyKey) as ArtifactRow | undefined
    if (!row) return null
    return {
      externalId: row.external_id,
      planHash: row.plan_hash,
      payloadHash: row.payload_hash,
      snapshot: JSON.parse(row.snapshot_json) as T,
    }
  }

  insert<T>(input: {
    target: 'jira' | 'zdoc'
    idempotencyKey: string
    externalId: string
    planHash: string
    payloadHash: string
    snapshot: T
    timestamp: string
  }): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO mock_external_artifacts (
        target, idempotency_key, external_id, plan_hash, payload_hash, snapshot_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.target,
      input.idempotencyKey,
      input.externalId,
      input.planHash,
      input.payloadHash,
      JSON.stringify(input.snapshot),
      input.timestamp,
      input.timestamp,
    )
  }

  updateSnapshot<T>(target: 'jira' | 'zdoc', idempotencyKey: string, snapshot: T, timestamp: string): void {
    const result = this.db.prepare(`
      UPDATE mock_external_artifacts SET snapshot_json = ?, updated_at = ?
      WHERE target = ? AND idempotency_key = ?
    `).run(JSON.stringify(snapshot), timestamp, target, idempotencyKey)
    if (result.changes !== 1) throw new Error(`Mock artifact not found: ${target}/${idempotencyKey}`)
  }

  reset(): void {
    this.db.prepare('DELETE FROM mock_external_artifacts').run()
  }
}
