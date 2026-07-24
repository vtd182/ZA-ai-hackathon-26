import { describe, expect, it } from 'vitest'
import { mapFreeformDiscoveryAnswers } from './workflow-intent'

describe('workflow intent', () => {
  it('maps markdown free-form discovery answers to the visible question order', () => {
    const questions = [{ id: 'Q-TARGET' }, { id: 'Q-MODEL' }, { id: 'Q-MVP' }]
    const message = [
      '* **Phân khúc:** Người dùng cá nhân tại đô thị.',
      '* **Mô hình vận hành:** Nền tảng kết nối với tài xế đối tác.',
      '* **MVP đầu tiên:** Đặt xe, tìm tài xế và theo dõi chuyến.',
    ].join('\n')

    expect(mapFreeformDiscoveryAnswers(questions, message)).toEqual({
      'Q-TARGET': 'Người dùng cá nhân tại đô thị.',
      'Q-MODEL': 'Nền tảng kết nối với tài xế đối tác.',
      'Q-MVP': 'Đặt xe, tìm tài xế và theo dõi chuyến.',
    })
  })

  it('ignores ordinary chat instead of guessing discovery answers', () => {
    expect(mapFreeformDiscoveryAnswers(
      [{ id: 'Q-TARGET' }, { id: 'Q-MODEL' }, { id: 'Q-MVP' }],
      'Tôi muốn thảo luận thêm về nhóm người dùng.',
    )).toBeNull()
  })
})
