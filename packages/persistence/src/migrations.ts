import type Database from 'better-sqlite3'

interface Migration { id: string; sql: string }

const migrations: Migration[] = [
  {
    id: '001_execution_history',
    sql: `
      CREATE TABLE IF NOT EXISTS conversation_turns (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES conversation_threads(id) ON DELETE CASCADE,
        schema_version INTEGER NOT NULL,
        status TEXT NOT NULL,
        input_text TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_turns_thread_started ON conversation_turns(thread_id, started_at DESC);
      CREATE TABLE IF NOT EXISTS message_parts (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        schema_version INTEGER NOT NULL,
        part_type TEXT NOT NULL,
        content_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_message_parts_message ON message_parts(message_id, id);
      CREATE TABLE IF NOT EXISTS provider_events (
        turn_id TEXT NOT NULL REFERENCES conversation_turns(id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL,
        schema_version INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        event_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (turn_id, sequence)
      );
    `,
  },
  {
    id: '002_canvas_documents',
    sql: `
      CREATE TABLE IF NOT EXISTS canvas_documents (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL UNIQUE REFERENCES conversation_threads(id) ON DELETE CASCADE,
        schema_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS canvas_checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id TEXT NOT NULL REFERENCES canvas_documents(id) ON DELETE CASCADE,
        schema_version INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_canvas_checkpoints_document ON canvas_checkpoints(document_id, id DESC);
      CREATE TABLE IF NOT EXISTS canvas_patches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id TEXT NOT NULL REFERENCES canvas_documents(id) ON DELETE CASCADE,
        schema_version INTEGER NOT NULL,
        patch_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `,
  },
  {
    id: '003_artifact_mappings',
    sql: `
      CREATE TABLE IF NOT EXISTS persisted_artifact_mappings (
        thread_id TEXT NOT NULL REFERENCES conversation_threads(id) ON DELETE CASCADE,
        mapping_id TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        target TEXT NOT NULL,
        spec_version INTEGER NOT NULL,
        mapping_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (thread_id, mapping_id)
      );
      CREATE INDEX IF NOT EXISTS idx_artifact_mappings_target ON persisted_artifact_mappings(thread_id, target, spec_version);
    `,
  },
]

export function applyCoreMigrations(db: Database.Database): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)')
  const applied = new Set((db.prepare('SELECT id FROM schema_migrations').all() as Array<{ id: string }>).map((row) => row.id))
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue
    db.transaction(() => {
      db.exec(migration.sql)
      db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(migration.id, new Date().toISOString())
    })()
  }
}

export const CORE_MIGRATION_IDS = migrations.map((migration) => migration.id)
