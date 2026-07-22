import Database from 'better-sqlite3'
import {
  figmaDesignSystemContextSchema,
  figmaTargetBindingSchema,
  type FigmaDesignSystemContext,
  type FigmaTargetBinding,
} from '@pm-agent/domain'

interface TargetRow {
  target_json: string
}

interface ContextRow {
  context_json: string
}

export class FigmaIntegrationStore {
  private readonly db: Database.Database

  constructor(filename: string) {
    this.db = new Database(filename)
    this.db.pragma('journal_mode = WAL')
    this.migrate()
  }

  close(): void {
    this.db.close()
  }

  saveActiveTarget(input: FigmaTargetBinding): FigmaTargetBinding {
    const target = figmaTargetBindingSchema.parse(input)
    const transaction = this.db.transaction(() => {
      this.db.prepare('UPDATE figma_target_allowlist SET active = 0 WHERE active = 1').run()
      this.db.prepare(`
        INSERT INTO figma_target_allowlist (target_hash, session_id, file_name, page_id, page_name, target_json, active, allowed_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(target_hash) DO UPDATE SET
          session_id = excluded.session_id,
          file_name = excluded.file_name,
          page_id = excluded.page_id,
          page_name = excluded.page_name,
          target_json = excluded.target_json,
          active = 1,
          allowed_at = excluded.allowed_at
      `).run(target.targetHash, target.sessionId, target.fileName, target.pageId, target.pageName, JSON.stringify(target), target.allowedAt)
    })
    transaction()
    return target
  }

  getActiveTarget(): FigmaTargetBinding | null {
    const row = this.db.prepare('SELECT target_json FROM figma_target_allowlist WHERE active = 1 LIMIT 1').get() as TargetRow | undefined
    return row ? figmaTargetBindingSchema.parse(JSON.parse(row.target_json)) : null
  }

  saveContext(input: FigmaDesignSystemContext): FigmaDesignSystemContext {
    const context = figmaDesignSystemContextSchema.parse(input)
    this.db.prepare(`
      INSERT INTO figma_design_system_contexts (target_hash, fingerprint, source, context_json, captured_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(target_hash) DO UPDATE SET
        fingerprint = excluded.fingerprint,
        source = excluded.source,
        context_json = excluded.context_json,
        captured_at = excluded.captured_at
    `).run(
      context.target.targetHash,
      context.manifest.fingerprint,
      context.manifest.source,
      JSON.stringify(context),
      context.capturedAt,
    )
    return context
  }

  getContext(targetHash: string): FigmaDesignSystemContext | null {
    const row = this.db.prepare('SELECT context_json FROM figma_design_system_contexts WHERE target_hash = ?').get(targetHash) as ContextRow | undefined
    return row ? figmaDesignSystemContextSchema.parse(JSON.parse(row.context_json)) : null
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS figma_target_allowlist (
        target_hash TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        page_id TEXT NOT NULL,
        page_name TEXT NOT NULL,
        target_json TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 0,
        allowed_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_figma_one_active_target ON figma_target_allowlist(active) WHERE active = 1;

      CREATE TABLE IF NOT EXISTS figma_design_system_contexts (
        target_hash TEXT PRIMARY KEY REFERENCES figma_target_allowlist(target_hash) ON DELETE CASCADE,
        fingerprint TEXT NOT NULL,
        source TEXT NOT NULL,
        context_json TEXT NOT NULL,
        captured_at TEXT NOT NULL
      );
    `)
  }
}
