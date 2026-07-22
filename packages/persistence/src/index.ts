import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import type {
  ChatMessage,
  ProviderProfile,
  ThreadDetail,
  ThreadSummary,
  WorkflowView,
} from '@pm-agent/domain'

export { LifecycleStore } from './lifecycle-store'
export { FigmaIntegrationStore } from './figma-integration-store'

interface ThreadRow {
  id: string
  title: string
  phase: WorkflowView
  status: 'active' | 'archived'
  provider_id: string
  model_id: string
  canvas_snapshot: string | null
  created_at: string
  updated_at: string
  last_message: string | null
}

interface MessageRow {
  id: string
  thread_id: string
  role: ChatMessage['role']
  content: string
  created_at: string
}

interface ProfileRow {
  id: string
  provider_id: string
  display_name: string
  model_id: string
  cost_mode: ProviderProfile['costMode']
  enabled: number
}

const defaultProfiles: Omit<ProviderProfile, 'hasCredential'>[] = [
  { id: 'mock-local', providerId: 'mock', displayName: 'Mock · Offline', modelId: 'deterministic-v1', costMode: 'mock', enabled: true },
  { id: 'codex-local', providerId: 'codex', displayName: 'Codex · Local login', modelId: 'gpt-5.5', costMode: 'subscription', enabled: true },
  { id: 'openai-api', providerId: 'openai', displayName: 'OpenAI API', modelId: 'gpt-5.6-sol', costMode: 'api_paid', enabled: true },
  { id: 'gemini-api', providerId: 'gemini', displayName: 'Gemini API', modelId: 'gemini-3-flash-preview', costMode: 'api_paid', enabled: true },
  { id: 'anthropic-api', providerId: 'anthropic', displayName: 'Claude API', modelId: 'claude-sonnet-4-6', costMode: 'api_paid', enabled: true },
]

function now(): string {
  return new Date().toISOString()
}

function messageFromRow(row: MessageRow): ChatMessage {
  return { id: row.id, threadId: row.thread_id, role: row.role, content: row.content, createdAt: row.created_at }
}

function summaryFromRow(row: ThreadRow): ThreadSummary {
  return {
    id: row.id,
    title: row.title,
    phase: row.phase,
    status: row.status,
    providerId: row.provider_id,
    modelId: row.model_id,
    updatedAt: row.updated_at,
    lastMessage: row.last_message,
  }
}

export class HistoryStore {
  private readonly db: Database.Database

  constructor(filename: string) {
    this.db = new Database(filename)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.migrate()
    this.seedProfiles()
    this.seedDemoThread()
  }

  close(): void {
    this.db.close()
  }

  listThreads(query = '', limit = 50): ThreadSummary[] {
    const normalized = query.trim()
    const rows = normalized
      ? this.db.prepare(`
          SELECT t.*, (
            SELECT content FROM messages m WHERE m.thread_id = t.id ORDER BY m.created_at DESC LIMIT 1
          ) AS last_message
          FROM conversation_threads t
          WHERE t.status = 'active' AND (t.title LIKE @query OR EXISTS (
            SELECT 1 FROM messages m WHERE m.thread_id = t.id AND m.content LIKE @query
          ))
          ORDER BY t.updated_at DESC LIMIT @limit
        `).all({ query: `%${normalized}%`, limit }) as ThreadRow[]
      : this.db.prepare(`
          SELECT t.*, (
            SELECT content FROM messages m WHERE m.thread_id = t.id ORDER BY m.created_at DESC LIMIT 1
          ) AS last_message
          FROM conversation_threads t
          WHERE t.status = 'active'
          ORDER BY t.updated_at DESC LIMIT @limit
        `).all({ limit }) as ThreadRow[]
    return rows.map(summaryFromRow)
  }

  createThread(): ThreadDetail {
    const id = randomUUID()
    const createdAt = now()
    const profile = this.getProfile('mock-local')
    this.db.prepare(`
      INSERT INTO conversation_threads (
        id, title, phase, status, provider_id, model_id, canvas_snapshot, created_at, updated_at
      ) VALUES (?, ?, 'discover', 'active', ?, ?, NULL, ?, ?)
    `).run(id, 'Ý tưởng chưa đặt tên', profile.id, profile.modelId, createdAt, createdAt)
    return this.getThread(id)
  }

  getThread(threadId: string, messageLimit = 100): ThreadDetail {
    const row = this.db.prepare(`
      SELECT t.*, (
        SELECT content FROM messages m WHERE m.thread_id = t.id ORDER BY m.created_at DESC LIMIT 1
      ) AS last_message
      FROM conversation_threads t WHERE t.id = ?
    `).get(threadId) as ThreadRow | undefined
    if (!row) throw new Error('Không tìm thấy cuộc hội thoại')

    const messageRows = this.db.prepare(`
      SELECT * FROM (
        SELECT id, thread_id, role, content, created_at FROM messages
        WHERE thread_id = ? ORDER BY created_at DESC LIMIT ?
      ) ORDER BY created_at ASC
    `).all(threadId, messageLimit) as MessageRow[]

    let canvasSnapshot: unknown | null = null
    if (row.canvas_snapshot) {
      try {
        canvasSnapshot = JSON.parse(row.canvas_snapshot)
      } catch {
        canvasSnapshot = null
      }
    }

    return { ...summaryFromRow(row), canvasSnapshot, messages: messageRows.map(messageFromRow) }
  }

  archiveThread(threadId: string): void {
    this.db.prepare("UPDATE conversation_threads SET status = 'archived', updated_at = ? WHERE id = ?").run(now(), threadId)
  }

  setThreadProvider(threadId: string, profileId: string): ThreadDetail {
    const profile = this.getProfile(profileId)
    this.db.prepare(`
      UPDATE conversation_threads SET provider_id = ?, model_id = ?, updated_at = ? WHERE id = ?
    `).run(profile.id, profile.modelId, now(), threadId)
    return this.getThread(threadId)
  }

  setThreadPhase(threadId: string, phase: WorkflowView): void {
    this.db.prepare('UPDATE conversation_threads SET phase = ?, updated_at = ? WHERE id = ?').run(phase, now(), threadId)
  }

  saveCanvas(threadId: string, snapshot: unknown): void {
    const payload = JSON.stringify(snapshot)
    this.db.prepare('UPDATE conversation_threads SET canvas_snapshot = ?, updated_at = ? WHERE id = ?').run(payload, now(), threadId)
  }

  addMessage(threadId: string, role: ChatMessage['role'], content: string): ChatMessage {
    const message: ChatMessage = { id: randomUUID(), threadId, role, content, createdAt: now() }
    const transaction = this.db.transaction(() => {
      this.db.prepare('INSERT INTO messages (id, thread_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(message.id, message.threadId, message.role, message.content, message.createdAt)
      const title = role === 'user'
        ? content.trim().replace(/\s+/g, ' ').slice(0, 54) || 'Ý tưởng chưa đặt tên'
        : null
      this.db.prepare(`
        UPDATE conversation_threads
        SET title = CASE WHEN title = 'Ý tưởng chưa đặt tên' AND ? IS NOT NULL THEN ? ELSE title END,
            updated_at = ?
        WHERE id = ?
      `).run(title, title, message.createdAt, threadId)
    })
    transaction()
    return message
  }

  recentMessages(threadId: string, limit = 16): ChatMessage[] {
    const rows = this.db.prepare(`
      SELECT * FROM (
        SELECT id, thread_id, role, content, created_at FROM messages
        WHERE thread_id = ? ORDER BY created_at DESC LIMIT ?
      ) ORDER BY created_at ASC
    `).all(threadId, limit) as MessageRow[]
    return rows.map(messageFromRow)
  }

  listProfiles(): Omit<ProviderProfile, 'hasCredential'>[] {
    const rows = this.db.prepare('SELECT * FROM provider_profiles WHERE enabled = 1 ORDER BY sort_order ASC').all() as ProfileRow[]
    return rows.map((row) => ({
      id: row.id,
      providerId: row.provider_id,
      displayName: row.display_name,
      modelId: row.model_id,
      costMode: row.cost_mode,
      enabled: Boolean(row.enabled),
    }))
  }

  getProfile(profileId: string): Omit<ProviderProfile, 'hasCredential'> {
    const profile = this.listProfiles().find((item) => item.id === profileId)
    if (!profile) throw new Error('Provider profile không tồn tại')
    return profile
  }

  configureProfile(profileId: string, modelId: string): Omit<ProviderProfile, 'hasCredential'> {
    const cleanModel = modelId.trim()
    if (!cleanModel) throw new Error('Model ID không được để trống')
    const result = this.db.prepare('UPDATE provider_profiles SET model_id = ? WHERE id = ?').run(cleanModel, profileId)
    if (result.changes !== 1) throw new Error('Provider profile không tồn tại')
    this.db.prepare('UPDATE conversation_threads SET model_id = ? WHERE provider_id = ?').run(cleanModel, profileId)
    return this.getProfile(profileId)
  }

  getActiveRemoteRef(threadId: string, profileId: string): string | null {
    const row = this.db.prepare(`
      SELECT remote_ref FROM provider_segments
      WHERE thread_id = ? AND profile_id = ? AND status = 'active'
      ORDER BY started_at DESC LIMIT 1
    `).get(threadId, profileId) as { remote_ref: string | null } | undefined
    return row?.remote_ref ?? null
  }

  saveProviderSegment(threadId: string, profileId: string, modelId: string, remoteRef: string | null): void {
    const timestamp = now()
    const active = this.db.prepare(`
      SELECT id FROM provider_segments WHERE thread_id = ? AND profile_id = ? AND status = 'active'
      ORDER BY started_at DESC LIMIT 1
    `).get(threadId, profileId) as { id: string } | undefined
    if (active) {
      this.db.prepare('UPDATE provider_segments SET remote_ref = ?, updated_at = ? WHERE id = ?').run(remoteRef, timestamp, active.id)
      return
    }
    this.db.prepare(`
      UPDATE provider_segments SET status = 'completed', updated_at = ? WHERE thread_id = ? AND status = 'active'
    `).run(timestamp, threadId)
    this.db.prepare(`
      INSERT INTO provider_segments (id, thread_id, profile_id, model_id, remote_ref, status, started_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(randomUUID(), threadId, profileId, modelId, remoteRef, timestamp, timestamp)
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_threads (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        phase TEXT NOT NULL,
        status TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        canvas_snapshot TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_threads_status_updated
        ON conversation_threads(status, updated_at DESC);

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES conversation_threads(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_thread_created
        ON messages(thread_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS provider_profiles (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        model_id TEXT NOT NULL,
        cost_mode TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS provider_segments (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES conversation_threads(id) ON DELETE CASCADE,
        profile_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        remote_ref TEXT,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_segments_thread_started
        ON provider_segments(thread_id, started_at DESC);
    `)
  }

  private seedProfiles(): void {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO provider_profiles
        (id, provider_id, display_name, model_id, cost_mode, enabled, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    const transaction = this.db.transaction(() => {
      defaultProfiles.forEach((profile, index) => {
        insert.run(profile.id, profile.providerId, profile.displayName, profile.modelId, profile.costMode, profile.enabled ? 1 : 0, index)
      })
    })
    transaction()
    this.db.prepare(`
      UPDATE provider_profiles SET model_id = 'gpt-5.5'
      WHERE id = 'codex-local' AND model_id = 'gpt-5.6-sol'
    `).run()
    this.db.prepare(`
      UPDATE conversation_threads SET model_id = 'gpt-5.5'
      WHERE provider_id = 'codex-local' AND model_id = 'gpt-5.6-sol'
    `).run()
  }

  private seedDemoThread(): void {
    const count = this.db.prepare('SELECT COUNT(*) AS count FROM conversation_threads').get() as { count: number }
    if (count.count > 0) return
    const thread = this.createThread()
    this.addMessage(thread.id, 'user', 'Mini App đặt suất ăn trước cho nhân viên, nhận tại pantry và thanh toán bằng ví nội bộ.')
    this.addMessage(thread.id, 'assistant', 'Mình đã dựng discovery map ban đầu. Hãy chọn một card hoặc yêu cầu thay đổi scope ngay trong chat.')
  }
}
