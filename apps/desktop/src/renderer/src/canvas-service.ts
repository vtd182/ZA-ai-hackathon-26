import {
  canvasProgramSchema,
  type CanvasDiffContext,
  type CanvasDocumentContext,
  type CanvasExecutionReceipt,
  type CanvasOperation,
  type CanvasProgram,
} from '@pm-agent/domain'
import { canvasNodeDimensions, layoutCanvasProgram, lintCanvasDocument } from '@pm-agent/canvas'
import {
  createShapeId,
  toRichText,
  type Editor,
  type TLShape,
  type TLShapeId,
} from 'tldraw'
import { runCanvasScript } from './canvas-script-runtime'

const colors = new Set(['black', 'grey', 'blue', 'green', 'yellow', 'red', 'violet', 'orange'])

export function semanticShapeId(id: string): TLShapeId {
  const normalized = id.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'node'
  return createShapeId(`canvas-${normalized}`)
}

function labelOf(shape: TLShape): string {
  return typeof shape.meta.label === 'string' ? shape.meta.label : ''
}

function boundsOf(shapes: Array<{ x: number; y: number; width: number; height: number }>): { x: number; y: number; width: number; height: number } | undefined {
  if (shapes.length === 0) return undefined
  const minX = Math.min(...shapes.map((shape) => shape.x))
  const minY = Math.min(...shapes.map((shape) => shape.y))
  const maxX = Math.max(...shapes.map((shape) => shape.x + shape.width))
  const maxY = Math.max(...shapes.map((shape) => shape.y + shape.height))
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function inspectCanvas(editor: Editor, revision: number, limit = 200, recentChangeIds: string[] = []): CanvasDocumentContext {
  const selectedShapeIds = editor.getSelectedShapeIds()
  const shapes = editor.getCurrentPageShapes().slice(0, limit).map((shape) => {
    const bounds = editor.getShapePageBounds(shape)
    return {
      id: shape.id,
      type: shape.type,
      label: labelOf(shape),
      ...(typeof shape.meta.semanticId === 'string' ? { semanticId: shape.meta.semanticId } : {}),
      ...(['note', 'process', 'decision', 'screen'].includes(String(shape.meta.nodeKind)) ? { nodeKind: shape.meta.nodeKind as 'note' | 'process' | 'decision' | 'screen' } : {}),
      ...(typeof shape.meta.visualRole === 'string' ? { visualRole: shape.meta.visualRole } : {}),
      ...(typeof shape.parentId === 'string' ? { parentId: shape.parentId } : {}),
      ...(typeof shape.meta.description === 'string' ? { description: shape.meta.description } : {}),
      ...(typeof shape.meta.lane === 'string' ? { lane: shape.meta.lane } : {}),
      ...(['neutral', 'brand', 'success', 'warning', 'danger', 'info', 'accent'].includes(String(shape.meta.tone)) ? { tone: shape.meta.tone as 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'accent' } : {}),
      ...(Array.isArray(shape.meta.content) ? { content: shape.meta.content.filter((item): item is string => typeof item === 'string').slice(0, 12) } : {}),
      x: bounds?.x ?? shape.x,
      y: bounds?.y ?? shape.y,
      width: bounds?.w ?? 0,
      height: bounds?.h ?? 0,
    }
  })
  const viewport = editor.getViewportPageBounds()
  const base: CanvasDocumentContext = {
    schemaVersion: 1,
    revision,
    selectedShapeIds,
    shapes,
    bindings: editor.getCurrentPageShapes()
      .filter((shape) => shape.type === 'arrow' && typeof shape.meta.fromId === 'string' && typeof shape.meta.toId === 'string')
      .map((shape) => ({
        id: typeof shape.meta.semanticId === 'string' ? shape.meta.semanticId : shape.id,
        shapeId: shape.id,
        fromId: String(shape.meta.fromId),
        toId: String(shape.meta.toId),
        label: labelOf(shape),
      })),
    viewport: { x: viewport.x, y: viewport.y, width: viewport.w, height: viewport.h },
    ...(recentChangeIds.length > 0 ? { recentChangeIds } : {}),
  }
  const selectedBounds = boundsOf(shapes.filter((shape) => selectedShapeIds.includes(shape.id)))
  if (selectedBounds) base.selectedBounds = selectedBounds
  base.lints = lintCanvasDocument(base)
  return base
}

function sameBounds(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
): boolean {
  return Math.abs(first.x - second.x) < 1
    && Math.abs(first.y - second.y) < 1
    && Math.abs(first.width - second.width) < 1
    && Math.abs(first.height - second.height) < 1
}

function sameShapeContent(
  first: CanvasDocumentContext['shapes'][number],
  second: CanvasDocumentContext['shapes'][number],
): boolean {
  return first.label === second.label
    && first.description === second.description
    && first.lane === second.lane
    && first.tone === second.tone
    && JSON.stringify(first.content ?? []) === JSON.stringify(second.content ?? [])
}

export function diffCanvasContexts(
  before: CanvasDocumentContext,
  after: CanvasDocumentContext,
  limit = 50,
): CanvasDiffContext {
  const previous = new Map(before.shapes.map((shape) => [shape.id, shape]))
  const current = new Map(after.shapes.map((shape) => [shape.id, shape]))
  const changes: CanvasDiffContext['changes'] = []
  for (const shape of after.shapes) {
    const old = previous.get(shape.id)
    if (!old) {
      changes.push({
        id: shape.semanticId ?? shape.id,
        label: shape.label || shape.semanticId || shape.type,
        change: 'created',
        after: { x: shape.x, y: shape.y, width: shape.width, height: shape.height },
      })
    } else if (!sameShapeContent(old, shape)) {
      changes.push({
        id: shape.semanticId ?? shape.id,
        label: shape.label || shape.semanticId || shape.type,
        change: 'updated',
        before: { x: old.x, y: old.y, width: old.width, height: old.height },
        after: { x: shape.x, y: shape.y, width: shape.width, height: shape.height },
      })
    } else if (!sameBounds(old, shape)) {
      changes.push({
        id: shape.semanticId ?? shape.id,
        label: shape.label || shape.semanticId || shape.type,
        change: 'moved',
        before: { x: old.x, y: old.y, width: old.width, height: old.height },
        after: { x: shape.x, y: shape.y, width: shape.width, height: shape.height },
      })
    }
  }
  for (const shape of before.shapes) {
    if (current.has(shape.id)) continue
    changes.push({
      id: shape.semanticId ?? shape.id,
      label: shape.label || shape.semanticId || shape.type,
      change: 'deleted',
      before: { x: shape.x, y: shape.y, width: shape.width, height: shape.height },
    })
  }
  const bounded = changes.slice(0, limit)
  const counts = {
    created: changes.filter((item) => item.change === 'created').length,
    updated: changes.filter((item) => item.change === 'updated').length,
    moved: changes.filter((item) => item.change === 'moved').length,
    deleted: changes.filter((item) => item.change === 'deleted').length,
  }
  const summaryParts = [
    counts.created ? `${counts.created} tạo mới` : '',
    counts.updated ? `${counts.updated} đổi nội dung` : '',
    counts.moved ? `${counts.moved} di chuyển` : '',
    counts.deleted ? `${counts.deleted} xóa` : '',
  ].filter(Boolean)
  return {
    schemaVersion: 1,
    fromRevision: before.revision,
    toRevision: after.revision,
    changes: bounded,
    selectedShapeIds: after.selectedShapeIds.slice(0, 50),
    summary: summaryParts.join(', ') || 'Không có thay đổi hình học hoặc nội dung; chỉ cập nhật vùng chọn',
  }
}

function findSemanticShape(editor: Editor, id: string): TLShape | undefined {
  return editor.getShape(semanticShapeId(id)) ?? editor.getCurrentPageShapes().find((shape) => shape.meta.semanticId === id || shape.id === id)
}

function normalizedLabel(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase()
}

function nodePresentation(operation: Extract<CanvasOperation, { op: 'create_node' }>): {
  color: 'blue' | 'green' | 'orange' | 'red' | 'yellow'
  fill: 'semi' | 'solid'
  geo: 'rectangle' | 'diamond'
} {
  const label = normalizedLabel(operation.label)
  if (operation.kind === 'decision') return { color: 'orange', fill: 'solid', geo: 'diamond' }
  if (operation.kind === 'screen') return { color: 'blue', fill: 'solid', geo: 'rectangle' }
  if (operation.kind === 'note' && /(loi|that bai|tu choi|khong tim|huy|blocked)/.test(label)) {
    return { color: 'red', fill: 'solid', geo: 'rectangle' }
  }
  if (operation.kind === 'note') return { color: 'yellow', fill: 'solid', geo: 'rectangle' }
  return { color: 'green', fill: 'solid', geo: 'rectangle' }
}

interface PrototypeBlock {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
  color: 'black' | 'blue' | 'grey' | 'green' | 'orange' | 'red' | 'violet' | 'yellow'
  fill: 'none' | 'solid' | 'semi'
  size?: 's' | 'm'
  align?: 'start' | 'middle' | 'end'
  shape?: 'geo' | 'text'
}

const tonePresentation = {
  neutral: { color: 'grey', fill: 'semi' },
  brand: { color: 'blue', fill: 'solid' },
  success: { color: 'green', fill: 'solid' },
  warning: { color: 'yellow', fill: 'solid' },
  danger: { color: 'red', fill: 'solid' },
  info: { color: 'blue', fill: 'semi' },
  accent: { color: 'violet', fill: 'semi' },
} as const

function authoredPrototypeBlocks(
  operation: Extract<CanvasOperation, { op: 'create_node' }>,
  stepIndex: number,
  stepCount: number,
): PrototypeBlock[] | undefined {
  const screen = operation.screen
  if (!screen) return undefined
  const blocks: PrototypeBlock[] = [
    { id: 'chrome', label: 'ZA MINI APP', x: 0, y: 0, width: 360, height: 52, color: 'blue', fill: 'solid', size: 'm', align: 'start' },
    { id: 'step', label: `${String(stepIndex + 1).padStart(2, '0')} / ${String(stepCount).padStart(2, '0')}`, x: 272, y: 12, width: 72, height: 28, color: 'green', fill: 'solid' },
  ]
  if (screen.eyebrow) blocks.push({ id: 'eyebrow', label: screen.eyebrow, x: 18, y: 68, width: 324, height: 26, color: 'violet', fill: 'none', align: 'start', shape: 'text' })
  const titleY = screen.eyebrow ? 102 : 72
  blocks.push({ id: 'title', label: screen.title, x: 18, y: titleY, width: 324, height: 68, color: 'black', fill: 'none', size: 'm', align: 'start', shape: 'text' })
  if (screen.subtitle) blocks.push({ id: 'subtitle', label: screen.subtitle, x: 18, y: titleY + 76, width: 324, height: 46, color: 'grey', fill: 'none', align: 'start', shape: 'text' })

  let cursorY = screen.subtitle ? titleY + 134 : titleY + 80
  let pendingHalf: PrototypeBlock | undefined
  for (const item of screen.blocks) {
    const presentation = tonePresentation[item.tone]
    const height = item.kind === 'hero' ? 92 : item.helper ? 72 : 60
    const label = [item.label.toUpperCase(), item.value, item.helper].filter(Boolean).join('\n')
    if (item.span === 'half') {
      const block: PrototypeBlock = {
        id: `block-${item.id}`,
        label,
        x: pendingHalf ? 188 : 18,
        y: cursorY,
        width: 154,
        height,
        color: presentation.color,
        fill: presentation.fill,
        align: 'start',
      }
      blocks.push(block)
      if (pendingHalf) {
        cursorY += Math.max(pendingHalf.height, height) + 12
        pendingHalf = undefined
      } else {
        pendingHalf = block
      }
    } else {
      if (pendingHalf) {
        cursorY += pendingHalf.height + 12
        pendingHalf = undefined
      }
      blocks.push({
        id: `block-${item.id}`,
        label,
        x: 18,
        y: cursorY,
        width: 324,
        height,
        color: presentation.color,
        fill: presentation.fill,
        align: 'start',
      })
      cursorY += height + 12
    }
  }
  if (pendingHalf) cursorY += pendingHalf.height + 12
  const actionY = Math.max(cursorY + 4, 584)
  blocks.push({ id: 'primary-action', label: screen.primaryAction, x: 18, y: actionY, width: 324, height: 48, color: 'blue', fill: 'solid', size: 'm' })
  if (screen.secondaryAction) blocks.push({ id: 'secondary-action', label: screen.secondaryAction, x: 18, y: actionY + 56, width: 150, height: 36, color: 'grey', fill: 'semi' })
  if (screen.navItems.length > 0) {
    blocks.push({
      id: 'nav',
      label: screen.navItems.map((item) => item === screen.activeNav ? `• ${item}` : item).join('      '),
      x: 18,
      y: 684,
      width: 324,
      height: 24,
      color: 'green',
      fill: 'none',
      shape: 'text',
    })
  }
  return blocks.filter((block) => block.y + block.height <= 716)
}

function prototypeBlocks(
  operation: Extract<CanvasOperation, { op: 'create_node' }>,
  stepIndex: number,
  stepCount: number,
): PrototypeBlock[] {
  const authored = authoredPrototypeBlocks(operation, stepIndex, stepCount)
  if (authored) return authored
  const label = normalizedLabel(operation.label)
  const backupReminder = operation.id.startsWith('prototype-backup-')
  const rideBooking = operation.id.startsWith('prototype-') && /(pickup|ride|driver)/.test(operation.id)
  const onboarding = operation.id.startsWith('prototype-') && /(welcome|register|verify)/.test(operation.id)
  const brand = backupReminder ? 'BACKUP  REMINDER' : rideBooking ? 'ZA  RIDE' : onboarding ? 'ZA  ACCOUNT' : 'ZA  PANTRY'
  const nav = backupReminder
    ? 'Tổng quan          Lịch          Nhật ký'
    : rideBooking
      ? 'Đặt chuyến       Hoạt động       Cá nhân'
      : onboarding
        ? 'Tài khoản          Trợ giúp          Bảo mật'
        : 'Trang chủ      Đơn hàng      Cá nhân'
  const shell: PrototypeBlock[] = [
    { id: 'brand', label: brand, x: 0, y: 0, width: 320, height: 54, color: 'blue', fill: 'solid', size: 'm', align: 'start' },
    { id: 'step', label: `${stepIndex + 1} / ${stepCount}`, x: 234, y: 12, width: 70, height: 30, color: 'green', fill: 'solid' },
    { id: 'nav', label: nav, x: 16, y: 486, width: 288, height: 26, color: 'green', fill: 'semi' },
  ]
  if (operation.id === 'prototype-backup-dashboard') {
    return [
      ...shell,
      { id: 'title', label: 'Bản sao lưu của bạn', x: 16, y: 70, width: 288, height: 44, color: 'black', fill: 'semi', size: 'm', align: 'start' },
      { id: 'health', label: 'AN TOÀN\nBackup gần nhất · Hôm qua 22:30', x: 16, y: 126, width: 288, height: 82, color: 'green', fill: 'solid', align: 'start' },
      { id: 'source', label: 'Nguồn\nẢnh & video · 12,4 GB', x: 16, y: 220, width: 136, height: 78, color: 'blue', fill: 'semi', align: 'start' },
      { id: 'next', label: 'Lịch tiếp theo\nHôm nay · 22:30', x: 168, y: 220, width: 136, height: 78, color: 'violet', fill: 'semi', align: 'start' },
      { id: 'storage', label: 'Cloud Drive     64% đã dùng', x: 16, y: 312, width: 288, height: 46, color: 'grey', fill: 'semi', align: 'start' },
      { id: 'warning', label: '3 tệp mới chưa được backup', x: 16, y: 370, width: 288, height: 38, color: 'yellow', fill: 'semi', align: 'start' },
      { id: 'action', label: 'Backup ngay', x: 16, y: 426, width: 288, height: 48, color: 'blue', fill: 'solid', size: 'm' },
    ]
  }
  if (operation.id === 'prototype-backup-source') {
    return [
      ...shell,
      { id: 'title', label: 'Chọn nguồn backup', x: 16, y: 70, width: 288, height: 44, color: 'black', fill: 'semi', size: 'm', align: 'start' },
      { id: 'device', label: 'Thiết bị này\nẢnh, video và tài liệu', x: 16, y: 126, width: 288, height: 66, color: 'blue', fill: 'solid', align: 'start' },
      { id: 'cloud', label: 'Cloud Drive\nĐã kết nối · minh@work.vn', x: 16, y: 204, width: 288, height: 66, color: 'green', fill: 'semi', align: 'start' },
      { id: 'folders', label: 'THƯ MỤC ĐÃ CHỌN\nCamera     Screenshots     Documents', x: 16, y: 282, width: 288, height: 78, color: 'violet', fill: 'semi', align: 'start' },
      { id: 'condition', label: 'Chỉ backup khi có Wi-Fi', x: 16, y: 372, width: 288, height: 38, color: 'grey', fill: 'semi', align: 'start' },
      { id: 'action', label: 'Lưu nguồn backup', x: 16, y: 426, width: 288, height: 48, color: 'blue', fill: 'solid', size: 'm' },
    ]
  }
  if (operation.id === 'prototype-backup-schedule') {
    return [
      ...shell,
      { id: 'title', label: 'Lịch & nhắc backup', x: 16, y: 70, width: 288, height: 44, color: 'black', fill: 'semi', size: 'm', align: 'start' },
      { id: 'frequency', label: 'TẦN SUẤT\nMỗi ngày', x: 16, y: 126, width: 136, height: 72, color: 'blue', fill: 'semi', align: 'start' },
      { id: 'time', label: 'THỜI GIAN\n22:30', x: 168, y: 126, width: 136, height: 72, color: 'violet', fill: 'semi', align: 'start' },
      { id: 'reminder', label: 'Nhắc trước 15 phút                 BẬT', x: 16, y: 212, width: 288, height: 52, color: 'green', fill: 'solid', align: 'start' },
      { id: 'snooze', label: 'Nếu bỏ lỡ, nhắc lại sau 30 phút', x: 16, y: 278, width: 288, height: 48, color: 'yellow', fill: 'semi', align: 'start' },
      { id: 'conditions', label: 'Điều kiện\nWi-Fi · Pin trên 30% · Đang sạc', x: 16, y: 340, width: 288, height: 70, color: 'grey', fill: 'semi', align: 'start' },
      { id: 'action', label: 'Lưu kế hoạch', x: 16, y: 426, width: 288, height: 48, color: 'blue', fill: 'solid', size: 'm' },
    ]
  }
  if (operation.id === 'prototype-backup-reminder') {
    return [
      ...shell,
      { id: 'eyebrow', label: 'ĐẾN LỊCH BACKUP · 22:30', x: 16, y: 72, width: 288, height: 34, color: 'violet', fill: 'semi' },
      { id: 'status', label: '3,2 GB đang chờ backup\nKhoảng 8 phút · Wi-Fi ổn định', x: 16, y: 120, width: 288, height: 86, color: 'blue', fill: 'solid', size: 'm' },
      { id: 'scope', label: 'Ảnh & video       486 tệp\nDocuments          24 tệp', x: 16, y: 220, width: 288, height: 76, color: 'grey', fill: 'semi', align: 'start' },
      { id: 'primary', label: 'Backup ngay', x: 16, y: 314, width: 288, height: 48, color: 'blue', fill: 'solid', size: 'm' },
      { id: 'snooze', label: 'Nhắc lại sau 30 phút', x: 16, y: 372, width: 184, height: 38, color: 'yellow', fill: 'semi' },
      { id: 'skip', label: 'Bỏ qua', x: 208, y: 372, width: 96, height: 38, color: 'grey', fill: 'semi' },
      { id: 'action', label: 'Xem chi tiết dữ liệu', x: 16, y: 426, width: 288, height: 48, color: 'green', fill: 'semi', size: 'm' },
    ]
  }
  if (operation.id === 'prototype-backup-result') {
    return [
      ...shell,
      { id: 'success', label: 'BACKUP HOÀN TẤT\n510 tệp đã an toàn', x: 16, y: 76, width: 288, height: 104, color: 'green', fill: 'solid', size: 'm' },
      { id: 'summary', label: '3,2 GB · 7 phút 42 giây\nCloud Drive · Mã phiên BK-0723', x: 16, y: 194, width: 288, height: 68, color: 'blue', fill: 'semi', align: 'start' },
      { id: 'next', label: 'Lần backup tiếp theo\nNgày mai · 22:30', x: 16, y: 276, width: 288, height: 62, color: 'violet', fill: 'semi', align: 'start' },
      { id: 'note', label: 'Không có lỗi cần xử lý', x: 16, y: 352, width: 288, height: 46, color: 'grey', fill: 'semi', align: 'start' },
      { id: 'action', label: 'Xem nhật ký backup', x: 16, y: 426, width: 288, height: 48, color: 'blue', fill: 'solid', size: 'm' },
    ]
  }
  if (/(kham pha|discover)/.test(label)) {
    return [
      ...shell,
      { id: 'title', label: 'Bữa trưa hôm nay', x: 16, y: 70, width: 288, height: 46, color: 'black', fill: 'semi', size: 'm', align: 'start' },
      { id: 'search', label: 'Tìm món hoặc nhà bếp', x: 16, y: 128, width: 288, height: 42, color: 'grey', fill: 'semi', align: 'start' },
      { id: 'filter-fast', label: 'Giao nhanh', x: 16, y: 182, width: 96, height: 32, color: 'blue', fill: 'semi' },
      { id: 'filter-healthy', label: 'Healthy', x: 120, y: 182, width: 96, height: 32, color: 'green', fill: 'semi' },
      { id: 'meal-1', label: 'Cơm gà nướng\n55.000đ · 11:30', x: 16, y: 228, width: 136, height: 142, color: 'orange', fill: 'semi', align: 'start' },
      { id: 'meal-2', label: 'Bún bò Huế\n48.000đ · 12:00', x: 168, y: 228, width: 136, height: 142, color: 'yellow', fill: 'semi', align: 'start' },
      { id: 'action', label: 'Xem toàn bộ thực đơn', x: 16, y: 426, width: 288, height: 48, color: 'blue', fill: 'solid', size: 'm' },
    ]
  }
  if (/(chon mon|khung gio)/.test(label)) {
    return [
      ...shell,
      { id: 'hero', label: 'Ảnh món ăn\nCơm gà nướng sốt tiêu', x: 16, y: 70, width: 288, height: 138, color: 'orange', fill: 'semi', size: 'm' },
      { id: 'price', label: '55.000đ  ·  Còn 12 suất', x: 16, y: 220, width: 288, height: 44, color: 'black', fill: 'semi', align: 'start' },
      { id: 'slot-1', label: '11:30', x: 16, y: 278, width: 88, height: 36, color: 'blue', fill: 'solid' },
      { id: 'slot-2', label: '12:00', x: 112, y: 278, width: 88, height: 36, color: 'grey', fill: 'semi' },
      { id: 'slot-3', label: '12:30', x: 208, y: 278, width: 96, height: 36, color: 'grey', fill: 'semi' },
      { id: 'quantity', label: 'Số lượng                  −   1   +', x: 16, y: 330, width: 288, height: 52, color: 'green', fill: 'semi', align: 'start' },
      { id: 'action', label: 'Thêm vào giỏ · 55.000đ', x: 16, y: 426, width: 288, height: 48, color: 'blue', fill: 'solid', size: 'm' },
    ]
  }
  if (/(gio hang|cart)/.test(label)) {
    return [
      ...shell,
      { id: 'group', label: 'ĐẶT NHÓM  ·  4 người tham gia', x: 16, y: 70, width: 288, height: 46, color: 'violet', fill: 'semi', align: 'start' },
      { id: 'item', label: 'Cơm gà nướng × 3\nBún bò Huế × 1', x: 16, y: 128, width: 288, height: 82, color: 'orange', fill: 'semi', align: 'start' },
      { id: 'receiver', label: 'Người nhận đại diện\nMinh Anh · Product Team', x: 16, y: 222, width: 288, height: 68, color: 'green', fill: 'semi', align: 'start' },
      { id: 'pickup', label: 'Pantry tầng 6  ·  11:30', x: 16, y: 302, width: 288, height: 48, color: 'grey', fill: 'semi', align: 'start' },
      { id: 'total', label: 'Tổng cộng                         213.000đ', x: 16, y: 362, width: 288, height: 48, color: 'black', fill: 'semi', align: 'start' },
      { id: 'action', label: 'Tiếp tục xác nhận', x: 16, y: 426, width: 288, height: 48, color: 'blue', fill: 'solid', size: 'm' },
    ]
  }
  if (/(xac nhan don|confirm order)/.test(label)) {
    return [
      ...shell,
      { id: 'progress', label: 'GIỎ HÀNG  ✓      XÁC NHẬN      HOÀN TẤT', x: 16, y: 70, width: 288, height: 40, color: 'green', fill: 'semi' },
      { id: 'order', label: 'Đơn nhóm #ZA-026\n4 suất · 2 loại món', x: 16, y: 124, width: 288, height: 76, color: 'orange', fill: 'semi', align: 'start' },
      { id: 'delivery', label: 'Nhận tại pantry tầng 6\n11:30 hôm nay', x: 16, y: 212, width: 288, height: 68, color: 'grey', fill: 'semi', align: 'start' },
      { id: 'policy', label: 'Không cần thanh toán trong MVP', x: 16, y: 292, width: 288, height: 48, color: 'yellow', fill: 'semi', align: 'start' },
      { id: 'total', label: 'Tổng cộng                         213.000đ', x: 16, y: 354, width: 288, height: 52, color: 'black', fill: 'semi', align: 'start' },
      { id: 'action', label: 'Đặt suất ăn cho nhóm', x: 16, y: 426, width: 288, height: 48, color: 'blue', fill: 'solid', size: 'm' },
    ]
  }
  if (/(trang thai nhan|order status)/.test(label)) {
    return [
      ...shell,
      { id: 'success', label: 'ĐƠN ĐÃ XÁC NHẬN\nMã nhận  A6-026', x: 16, y: 76, width: 288, height: 112, color: 'green', fill: 'solid', size: 'm' },
      { id: 'timeline-1', label: '✓  10:42  Đã xác nhận', x: 16, y: 206, width: 288, height: 46, color: 'green', fill: 'semi', align: 'start' },
      { id: 'timeline-2', label: '•  10:55  Bếp đang chuẩn bị', x: 16, y: 262, width: 288, height: 46, color: 'orange', fill: 'semi', align: 'start' },
      { id: 'timeline-3', label: '○  11:30  Sẵn sàng tại pantry', x: 16, y: 318, width: 288, height: 46, color: 'grey', fill: 'semi', align: 'start' },
      { id: 'receiver', label: 'Người nhận: Minh Anh · Tầng 6', x: 16, y: 376, width: 288, height: 38, color: 'violet', fill: 'semi' },
      { id: 'action', label: 'Chia sẻ mã nhận cho nhóm', x: 16, y: 426, width: 288, height: 48, color: 'blue', fill: 'solid', size: 'm' },
    ]
  }
  return [
    ...shell,
    { id: 'title', label: operation.label, x: 16, y: 76, width: 288, height: 64, color: 'black', fill: 'semi', size: 'm' },
    { id: 'content-1', label: 'Thông tin chính', x: 16, y: 158, width: 288, height: 64, color: 'blue', fill: 'semi' },
    { id: 'content-2', label: 'Lựa chọn của người dùng', x: 16, y: 236, width: 288, height: 64, color: 'green', fill: 'semi' },
    { id: 'content-3', label: 'Trạng thái hiện tại', x: 16, y: 314, width: 288, height: 64, color: 'grey', fill: 'semi' },
    { id: 'action', label: 'Tiếp tục', x: 16, y: 426, width: 288, height: 48, color: 'blue', fill: 'solid', size: 'm' },
  ]
}

function prototypeChildId(operationId: string, blockId: string): TLShapeId {
  return createShapeId(`canvas-${operationId}-${blockId}`)
}

function upsertPrototypeSceneFurniture(
  editor: Editor,
  nodes: Array<Extract<CanvasOperation, { op: 'create_node' }>>,
  program: CanvasProgram,
): void {
  const positioned = nodes.filter((node) => node.x !== undefined && node.y !== undefined)
  if (positioned.length < 3 || !positioned.every((node) => node.id.startsWith('prototype-'))) return
  const minX = Math.min(...positioned.map((node) => node.x!))
  const minY = Math.min(...positioned.map((node) => node.y!))
  const labels = normalizedLabel(positioned.map((node) => node.label).join(' '))
  const backupReminder = /(backup|sao luu|nhac backup)/.test(labels)
  const mealOrdering = /(mon|gio hang|don|nhan hang)/.test(labels)
  const rideBooking = /(diem don|chuyen|tai xe)/.test(labels)
  const title = program.title ?? (backupReminder
    ? 'MVP PROTOTYPE  ·  NHẮC BACKUP CHỦ ĐỘNG'
    : mealOrdering
    ? 'MVP PROTOTYPE  ·  ĐẶT SUẤT ĂN NHÓM'
    : rideBooking
      ? 'MVP PROTOTYPE  ·  ĐẶT CHUYẾN MINI APP'
      : 'MVP PROTOTYPE  ·  CORE USER JOURNEY')
  const focus = program.description ?? (backupReminder
    ? 'SCOPE ĐÃ KHÓA\nThiết lập · Nhắc hạn · Backup · Kết quả'
    : mealOrdering
    ? 'SCOPE ĐÃ KHÓA\nĐặt nhóm · 1 người nhận · Bỏ payment'
    : rideBooking
      ? 'SCOPE ĐÃ KHÓA\nĐặt điểm · Chọn chuyến · Theo dõi'
      : 'PRODUCT CONCEPT\nChọn một màn hình để feedback')
  const furniture = [
    {
      id: createShapeId('canvas-prototype-scene-header'),
      x: minX,
      y: minY - 136,
      w: 900,
      h: 82,
      label: title,
      color: 'black',
      fill: 'semi',
      visualRole: 'prototype-scene-header',
      size: 'm',
    },
    {
      id: createShapeId('canvas-prototype-scene-focus'),
      x: minX + 924,
      y: minY - 136,
      w: 516,
      h: 82,
      label: focus,
      color: 'yellow',
      fill: 'semi',
      visualRole: 'prototype-scene-focus',
      size: 's',
    },
  ] as const
  for (const item of furniture) {
    const shape = {
      id: item.id,
      type: 'geo',
      x: item.x,
      y: item.y,
      props: {
        geo: 'rectangle',
        w: item.w,
        h: item.h,
        color: item.color,
        fill: item.fill,
        dash: 'solid',
        font: 'sans',
        size: item.size,
        align: 'start',
        verticalAlign: 'middle',
        richText: toRichText(item.label),
      },
      meta: {
        semanticId: item.visualRole,
        label: item.label,
        canvasOwner: 'agent',
        visualRole: item.visualRole,
      },
    }
    if (editor.getShape(item.id)?.type === 'geo') editor.updateShape(shape as never)
    else editor.createShape(shape as never)
  }
}

function upsertPrototypeFrame(
  editor: Editor,
  operation: Extract<CanvasOperation, { op: 'create_node' }>,
  x: number,
  y: number,
  stepIndex: number,
  stepCount: number,
): TLShapeId {
  const id = semanticShapeId(operation.id)
  const current = editor.getShape(id)
  if (current && current.type !== 'frame') editor.deleteShape(current.id)
  const meta = {
    semanticId: operation.id,
    label: operation.label,
    nodeKind: operation.kind,
    canvasOwner: 'agent',
    visualRole: 'prototype-screen',
    ...(operation.description ? { description: operation.description } : {}),
    ...(operation.lane ? { lane: operation.lane } : {}),
    ...(operation.tone ? { tone: operation.tone } : {}),
    ...(operation.screen ? {
      content: [
        operation.screen.title,
        operation.screen.subtitle ?? '',
        ...operation.screen.blocks.flatMap((block) => [block.label, block.value ?? '', block.helper ?? '']),
        operation.screen.primaryAction,
        operation.screen.secondaryAction ?? '',
      ].filter(Boolean),
    } : {}),
  }
  if (editor.getShape(id)?.type === 'frame') {
    editor.updateShape({
      id,
      type: 'frame',
      ...(operation.x !== undefined && operation.y !== undefined ? { x, y } : {}),
      props: { w: 360, h: 720, name: operation.label, color: 'grey' },
      meta,
    } as never)
  } else {
    editor.createShape({
      id,
      type: 'frame',
      x,
      y,
      props: { w: 360, h: 720, name: operation.label, color: 'grey' },
      meta,
    } as never)
  }
  const blocks = prototypeBlocks(operation, stepIndex, stepCount)
  const expectedChildIds = new Set(blocks.map((block) => prototypeChildId(operation.id, block.id)))
  for (const child of editor.getCurrentPageShapes()) {
    if (child.meta.prototypeParentId === operation.id && !expectedChildIds.has(child.id)) editor.deleteShape(child.id)
  }
  for (const block of blocks) {
    const childId = prototypeChildId(operation.id, block.id)
    const child = editor.getShape(childId)
    const shapeType = block.shape ?? 'geo'
    if (child && child.type !== shapeType) editor.deleteShape(child.id)
    if (shapeType === 'text') {
      const textShape = {
        id: childId,
        type: 'text',
        parentId: id,
        x: block.x,
        y: block.y,
        props: {
          color: block.color,
          size: block.size ?? 's',
          font: 'sans',
          textAlign: block.align ?? 'start',
          autoSize: false,
          w: block.width,
          richText: toRichText(block.label),
        },
        meta: {
          canvasOwner: 'agent',
          visualRole: `prototype-${block.id}`,
          prototypeParentId: operation.id,
          label: block.label,
        },
      }
      if (editor.getShape(childId)?.type === 'text') editor.updateShape(textShape as never)
      else editor.createShape(textShape as never)
      continue
    }
    const shape = {
      id: childId,
      type: 'geo',
      parentId: id,
      x: block.x,
      y: block.y,
      props: {
        geo: 'rectangle',
        w: block.width,
        h: block.height,
        color: block.color,
        fill: block.fill,
        dash: 'solid',
        font: 'sans',
        size: block.size ?? 's',
        align: block.align ?? 'middle',
        verticalAlign: 'middle',
        richText: toRichText(block.label),
      },
      meta: {
        canvasOwner: 'agent',
        visualRole: `prototype-${block.id}`,
        prototypeParentId: operation.id,
        label: block.label,
      },
    }
    if (editor.getShape(childId)?.type === 'geo') editor.updateShape(shape as never)
    else editor.createShape(shape as never)
  }
  return id
}

function richNodeChildId(operationId: string, role: string): TLShapeId {
  return createShapeId(`canvas-${operationId}-card-${role}`)
}

function upsertRichNodeFrame(
  editor: Editor,
  operation: Extract<CanvasOperation, { op: 'create_node' }>,
  x: number,
  y: number,
): TLShapeId {
  const id = semanticShapeId(operation.id)
  const current = editor.getShape(id)
  if (current && current.type !== 'frame') editor.deleteShape(current.id)
  const dimensions = canvasNodeDimensions(operation.kind, operation.label, operation.id, true, operation.description)
  const presentation = operation.tone ? tonePresentation[operation.tone] : nodePresentation(operation)
  const meta = {
    semanticId: operation.id,
    label: operation.label,
    nodeKind: operation.kind,
    canvasOwner: 'agent',
    visualRole: operation.kind === 'note' || operation.tone === 'danger' ? 'exception' : operation.kind,
    ...(operation.description ? { description: operation.description } : {}),
    ...(operation.lane ? { lane: operation.lane } : {}),
    ...(operation.tone ? { tone: operation.tone } : {}),
    content: [operation.label, operation.description ?? '', operation.badge ?? '', operation.lane ?? ''].filter(Boolean),
  }
  const frame = {
    id,
    type: 'frame',
    x,
    y,
    props: { w: dimensions.width, h: dimensions.height, name: operation.badge ?? operation.kind.toUpperCase(), color: presentation.color },
    meta,
  }
  if (editor.getShape(id)?.type === 'frame') editor.updateShape(frame as never)
  else editor.createShape(frame as never)

  const children = [
    {
      role: 'background',
      label: '',
      x: 0,
      y: 0,
      width: dimensions.width,
      height: dimensions.height,
      color: presentation.color,
      fill: operation.kind === 'decision' ? 'semi' : presentation.fill,
      size: 's',
      align: 'start',
    },
    {
      role: 'badge',
      label: [operation.icon?.toUpperCase(), operation.badge].filter(Boolean).join('  ·  ') || operation.kind.toUpperCase(),
      x: 16,
      y: 14,
      width: dimensions.width - 32,
      height: 28,
      color: presentation.color,
      fill: 'none',
      size: 's',
      align: 'start',
    },
    {
      role: 'title',
      label: operation.label,
      x: 16,
      y: 48,
      width: dimensions.width - 32,
      height: operation.description ? 56 : 96,
      color: 'black',
      fill: 'none',
      size: 'm',
      align: 'start',
    },
    ...(operation.description ? [{
      role: 'description',
      label: operation.description,
      x: 16,
      y: 108,
      width: dimensions.width - 32,
      height: dimensions.height - 146,
      color: 'grey',
      fill: 'none',
      size: 's',
      align: 'start',
    }] : []),
    {
      role: 'lane',
      label: operation.lane ? `LANE  ·  ${operation.lane}` : '',
      x: 16,
      y: dimensions.height - 28,
      width: dimensions.width - 32,
      height: 20,
      color: presentation.color,
      fill: 'none',
      size: 's',
      align: 'start',
    },
  ] as const

  for (const child of children) {
    const childId = richNodeChildId(operation.id, child.role)
    if (child.role !== 'background') {
      const textShape = {
        id: childId,
        type: 'text',
        parentId: id,
        x: child.x,
        y: child.y,
        props: {
          color: child.color,
          size: child.size,
          font: 'sans',
          textAlign: child.align,
          autoSize: false,
          w: child.width,
          richText: toRichText(child.label),
        },
        meta: {
          canvasOwner: 'agent',
          visualRole: `workflow-${child.role}`,
          workflowParentId: operation.id,
          label: child.label,
        },
      }
      const currentChild = editor.getShape(childId)
      if (currentChild && currentChild.type !== 'text') editor.deleteShape(currentChild.id)
      if (editor.getShape(childId)?.type === 'text') editor.updateShape(textShape as never)
      else editor.createShape(textShape as never)
      continue
    }
    const shape = {
      id: childId,
      type: 'geo',
      parentId: id,
      x: child.x,
      y: child.y,
      props: {
        geo: 'rectangle',
        w: child.width,
        h: child.height,
        color: child.color,
        fill: child.fill,
        dash: 'solid',
        font: 'sans',
        size: child.size,
        align: child.align,
        verticalAlign: 'middle',
        richText: toRichText(child.label),
      },
      meta: {
        canvasOwner: 'agent',
        visualRole: `workflow-${child.role}`,
        workflowParentId: operation.id,
        label: child.label,
      },
    }
    if (editor.getShape(childId)?.type === 'geo') editor.updateShape(shape as never)
    else editor.createShape(shape as never)
  }
  return id
}

function upsertWorkflowSceneFurniture(
  editor: Editor,
  nodes: Array<Extract<CanvasOperation, { op: 'create_node' }>>,
  program: CanvasProgram,
): void {
  const positioned = nodes.filter((node) => node.x !== undefined && node.y !== undefined)
  if (positioned.length < 2 || program.sceneType !== 'workflow') return
  const minX = Math.min(...positioned.map((node) => node.x!))
  const minY = Math.min(...positioned.map((node) => node.y!))
  const items = [
    {
      id: createShapeId('canvas-workflow-scene-title'),
      x: minX,
      y: minY - 150,
      w: 760,
      h: 70,
      label: program.title ?? 'Product Journey',
      color: 'black',
      fill: 'none',
      size: 'l',
      role: 'workflow-scene-title',
    },
    {
      id: createShapeId('canvas-workflow-scene-description'),
      x: minX + 784,
      y: minY - 150,
      w: 620,
      h: 70,
      label: program.description ?? program.summary,
      color: 'blue',
      fill: 'semi',
      size: 's',
      role: 'workflow-scene-description',
    },
  ] as const
  for (const item of items) {
    const shape = {
      id: item.id,
      type: 'geo',
      x: item.x,
      y: item.y,
      props: {
        geo: 'rectangle',
        w: item.w,
        h: item.h,
        color: item.color,
        fill: item.fill,
        dash: 'solid',
        font: 'sans',
        size: item.size,
        align: 'start',
        verticalAlign: 'middle',
        richText: toRichText(item.label),
      },
      meta: { canvasOwner: 'agent', visualRole: item.role, label: item.label },
    }
    if (editor.getShape(item.id)?.type === 'geo') editor.updateShape(shape as never)
    else editor.createShape(shape as never)
  }
}

function createNode(editor: Editor, operation: Extract<CanvasOperation, { op: 'create_node' }>, index: number, nodeCount: number): TLShapeId {
  const id = semanticShapeId(operation.id)
  const existing = editor.getShape(id)
  const viewport = editor.getViewportPageBounds()
  const columns = Math.min(4, Math.max(1, nodeCount))
  const x = operation.x ?? viewport.center.x - ((columns - 1) * 340) / 2 + (index % columns) * 340
  const y = operation.y ?? viewport.center.y - 100 + Math.floor(index / columns) * 190
  const presentation = nodePresentation(operation)
  const dimensions = canvasNodeDimensions(operation.kind, operation.label, operation.id, Boolean(operation.description || operation.badge || operation.lane), operation.description)
  if (operation.kind === 'screen' && operation.id.startsWith('prototype-')) {
    return upsertPrototypeFrame(editor, operation, x, y, index, nodeCount)
  }
  if (operation.description || operation.badge || operation.lane) {
    return upsertRichNodeFrame(editor, operation, x, y)
  }
  const meta = {
    ...existing?.meta,
    semanticId: operation.id,
    label: operation.label,
    nodeKind: operation.kind,
    canvasOwner: 'agent',
    visualRole: operation.kind === 'note' && presentation.color === 'red' ? 'exception' : operation.kind,
    ...(operation.description ? { description: operation.description } : {}),
    ...(operation.lane ? { lane: operation.lane } : {}),
    ...(operation.tone ? { tone: operation.tone } : {}),
  }
  if (existing?.type === 'note') {
    editor.updateShape({
      id,
      type: 'note',
      ...(operation.x !== undefined && operation.y !== undefined ? { x: operation.x, y: operation.y } : {}),
      props: { color: presentation.color, size: 'm', font: 'sans', richText: toRichText(operation.label) },
      meta,
    } as never)
    return id
  }
  if (existing?.type === 'geo') {
    editor.updateShape({
      id,
      type: 'geo',
      ...(operation.x !== undefined && operation.y !== undefined ? { x: operation.x, y: operation.y } : {}),
      props: {
        geo: presentation.geo,
        w: dimensions.width,
        h: dimensions.height,
        color: presentation.color,
        fill: presentation.fill,
        dash: 'solid',
        font: 'sans',
        size: 'm',
        align: 'middle',
        verticalAlign: 'middle',
        richText: toRichText(operation.label),
      },
      meta,
    } as never)
    return id
  }
  editor.createShape({
    id,
    type: 'geo',
    x,
    y,
    props: {
      geo: operation.kind === 'note' ? 'rectangle' : presentation.geo,
      w: dimensions.width,
      h: dimensions.height,
      color: presentation.color,
      fill: presentation.fill,
      dash: 'solid',
      font: 'sans',
      size: 'm',
      align: 'middle',
      verticalAlign: 'middle',
      richText: toRichText(operation.label),
    },
    meta,
  })
  return id
}

function connect(editor: Editor, operation: Extract<CanvasOperation, { op: 'connect' }>): TLShapeId | undefined {
  const from = findSemanticShape(editor, operation.fromId)
  const to = findSemanticShape(editor, operation.toId)
  if (!from || !to) return undefined
  const fromBounds = editor.getShapePageBounds(from)
  const toBounds = editor.getShapePageBounds(to)
  if (!fromBounds || !toBounds) return undefined
  const id = semanticShapeId(operation.id)
  const meta = { semanticId: operation.id, fromId: operation.fromId, toId: operation.toId, label: operation.label ?? '', canvasOwner: 'agent' }
  const dx = toBounds.center.x - fromBounds.center.x
  const dy = toBounds.center.y - fromBounds.center.y
  const horizontal = Math.abs(dx) >= Math.abs(dy)
  const startAnchor = horizontal
    ? { x: dx >= 0 ? 1 : 0, y: 0.5 }
    : { x: 0.5, y: dy >= 0 ? 1 : 0 }
  const endAnchor = horizontal
    ? { x: dx >= 0 ? 0 : 1, y: 0.5 }
    : { x: 0.5, y: dy >= 0 ? 0 : 1 }
  const normalizedEdgeLabel = normalizedLabel(operation.label ?? '')
  const color = /(khong|tu choi|that bai|huy)/.test(normalizedEdgeLabel)
    ? 'red'
    : /(co|dong y|thanh cong|xac nhan)/.test(normalizedEdgeLabel) ? 'green' : 'grey'
  if (!editor.getShape(id)) {
    editor.createShape({
      id,
      type: 'arrow',
      x: fromBounds.center.x,
      y: fromBounds.center.y,
      props: {
        start: { x: 0, y: 0 },
        end: { x: toBounds.center.x - fromBounds.center.x, y: toBounds.center.y - fromBounds.center.y },
        arrowheadEnd: 'arrow',
        color,
        dash: 'solid',
        size: 'm',
        font: 'sans',
        ...(operation.label ? { richText: toRichText(operation.label) } : {}),
      },
      meta,
    })
    editor.createBindings([
      { type: 'arrow', fromId: id, toId: from.id, props: { terminal: 'start', normalizedAnchor: startAnchor, isExact: false, isPrecise: true, snap: 'none' } },
      { type: 'arrow', fromId: id, toId: to.id, props: { terminal: 'end', normalizedAnchor: endAnchor, isExact: false, isPrecise: true, snap: 'none' } },
    ])
  } else if (operation.label) {
    editor.updateShape({ id, type: 'arrow', props: { color, font: 'sans', richText: toRichText(operation.label) }, meta } as never)
  }
  return id
}

function applyOperations(editor: Editor, operations: CanvasOperation[], program: CanvasProgram, renderSceneFurniture: boolean): TLShapeId[] {
  const created: TLShapeId[] = []
  const nodes = operations.filter((operation): operation is Extract<CanvasOperation, { op: 'create_node' }> => operation.op === 'create_node')
  editor.run(() => {
    for (const operation of operations) {
      if (operation.op !== 'delete') continue
      const shape = findSemanticShape(editor, operation.id)
      if (shape) editor.deleteShape(shape.id)
    }
    if (renderSceneFurniture) {
      upsertPrototypeSceneFurniture(editor, nodes, program)
      upsertWorkflowSceneFurniture(editor, nodes, program)
    }
    for (const [nodeIndex, operation] of nodes.entries()) {
      created.push(createNode(editor, operation, nodeIndex, nodes.length))
    }
    for (const operation of operations) {
      if (operation.op !== 'update') continue
      const shape = findSemanticShape(editor, operation.id)
      if (!shape) continue
      const props: Record<string, unknown> = {}
      if (operation.label && (shape.type === 'geo' || shape.type === 'note')) props.richText = toRichText(operation.label)
      if (operation.label && shape.type === 'frame') props.name = operation.label
      if (operation.color && colors.has(operation.color)) props.color = operation.color
      editor.updateShape({ id: shape.id, type: shape.type, ...(Object.keys(props).length > 0 ? { props } : {}), meta: { ...shape.meta, ...(operation.label ? { label: operation.label } : {}) } } as never)
    }
    for (const operation of operations) {
      if (operation.op !== 'connect') continue
      const id = connect(editor, operation)
      if (id) created.push(id)
    }
  })
  return created
}

export async function executeCanvasProgram(
  editor: Editor,
  threadId: string,
  input: CanvasProgram,
  source: CanvasExecutionReceipt['source'],
  requestId?: string,
): Promise<CanvasExecutionReceipt> {
  const program = canvasProgramSchema.parse(input)
  const rawOperations = program.mode === 'script' ? await runCanvasScript(program.script!) : program.operations
  const previousSelection = editor.getSelectedShapeIds()
  const before = inspectCanvas(editor, 0)
  const prepared = rawOperations.length > 0
    ? layoutCanvasProgram({
        ...program,
        mode: 'operations',
        operations: rawOperations,
        script: null,
      }, before, { respectExplicitPositions: source === 'developer' })
    : program
  const operations = prepared.mode === 'operations' ? prepared.operations : rawOperations
  const createdNodeCount = operations.filter((operation) => operation.op === 'create_node').length
  const renderSceneFurniture = program.sceneType === 'prototype'
    || !before.shapes.some((shape) => shape.nodeKind)
    || createdNodeCount > 6
  const created = program.mode === 'none' ? [] : applyOperations(editor, operations, prepared, renderSceneFurniture)
  const createdNodeShapeIds = operations
    .filter(
      (operation): operation is Extract<CanvasOperation, { op: 'create_node' }> =>
        operation.op === 'create_node'
    )
    .map((operation) => semanticShapeId(operation.id))
    .filter((id) => editor.getShape(id))
  if (createdNodeShapeIds.length > 0 && source !== 'developer') {
    editor.select(...createdNodeShapeIds)
    const hadSemanticScene = before.shapes.some((shape) => shape.nodeKind)
    if (!hadSemanticScene || createdNodeShapeIds.length > 6) {
      editor.zoomToFit({ immediate: true })
    } else {
      const viewport = editor.getViewportPageBounds()
      const selectionBounds = editor.getSelectionPageBounds()
      const isVisible = selectionBounds
        && selectionBounds.x >= viewport.x
        && selectionBounds.y >= viewport.y
        && selectionBounds.maxX <= viewport.maxX
        && selectionBounds.maxY <= viewport.maxY
      if (!isVisible) editor.zoomToSelection({ immediate: true })
    }
    const restorableSelection = previousSelection.filter((id) => editor.getShape(id))
    if (restorableSelection.length > 0) editor.select(...restorableSelection)
    else editor.selectNone()
  }
  const affectedSemanticIds = operations.flatMap((operation) => {
    if (operation.op === 'create_node' || operation.op === 'update' || operation.op === 'delete') return [operation.id]
    return [operation.fromId, operation.toId]
  })
  const after = inspectCanvas(editor, before.revision + 1, 200, affectedSemanticIds)
  const lintIssues = lintCanvasDocument(after, affectedSemanticIds)
  return {
    schemaVersion: 1,
    receiptId: `canvas-receipt:${threadId}:${Date.now()}`,
    ...(requestId ? { requestId } : {}),
    threadId,
    source,
    appliedOperationCount: operations.length,
    shapeCount: after.shapes.length,
    createdShapeIds: created,
    lintIssues,
    at: new Date().toISOString(),
  }
}

export function reflowCanvas(editor: Editor): CanvasDocumentContext {
  const context = inspectCanvas(editor, 0)
  const nodes = context.shapes.filter((shape) => shape.semanticId && shape.nodeKind)
  if (nodes.length < 2) return context
  const program = canvasProgramSchema.parse({
    schemaVersion: 1,
    mode: 'operations',
    summary: 'Re-layout current canvas scene',
    operations: [
      ...nodes.map((shape) => ({
        op: 'create_node' as const,
        id: shape.semanticId!,
        label: shape.label || shape.semanticId!,
        kind: shape.nodeKind!,
      })),
      ...(context.bindings ?? []).map((binding) => ({
        op: 'connect' as const,
        id: binding.id,
        fromId: binding.fromId,
        toId: binding.toId,
        ...(binding.label ? { label: binding.label } : {}),
      })),
    ],
    script: null,
  })
  const layout = layoutCanvasProgram(program, {
    ...context,
    shapes: context.shapes.filter((shape) => !shape.semanticId || !shape.nodeKind),
  }, { force: true })
  editor.run(() => {
    for (const operation of layout.operations) {
      if (operation.op !== 'create_node' || operation.x === undefined || operation.y === undefined) continue
      const shape = findSemanticShape(editor, operation.id)
      if (shape) editor.updateShape({ id: shape.id, type: shape.type, x: operation.x, y: operation.y } as never)
    }
  })
  editor.zoomToFit({ immediate: true })
  return inspectCanvas(editor, context.revision + 1, 200, nodes.map((node) => node.semanticId!))
}
