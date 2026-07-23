import {
  parseProductSpec,
  validateProductSpecInvariants,
  type ChatMessage,
  type PhaseReasoningResult,
  type ProductSpec,
} from '@pm-agent/domain'

type DecisionResult = Extract<PhaseReasoningResult, { phase: 'decide' }>

export interface ProductSpecSynthesisInput {
  current: ProductSpec
  threadTitle: string
  messages: ChatMessage[]
  decision: DecisionResult
  selectedOptionId: string
  customTitle?: string
  selectedAt: string
}

interface JourneyStep {
  key: string
  title: string
  purpose: string
  acceptanceCriteria: string[]
  roles: string[]
}

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase()
}

function answerFromTranscript(messages: ChatMessage[], promptFragments: string[]): string | null {
  for (const message of [...messages].reverse()) {
    if (message.role !== 'user') continue
    for (const line of message.content.split('\n')) {
      const separator = line.indexOf(':')
      if (separator < 0) continue
      const prompt = normalized(line.slice(0, separator))
      if (!promptFragments.some((fragment) => prompt.includes(fragment))) continue
      const answer = line.slice(separator + 1).trim()
      if (answer) return answer
    }
  }
  return null
}

function initialIdea(messages: ChatMessage[], fallback: string): string {
  return messages.find((message) => (
    message.role === 'user'
    && !message.content.startsWith('Đã chọn phương án:')
    && !message.content.includes('Ai là người dùng chính?')
  ))?.content.trim() || fallback
}

function journeyForIdea(idea: string): JourneyStep[] {
  const text = normalized(idea)
  if (/(suat an|bua trua|mon an|pantry|dat mon)/.test(text)) {
    return [
      { key: 'DISCOVER', title: 'Khám phá món ăn', purpose: 'Tìm món phù hợp và xem khả năng phục vụ', acceptanceCriteria: ['Hiển thị món còn nhận đặt', 'Cho phép lọc hoặc tìm món phù hợp'], roles: ['app-header', 'menu-card', 'primary-button'] },
      { key: 'SELECT', title: 'Chọn món và thời gian', purpose: 'Chọn món, số lượng và khung giờ nhận', acceptanceCriteria: ['Chọn được số lượng hợp lệ', 'Chỉ cho chọn khung giờ còn phục vụ'], roles: ['app-header', 'menu-card', 'primary-button'] },
      { key: 'REVIEW', title: 'Xác nhận đơn', purpose: 'Kiểm tra đơn và người nhận đại diện', acceptanceCriteria: ['Hiển thị đầy đủ món, số lượng và nơi nhận', 'Người dùng xác nhận được đơn hợp lệ'], roles: ['app-header', 'order-summary', 'primary-button'] },
      { key: 'CONFIRM', title: 'Hoàn tất đặt món', purpose: 'Xác nhận đơn đã được ghi nhận', acceptanceCriteria: ['Hiển thị mã đơn duy nhất', 'Thông báo rõ thời gian và địa điểm nhận'], roles: ['app-header', 'status-message', 'primary-button'] },
      { key: 'STATUS', title: 'Theo dõi trạng thái', purpose: 'Theo dõi tiến độ chuẩn bị và nhận món', acceptanceCriteria: ['Hiển thị trạng thái mới nhất', 'Cho phép chia sẻ mã nhận cho nhóm'], roles: ['app-header', 'status-message', 'secondary-button'] },
    ]
  }
  if (/(dat xe|goi xe|chuyen di|tai xe|di chuyen)/.test(text)) {
    return [
      { key: 'ROUTE', title: 'Nhập hành trình', purpose: 'Chọn điểm đón và điểm đến', acceptanceCriteria: ['Điểm đón và điểm đến đều hợp lệ', 'Hiển thị tóm tắt hành trình'], roles: ['app-header', 'menu-card', 'primary-button'] },
      { key: 'OPTION', title: 'Chọn phương án di chuyển', purpose: 'So sánh lựa chọn và thời gian dự kiến', acceptanceCriteria: ['Hiển thị ít nhất một lựa chọn khả dụng', 'Nêu rõ thời gian chờ dự kiến'], roles: ['app-header', 'menu-card', 'primary-button'] },
      { key: 'REVIEW', title: 'Xác nhận chuyến', purpose: 'Kiểm tra hành trình trước khi gửi yêu cầu', acceptanceCriteria: ['Hiển thị đúng điểm đón, điểm đến và lựa chọn', 'Cho phép xác nhận yêu cầu'], roles: ['app-header', 'order-summary', 'primary-button'] },
      { key: 'MATCH', title: 'Ghép tài xế', purpose: 'Thông báo tiến trình tìm tài xế', acceptanceCriteria: ['Hiển thị trạng thái ghép tài xế', 'Cho phép hủy khi chưa ghép thành công'], roles: ['app-header', 'status-message', 'secondary-button'] },
      { key: 'TRACK', title: 'Theo dõi chuyến', purpose: 'Theo dõi tài xế và trạng thái chuyến', acceptanceCriteria: ['Hiển thị thông tin tài xế đã ghép', 'Cập nhật trạng thái chuyến rõ ràng'], roles: ['app-header', 'status-message', 'primary-button'] },
    ]
  }
  if (/(onboarding|dang ky|xac thuc|tao tai khoan)/.test(text)) {
    return [
      { key: 'REGISTER', title: 'Đăng ký', purpose: 'Thu thập thông tin tối thiểu để tạo tài khoản', acceptanceCriteria: ['Kiểm tra dữ liệu bắt buộc', 'Cho phép tiếp tục với thông tin hợp lệ'], roles: ['app-header', 'menu-card', 'primary-button'] },
      { key: 'VERIFY', title: 'Xác thực', purpose: 'Xác nhận quyền sở hữu thông tin đăng ký', acceptanceCriteria: ['Gửi và kiểm tra mã xác thực', 'Hiển thị lỗi và cho phép thử lại'], roles: ['app-header', 'order-summary', 'primary-button'] },
      { key: 'COMPLETE', title: 'Hoàn tất', purpose: 'Thông báo tài khoản đã sẵn sàng', acceptanceCriteria: ['Hiển thị kết quả thành công', 'Có hành động đi tiếp rõ ràng'], roles: ['app-header', 'status-message', 'primary-button'] },
    ]
  }
  return [
    { key: 'START', title: 'Bắt đầu', purpose: 'Tiếp nhận nhu cầu chính của người dùng', acceptanceCriteria: ['Thu thập đủ dữ liệu bắt buộc', 'Giải thích rõ bước tiếp theo'], roles: ['app-header', 'menu-card', 'primary-button'] },
    { key: 'CONFIGURE', title: 'Thiết lập yêu cầu', purpose: 'Cho phép người dùng cấu hình lựa chọn chính', acceptanceCriteria: ['Lưu được lựa chọn hợp lệ', 'Hiển thị constraint quan trọng'], roles: ['app-header', 'menu-card', 'primary-button'] },
    { key: 'REVIEW', title: 'Kiểm tra và xác nhận', purpose: 'Review toàn bộ dữ liệu trước khi gửi', acceptanceCriteria: ['Hiển thị tóm tắt đầy đủ', 'Cho phép quay lại chỉnh sửa'], roles: ['app-header', 'order-summary', 'primary-button'] },
    { key: 'COMPLETE', title: 'Hoàn tất', purpose: 'Xác nhận yêu cầu đã được xử lý', acceptanceCriteria: ['Hiển thị kết quả rõ ràng', 'Có hành động tiếp theo'], roles: ['app-header', 'status-message', 'primary-button'] },
  ]
}

export function synthesizeProductSpecFromDecision(input: ProductSpecSynthesisInput): ProductSpec {
  const option = input.decision.phaseData.options.find((item) => item.id === input.selectedOptionId)
  const selectedTitle = option?.title ?? input.customTitle?.trim()
  if (!selectedTitle) throw new Error('Không thể tổng hợp ProductSpec khi chưa có phương án hợp lệ')

  const ideaSummary = initialIdea(input.messages, input.threadTitle)
  const targetUser = answerFromTranscript(input.messages, ['ai la nguoi dung chinh', 'khach hang chinh']) ?? 'Người dùng Mini App mục tiêu'
  const outcome = answerFromTranscript(input.messages, ['outcome uu tien', 'gia tri khac biet', 'ket qua uu tien']) ?? 'Hoàn thành tác vụ chính nhanh và rõ ràng hơn'
  const constraint = answerFromTranscript(input.messages, ['constraint nao', 'rang buoc']) ?? 'Triển khai phạm vi Mini App trước'
  const steps = journeyForIdea(ideaSummary)
  const requirementIds = steps.map((step) => `REQ-${step.key}`)
  const dependencyId = 'DEP-ZALO-MINI-APP'

  const spec = parseProductSpec({
    ...input.current,
    title: input.threadTitle,
    status: 'draft',
    idea: {
      ...input.current.idea,
      title: input.threadTitle,
      summary: ideaSummary,
      productType: normalized(ideaSummary).includes('oa') ? 'oa' : normalized(ideaSummary).includes('bot') ? 'bot' : 'mini_app',
      targetUsers: [targetUser],
    },
    goals: [{
      id: 'GOAL-MVP-OUTCOME',
      kind: 'goal',
      title: 'Outcome ưu tiên của MVP',
      metric: outcome,
    }],
    findings: [
      { id: 'FINDING-TARGET-USER', kind: 'finding', title: 'Nhóm người dùng đã khóa', evidence: targetUser, sourceType: 'user_input' },
      { id: 'FINDING-MVP-CONSTRAINT', kind: 'finding', title: 'Constraint đã khóa', evidence: constraint, sourceType: 'user_input' },
    ],
    requirements: steps.map((step, index) => ({
      id: requirementIds[index],
      kind: 'requirement',
      title: step.title,
      description: step.purpose,
      priority: 'must',
      status: 'in_scope',
      acceptanceCriteria: step.acceptanceCriteria,
      dependsOn: index > 0 ? [requirementIds[index - 1]] : [],
    })),
    screens: steps.map((step, index) => ({
      id: `SCREEN-${step.key}`,
      kind: 'screen',
      title: step.title,
      purpose: step.purpose,
      requirementIds: [requirementIds[index]],
      designSystemRoles: step.roles,
    })),
    stories: steps.map((step, index) => ({
      id: `STORY-${step.key}`,
      kind: 'story',
      title: `Người dùng ${step.title.toLowerCase()}`,
      requirementIds: [requirementIds[index]],
      acceptanceCriteria: step.acceptanceCriteria,
    })),
    dependencies: [{
      id: dependencyId,
      kind: 'dependency',
      title: constraint,
      dependencyType: 'platform',
      requirementIds,
    }],
    decisions: [{
      id: 'DECISION-MVP-SCOPE',
      kind: 'decision',
      title: 'Phương án MVP đã chọn',
      question: 'Phương án nào được dùng để chuyển sang Delivery?',
      choice: selectedTitle,
      rationale: option?.tradeoff ?? 'Người dùng nhập một phương án khác phù hợp hơn với bối cảnh.',
      status: 'accepted',
    }],
    relationships: [
      { id: 'REL-TARGET-GOAL', type: 'SUPPORTS', source: { kind: 'finding', id: 'FINDING-TARGET-USER' }, target: { kind: 'goal', id: 'GOAL-MVP-OUTCOME' } },
      ...steps.flatMap((step, index) => {
        const requirementId = requirementIds[index]
        return [
          { id: `REL-${step.key}-SCREEN`, type: 'DESIGNED_BY', source: { kind: 'requirement', id: requirementId }, target: { kind: 'screen', id: `SCREEN-${step.key}` } },
          { id: `REL-${step.key}-STORY`, type: 'IMPLEMENTS', source: { kind: 'requirement', id: requirementId }, target: { kind: 'story', id: `STORY-${step.key}` } },
          { id: `REL-${step.key}-PLATFORM`, type: 'DEPENDS_ON', source: { kind: 'requirement', id: requirementId }, target: { kind: 'dependency', id: dependencyId } },
        ]
      }),
    ],
    artifactMappings: [],
    updatedAt: input.selectedAt,
  })
  const issues = validateProductSpecInvariants(spec)
  if (issues.length > 0) throw new Error(`ProductSpec synthesis không đạt invariant: ${issues.map((issue) => issue.message).join('; ')}`)
  return spec
}
