import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import type {
  ChatMessage,
  HandoffPackage,
  ProviderCapabilities,
  ProviderProfile,
  ProviderEvent,
  ThreadDetail,
  ThreadSummary,
  MessagePage,
  WorkflowView,
} from '@pm-agent/domain'
import { providerCapabilitiesSchema } from '@pm-agent/domain'
import { applyCoreMigrations } from './migrations'

export { LifecycleStore } from './lifecycle-store'
export { FigmaIntegrationStore } from './figma-integration-store'
export { OutboxStore } from './outbox-store'
export { CORE_MIGRATION_IDS } from './migrations'

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

export interface PersistedTurn {
  id: string
  threadId: string
  schemaVersion: 1
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  inputText: string
  startedAt: string
  completedAt: string | null
  events: ProviderEvent[]
}

const defaultProfiles: Omit<ProviderProfile, 'hasCredential'>[] = [
  { id: 'mock-local', providerId: 'mock', displayName: 'Mock · Offline', modelId: 'deterministic-v1', costMode: 'mock', enabled: true },
  { id: 'codex-local', providerId: 'codex', displayName: 'Codex · Local login', modelId: 'gpt-5.5', costMode: 'subscription', enabled: true },
  { id: 'openai-api', providerId: 'openai', displayName: 'OpenAI API', modelId: 'gpt-5.6-sol', costMode: 'api_paid', enabled: true },
  { id: 'gemini-api', providerId: 'gemini', displayName: 'Gemini API', modelId: 'gemini-3-flash-preview', costMode: 'api_paid', enabled: true },
  { id: 'anthropic-api', providerId: 'anthropic', displayName: 'Claude API', modelId: 'claude-sonnet-4-6', costMode: 'api_paid', enabled: true },
  { id: 'agentrouter-api', providerId: 'agentrouter', displayName: 'AgentRouter', modelId: 'claude-opus-4-8', costMode: 'api_paid', enabled: true },
]

export const DEMO_FIXTURE_VERSION = 1 as const
export const DEMO_THREAD_ID = 'demo:meal-ordering:v1'
const DEMO_CREATED_AT = '2026-07-22T03:00:00.000Z'
const DEMO_MESSAGES = [
  {
    id: 'demo:meal-ordering:v1:message:idea',
    role: 'user' as const,
    content: 'Mini App đặt suất ăn trước cho nhân viên, nhận tại pantry và thanh toán bằng ví nội bộ.',
    createdAt: '2026-07-22T03:00:01.000Z',
  },
  {
    id: 'demo:meal-ordering:v1:message:discovery',
    role: 'assistant' as const,
    content: 'Mình đã dựng discovery map ban đầu. Hãy chọn một card hoặc yêu cầu thay đổi scope ngay trong chat.',
    createdAt: '2026-07-22T03:00:02.000Z',
  },
] as const

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

function ftsQuery(value: string): string {
  return value.trim().split(/\s+/).filter(Boolean).map((term) => `"${term.replaceAll('"', '""')}"*`).join(' AND ')
}

function encodeMessageCursor(row: MessageRow): string {
  return Buffer.from(JSON.stringify([row.created_at, row.id]), 'utf8').toString('base64url')
}

function decodeMessageCursor(cursor: string): [string, string] {
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown
    if (!Array.isArray(value) || value.length !== 2 || value.some((item) => typeof item !== 'string')) throw new Error()
    return value as [string, string]
  } catch {
    throw new Error('Invalid message cursor')
  }
}

export class HistoryStore {
  private readonly db: Database.Database

  constructor(filename: string) {
    this.db = new Database(filename)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.migrate()
    applyCoreMigrations(this.db)
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
            SELECT 1 FROM messages_fts f WHERE f.thread_id = t.id AND messages_fts MATCH @fts
          ))
          ORDER BY t.updated_at DESC LIMIT @limit
        `).all({ query: `%${normalized}%`, fts: ftsQuery(normalized), limit }) as ThreadRow[]
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
    // Reuse an untouched thread instead of spamming empty ones: if an active thread
    // already has no messages and a blank canvas, "new conversation" just focuses it.
    const reusable = this.db.prepare(`
      SELECT t.id FROM conversation_threads t
      WHERE t.status = 'active'
        AND t.canvas_snapshot IS NULL
        AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.thread_id = t.id)
      ORDER BY t.created_at DESC LIMIT 1
    `).get() as { id: string } | undefined
    if (reusable) return this.getThread(reusable.id)

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

    const messagePage = this.listMessagesPage(threadId, undefined, messageLimit)

    let canvasSnapshot: unknown | null = null
    if (row.canvas_snapshot) {
      try {
        canvasSnapshot = JSON.parse(row.canvas_snapshot)
      } catch {
        canvasSnapshot = null
      }
    }

    return { ...summaryFromRow(row), canvasSnapshot, messages: messagePage.items, messageNextCursor: messagePage.nextCursor }
  }

  listMessagesPage(threadId: string, cursor?: string, requestedLimit = 50): MessagePage {
    const limit = Math.max(1, Math.min(100, requestedLimit))
    const boundary = cursor ? decodeMessageCursor(cursor) : null
    const rows = this.db.prepare(`
      SELECT id, thread_id, role, content, created_at FROM messages
      WHERE thread_id = @threadId
        AND (@cursorAt IS NULL OR created_at < @cursorAt OR (created_at = @cursorAt AND id < @cursorId))
      ORDER BY created_at DESC, id DESC LIMIT @limit
    `).all({
      threadId,
      cursorAt: boundary?.[0] ?? null,
      cursorId: boundary?.[1] ?? null,
      limit: limit + 1,
    }) as MessageRow[]
    const hasMore = rows.length > limit
    const pageRows = rows.slice(0, limit)
    return {
      items: pageRows.map(messageFromRow).reverse(),
      nextCursor: hasMore && pageRows.length > 0 ? encodeMessageCursor(pageRows.at(-1)!) : null,
    }
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

  switchThreadProvider(
    threadId: string,
    profileId: string,
    capabilities: ProviderCapabilities,
    handoff: HandoffPackage,
  ): ThreadDetail {
    const profile = this.getProfile(profileId)
    if (handoff.threadId !== threadId || handoff.to.profileId !== profileId || handoff.to.modelId !== profile.modelId) {
      throw new Error('Provider handoff does not match target profile')
    }
    const timestamp = now()
    const transaction = this.db.transaction(() => {
      this.db.prepare(`
        UPDATE provider_segments SET status = 'completed', updated_at = ?
        WHERE thread_id = ? AND status = 'active'
      `).run(timestamp, threadId)
      this.db.prepare(`
        INSERT INTO provider_segments (
          id, thread_id, profile_id, model_id, remote_ref, capability_json, handoff_json, status, started_at, updated_at
        ) VALUES (?, ?, ?, ?, NULL, ?, ?, 'active', ?, ?)
      `).run(randomUUID(), threadId, profile.id, profile.modelId, JSON.stringify(capabilities), JSON.stringify(handoff), timestamp, timestamp)
      this.db.prepare(`
        UPDATE conversation_threads SET provider_id = ?, model_id = ?, updated_at = ? WHERE id = ?
      `).run(profile.id, profile.modelId, timestamp, threadId)
    })
    transaction()
    return this.getThread(threadId)
  }

  setThreadPhase(threadId: string, phase: WorkflowView): void {
    this.db.prepare('UPDATE conversation_threads SET phase = ?, updated_at = ? WHERE id = ?').run(phase, now(), threadId)
  }

  saveCanvas(threadId: string, snapshot: unknown): void {
    const payload = JSON.stringify(snapshot)
    const timestamp = now()
    const documentId = `canvas:${threadId}`
    this.db.transaction(() => {
      this.db.prepare('UPDATE conversation_threads SET canvas_snapshot = ?, updated_at = ? WHERE id = ?').run(payload, timestamp, threadId)
      this.db.prepare(`
        INSERT INTO canvas_documents (id, thread_id, schema_version, created_at, updated_at)
        VALUES (?, ?, 1, ?, ?)
        ON CONFLICT(thread_id) DO UPDATE SET updated_at = excluded.updated_at
      `).run(documentId, threadId, timestamp, timestamp)
      this.db.prepare('INSERT INTO canvas_checkpoints (document_id, schema_version, snapshot_json, created_at) VALUES (?, 1, ?, ?)')
        .run(documentId, payload, timestamp)
    })()
  }

  getLatestCanvasCheckpoint(threadId: string): unknown | null {
    const row = this.db.prepare(`
      SELECT c.snapshot_json FROM canvas_checkpoints c
      JOIN canvas_documents d ON d.id = c.document_id
      WHERE d.thread_id = ? ORDER BY c.id DESC LIMIT 1
    `).get(threadId) as { snapshot_json: string } | undefined
    return row ? JSON.parse(row.snapshot_json) : null
  }

  addMessage(threadId: string, role: ChatMessage['role'], content: string): ChatMessage {
    const message: ChatMessage = { id: randomUUID(), threadId, role, content, createdAt: now() }
    const transaction = this.db.transaction(() => {
      this.db.prepare('INSERT INTO messages (id, thread_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(message.id, message.threadId, message.role, message.content, message.createdAt)
      this.db.prepare(`
        INSERT INTO message_parts (id, message_id, schema_version, part_type, content_json, created_at)
        VALUES (?, ?, 1, 'text', ?, ?)
      `).run(`part:${message.id}:text`, message.id, JSON.stringify({ text: content }), message.createdAt)
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

  startTurn(threadId: string, inputText: string, startedAt = now()): string {
    const id = randomUUID()
    this.db.prepare(`
      INSERT INTO conversation_turns (id, thread_id, schema_version, status, input_text, started_at, completed_at)
      VALUES (?, ?, 1, 'running', ?, ?, NULL)
    `).run(id, threadId, inputText, startedAt)
    return id
  }

  completeTurn(turnId: string, status: Exclude<PersistedTurn['status'], 'running'>, events: ProviderEvent[], completedAt = now()): void {
    this.db.transaction(() => {
      const result = this.db.prepare('UPDATE conversation_turns SET status = ?, completed_at = ? WHERE id = ? AND status = ?')
        .run(status, completedAt, turnId, 'running')
      if (result.changes !== 1) throw new Error(`Turn is not running: ${turnId}`)
      const insert = this.db.prepare(`
        INSERT INTO provider_events (turn_id, sequence, schema_version, event_type, event_json, created_at)
        VALUES (?, ?, 1, ?, ?, ?)
      `)
      for (const event of events) insert.run(turnId, event.sequence, event.type, JSON.stringify(event), event.at)
    })()
  }

  getTurn(turnId: string): PersistedTurn | null {
    const row = this.db.prepare(`
      SELECT id, thread_id, schema_version, status, input_text, started_at, completed_at FROM conversation_turns WHERE id = ?
    `).get(turnId) as {
      id: string; thread_id: string; schema_version: number; status: PersistedTurn['status']; input_text: string; started_at: string; completed_at: string | null
    } | undefined
    if (!row) return null
    const events = this.db.prepare('SELECT event_json FROM provider_events WHERE turn_id = ? ORDER BY sequence').all(turnId) as Array<{ event_json: string }>
    return {
      id: row.id,
      threadId: row.thread_id,
      schemaVersion: 1,
      status: row.status,
      inputText: row.input_text,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      events: events.map((event) => JSON.parse(event.event_json) as ProviderEvent),
    }
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

  allMessages(threadId: string, limit = 10_000): ChatMessage[] {
    const rows = this.db.prepare(`
      SELECT id, thread_id, role, content, created_at FROM messages
      WHERE thread_id = ? ORDER BY rowid ASC LIMIT ?
    `).all(threadId, Math.max(1, Math.min(10_000, limit))) as MessageRow[]
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

  resetDemoWorkspace(): ThreadDetail {
    const transaction = this.db.transaction(() => {
      this.db.prepare('DELETE FROM conversation_threads').run()
      this.insertDemoThread()
    })
    transaction()
    return this.getThread(DEMO_THREAD_ID)
  }

  getActiveRemoteRef(threadId: string, profileId: string): string | null {
    const row = this.db.prepare(`
      SELECT remote_ref FROM provider_segments
      WHERE thread_id = ? AND profile_id = ? AND status = 'active'
      ORDER BY started_at DESC LIMIT 1
    `).get(threadId, profileId) as { remote_ref: string | null } | undefined
    return row?.remote_ref ?? null
  }

  getActiveProviderHandoff(threadId: string): { capabilities: ProviderCapabilities; handoff: HandoffPackage } | null {
    const row = this.db.prepare(`
      SELECT capability_json, handoff_json FROM provider_segments
      WHERE thread_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1
    `).get(threadId) as { capability_json: string | null; handoff_json: string | null } | undefined
    if (!row?.capability_json || !row.handoff_json) return null
    return {
      capabilities: providerCapabilitiesSchema.parse(JSON.parse(row.capability_json)),
      handoff: JSON.parse(row.handoff_json) as HandoffPackage,
    }
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
        capability_json TEXT,
        handoff_json TEXT,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_segments_thread_started
        ON provider_segments(thread_id, started_at DESC);
    `)
    const columns = this.db.prepare('PRAGMA table_info(provider_segments)').all() as Array<{ name: string }>
    if (!columns.some((column) => column.name === 'capability_json')) this.db.exec('ALTER TABLE provider_segments ADD COLUMN capability_json TEXT')
    if (!columns.some((column) => column.name === 'handoff_json')) this.db.exec('ALTER TABLE provider_segments ADD COLUMN handoff_json TEXT')
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
    // Migrate the AgentRouter default model to claude-opus-4-8 for DBs seeded with the old gpt-5.
    this.db.prepare(`
      UPDATE provider_profiles SET model_id = 'claude-opus-4-8'
      WHERE id = 'agentrouter-api' AND model_id = 'gpt-5'
    `).run()
  }

  private seedDemoThread(): void {
    const count = this.db.prepare('SELECT COUNT(*) AS count FROM conversation_threads').get() as { count: number }
    if (count.count > 0) return
    this.insertDemoThread()
  }

  private insertDemoThread(): void {
    const profile = this.getProfile('mock-local')
    this.db.prepare(`
      INSERT INTO conversation_threads (
        id, title, phase, status, provider_id, model_id, canvas_snapshot, created_at, updated_at
      ) VALUES (?, ?, 'discover', 'active', ?, ?, NULL, ?, ?)
    `).run(
      DEMO_THREAD_ID,
      'Mini App đặt suất ăn trước cho nhân viên',
      profile.id,
      profile.modelId,
      DEMO_CREATED_AT,
      DEMO_MESSAGES.at(-1)!.createdAt,
    )
    const insertMessage = this.db.prepare('INSERT INTO messages (id, thread_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
    for (const message of DEMO_MESSAGES) {
      insertMessage.run(message.id, DEMO_THREAD_ID, message.role, message.content, message.createdAt)
      this.db.prepare(`
        INSERT INTO message_parts (id, message_id, schema_version, part_type, content_json, created_at)
        VALUES (?, ?, 1, 'text', ?, ?)
      `).run(`part:${message.id}:text`, message.id, JSON.stringify({ text: message.content }), message.createdAt)
    }
  }
}
