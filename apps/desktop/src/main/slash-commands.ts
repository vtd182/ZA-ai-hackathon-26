export type SlashCommand =
  | { kind: 'help' }
  | { kind: 'figma_prepare' }
  | { kind: 'figma_approve' }
  | { kind: 'figma_create' }
  | { kind: 'figma_status' }
  | { kind: 'figma_retry' }
  | { kind: 'canvas_flow'; prompt: string }
  | { kind: 'canvas_prototype'; prompt: string }
  | { kind: 'invalid'; command: string }

export function parseSlashCommand(input: string): SlashCommand | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) return null
  const [namespace = '', action = '', ...rest] = trimmed.split(/\s+/)
  const prompt = rest.join(' ').trim()

  if (namespace === '/help') return { kind: 'help' }
  if (namespace === '/figma' || namespace === '/artifact') {
    if (!action || action === 'help') return { kind: 'help' }
    if (action === 'prepare' || action === 'plan') return { kind: 'figma_prepare' }
    if (action === 'approve') return { kind: 'figma_approve' }
    if (action === 'create' || action === 'run') return { kind: 'figma_create' }
    if (action === 'status') return { kind: 'figma_status' }
    if (action === 'retry') return { kind: 'figma_retry' }
  }
  if (namespace === '/canvas') {
    if (action === 'flow') return { kind: 'canvas_flow', prompt }
    if (action === 'prototype') return { kind: 'canvas_prototype', prompt }
  }
  return { kind: 'invalid', command: [namespace, action].filter(Boolean).join(' ') }
}

export function slashHelpMessage(): string {
  return [
    'Slash commands khả dụng:',
    '/figma prepare — tạo và kiểm tra immutable plan, chưa write',
    '/figma approve — duyệt plan đang chờ và tạo artifact',
    '/figma create — prepare nếu chưa có plan, nếu có thì approve và tạo',
    '/figma status — kiểm tra plugin, allowlisted target và execution',
    '/figma retry — retry riêng Figma sau lỗi',
    '/canvas flow [mô tả] — ép tạo user flow trên canvas',
    '/canvas prototype [mô tả] — ép tạo prototype trên canvas',
  ].join('\n')
}
