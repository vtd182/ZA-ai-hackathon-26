import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FigmaSession, FigmaSetupStatus } from '@pm-agent/domain'

interface RuntimeOverview {
  version?: string
  activeSession?: string
  connected?: boolean
  sessionCount?: number
  sessions?: FigmaSession[]
}

export interface FigmaRuntimeOptions {
  binaryPath: string
  manifestPath: string
  host?: string
  port?: number
}

export class FigmaRuntimeManager {
  private child: ChildProcessWithoutNullStreams | null = null
  private starting = false
  private lastError: string | null = null
  private readonly host: string
  private readonly port: number

  constructor(private readonly options: FigmaRuntimeOptions) {
    this.host = options.host ?? '127.0.0.1'
    this.port = options.port ?? 1802
  }

  get manifestPath(): string {
    return this.options.manifestPath
  }

  get controlPlaneUrl(): string {
    return `http://${this.host}:${this.port}/admin`
  }

  async status(): Promise<FigmaSetupStatus> {
    const overview = await this.readOverview()
    const binaryReady = existsSync(this.options.binaryPath)
    const pluginDirectory = dirname(this.options.manifestPath)
    const pluginBuilt = existsSync(this.options.manifestPath)
      && existsSync(join(pluginDirectory, 'dist', 'code.js'))
      && existsSync(join(pluginDirectory, 'dist', 'index.html'))

    if (overview) {
      return {
        runtime: 'ready',
        runtimeVersion: overview.version ?? null,
        binaryReady,
        pluginBuilt,
        pluginConnected: Boolean(overview.connected),
        sessionCount: overview.sessionCount ?? 0,
        activeSession: overview.activeSession || null,
        sessions: overview.sessions ?? [],
        target: null,
        designSystem: null,
        manifestPath: this.options.manifestPath,
        controlPlaneUrl: this.controlPlaneUrl,
        detail: overview.connected ? 'Figma plugin đã kết nối runtime local.' : 'Runtime sẵn sàng; đang chờ Figma plugin.',
      }
    }

    const runtime = this.starting ? 'starting' : this.lastError ? 'error' : binaryReady ? 'stopped' : 'missing'
    return {
      runtime,
      runtimeVersion: null,
      binaryReady,
      pluginBuilt,
      pluginConnected: false,
      sessionCount: 0,
      activeSession: null,
      sessions: [],
      target: null,
      designSystem: null,
      manifestPath: this.options.manifestPath,
      controlPlaneUrl: this.controlPlaneUrl,
      detail: this.lastError ?? (binaryReady ? 'Runtime chưa chạy.' : 'Chưa build Figma runtime cho máy này.'),
    }
  }

  async start(): Promise<FigmaSetupStatus> {
    const current = await this.status()
    if (current.runtime === 'ready' || this.starting) return current
    if (!current.binaryReady) return current

    this.starting = true
    this.lastError = null
    try {
      this.child = spawn(this.options.binaryPath, ['--ip', this.host, '--port', String(this.port)], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ZA_LOG_LEVEL: 'warn', ZA_LOG_FORMAT: 'text' },
      })
      this.child.stderr.setEncoding('utf8')
      this.child.stderr.on('data', (chunk: string) => {
        const line = chunk.trim().split('\n').at(-1)
        if (line) this.lastError = line.slice(0, 400)
      })
      this.child.once('exit', (code) => {
        if (code && code !== 0) this.lastError = `Figma runtime exited with code ${code}`
        this.child = null
      })
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        const status = await this.status()
        if (status.runtime === 'ready') return status
      }
      this.lastError = 'Figma runtime không phản hồi sau 3 giây.'
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Không thể khởi động Figma runtime.'
    } finally {
      this.starting = false
    }
    return this.status()
  }

  stop(): void {
    this.child?.kill('SIGTERM')
    this.child = null
  }

  private async readOverview(): Promise<RuntimeOverview | null> {
    try {
      const response = await fetch(`http://${this.host}:${this.port}/admin/overview`, {
        signal: AbortSignal.timeout(600),
      })
      if (!response.ok) return null
      return await response.json() as RuntimeOverview
    } catch {
      return null
    }
  }
}
