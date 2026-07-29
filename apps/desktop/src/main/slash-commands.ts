export type SlashCommand =
  | { kind: 'help' }
  | { kind: 'figma_prepare' }
  | { kind: 'figma_approve' }
  | { kind: 'figma_create' }
  | { kind: 'figma_status' }
  | { kind: 'figma_retry' }
  | { kind: 'figma_regenerate' }
  | { kind: 'figma_refine'; prompt: string }
  | { kind: 'spec_confirm' }
  | { kind: 'change_remove'; query: string }
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
    if (action === 'regenerate' || action === 'regen') return { kind: 'figma_regenerate' }
    if (action === 'refine') return { kind: 'figma_refine', prompt }
  }
  if (namespace === '/spec' || namespace === '/productspec') {
    if (action === 'confirm' || action === 'approve' || action === 'chot') return { kind: 'spec_confirm' }
  }
  if (namespace === '/change' || namespace === '/scope') {
    if (action === 'remove' || action === 'drop' || action === 'bo' || action === 'xoa') return { kind: 'change_remove', query: prompt }
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
    'Slash commands (gõ `/` để mở menu):',
    '',
    '◆ FIGMA — kickoff artifact (Figma + PRD + backlog)',
    '  /figma prepare — tạo & kiểm tra immutable plan, chưa write',
    '  /figma approve — duyệt plan đang chờ và tạo artifact',
    '  /figma create — prepare nếu chưa có plan, có thì approve, write và read-back',
    '  /figma regenerate — tạo lại một bản thiết kế mới (giữ bản cũ)',
    '  /figma refine [feedback] — agent sửa bản Figma hiện tại theo feedback',
    '  /figma retry — retry riêng Figma sau lỗi',
    '  /figma status — plugin, target đã allowlist và trạng thái execution',
    '',
    '◆ CANVAS — vẽ sơ đồ trên canvas',
    '  /canvas flow [mô tả] — user flow',
    '  /canvas prototype [mô tả] — prototype màn hình',
    '  /canvas sequence — sequence (Người dùng / OA-Bot / Backend)',
    '  /canvas state — state machine (vòng đời + transition)',
    '  /canvas mindmap — mind map phân rã tính năng',
    '  /canvas er — ER data model',
    '',
    '◆ SPEC — source of truth',
    '  /spec confirm — chốt Draft ProductSpec trước khi tạo artifact',
    '',
    '◆ CHANGE — impact preview, chưa write',
    '  /change remove [target] — resolve requirement, tạo before/after và chờ duyệt',
    '  Ví dụ: /change remove payment hoặc /change remove REQ-PAYMENT',
    '',
    '◆ STUDIO — trao đổi & phác thảo',
    '  /studio explore [chủ đề] — mở rộng ý tưởng, không tự vẽ',
    '  /studio critique [chủ đề] — phản biện, không tự sửa',
    '  /studio sketch [mô tả] — phác trực quan khi được yêu cầu',
    '  /studio refine [mô tả] — sửa đúng vùng canvas đang chọn',
  ].join('\n')
}
