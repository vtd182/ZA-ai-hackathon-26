export type SlashCommand =
  | { kind: 'help' }
  | { kind: 'figma_prepare' }
  | { kind: 'figma_approve' }
  | { kind: 'figma_create' }
  | { kind: 'figma_status' }
  | { kind: 'figma_retry' }
  | { kind: 'canvas_flow'; prompt: string }
  | { kind: 'canvas_prototype'; prompt: string }
  | { kind: 'canvas_diagram'; diagram: 'sequence' | 'state' | 'mindmap' | 'er'; prompt: string }
  | { kind: 'studio_explore'; prompt: string }
  | { kind: 'studio_critique'; prompt: string }
  | { kind: 'studio_sketch'; prompt: string }
  | { kind: 'studio_refine'; prompt: string }
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
    if (action === 'sequence') return { kind: 'canvas_diagram', diagram: 'sequence', prompt }
    if (action === 'state') return { kind: 'canvas_diagram', diagram: 'state', prompt }
    if (action === 'mindmap') return { kind: 'canvas_diagram', diagram: 'mindmap', prompt }
    if (action === 'er') return { kind: 'canvas_diagram', diagram: 'er', prompt }
  }
  if (namespace === '/studio') {
    if (action === 'explore') return { kind: 'studio_explore', prompt }
    if (action === 'critique') return { kind: 'studio_critique', prompt }
    if (action === 'sketch') return { kind: 'studio_sketch', prompt }
    if (action === 'refine') return { kind: 'studio_refine', prompt }
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
    '/canvas sequence — sequence diagram (actor: Người dùng / OA-Bot / Backend)',
    '/canvas state — state machine (vòng đời + transition)',
    '/canvas mindmap — mind map phân rã tính năng',
    '/canvas er — ER data model của Mini App',
    '/studio explore [chủ đề] — cùng mở rộng ý tưởng, không tự vẽ',
    '/studio critique [chủ đề] — phản biện ý tưởng hoặc vùng chọn, không tự sửa',
    '/studio sketch [mô tả] — phác trực quan khi bạn yêu cầu',
    '/studio refine [mô tả] — sửa đúng vùng canvas đang chọn',
  ].join('\n')
}
