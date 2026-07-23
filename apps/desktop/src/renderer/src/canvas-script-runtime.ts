import { canvasOperationSchema, type CanvasOperation } from '@pm-agent/domain'

const blockedCapability = /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|require|process|electron|ipcRenderer|window|document|navigator|localStorage|indexedDB|globalThis|self|Function|eval|constructor|prototype|__proto__)\b/

export async function runCanvasScript(source: string): Promise<CanvasOperation[]> {
  if (blockedCapability.test(source)) throw new Error('Canvas script yêu cầu capability không được phép')
  if (typeof Worker === 'undefined') throw new Error('Canvas script worker không khả dụng')

  const workerSource = `
const splitTopLevel = (value, delimiter) => {
  const parts = []; let start = 0; let depth = 0; let quote = null; let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (escaped) { escaped = false; continue; }
    if (char === '\\\\') { escaped = true; continue; }
    if (quote) { if (char === quote) quote = null; continue; }
    if (char === '\"' || char === "'") { quote = char; continue; }
    if (char === '(' || char === '{' || char === '[') depth += 1;
    if (char === ')' || char === '}' || char === ']') depth -= 1;
    if (depth === 0 && (char === delimiter || (delimiter === ';' && char === '\\n'))) { parts.push(value.slice(start, index)); start = index + 1; }
  }
  parts.push(value.slice(start)); return parts.map((part) => part.trim()).filter(Boolean);
};
const parseArg = (token) => {
  const value = token.trim();
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/\\\\'/g, "'").replace(/\\\\n/g, '\\n');
  if (value.startsWith('\"') || value.startsWith('{') || value.startsWith('[')) return JSON.parse(value);
  if (/^-?\\d+(?:\\.\\d+)?$/.test(value)) return Number(value);
  if (value === 'true') return true; if (value === 'false') return false; if (value === 'null') return null;
  throw new Error('Canvas script arguments must be string, number, boolean, null or JSON');
};
self.onmessage = ({ data }) => {
  try {
    const operations = [];
    for (const statement of splitTopLevel(data, ';')) {
      const match = statement.match(/^canvas\\.(node|connect|update|remove)\\(([\\s\\S]*)\\)$/);
      if (!match) throw new Error('Only canvas.node/connect/update/remove calls are allowed');
      const args = splitTopLevel(match[2], ',').map(parseArg);
      if (match[1] === 'node') operations.push({ op: 'create_node', id: args[0], label: args[1], kind: args[2] ?? 'process', ...(args[3] ?? {}) });
      if (match[1] === 'connect') operations.push({ op: 'connect', id: args[0], fromId: args[1], toId: args[2], ...(args[3] ? { label: args[3] } : {}) });
      if (match[1] === 'update') operations.push({ op: 'update', id: args[0], ...(args[1] ?? {}) });
      if (match[1] === 'remove') operations.push({ op: 'delete', id: args[0] });
      if (operations.length > 200) throw new Error('Canvas script exceeds 200 operations');
    }
    self.postMessage({ operations });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }); }
};`
  const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }))
  const worker = new Worker(url)
  try {
    const result = await new Promise<{ operations?: unknown; error?: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Canvas script timeout sau 1000ms')), 1_000)
      worker.onmessage = (event: MessageEvent<{ operations?: unknown; error?: string }>) => {
        clearTimeout(timer)
        resolve(event.data)
      }
      worker.onerror = (event) => {
        clearTimeout(timer)
        reject(new Error(event.message || 'Canvas script worker failed'))
      }
      worker.postMessage(source)
    })
    if (result.error) throw new Error(result.error)
    return canvasOperationSchema.array().max(200).parse(result.operations)
  } finally {
    worker.terminate()
    URL.revokeObjectURL(url)
  }
}
