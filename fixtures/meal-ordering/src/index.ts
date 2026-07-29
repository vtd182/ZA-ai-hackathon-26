import { parseProductSpec } from '@pm-agent/domain'

export const mealOrderingProductSpec = parseProductSpec({
  schemaVersion: 1,
  id: 'SPEC-MEAL-ORDERING',
  version: 1,
  title: 'Mini App đặt suất ăn trước',
  status: 'approved',
  idea: {
    id: 'IDEA-MEAL-ORDERING',
    kind: 'idea',
    title: 'Đặt suất ăn trước tại pantry',
    summary: 'Nhân viên đặt món trước, nhận theo mã tại pantry và có thể thanh toán bằng ví nội bộ.',
    productType: 'mini_app',
    targetUsers: ['Nhân viên văn phòng', 'Nhân viên pantry'],
  },
  goals: [
    { id: 'GOAL-QUEUE-TIME', kind: 'goal', title: 'Giảm thời gian chờ', metric: 'Giảm thời gian xếp hàng giờ trưa ít nhất 40%' },
  ],
  findings: [
    { id: 'FINDING-LUNCH-QUEUE', kind: 'finding', title: 'Xếp hàng giờ trưa', evidence: 'Fixture research ghi nhận pantry quá tải trong khung 11:30-12:30.', sourceType: 'fixture' },
  ],
  requirements: [
    {
      id: 'REQ-ORDER', kind: 'requirement', title: 'Đặt suất ăn',
      description: 'Nhân viên chọn món và số lượng trước giờ nhận.', priority: 'must', status: 'in_scope',
      acceptanceCriteria: ['Hiển thị món còn nhận đặt', 'Cho phép xác nhận một đơn hợp lệ'], dependsOn: [],
    },
    {
      id: 'REQ-PICKUP', kind: 'requirement', title: 'Nhận món bằng mã',
      description: 'Đơn thành công có mã nhận món để đối soát tại pantry.', priority: 'must', status: 'in_scope',
      acceptanceCriteria: ['Mã nhận món duy nhất trong ngày', 'Pantry có thể xác nhận đã giao'], dependsOn: ['REQ-ORDER'],
    },
    {
      id: 'REQ-PAYMENT', kind: 'requirement', title: 'Thanh toán bằng ví nội bộ',
      description: 'Người dùng thanh toán đơn qua ví nội bộ.', priority: 'should', status: 'in_scope',
      acceptanceCriteria: ['Hiển thị số dư trước xác nhận', 'Giao dịch thất bại không tạo đơn đã trả tiền'], dependsOn: ['REQ-ORDER'],
    },
  ],
  screens: [
    { id: 'SCREEN-MENU', kind: 'screen', title: 'Danh sách món', purpose: 'Chọn món và số lượng', requirementIds: ['REQ-ORDER'], designSystemRoles: ['app-header', 'menu-card', 'primary-button'] },
    { id: 'SCREEN-CHECKOUT', kind: 'screen', title: 'Xác nhận đơn', purpose: 'Kiểm tra đơn và phương thức thanh toán', requirementIds: ['REQ-ORDER', 'REQ-PAYMENT'], designSystemRoles: ['app-header', 'order-summary', 'payment-method', 'primary-button'] },
    { id: 'SCREEN-CONFIRMATION', kind: 'screen', title: 'Mã nhận món', purpose: 'Hiển thị kết quả và mã nhận món', requirementIds: ['REQ-PICKUP'], designSystemRoles: ['app-header', 'pickup-code', 'status-message'] },
    { id: 'SCREEN-WALLET-ERROR', kind: 'screen', title: 'Lỗi thanh toán', purpose: 'Giải thích lỗi ví và cho phép thử lại', requirementIds: ['REQ-PAYMENT'], designSystemRoles: ['app-header', 'error-message', 'secondary-button'] },
  ],
  stories: [
    { id: 'STORY-ORDER-MEAL', kind: 'story', title: 'Đặt suất ăn', requirementIds: ['REQ-ORDER', 'REQ-PICKUP'], acceptanceCriteria: ['Tạo đơn và nhận mã pickup'] },
    { id: 'STORY-PAY-WALLET', kind: 'story', title: 'Thanh toán qua ví', requirementIds: ['REQ-PAYMENT'], acceptanceCriteria: ['Thanh toán thành công trước khi tạo mã pickup'] },
  ],
  dependencies: [
    { id: 'DEP-WALLET-SDK', kind: 'dependency', title: 'Wallet SDK', dependencyType: 'platform', requirementIds: ['REQ-PAYMENT'] },
  ],
  decisions: [
    { id: 'DECISION-MVP-SCOPE', kind: 'decision', title: 'Phạm vi MVP', question: 'MVP có thanh toán ví không?', choice: 'Có, nhưng có thể loại khi scope thay đổi.', rationale: 'Fixture giữ payment để minh họa impact flow.', status: 'accepted' },
  ],
  relationships: [
    { id: 'REL-FINDING-GOAL', type: 'SUPPORTS', source: { kind: 'finding', id: 'FINDING-LUNCH-QUEUE' }, target: { kind: 'goal', id: 'GOAL-QUEUE-TIME' } },
    { id: 'REL-ORDER-MENU', type: 'DESIGNED_BY', source: { kind: 'requirement', id: 'REQ-ORDER' }, target: { kind: 'screen', id: 'SCREEN-MENU' } },
    { id: 'REL-ORDER-STORY', type: 'IMPLEMENTS', source: { kind: 'requirement', id: 'REQ-ORDER' }, target: { kind: 'story', id: 'STORY-ORDER-MEAL' } },
    { id: 'REL-PICKUP-STORY', type: 'IMPLEMENTS', source: { kind: 'requirement', id: 'REQ-PICKUP' }, target: { kind: 'story', id: 'STORY-ORDER-MEAL' } },
    { id: 'REL-PAYMENT-CHECKOUT', type: 'DESIGNED_BY', source: { kind: 'requirement', id: 'REQ-PAYMENT' }, target: { kind: 'screen', id: 'SCREEN-CHECKOUT' } },
    { id: 'REL-PAYMENT-ERROR', type: 'DESIGNED_BY', source: { kind: 'requirement', id: 'REQ-PAYMENT' }, target: { kind: 'screen', id: 'SCREEN-WALLET-ERROR' } },
    { id: 'REL-PAYMENT-STORY', type: 'IMPLEMENTS', source: { kind: 'requirement', id: 'REQ-PAYMENT' }, target: { kind: 'story', id: 'STORY-PAY-WALLET' } },
    { id: 'REL-PAYMENT-WALLET', type: 'DEPENDS_ON', source: { kind: 'requirement', id: 'REQ-PAYMENT' }, target: { kind: 'dependency', id: 'DEP-WALLET-SDK' } },
  ],
  artifactMappings: [],
  createdAt: '2026-07-22T00:00:00.000Z',
  updatedAt: '2026-07-22T00:00:00.000Z',
})

export const removePaymentPrompt = 'Bỏ payment khỏi MVP'
