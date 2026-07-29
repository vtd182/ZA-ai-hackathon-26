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

export type ProductSurface =
  | 'mini_app'
  | 'oa'
  | 'bot'
  | 'web_app'
  | 'admin_dashboard'
  | 'landing_page'
  | 'desktop_tool'
  | 'adaptive'

export interface ProductBrief {
  schemaVersion: 1
  clarity: 'clear' | 'partial' | 'ambiguous'
  userGoal: string
  targetUsers: string[]
  productSurface: ProductSurface
  mvpScope: string[]
  outOfScope: string[]
  risks: string[]
  missingCriticalInputs: string[]
  confidence: number
}

export interface ProductSpecFromBriefInput {
  current: ProductSpec
  threadTitle: string
  brief: ProductBrief
  createdAt: string
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

function titleCase(value: string): string {
  return value.trim().replace(/\s+/g, ' ').replace(/^./, (char) => char.toUpperCase())
}

function stableKey(value: string, fallback: string): string {
  const key = normalized(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36)
  return key || fallback
}

function unique(values: string[]): string[] {
  const seen = new Set<string>()
  return values
    .map((value) => value.trim())
    .filter((value) => {
      if (!value || seen.has(normalized(value))) return false
      seen.add(normalized(value))
      return true
    })
}

function inferSurface(text: string): ProductSurface {
  const value = normalized(text)
  if (/\b(bot|chatbot)\b/.test(value)) return 'bot'
  if (/\boa\b|official account/.test(value)) return 'oa'
  if (/(admin|dashboard|backoffice|ops|van hanh|quan tri|crm|console)/.test(value)) return 'admin_dashboard'
  if (/(landing|website|marketing|hero|trang web)/.test(value)) return 'landing_page'
  if (/(web app|web|portal|saas)/.test(value)) return 'web_app'
  if (/(desktop tool|desktop app|internal tool)/.test(value)) return 'desktop_tool'
  if (/(miniapp|mini app|zalo mini)/.test(value)) return 'mini_app'
  return 'adaptive'
}

function inferTargetUsers(original: string): string[] {
  const candidates: string[] = []
  const lower = normalized(original)
  const explicit = original.match(/(?:cho|dành cho|phục vụ)\s+([^,.;\n]+)/i)?.[1]?.trim()
  if (explicit) candidates.push(explicit)
  if (/(ops|operation|van hanh)/.test(lower)) candidates.push('Ops nội bộ')
  if (/(admin|quan tri)/.test(lower)) candidates.push('Admin')
  if (/(staff|nhan vien)/.test(lower)) candidates.push('Nhân viên')
  if (/(khach hang|nguoi dung cuoi)/.test(lower)) candidates.push('Khách hàng')
  return unique(candidates).slice(0, 3)
}

function inferOutOfScope(original: string): string[] {
  const items: string[] = []
  const pattern = /(?:chưa cần|không cần|không làm|out of scope|exclude)\s+([^,.;\n]+)/gi
  for (const match of original.matchAll(pattern)) {
    if (match[1]) items.push(titleCase(match[1]))
  }
  return unique(items).slice(0, 4)
}

function inferMvpScope(original: string, surface: ProductSurface): string[] {
  const text = normalized(original)
  const scope: string[] = []
  const addIf = (pattern: RegExp, title: string): void => {
    if (pattern.test(text)) scope.push(title)
  }
  addIf(/sidebar|navigation|nav|menu/, 'Navigation và cấu trúc thông tin')
  addIf(/bang|table|list|danh sach|realtime|real-time/, 'Danh sách dữ liệu chính')
  addIf(/filter|loc|search|tim kiem/, 'Tìm kiếm và bộ lọc')
  addIf(/exception|ngoai le|loi|bat thuong|retry/, 'Xử lý exception và recovery')
  addIf(/phan quyen|role|admin|staff|permission/, 'Phân quyền vai trò')
  addIf(/chi tiet|detail|drawer|modal/, 'Chi tiết và chỉnh sửa bản ghi')
  addIf(/thong bao|notification|alert|remind|nhac/, 'Thông báo và nhắc việc')
  addIf(/bao cao|analytics|metric|chart|dashboard/, 'Chỉ số vận hành')
  addIf(/xac thuc|otp|login|dang nhap/, 'Đăng nhập và xác thực')
  addIf(/booking|dat xe|dat phong|reservation|don hang|order/, 'Quản lý booking/yêu cầu')
  if (scope.length === 0 && surface === 'admin_dashboard') {
    scope.push('Tổng quan vận hành', 'Danh sách dữ liệu chính', 'Chi tiết và xử lý exception')
  }
  return unique(scope).slice(0, 6)
}

function inferRisks(original: string): string[] {
  const text = normalized(original)
  const risks: string[] = []
  if (/realtime|real-time/.test(text)) risks.push('Dữ liệu realtime cần trạng thái stale/loading/error rõ ràng')
  if (/exception|ngoai le|retry|loi/.test(text)) risks.push('Luồng exception dễ thiếu recovery và ownership')
  if (/phan quyen|role|permission/.test(text)) risks.push('Phân quyền cần phân biệt quyền xem, sửa và duyệt')
  if (/payment|thanh toan/.test(text)) risks.push('Payment cần boundary riêng nếu vào MVP')
  if (/zalo|mini app/.test(text)) risks.push('Cần kiểm tra constraint Zalo Mini App/ZDS trước khi write Figma')
  return risks
}

function goalFromBrief(input: string): string {
  const cleaned = input.trim().replace(/\s+/g, ' ')
  const sentence = cleaned.split(/[.!?\n]/)[0]?.trim() || cleaned
  return titleCase(sentence
    .replace(/^tôi\s+(cần|muốn|đang muốn|đang cần)\s+/i, '')
    .replace(/^hãy\s+/i, '')
    .slice(0, 96))
}

export function extractProductBrief(input: string): ProductBrief | null {
  const cleaned = input.trim()
  if (cleaned.length < 60) return null
  const text = normalized(cleaned)
  if (/^(ve|vẽ|tao|tạo)\s+(workflow|flow|prototype|canvas|figma)\b/.test(text)) return null
  const surface = inferSurface(cleaned)
  const scope = inferMvpScope(cleaned, surface)
  const outOfScope = inferOutOfScope(cleaned)
  const targetUsers = inferTargetUsers(cleaned)
  const hasProductNoun = /(miniapp|mini app|web|dashboard|admin|oa|bot|tool|portal|crm|app|san pham|product)/.test(text)
  const hasOutcome = /(quan ly|theo doi|dat|xu ly|giam|tang|tu dong|noi bo|van hanh|kickoff|mvp)/.test(text)
  const signalCount = scope.length + outOfScope.length + targetUsers.length
  if (!hasProductNoun || !hasOutcome || signalCount < 3) return null
  const confidence = Math.min(0.92, 0.58 + signalCount * 0.07 + (cleaned.length > 140 ? 0.06 : 0))
  return {
    schemaVersion: 1,
    clarity: confidence >= 0.72 ? 'clear' : 'partial',
    userGoal: goalFromBrief(cleaned),
    targetUsers: targetUsers.length > 0 ? targetUsers : ['Người dùng mục tiêu'],
    productSurface: surface,
    mvpScope: scope.length > 0 ? scope : ['Tác vụ chính của sản phẩm'],
    outOfScope,
    risks: inferRisks(cleaned),
    missingCriticalInputs: [],
    confidence,
  }
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
  if (/(remind|reminder|nhac).{0,40}(backup|sao luu)|(?:backup|sao luu).{0,40}(remind|reminder|nhac)/.test(text)) {
    return [
      { key: 'BACKUP-OVERVIEW', title: 'Tổng quan backup', purpose: 'Cho người dùng biết dữ liệu nào đã an toàn, lần backup gần nhất và lịch tiếp theo', acceptanceCriteria: ['Hiển thị trạng thái backup gần nhất', 'Cho phép bắt đầu backup thủ công'], roles: ['app-header', 'status-message', 'list-item', 'primary-button'] },
      { key: 'BACKUP-SOURCE', title: 'Kết nối nguồn backup', purpose: 'Chọn dữ liệu và đích lưu trữ được phép sử dụng', acceptanceCriteria: ['Hiển thị rõ nguồn và tài khoản đã kết nối', 'Lưu được phạm vi dữ liệu cần backup'], roles: ['app-header', 'list-item', 'checkbox', 'primary-button'] },
      { key: 'BACKUP-SCHEDULE', title: 'Lịch và nhắc backup', purpose: 'Thiết lập thời gian, điều kiện chạy và cách nhắc khi đến hạn', acceptanceCriteria: ['Lưu được tần suất và thời gian hợp lệ', 'Cho phép bật tắt nhắc và cấu hình thời gian hoãn'], roles: ['app-header', 'date-input', 'switch', 'list-item', 'primary-button'] },
      { key: 'BACKUP-REMINDER', title: 'Nhắc backup đến hạn', purpose: 'Giải thích dữ liệu đang chờ và cho phép backup, hoãn hoặc bỏ qua', acceptanceCriteria: ['Hiển thị dung lượng và thời gian dự kiến', 'Có đủ hành động backup ngay, nhắc lại và bỏ qua'], roles: ['app-header', 'status-message', 'primary-button', 'secondary-button', 'tertiary-button'] },
      { key: 'BACKUP-RESULT', title: 'Kết quả backup', purpose: 'Xác nhận kết quả, lỗi cần xử lý và lịch backup tiếp theo', acceptanceCriteria: ['Hiển thị số tệp và dung lượng đã backup', 'Cho phép xem nhật ký hoặc thử lại khi thất bại'], roles: ['app-header', 'status-message', 'list-item', 'primary-button'] },
    ]
  }
  if (/(suat an|bua trua|mon an|pantry|dat mon)/.test(text)) {
    return [
      { key: 'DISCOVER', title: 'Khám phá món ăn', purpose: 'Tìm món phù hợp và xem khả năng phục vụ', acceptanceCriteria: ['Hiển thị món còn nhận đặt', 'Cho phép lọc hoặc tìm món phù hợp'], roles: ['app-header', 'search-input', 'list-item', 'primary-button'] },
      { key: 'SELECT', title: 'Chọn món và thời gian', purpose: 'Chọn món, số lượng và khung giờ nhận', acceptanceCriteria: ['Chọn được số lượng hợp lệ', 'Chỉ cho chọn khung giờ còn phục vụ'], roles: ['app-header', 'list-item', 'date-input', 'primary-button'] },
      { key: 'REVIEW', title: 'Xác nhận đơn', purpose: 'Kiểm tra đơn và người nhận đại diện', acceptanceCriteria: ['Hiển thị đầy đủ món, số lượng và nơi nhận', 'Người dùng xác nhận được đơn hợp lệ'], roles: ['app-header', 'order-summary', 'primary-button'] },
      { key: 'CONFIRM', title: 'Hoàn tất đặt món', purpose: 'Xác nhận đơn đã được ghi nhận', acceptanceCriteria: ['Hiển thị mã đơn duy nhất', 'Thông báo rõ thời gian và địa điểm nhận'], roles: ['app-header', 'status-message', 'primary-button'] },
      { key: 'STATUS', title: 'Theo dõi trạng thái', purpose: 'Theo dõi tiến độ chuẩn bị và nhận món', acceptanceCriteria: ['Hiển thị trạng thái mới nhất', 'Cho phép chia sẻ mã nhận cho nhóm'], roles: ['app-header', 'status-message', 'secondary-button'] },
    ]
  }
  if (/(dat xe|goi xe|chuyen di|tai xe|di chuyen)/.test(text)) {
    return [
      { key: 'ROUTE', title: 'Nhập hành trình', purpose: 'Chọn điểm đón và điểm đến', acceptanceCriteria: ['Điểm đón và điểm đến đều hợp lệ', 'Hiển thị tóm tắt hành trình'], roles: ['app-header', 'text-input', 'primary-button'] },
      { key: 'OPTION', title: 'Chọn phương án di chuyển', purpose: 'So sánh lựa chọn và thời gian dự kiến', acceptanceCriteria: ['Hiển thị ít nhất một lựa chọn khả dụng', 'Nêu rõ thời gian chờ dự kiến'], roles: ['app-header', 'list-item', 'primary-button'] },
      { key: 'REVIEW', title: 'Xác nhận chuyến', purpose: 'Kiểm tra hành trình trước khi gửi yêu cầu', acceptanceCriteria: ['Hiển thị đúng điểm đón, điểm đến và lựa chọn', 'Cho phép xác nhận yêu cầu'], roles: ['app-header', 'order-summary', 'primary-button'] },
      { key: 'MATCH', title: 'Ghép tài xế', purpose: 'Thông báo tiến trình tìm tài xế', acceptanceCriteria: ['Hiển thị trạng thái ghép tài xế', 'Cho phép hủy khi chưa ghép thành công'], roles: ['app-header', 'status-message', 'secondary-button'] },
      { key: 'TRACK', title: 'Theo dõi chuyến', purpose: 'Theo dõi tài xế và trạng thái chuyến', acceptanceCriteria: ['Hiển thị thông tin tài xế đã ghép', 'Cập nhật trạng thái chuyến rõ ràng'], roles: ['app-header', 'status-message', 'primary-button'] },
    ]
  }
  if (/(onboarding|dang ky|xac thuc|tao tai khoan)/.test(text)) {
    return [
      { key: 'REGISTER', title: 'Đăng ký', purpose: 'Thu thập thông tin tối thiểu để tạo tài khoản', acceptanceCriteria: ['Kiểm tra dữ liệu bắt buộc', 'Cho phép tiếp tục với thông tin hợp lệ'], roles: ['app-header', 'text-input', 'phone-input', 'primary-button'] },
      { key: 'VERIFY', title: 'Xác thực', purpose: 'Xác nhận quyền sở hữu thông tin đăng ký', acceptanceCriteria: ['Gửi và kiểm tra mã xác thực', 'Hiển thị lỗi và cho phép thử lại'], roles: ['app-header', 'otp-input', 'secondary-button', 'primary-button'] },
      { key: 'COMPLETE', title: 'Hoàn tất', purpose: 'Thông báo tài khoản đã sẵn sàng', acceptanceCriteria: ['Hiển thị kết quả thành công', 'Có hành động đi tiếp rõ ràng'], roles: ['app-header', 'status-message', 'primary-button'] },
    ]
  }
  return [
    { key: 'START', title: 'Bắt đầu', purpose: 'Tiếp nhận nhu cầu chính của người dùng', acceptanceCriteria: ['Thu thập đủ dữ liệu bắt buộc', 'Giải thích rõ bước tiếp theo'], roles: ['app-header', 'text-input', 'primary-button'] },
    { key: 'CONFIGURE', title: 'Thiết lập yêu cầu', purpose: 'Cho phép người dùng cấu hình lựa chọn chính', acceptanceCriteria: ['Lưu được lựa chọn hợp lệ', 'Hiển thị constraint quan trọng'], roles: ['app-header', 'list-item', 'primary-button'] },
    { key: 'REVIEW', title: 'Kiểm tra và xác nhận', purpose: 'Review toàn bộ dữ liệu trước khi gửi', acceptanceCriteria: ['Hiển thị tóm tắt đầy đủ', 'Cho phép quay lại chỉnh sửa'], roles: ['app-header', 'order-summary', 'primary-button'] },
    { key: 'COMPLETE', title: 'Hoàn tất', purpose: 'Xác nhận yêu cầu đã được xử lý', acceptanceCriteria: ['Hiển thị kết quả rõ ràng', 'Có hành động tiếp theo'], roles: ['app-header', 'status-message', 'primary-button'] },
  ]
}

function journeyForBrief(brief: ProductBrief): JourneyStep[] {
  const text = normalized(`${brief.userGoal} ${brief.mvpScope.join(' ')}`)
  if (brief.productSurface === 'admin_dashboard' || /(dashboard|admin|backoffice|ops|van hanh|booking)/.test(text)) {
    const steps: JourneyStep[] = [
      { key: 'OPS-OVERVIEW', title: 'Tổng quan vận hành', purpose: 'Theo dõi trạng thái chính, việc cần xử lý và cảnh báo mới nhất', acceptanceCriteria: ['Hiển thị số liệu trọng yếu', 'Có trạng thái loading/empty/error'], roles: ['app-header', 'status-message', 'data-card'] },
      { key: 'WORK-QUEUE', title: 'Danh sách booking', purpose: 'Xem, lọc và tìm các booking/yêu cầu cần xử lý', acceptanceCriteria: ['Lọc được theo trạng thái', 'Tìm được theo mã hoặc người phụ trách'], roles: ['app-header', 'search-input', 'list-item', 'filter'] },
      { key: 'EXCEPTION-QUEUE', title: 'Hàng đợi exception', purpose: 'Ưu tiên lỗi, bất thường và booking cần can thiệp thủ công', acceptanceCriteria: ['Nêu rõ lý do exception', 'Có hành động assign, retry hoặc dismiss'], roles: ['app-header', 'status-message', 'list-item', 'primary-button'] },
      { key: 'DETAIL-ACTION', title: 'Chi tiết và xử lý', purpose: 'Review dữ liệu, lịch sử và thực hiện hành động vận hành', acceptanceCriteria: ['Hiển thị đủ lịch sử thay đổi', 'Ghi nhận được quyết định xử lý'], roles: ['app-header', 'order-summary', 'primary-button', 'secondary-button'] },
    ]
    if (/(phan quyen|role|permission|admin|staff)/.test(text)) {
      steps.push({ key: 'ACCESS-CONTROL', title: 'Phân quyền truy cập', purpose: 'Quản lý quyền xem, sửa và duyệt theo vai trò', acceptanceCriteria: ['Phân biệt được admin và staff', 'Không cho thao tác ngoài quyền'], roles: ['app-header', 'list-item', 'switch', 'primary-button'] })
    }
    return steps
  }
  if (brief.productSurface === 'landing_page') {
    return [
      { key: 'LANDING-HERO', title: 'Hero và offer chính', purpose: 'Truyền đạt lời hứa sản phẩm và CTA đầu tiên', acceptanceCriteria: ['Có headline rõ offer', 'CTA chính nổi bật'], roles: ['app-header', 'primary-button', 'status-message'] },
      { key: 'VALUE-PROOF', title: 'Giá trị và bằng chứng', purpose: 'Giải thích lợi ích, use cases và bằng chứng tin cậy', acceptanceCriteria: ['Nêu được 3 lợi ích chính', 'Có proof point hoặc metric'], roles: ['list-item', 'status-message'] },
      { key: 'CONVERSION', title: 'Chuyển đổi người dùng', purpose: 'Thu lead hoặc đưa người dùng sang bước tiếp theo', acceptanceCriteria: ['Form/CTA có validation', 'Có trạng thái success/error'], roles: ['text-input', 'primary-button', 'status-message'] },
    ]
  }
  return journeyForIdea(`${brief.userGoal} ${brief.mvpScope.join(' ')}`)
}

export function synthesizeProductSpecFromBrief(input: ProductSpecFromBriefInput): ProductSpec {
  const brief = input.brief
  if (brief.clarity !== 'clear' || brief.mvpScope.length === 0) {
    throw new Error('ProductBrief chưa đủ rõ để synthesize ProductSpec')
  }
  const steps = journeyForBrief(brief)
  const requirementIds = steps.map((step) => `REQ-${step.key}`)
  const dependencyId = brief.productSurface === 'admin_dashboard' || brief.productSurface === 'web_app'
    ? 'DEP-WEB-RUNTIME'
    : 'DEP-ZALO-MINI-APP'
  const title = input.threadTitle === 'Ý tưởng chưa đặt tên' ? brief.userGoal : input.threadTitle
  const productType = brief.productSurface === 'oa' ? 'oa' : brief.productSurface === 'bot' ? 'bot' : 'mini_app'
  const spec = parseProductSpec({
    ...input.current,
    title,
    status: 'draft',
    idea: {
      ...input.current.idea,
      title,
      summary: `${brief.userGoal}. MVP scope: ${brief.mvpScope.join('; ')}${brief.outOfScope.length ? `. Out of scope: ${brief.outOfScope.join('; ')}` : ''}.`,
      productType,
      targetUsers: brief.targetUsers,
    },
    goals: [{
      id: 'GOAL-MVP-OUTCOME',
      kind: 'goal',
      title: 'Outcome ưu tiên của MVP',
      metric: `Giúp ${brief.targetUsers.join(', ')} hoàn thành ${brief.mvpScope[0]?.toLowerCase() ?? 'tác vụ chính'} với ít bước và trạng thái rõ ràng.`,
    }],
    findings: [
      { id: 'FINDING-CLEAR-BRIEF', kind: 'finding', title: 'Brief đầu vào đủ rõ', evidence: `${Math.round(brief.confidence * 100)}% confidence từ input ban đầu`, sourceType: 'user_input' },
      { id: 'FINDING-PRODUCT-SURFACE', kind: 'finding', title: 'Surface sản phẩm', evidence: brief.productSurface, sourceType: 'user_input' },
      ...(brief.risks.length
        ? [{ id: 'FINDING-RISK', kind: 'finding' as const, title: 'Rủi ro cần review', evidence: brief.risks.join('; '), sourceType: 'user_input' as const }]
        : []),
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
      title: brief.productSurface === 'admin_dashboard' || brief.productSurface === 'web_app'
        ? 'Web app runtime và dữ liệu vận hành'
        : 'Zalo Mini App runtime và ZDS guard',
      dependencyType: 'platform',
      requirementIds,
    }],
    decisions: [
      {
        id: 'DECISION-CLEAR-BRIEF-DRAFT',
        kind: 'decision',
        title: 'Tạo Draft ProductSpec từ brief rõ',
        question: 'Brief đầu vào đã đủ rõ để bỏ qua guided discovery chưa?',
        choice: 'Có, tạo Draft ProductSpec ngay để user review.',
        rationale: 'Input đã nêu surface, scope MVP, người dùng/ngữ cảnh và ít nhất một constraint.',
        status: 'accepted',
      },
      ...brief.outOfScope.map((item, index) => ({
        id: `DECISION-OUT-OF-SCOPE-${stableKey(item, String(index + 1))}`,
        kind: 'decision' as const,
        title: `Loại khỏi MVP: ${item}`,
        question: 'Scope nào chưa đưa vào MVP?',
        choice: item,
        rationale: 'Người dùng nêu rõ trong brief ban đầu.',
        status: 'accepted' as const,
      })),
    ],
    relationships: [
      { id: 'REL-BRIEF-GOAL', type: 'SUPPORTS', source: { kind: 'finding', id: 'FINDING-CLEAR-BRIEF' }, target: { kind: 'goal', id: 'GOAL-MVP-OUTCOME' } },
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
    updatedAt: input.createdAt,
  })
  const issues = validateProductSpecInvariants(spec)
  if (issues.length > 0) throw new Error(`ProductSpec synthesis không đạt invariant: ${issues.map((issue) => issue.message).join('; ')}`)
  return spec
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
