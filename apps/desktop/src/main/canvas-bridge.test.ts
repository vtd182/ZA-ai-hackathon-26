import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CanvasBridge } from './canvas-bridge'

describe('CanvasBridge', () => {
  const homes: string[] = []
  afterEach(() => homes.splice(0).forEach((home) => rmSync(home, { recursive: true, force: true })))

  it('requires its per-launch token and dispatches validated semantic commands', async () => {
    const home = mkdtempSync(join(tmpdir(), 'pm-canvas-bridge-'))
    homes.push(home)
    const dispatched: unknown[] = []
    const thread = {
      id: 'THREAD-1', title: 'Flow', phase: 'discover' as const, status: 'active' as const,
      providerId: 'mock', modelId: 'deterministic-v1', updatedAt: '2026-07-23T00:00:00.000Z',
      lastMessage: null, canvasSnapshot: null, messages: [], messageNextCursor: null,
    }
    const bridge = new CanvasBridge({
      homePath: home,
      listThreads: () => [thread],
      getThread: () => thread,
      dispatch: (threadId, commands) => dispatched.push({ threadId, commands }),
    })
    await bridge.start()
    try {
      const descriptor = JSON.parse(readFileSync(join(home, '.pm-lifecycle-agent', 'canvas-bridge.json'), 'utf8')) as { port: number; token: string }
      const base = `http://127.0.0.1:${descriptor.port}`
      expect((await fetch(`${base}/api/threads`)).status).toBe(401)
      const response = await fetch(`${base}/api/threads/THREAD-1/commands`, {
        method: 'POST',
        headers: { authorization: `Bearer ${descriptor.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ commands: [
          { type: 'create_canvas_node', nodeId: 'start', label: 'Start', nodeKind: 'process' },
          { type: 'create_canvas_node', nodeId: 'done', label: 'Done', nodeKind: 'screen' },
          { type: 'connect_canvas_nodes', fromId: 'start', toId: 'done' },
        ] }),
      })
      expect(response.status).toBe(202)
      expect(dispatched).toHaveLength(1)
    } finally {
      bridge.stop()
    }
  })
})
