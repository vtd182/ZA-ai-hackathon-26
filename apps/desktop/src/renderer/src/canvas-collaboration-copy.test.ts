import { describe, expect, it } from 'vitest'
import { canvasCollaborationCopy, compactCanvasLabel } from './canvas-collaboration-copy'

describe('canvas collaboration copy', () => {
  it('keeps Vietnamese accents in selected canvas context', () => {
    const copy = canvasCollaborationCopy({
      canvasItemCount: 6,
      selectionLabel: 'Xác thực tài xế đối tác',
      productSpecStatus: 'draft',
      canPromote: true,
    })

    expect(copy?.title).toBe('Feedback vùng chọn')
    expect(copy?.detail).toContain('Xác thực tài xế đối tác')
    expect(copy?.actions.find((action) => action.id === 'refine-selection')?.draft).toContain('đối tác')
  })

  it('surfaces sync and promotion when canvas is still exploratory', () => {
    const copy = canvasCollaborationCopy({
      canvasItemCount: 4,
      productSpecStatus: 'draft',
      canPromote: true,
    })

    expect(copy?.title).toBe('Canvas exploration')
    expect(copy?.actions.map((action) => action.id)).toEqual(['sync-canvas', 'promote-canvas'])
  })

  it('does not suggest promotion after ProductSpec is confirmed', () => {
    const copy = canvasCollaborationCopy({
      canvasItemCount: 4,
      productSpecStatus: 'approved',
      canPromote: true,
    })

    expect(copy?.title).toBe('Canvas review')
    expect(copy?.actions.map((action) => action.id)).toEqual(['sync-canvas'])
  })

  it('compacts long labels without removing accents', () => {
    expect(compactCanvasLabel('Nhánh xử lý ngoại lệ khi tài xế đối tác hủy chuyến sát giờ đón', 36))
      .toBe('Nhánh xử lý ngoại lệ khi tài xế đối...')
  })
})
