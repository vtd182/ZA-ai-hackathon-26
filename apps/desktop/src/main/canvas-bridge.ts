import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { canvasProgramSchema, providerCommandSchema, type CanvasExecutionReceipt, type CanvasProgram, type ProviderCommand, type ThreadDetail, type ThreadSummary } from '@pm-agent/domain'

interface CanvasBridgeOptions {
  homePath: string
  listThreads(): ThreadSummary[]
  getThread(threadId: string): ThreadDetail
  dispatch(threadId: string, commands: ProviderCommand[]): void
  dispatchProgram(threadId: string, batchId: number, program: CanvasProgram): void
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(value))
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 128 * 1024) throw new Error('Request body exceeds 128 KiB')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export class CanvasBridge {
  private readonly token = randomBytes(32).toString('base64url')
  private readonly descriptorPath: string
  private server: Server | null = null
  private readonly pending = new Map<number, (receipt: CanvasExecutionReceipt) => void>()

  constructor(private readonly options: CanvasBridgeOptions) {
    this.descriptorPath = join(options.homePath, '.pm-lifecycle-agent', 'canvas-bridge.json')
  }

  async start(): Promise<void> {
    if (this.server) return
    this.server = createServer((request, response) => void this.handle(request, response))
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(0, '127.0.0.1', () => resolve())
    })
    const address = this.server.address()
    if (!address || typeof address === 'string') throw new Error('Canvas Bridge failed to bind a loopback port')
    mkdirSync(join(this.options.homePath, '.pm-lifecycle-agent'), { recursive: true, mode: 0o700 })
    writeFileSync(this.descriptorPath, JSON.stringify({
      schemaVersion: 1,
      port: address.port,
      token: this.token,
      pid: process.pid,
      startedAt: new Date().toISOString(),
    }), { mode: 0o600 })
  }

  get status(): { running: boolean; port: number | null } {
    const address = this.server?.address()
    const port = address && typeof address !== 'string' ? address.port : null
    return { running: Boolean(this.server) && port !== null, port }
  }

  stop(): void {
    this.server?.close()
    this.server = null
    try {
      unlinkSync(this.descriptorPath)
    } catch {
      // A missing descriptor only means the previous shutdown already cleaned it up.
    }
  }

  acknowledge(receipt: CanvasExecutionReceipt): void {
    if (receipt.batchId === undefined) return
    this.pending.get(receipt.batchId)?.(receipt)
    this.pending.delete(receipt.batchId)
  }

  private waitForReceipt(batchId: number): Promise<CanvasExecutionReceipt | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(batchId)
        resolve(null)
      }, 5_000)
      this.pending.set(batchId, (receipt) => {
        clearTimeout(timer)
        resolve(receipt)
      })
    })
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (request.method === 'GET' && url.pathname === '/') {
        sendJson(response, 200, { name: 'PM Lifecycle Canvas Bridge', schemaVersion: 1, authenticated: false })
        return
      }
      if (request.headers.authorization !== `Bearer ${this.token}`) {
        sendJson(response, 401, { error: 'unauthorized' })
        return
      }
      if (request.method === 'GET' && url.pathname === '/api/threads') {
        sendJson(response, 200, { threads: this.options.listThreads() })
        return
      }
      const canvasMatch = url.pathname.match(/^\/api\/threads\/([^/]+)\/canvas$/)
      if (request.method === 'GET' && canvasMatch) {
        const thread = this.options.getThread(decodeURIComponent(canvasMatch[1]!))
        sendJson(response, 200, {
          thread: { id: thread.id, title: thread.title, phase: thread.phase, updatedAt: thread.updatedAt },
          snapshot: thread.canvasSnapshot,
        })
        return
      }
      const commandMatch = url.pathname.match(/^\/api\/threads\/([^/]+)\/commands$/)
      if (request.method === 'POST' && commandMatch) {
        const threadId = decodeURIComponent(commandMatch[1]!)
        this.options.getThread(threadId)
        const payload = await readJson(request) as { commands?: unknown }
        const commands = providerCommandSchema.array().min(1).max(100).parse(payload.commands)
        this.options.dispatch(threadId, commands)
        sendJson(response, 202, { accepted: commands.length, threadId })
        return
      }
      const programMatch = url.pathname.match(/^\/api\/threads\/([^/]+)\/(programs|scripts)$/)
      if (request.method === 'POST' && programMatch) {
        const threadId = decodeURIComponent(programMatch[1]!)
        this.options.getThread(threadId)
        const payload = await readJson(request) as { program?: unknown; script?: unknown }
        const program = programMatch[2] === 'scripts'
          ? canvasProgramSchema.parse({ schemaVersion: 1, mode: 'script', summary: 'Developer canvas script', operations: [], script: payload.script })
          : canvasProgramSchema.parse(payload.program)
        const batchId = Date.now()
        const receiptPromise = this.waitForReceipt(batchId)
        this.options.dispatchProgram(threadId, batchId, program)
        const receipt = await receiptPromise
        sendJson(response, receipt ? 200 : 202, receipt ?? { accepted: program.mode === 'operations' ? program.operations.length : 1, threadId, batchId, acknowledgement: 'pending' })
        return
      }
      sendJson(response, 404, { error: 'not_found' })
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : 'invalid_request' })
    }
  }
}
