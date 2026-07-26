import vm from 'node:vm'
import { canvasOperationSchema, type CanvasOperation } from '@pm-agent/domain'

/**
 * Runs REAL developer JavaScript for the guarded Canvas Bridge in an isolated Node vm
 * sandbox and returns the canvas operations it produced. Unlike the renderer's bounded
 * string interpreter, this supports full JS — loops, variables, functions, Math — so an
 * agent can generate scenes programmatically ("unlimited creativity"), yet the sandbox
 * exposes ONLY a `canvas` builder plus pure computation globals. It has no require,
 * process, fetch, filesystem, network or Electron access, and the ONLY side effect is the
 * list of validated operations forwarded to the renderer. This mirrors the tldraw skill's
 * `/exec` model while keeping the CSP-locked renderer untouched.
 */

const MAX_OPERATIONS = 200

export function runCanvasScriptVm(source: string): CanvasOperation[] {
  if (source.length > 20_000) throw new Error('Canvas script quá dài (>20k ký tự)')
  const raw: unknown[] = []
  const push = (op: unknown): void => {
    if (raw.length >= MAX_OPERATIONS) throw new Error(`Canvas script vượt ${MAX_OPERATIONS} operations`)
    raw.push(op)
  }

  const clean = <T extends Record<string, unknown>>(value: unknown): T =>
    (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as T

  const canvas = {
    // Semantic workflow node with optional { x, y, kind, tone, color, badge, lane, icon, description }.
    node(id: unknown, label: unknown, kind: unknown = 'process', opts: unknown = {}): void {
      push({ op: 'create_node', id: String(id), label: String(label), kind: String(kind), ...clean(opts) })
    },
    connect(id: unknown, fromId: unknown, toId: unknown, label?: unknown): void {
      push({ op: 'connect', id: String(id), fromId: String(fromId), toId: String(toId), ...(label ? { label: String(label) } : {}) })
    },
    update(id: unknown, opts: unknown = {}): void {
      push({ op: 'update', id: String(id), ...clean(opts) })
    },
    remove(id: unknown): void {
      push({ op: 'delete', id: String(id) })
    },
  }

  // A frozen context: the script sees only `canvas` + pure computation. No require/process/
  // globalThis/fetch/fs — they are simply absent from the context.
  const context = vm.createContext(Object.freeze({
    canvas,
    Math, JSON, Array, Object, Number, String, Boolean,
    isFinite, isNaN, parseInt, parseFloat,
  }))

  let compiled: vm.Script
  try {
    compiled = new vm.Script(source, { filename: 'canvas-script.js' })
  } catch (error) {
    throw new Error(`Canvas script lỗi cú pháp: ${error instanceof Error ? error.message : String(error)}`)
  }
  try {
    compiled.runInContext(context, { timeout: 1_500, breakOnSigint: true })
  } catch (error) {
    throw new Error(`Canvas script lỗi khi chạy: ${error instanceof Error ? error.message : String(error)}`)
  }

  return canvasOperationSchema.array().max(MAX_OPERATIONS).parse(raw) as CanvasOperation[]
}
