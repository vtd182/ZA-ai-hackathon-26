import { createHash } from 'node:crypto'
import {
  artifactIssueSchema,
  figmaArtifactPlanSchema,
  figmaPreflightPlanSchema,
  type ArtifactIssue,
  type DesignContentSection,
  type DesignScreenRecipe,
  type FigmaDesignDirection,
  type DesignSlot,
  type DesignSystemManifest,
  type FigmaArtifactPlan,
  type FigmaCreativeBlueprint,
  type FigmaPreflightPlan,
  type FigmaTargetBinding,
  type ProductSpec,
  validateFigmaCreativeBlueprintStructure,
} from '@pm-agent/domain'
import { stableStringify, type JsonValue } from '@pm-agent/shared'
import type { PreflightResult } from './contract'

export interface FigmaPlanMetadataInput {
  runId: string
  threadId: string
  actionId: string
  idempotencyKey: string
  pageStrategy?: 'create_new' | 'create_or_recover_incomplete' | 'create_or_reuse_managed'
}

function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase()
}

function designDirectionFor(spec: ProductSpec): FigmaDesignDirection {
  const context = normalized(`${spec.title} ${spec.idea.summary}`)
  if (/(backup|sao luu|nhac du lieu)/.test(context)) {
    return {
      conceptName: 'Quiet confidence',
      productPromise: 'Mọi dữ liệu quan trọng đều an toàn, nhưng người dùng chỉ bị gián đoạn khi thực sự cần hành động.',
      tone: 'calm',
      density: 'comfortable',
      palette: 'trust-green',
      principles: [
        { title: 'Safety at a glance', detail: 'Trạng thái an toàn, dữ liệu chờ và lần backup tiếp theo phải đọc được trong vài giây.' },
        { title: 'Progressive urgency', detail: 'Màu sắc và hierarchy chỉ tăng cường khi đến hạn, có lỗi hoặc cần quyết định.' },
        { title: 'Reversible control', detail: 'Backup ngay, hoãn và bỏ qua luôn rõ hậu quả, không tạo cảm giác ép buộc.' },
      ],
    }
  }
  if (/(suat an|bua trua|mon an|pantry|dat mon)/.test(context)) {
    return {
      conceptName: 'Fast lunch, shared rhythm',
      productPromise: 'Một trải nghiệm đặt món nhóm nhanh, giàu thông tin và vẫn nhẹ nhàng trong nhịp làm việc.',
      tone: 'warm',
      density: 'comfortable',
      palette: 'warm-coral',
      principles: [
        { title: 'Choice without overload', detail: 'Ưu tiên món, thời gian nhận và trạng thái còn suất trước chi tiết phụ.' },
        { title: 'Group clarity', detail: 'Người đặt, thành viên và điểm nhận luôn có hierarchy riêng.' },
        { title: 'Confident confirmation', detail: 'Tổng tiền, trạng thái và hành động tiếp theo phải không thể hiểu nhầm.' },
      ],
    }
  }
  return {
    conceptName: 'Focused utility',
    productPromise: `Biến ${spec.title} thành một hành trình rõ ràng, có chủ đích và gần với trải nghiệm Mini App thật.`,
    tone: 'focused',
    density: 'comfortable',
    palette: 'zalo-blue',
    principles: [
      { title: 'One primary task', detail: 'Mỗi màn hình có một hierarchy và một hành động chính rõ ràng.' },
      { title: 'System-led consistency', detail: 'Interaction controls dùng Design System; composition phản ánh đúng mục đích sản phẩm.' },
      { title: 'State before decoration', detail: 'Success, empty, loading và error được thể hiện bằng nội dung và cấu trúc trước màu sắc.' },
    ],
  }
}

function section(
  key: string,
  kind: DesignContentSection['kind'],
  title: string,
  body: string,
  tone: DesignContentSection['tone'],
  items: DesignContentSection['items'] = [],
): DesignContentSection {
  return { key, kind, title, body, tone, items }
}

function presentationFor(screen: ProductSpec['screens'][number], sequence: number): DesignScreenRecipe['presentation'] {
  const id = normalized(`${screen.id} ${screen.title}`)
  if (id.includes('backup-overview') || id.includes('tong quan backup')) {
    return {
      archetype: 'dashboard',
      eyebrow: 'TRẠNG THÁI HỆ THỐNG',
      headline: 'Dữ liệu của bạn đang an toàn',
      supportingText: 'Tổng quan lần sao lưu gần nhất, dữ liệu mới và lịch chạy tiếp theo.',
      sections: [
        section('backup-health', 'status', 'An toàn', 'Backup gần nhất hôm qua lúc 22:30.', 'success', [
          { label: 'Đã bảo vệ', value: '12,4 GB' },
          { label: 'Đang chờ', value: '3 tệp mới' },
        ]),
        section('next-run', 'metric_grid', 'Lịch tiếp theo', 'Hệ thống chỉ chạy khi đủ điều kiện.', 'brand', [
          { label: 'Thời gian', value: 'Hôm nay · 22:30' },
          { label: 'Điều kiện', value: 'Wi-Fi · Pin > 30%' },
        ]),
        section('recent-activity', 'timeline', 'Hoạt động gần đây', 'Không có lỗi cần xử lý.', 'neutral', [
          { label: 'Hôm qua', value: '486 ảnh · Thành công' },
          { label: 'Thứ Hai', value: '24 tài liệu · Thành công' },
        ]),
      ],
      navigationLabel: 'Tổng quan',
    }
  }
  if (id.includes('backup-source') || id.includes('nguon backup')) {
    return {
      archetype: 'selection',
      eyebrow: 'BƯỚC 1 / 2',
      headline: 'Bạn muốn bảo vệ dữ liệu nào?',
      supportingText: 'Chọn nguồn, loại dữ liệu và nơi lưu. Có thể thay đổi bất cứ lúc nào.',
      sections: [
        section('source-account', 'status', 'Cloud Drive đã kết nối', 'minh@work.vn · còn trống 36 GB', 'success'),
        section('data-scope', 'choice_list', 'Dữ liệu được chọn', 'Ước tính 12,4 GB cho lần đầu.', 'brand', [
          { label: 'Ảnh & video', value: '2.840 tệp' },
          { label: 'Tài liệu', value: '186 tệp' },
          { label: 'Screenshots', value: 'Không chọn' },
        ]),
        section('network-rule', 'info', 'Sử dụng dữ liệu hợp lý', 'Chỉ backup khi có Wi-Fi để tránh phát sinh chi phí.', 'neutral'),
      ],
      navigationLabel: 'Nguồn backup',
    }
  }
  if (id.includes('backup-schedule') || id.includes('lich va nhac')) {
    return {
      archetype: 'configuration',
      eyebrow: 'BƯỚC 2 / 2',
      headline: 'Tự động đúng lúc, nhắc vừa đủ',
      supportingText: 'Thiết lập thời điểm an toàn nhất để chạy và cách ứng xử khi người dùng bỏ lỡ.',
      sections: [
        section('schedule', 'metric_grid', 'Lịch tự động', 'Áp dụng theo múi giờ thiết bị.', 'brand', [
          { label: 'Tần suất', value: 'Mỗi ngày' },
          { label: 'Thời gian', value: '22:30' },
        ]),
        section('reminder-rule', 'choice_list', 'Quy tắc nhắc', 'Không gửi lại nếu backup đã hoàn tất.', 'accent', [
          { label: 'Nhắc trước', value: '15 phút' },
          { label: 'Nếu bỏ lỡ', value: 'Nhắc lại sau 30 phút' },
        ]),
        section('run-conditions', 'info', 'Điều kiện chạy', 'Wi-Fi ổn định · Pin trên 30% · Ưu tiên khi đang sạc.', 'neutral'),
      ],
      navigationLabel: 'Lịch & nhắc',
    }
  }
  if (id.includes('backup-reminder') || id.includes('nhac backup')) {
    return {
      archetype: 'interrupt',
      eyebrow: 'ĐẾN LỊCH BACKUP · 22:30',
      headline: '3,2 GB đang chờ được bảo vệ',
      supportingText: 'Khoảng 8 phút trên Wi-Fi hiện tại. Bạn vẫn có thể tiếp tục dùng Mini App.',
      sections: [
        section('pending-backup', 'progress', 'Sẵn sàng backup', '510 tệp mới từ lần gần nhất.', 'brand', [
          { label: 'Ảnh & video', value: '486 tệp' },
          { label: 'Tài liệu', value: '24 tệp' },
        ]),
        section('impact', 'info', 'Không làm gián đoạn công việc', 'Backup chạy nền và sẽ dừng nếu kết nối không ổn định.', 'neutral'),
      ],
      navigationLabel: 'Nhắc backup',
    }
  }
  if (id.includes('backup-result') || id.includes('ket qua backup')) {
    return {
      archetype: 'result',
      eyebrow: 'HOÀN TẤT LÚC 22:38',
      headline: '510 tệp đã an toàn',
      supportingText: 'Lần backup này hoàn tất trong 7 phút 42 giây và không có lỗi.',
      sections: [
        section('result-summary', 'confirmation', 'Backup thành công', 'Mã phiên BK-0723 · Cloud Drive', 'success', [
          { label: 'Dung lượng', value: '3,2 GB' },
          { label: 'Tệp đã lưu', value: '510' },
        ]),
        section('next-backup', 'status', 'Lịch tiếp theo', 'Ngày mai lúc 22:30.', 'brand'),
        section('audit-note', 'info', 'Nhật ký sạch', 'Không có tệp bị bỏ qua hoặc lỗi cần thử lại.', 'neutral'),
      ],
      navigationLabel: 'Kết quả',
    }
  }

  const title = screen.title
  const roleText = screen.designSystemRoles.join(' ')
  const archetype: DesignScreenRecipe['presentation']['archetype'] = /error|status-message/.test(roleText) && /hoàn tất|thành công|error|lỗi/i.test(title)
    ? 'result'
    : /input|checkbox|switch|date/.test(roleText)
      ? 'form'
      : /summary|review|xác nhận/i.test(`${roleText} ${title}`)
        ? 'review'
        : sequence === 0 ? 'browse' : 'selection'
  return {
    archetype,
    eyebrow: `BƯỚC ${sequence + 1}`,
    headline: title,
    supportingText: screen.purpose,
    sections: [
      section('primary-context', archetype === 'result' ? 'confirmation' : 'info', title, screen.purpose, archetype === 'result' ? 'success' : 'brand'),
      section('product-state', 'status', 'Trạng thái cần thiết kế', 'Nội dung thật, trạng thái mặc định và trường hợp cần hành động.', 'neutral'),
    ],
    navigationLabel: title,
  }
}

function contentForRole(role: string, screenName: string, purpose: string): Record<string, string> {
  if (role === 'app-header') return { text: screenName }
  if (role === 'primary-button') {
    if (/tổng quan backup/i.test(screenName)) return { text: 'Backup ngay' }
    if (/nguồn backup/i.test(screenName)) return { text: 'Lưu nguồn backup' }
    if (/lịch và nhắc/i.test(screenName)) return { text: 'Lưu kế hoạch' }
    if (/nhắc backup/i.test(screenName)) return { text: 'Backup ngay' }
    if (/kết quả backup/i.test(screenName)) return { text: 'Xem nhật ký backup' }
    return { text: /hoàn tất|complete/i.test(screenName) ? 'Hoàn tất' : 'Tiếp tục' }
  }
  if (role === 'secondary-button') return { text: /nhắc backup/i.test(screenName) ? 'Nhắc lại sau 30 phút' : 'Quay lại' }
  if (role === 'tertiary-button') return { text: /nhắc backup/i.test(screenName) ? 'Bỏ qua lần này' : 'Để sau' }
  if (role === 'date-input') return { text: /backup/i.test(screenName) ? 'Mỗi ngày · 22:30' : 'Chọn ngày' }
  if (role === 'switch') return { text: /backup/i.test(screenName) ? 'Nhắc trước 15 phút' : 'Bật thông báo' }
  if (role === 'checkbox') return { text: /backup/i.test(screenName) ? 'Ảnh, video và tài liệu' : 'Đã chọn' }
  if (role === 'status-message') {
    if (/tổng quan backup/i.test(screenName)) return { text: 'An toàn · Backup gần nhất hôm qua 22:30' }
    if (/nhắc backup/i.test(screenName)) return { text: '3,2 GB đang chờ · khoảng 8 phút' }
    if (/kết quả backup/i.test(screenName)) return { text: 'Backup hoàn tất · 510 tệp đã an toàn' }
  }
  if (role.includes('input')) return { text: role === 'otp-input' ? 'Nhập mã xác thực' : 'Nhập thông tin' }
  return { text: purpose }
}

function slotForRole(role: string, index: number, screenName: string, purpose: string): DesignSlot {
  return {
    key: `${String(index + 1).padStart(2, '0')}-${slug(role)}`,
    label: role.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' '),
    required: true,
    requiredRoles: [role],
    preferredRoles: [],
    variantProperties: {},
    content: contentForRole(role, screenName, purpose),
    children: [],
  }
}

function recipesFor(spec: ProductSpec, creativeBlueprint?: FigmaCreativeBlueprint): DesignScreenRecipe[] {
  const activeRequirementIds = new Set(spec.requirements.filter((item) => item.status !== 'removed').map((item) => item.id))
  const productScreens = spec.screens.filter((screen) => screen.requirementIds.some((id) => activeRequirementIds.has(id)))
  const screens = creativeBlueprint
    ? creativeBlueprint.screens.map((creativeScreen) => {
        const productScreen = productScreens.find((screen) => screen.id === creativeScreen.screenId)
        return productScreen ?? {
          id: creativeScreen.screenId,
          kind: 'screen' as const,
          title: creativeScreen.name,
          purpose: creativeScreen.purpose,
          requirementIds: creativeScreen.requirementIds,
          designSystemRoles: creativeScreen.elements.flatMap((element) => element.componentRole ? [element.componentRole] : []),
        }
      })
    : productScreens
  return screens.map((screen, sequence) => {
    const next = screens[sequence + 1]
    const creativeScreen = creativeBlueprint?.screens.find((candidate) => candidate.screenId === screen.id)
    const creativeSlots = creativeScreen?.elements
      .filter((element) => element.kind === 'component' && element.componentRole)
      .map((element) => ({
        key: element.id,
        label: element.name,
        required: true,
        requiredRoles: [element.componentRole!],
        preferredRoles: [],
        variantProperties: {},
        content: element.componentText ? { text: element.componentText } : {},
        children: [],
      }))
    return {
      schemaVersion: 1,
      screenId: screen.id,
      name: screen.title,
      purpose: screen.purpose,
      requirementIds: screen.requirementIds.filter((id) => activeRequirementIds.has(id)),
      layout: 'vertical',
      sequence,
      presentation: presentationFor(screen, sequence),
      slots: creativeSlots?.length
        ? creativeSlots
        : screen.designSystemRoles.map((role, index) => slotForRole(role, index, screen.title, screen.purpose)),
      prototypeEdges: creativeBlueprint
        ? creativeBlueprint.prototypeEdges
          .filter((edge) => edge.fromScreenId === screen.id)
          .map((edge) => ({
            key: edge.key,
            fromScreenId: edge.fromScreenId,
            toScreenId: edge.toScreenId,
            trigger: edge.trigger,
            action: edge.action,
            ...(edge.delayMs !== undefined ? { delayMs: edge.delayMs } : {}),
            ...(edge.transition ? { transition: edge.transition } : {}),
          }))
        : next ? [{
        key: `edge:${screen.id}:${next.id}`,
        fromScreenId: screen.id,
        toScreenId: next.id,
        trigger: 'on_tap' as const,
        action: 'navigate' as const,
      }] : [],
    }
  })
}

export function createFigmaArtifactPlan(
  spec: ProductSpec,
  target: FigmaTargetBinding,
  manifest: DesignSystemManifest,
  metadata: FigmaPlanMetadataInput,
  mode: FigmaArtifactPlan['mode'] = 'strict',
  creativeBlueprint?: FigmaCreativeBlueprint,
): FigmaArtifactPlan {
  if (creativeBlueprint) {
    validateFigmaCreativeBlueprintStructure(creativeBlueprint)
    const activeRequirementIds = new Set(spec.requirements.filter((item) => item.status !== 'removed').map((item) => item.id))
    for (const screen of spec.screens.filter((item) => item.requirementIds.some((id) => activeRequirementIds.has(id)))) {
      const creativeScreen = creativeBlueprint.screens.find((candidate) => candidate.screenId === screen.id)
      if (!creativeScreen) throw new Error(`Creative blueprint is missing ProductSpec screen ${screen.id}`)
      const creativeRoles = new Set(creativeScreen.elements.flatMap((element) => element.componentRole ? [element.componentRole] : []))
      const missingRoles = screen.designSystemRoles.filter((role) => !creativeRoles.has(role))
      if (missingRoles.length > 0) {
        throw new Error(`Creative screen ${screen.id} is missing required ZDS roles: ${missingRoles.join(', ')}`)
      }
    }
    for (const screen of creativeBlueprint.screens) {
      const unknownRequirements = screen.requirementIds.filter((id) => !activeRequirementIds.has(id))
      if (unknownRequirements.length > 0) {
        throw new Error(`Creative screen ${screen.screenId} references out-of-scope requirements: ${unknownRequirements.join(', ')}`)
      }
      for (const element of screen.elements.filter((candidate) => candidate.kind === 'component')) {
        const limit = element.componentRole === 'app-header'
          ? 32
          : element.componentRole?.includes('button')
            ? 28
            : element.componentRole?.includes('message')
              ? 64
              : null
        if (limit && (element.componentText?.length ?? 0) > limit) {
          throw new Error(
            `Creative component ${element.id} (${element.componentRole}) exceeds its ${limit}-character content-fit limit`,
          )
        }
      }
    }
  }
  const availableTokens = new Set(Object.values(manifest.tokens).flat().map((token) => token.name))
  const requiredTokens = ['color/brand/primary', 'color/text/primary', 'color/surface/default', 'type/body/medium', 'space/4', 'radius/container']
    .filter((token) => availableTokens.has(token))
  return figmaArtifactPlanSchema.parse({
    schemaVersion: 1,
    kind: 'figma_design_system_plan',
    mode,
    target,
    manifestFingerprint: manifest.fingerprint,
    requiredTokens,
    designDirection: creativeBlueprint
      ? {
          conceptName: creativeBlueprint.conceptName.slice(0, 80),
          productPromise: creativeBlueprint.productPromise.slice(0, 180),
          tone: 'confident',
          density: 'comfortable',
          palette: 'zalo-blue',
          principles: creativeBlueprint.principles.slice(0, 4).map((principle) => ({
            title: principle.slice(0, 80),
            detail: principle.slice(0, 180),
          })),
        }
      : designDirectionFor(spec),
    ...(creativeBlueprint ? { creativeBlueprint } : {}),
    metadata: {
      namespace: 'za.pm-lifecycle/v1',
      ...metadata,
      specId: spec.id,
      specVersion: spec.version,
      artifactPageName: `DualMind · ${spec.title.slice(0, 54)} · v${spec.version}`,
    },
    screens: recipesFor(spec, creativeBlueprint),
  })
}

export function hashFigmaPreflightPlan(plan: FigmaPreflightPlan): string {
  return createHash('sha256').update(stableStringify(plan as unknown as JsonValue)).digest('hex')
}

export function preflightFigmaArtifactPlan(
  input: FigmaArtifactPlan,
  manifest: DesignSystemManifest,
  allowedTarget: FigmaTargetBinding,
): PreflightResult<FigmaPreflightPlan> {
  const plan = figmaArtifactPlanSchema.parse(input)
  const issues: ArtifactIssue[] = []
  const targetMatches = plan.target.targetHash === allowedTarget.targetHash
    && plan.target.sessionId === allowedTarget.sessionId
    && plan.target.pageId === allowedTarget.pageId
  if (!targetMatches) {
    issues.push({ code: 'TARGET_NOT_ALLOWED', severity: 'error', message: 'Figma target does not match the active sandbox allowlist.' })
  }
  if (plan.manifestFingerprint !== manifest.fingerprint) {
    issues.push({ code: 'MANIFEST_CHANGED', severity: 'error', message: 'Design System manifest changed after the artifact plan was created.' })
  }
  if (plan.creativeBlueprint) {
    const recipeById = new Map(plan.screens.map((screen) => [screen.screenId, screen]))
    const creativeIds = new Set(plan.creativeBlueprint.screens.map((screen) => screen.screenId))
    for (const recipe of plan.screens) {
      if (!creativeIds.has(recipe.screenId)) {
        issues.push({
          code: 'CREATIVE_SCREEN_MISSING',
          severity: 'error',
          message: `Creative blueprint is missing ProductSpec screen ${recipe.screenId}.`,
          entityId: recipe.screenId,
        })
      }
    }
    for (const screen of plan.creativeBlueprint.screens) {
      const recipe = recipeById.get(screen.screenId)
      if (!recipe) {
        issues.push({
          code: 'CREATIVE_SCREEN_UNKNOWN',
          severity: 'error',
          message: `Creative blueprint contains a screen outside ProductSpec: ${screen.screenId}.`,
          entityId: screen.screenId,
        })
        continue
      }
      const creativeRequirements = [...screen.requirementIds].sort()
      const recipeRequirements = [...recipe.requirementIds].sort()
      if (stableStringify(creativeRequirements as JsonValue) !== stableStringify(recipeRequirements as JsonValue)) {
        issues.push({
          code: 'CREATIVE_TRACEABILITY_MISMATCH',
          severity: 'error',
          message: 'Creative screen requirementIds do not match ProductSpec traceability.',
          entityId: screen.screenId,
        })
      }
      const text = screen.elements.map((element) => element.text ?? element.componentText ?? '').join(' ')
      if (/thông tin chính|lựa chọn của người dùng|trạng thái hiện tại|lorem ipsum|placeholder/i.test(text)) {
        issues.push({
          code: 'CREATIVE_PLACEHOLDER_CONTENT',
          severity: 'error',
          message: 'Creative screen still contains generic placeholder content.',
          entityId: screen.screenId,
        })
      }
      if (!screen.elements.some((element) => element.kind === 'component')) {
        issues.push({
          code: 'CREATIVE_ZDS_CONTROL_MISSING',
          severity: plan.mode === 'strict' ? 'error' : 'warning',
          message: 'Creative screen has no ZDS-backed interaction control.',
          entityId: screen.screenId,
        })
      }
    }
  } else {
    issues.push({
      code: 'CREATIVE_BLUEPRINT_MISSING',
      severity: 'warning',
      message: 'Legacy deterministic compositor is active; this plan is not product-grade creative synthesis.',
    })
  }

  const componentsByRole = new Map(manifest.components.map((component) => [component.semanticRole, component]))
  const resolvedSlots = plan.screens.flatMap((screen) => screen.slots.map((slot) => {
    const component = slot.requiredRoles.map((role) => componentsByRole.get(role)).find((item) => item && !item.deprecated)
    const deprecated = slot.requiredRoles.map((role) => componentsByRole.get(role)).find((item) => item?.deprecated)
    if (!component) {
      const severity = plan.mode === 'strict' && slot.required ? 'error' as const : 'warning' as const
      issues.push({
        code: deprecated ? 'DEPRECATED_COMPONENT' : 'MISSING_COMPONENT_ROLE',
        severity,
        message: deprecated
          ? `Only a deprecated component resolves slot ${slot.key}.`
          : `No component resolves required roles: ${slot.requiredRoles.join(', ')}.`,
        entityId: screen.screenId,
      })
    }
    return {
      screenId: screen.screenId,
      slotKey: slot.key,
      required: slot.required,
      componentKey: component?.key ?? null,
      componentBinding: component
        ? component.binding ?? { kind: 'component_key' as const, key: component.key }
        : null,
      semanticRole: component?.semanticRole ?? null,
      // strict alone treats a missing role as an unresolved gap; reference and free let the
      // agent creatively fill it with a labeled primitive instead of blocking.
      resolution: component ? 'component' as const : plan.mode !== 'strict' ? 'primitive_fallback' as const : 'missing' as const,
    }
  }))

  const allTokens = new Set(Object.values(manifest.tokens).flat().map((token) => token.name))
  const resolvedTokens = plan.requiredTokens.filter((name) => allTokens.has(name))
  for (const token of plan.requiredTokens) {
    if (!allTokens.has(token)) issues.push({ code: 'MISSING_TOKEN', severity: 'error', message: `Required token is missing: ${token}.` })
  }
  if (!manifest.forbiddenRawStyles) {
    issues.push({ code: 'RAW_STYLE_POLICY_DISABLED', severity: 'warning', message: 'Manifest does not explicitly forbid raw styles.' })
  }

  const preflightPlan = figmaPreflightPlanSchema.parse({
    schemaVersion: 1,
    source: plan,
    resolvedSlots,
    resolvedTokens,
    estimatedOperations: 1
      + plan.screens.length
      + resolvedSlots.length
      + (plan.creativeBlueprint?.screens.reduce((count, screen) => count + screen.elements.length, 0) ?? 0)
      + plan.screens.reduce((count, screen) => count + screen.prototypeEdges.length + screen.presentation.sections.length, 0),
  })
  const parsedIssues = issues.map((issue) => artifactIssueSchema.parse(issue))
  return {
    allowed: !parsedIssues.some((issue) => issue.severity === 'error'),
    plan: preflightPlan,
    planHash: hashFigmaPreflightPlan(preflightPlan),
    issues: parsedIssues,
  }
}
