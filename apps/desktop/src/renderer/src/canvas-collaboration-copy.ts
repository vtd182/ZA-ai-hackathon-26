import type { ProductSpec } from '@pm-agent/domain'

export type CanvasCollaborationActionId = 'ask-selection' | 'refine-selection' | 'sync-canvas' | 'promote-canvas'

export interface CanvasCollaborationAction {
  id: CanvasCollaborationActionId
  label: string
  detail: string
  draft?: string
}

export interface CanvasCollaborationCopy {
  title: string
  detail: string
  status: string
  actions: CanvasCollaborationAction[]
}

export function compactCanvasLabel(value: string, limit = 72): string {
  const compact = value.trim().replace(/\s*\n+\s*/g, ' · ').replace(/[ \t]+/g, ' ')
  if (compact.length <= limit) return compact
  const candidate = compact.slice(0, limit + 1)
  const boundary = Math.max(candidate.lastIndexOf(' '), candidate.lastIndexOf(' · '))
  return `${candidate.slice(0, boundary > limit * 0.55 ? boundary : limit).trim()}...`
}

export function canvasCollaborationCopy(input: {
  canvasItemCount: number
  selectionLabel?: string
  productSpecStatus?: ProductSpec['status']
  canPromote: boolean
}): CanvasCollaborationCopy | null {
  if (input.canvasItemCount <= 0) return null

  const actions: CanvasCollaborationAction[] = []
  const selectedLabel = input.selectionLabel ? compactCanvasLabel(input.selectionLabel) : ''

  if (selectedLabel) {
    actions.push(
      {
        id: 'ask-selection',
        label: 'Hỏi vùng này',
        detail: 'Đưa selection vào câu hỏi',
        draft: `Về ${selectedLabel}: `,
      },
      {
        id: 'refine-selection',
        label: 'Sửa vùng này',
        detail: 'Giữ nguyên phần còn lại',
        draft: `Sửa đúng vùng canvas đang chọn (${selectedLabel}): `,
      },
    )
  }

  actions.push({
    id: 'sync-canvas',
    label: selectedLabel ? 'Sync vùng chọn' : 'Sync canvas',
    detail: 'Đọc diff vào chat',
  })

  if (input.canPromote && input.productSpecStatus !== 'approved') {
    actions.push({
      id: 'promote-canvas',
      label: 'Chốt canvas',
      detail: 'Tạo ProductSpec preview',
    })
  }

  if (selectedLabel) {
    return {
      title: 'Feedback vùng chọn',
      detail: `Chat đang nhận “${selectedLabel}” cùng các node lân cận làm context.`,
      status: 'Canvas -> chat -> refine đúng vùng',
      actions,
    }
  }

  return {
    title: input.productSpecStatus === 'approved' ? 'Canvas review' : 'Canvas exploration',
    detail: input.productSpecStatus === 'approved'
      ? 'ProductSpec đã chốt; canvas dùng để review, giải thích và chuẩn bị change impact.'
      : 'Canvas vẫn là nháp sống. Sync để agent đọc thay đổi, rồi chốt thành ProductSpec khi scope đã rõ.',
    status: `${input.canvasItemCount} node đang ở canvas`,
    actions,
  }
}
