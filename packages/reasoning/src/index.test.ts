import { describe, expect, it } from 'vitest'
import { createScaffoldFigmaBlueprint, ProviderRegistry, inferLocalCommands } from './index'
import { parseProductSpec } from '@pm-agent/domain'

const creativeTestSpec = parseProductSpec({
  schemaVersion: 1,
  id: 'SPEC-CREATIVE',
  version: 1,
  title: 'Mini App đặt xe',
  status: 'draft',
  idea: {
    id: 'IDEA-CREATIVE',
    kind: 'idea',
    title: 'Đặt xe',
    summary: 'Đặt chuyến nhanh và theo dõi tài xế.',
    productType: 'mini_app',
    targetUsers: ['Hành khách'],
  },
  goals: [{ id: 'GOAL-1', kind: 'goal', title: 'Đặt nhanh', metric: 'Hoàn tất trong 4 bước' }],
  findings: [],
  requirements: [{
    id: 'REQ-1', kind: 'requirement', title: 'Chọn điểm đón', description: 'Chọn điểm đón và điểm đến',
    priority: 'must', status: 'in_scope', acceptanceCriteria: ['Điểm đón hợp lệ'], dependsOn: [],
  }],
  screens: [{
    id: 'SCREEN-1', kind: 'screen', title: 'Chọn điểm đón', purpose: 'Chọn hành trình',
    requirementIds: ['REQ-1'], designSystemRoles: ['app-header', 'location-input', 'primary-button'],
  }],
  stories: [{
    id: 'STORY-1', kind: 'story', title: 'Đặt chuyến', requirementIds: ['REQ-1'], acceptanceCriteria: ['Tạo chuyến'],
  }],
  dependencies: [],
  decisions: [],
  relationships: [],
  artifactMappings: [],
  createdAt: '2026-07-24T00:00:00.000Z',
  updatedAt: '2026-07-24T00:00:00.000Z',
})

describe('mock provider command inference', () => {
  it('maps Vietnamese remove-payment intent', () => {
    const result = inferLocalCommands('Bỏ payment khỏi MVP')
    expect(result.commands).toEqual([{ type: 'remove_card', query: 'payment' }])
  })

  it('switches lifecycle view', () => {
    const result = inferLocalCommands('Mở view change impact')
    expect(result.commands).toContainEqual({ type: 'switch_view', view: 'change' })
  })

  it('leaves rich visual fallback planning to Agent Core', () => {
    const result = inferLocalCommands('Vẽ workflow xử lý yêu cầu')
    expect(result.commands).toEqual([])
    expect(result.intent.kind).toBe('draw')
    expect(result.message).toContain('journey')
  })

  it('returns deterministic phase-specific decision data', () => {
    const first = inferLocalCommands('Đề xuất phương án', 'decide')
    const second = inferLocalCommands('Đề xuất phương án', 'decide')
    expect(first).toEqual(second)
    expect(first).toMatchObject({ phase: 'decide', phaseData: { recommendedOptionId: 'OPT-LEAN' } })
    expect(first.message).toContain('hai phương án MVP')
  })

  it('limits discovery to three structured questions', () => {
    const result = inferLocalCommands('Bắt đầu discovery', 'discover')
    expect(result.phase).toBe('discover')
    expect(result.intent.kind).toBe('discovery')
    if (result.phase === 'discover') expect(result.phaseData.questions).toHaveLength(3)
  })

  it('keeps ordinary Vietnamese product language as conversation', () => {
    const result = inferLocalCommands('Nền tảng kết nối hành khách với tài xế đối tác và theo dõi chuyến')
    expect(result.intent.kind).toBe('conversation')
  })

  it('keeps the accented offline ambiguity fixture on the structured change path', () => {
    expect(inferLocalCommands('Bỏ cái đó').intent.kind).toBe('change')
  })

  it('routes an explicit mock canvas edit without guessing a target', () => {
    const result = inferLocalCommands('Sửa canvas nhưng chưa chọn target')
    expect(result.intent).toEqual({ kind: 'edit', target: null, artifactAction: null })
  })

  it('routes explicit mock Figma and promotion requests into guarded intents', () => {
    expect(inferLocalCommands('Tạo thiết kế này trên Figma').intent).toEqual({
      kind: 'artifact',
      target: null,
      artifactAction: 'prepare',
    })
    expect(inferLocalCommands('Chốt flow này thành MVP').intent.kind).toBe('promote')
  })

  it('normalizes Mock completion into contiguous provider events and explicit capabilities', async () => {
    const provider = new ProviderRegistry().get('mock')
    const response = await provider.reason({
      threadId: 'THREAD', phase: 'discover', message: 'Khám phá', recentMessages: [], remoteRef: null,
    }, { modelId: 'deterministic-v1' }, new AbortController().signal)
    expect(response.events.map((event) => event.type)).toEqual(['turn_started', 'text_delta', 'result', 'turn_completed'])
    expect(response.events.map((event) => event.sequence)).toEqual([0, 1, 2, 3])
    expect(response.capabilities).toEqual(provider.capabilities)
  })

  it('treats a canvas selection as conversation context instead of implicit edit permission', async () => {
    const provider = new ProviderRegistry().get('mock')
    const response = await provider.reason({
      threadId: 'THREAD',
      phase: 'discover',
      message: 'Bạn thấy phần đăng nhập này đã đủ rõ chưa?',
      recentMessages: [],
      responseMode: 'route',
      selection: {
        entityId: 'SCREEN-LOGIN',
        label: 'Màn hình đăng nhập',
        shapeIds: ['shape-login'],
        selectedShapeCount: 1,
      },
      remoteRef: null,
    }, { modelId: 'deterministic-v1' }, new AbortController().signal)

    expect(response.result.intent.kind).toBe('conversation')
    expect(response.result.commands).toEqual([])
  })

  it('never leaks canvas mutation commands on a route turn even when the text matches a command keyword', async () => {
    const provider = new ProviderRegistry().get('mock')
    const response = await provider.reason({
      threadId: 'THREAD',
      phase: 'change',
      message: 'Mình nghĩ nên bỏ payment khỏi MVP, bạn thấy sao?',
      recentMessages: [],
      responseMode: 'route',
      remoteRef: null,
    }, { modelId: 'deterministic-v1' }, new AbortController().signal)

    // Direct slash/creative turns own mutation; a lightweight route turn must not
    // carry remove_card/switch_view even though the wording would infer one.
    expect(response.result.commands).toEqual([])
  })

  it('critiques a synced selection without pretending selection-only context is a canvas change', async () => {
    const provider = new ProviderRegistry().get('mock')
    const response = await provider.reason({
      threadId: 'THREAD',
      phase: 'discover',
      message: 'Sync canvas. Hãy đọc vùng đang chọn.',
      recentMessages: [],
      responseMode: 'route',
      selection: {
        entityId: 'privacy-status',
        label: 'Không tự động báo ai · Đang riêng tư',
        shapeIds: ['shape-privacy'],
        selectedShapeCount: 1,
      },
      canvasDiff: {
        schemaVersion: 1,
        fromRevision: 7,
        toRevision: 11,
        changes: [],
        selectedShapeIds: ['shape-privacy'],
        summary: 'Không có thay đổi hình học hoặc nội dung; chỉ cập nhật vùng chọn',
      },
      remoteRef: null,
    }, { modelId: 'deterministic-v1' }, new AbortController().signal)

    expect(response.result.intent.kind).toBe('conversation')
    expect(response.result.message).toContain('lượt đưa selection vào ngữ cảnh chat')
    expect(response.result.message).toContain('Chỉ chia sẻ khi bạn chọn')
    expect(response.result.message).not.toContain('thay đổi 7')
    expect(response.suggestions.map((suggestion) => suggestion.label)).toEqual([
      'Đổi sang copy tích cực',
      'So sánh hai cách viết',
    ])
  })

  it('turns a free-form idea into a specific tension without drawing or starting lifecycle', async () => {
    const provider = new ProviderRegistry().get('mock')
    const idea = 'Tôi đang nghĩ về một mini app giúp gia đình nhắc nhau uống thuốc, nhưng không muốn nó tạo cảm giác bị giám sát.'
    const response = await provider.reason({
      threadId: 'THREAD',
      phase: 'discover',
      message: idea,
      recentMessages: [{ id: 'MESSAGE-1', threadId: 'THREAD', role: 'user', content: idea, createdAt: '2026-07-26T00:00:00.000Z' }],
      responseMode: 'route',
      remoteRef: null,
    }, { modelId: 'deterministic-v1' }, new AbortController().signal)

    expect(response.result.intent.kind).toBe('conversation')
    expect(response.result.commands).toEqual([])
    expect(response.result.message).toContain('nhắc nhau uống thuốc')
    expect(response.result.message).toContain('bị giám sát')
    expect(response.result.message).toContain('Canvas sẽ vẫn trống')
    expect(response.suggestions.map((suggestion) => suggestion.label)).toEqual([
      'Phản biện giả định',
      'Chốt ranh giới',
      'Phác moment chính',
    ])
  })

  it('uses the original idea when a suggestion asks for a deeper critique', async () => {
    const provider = new ProviderRegistry().get('mock')
    const idea = 'Tôi đang nghĩ về một mini app giúp gia đình nhắc nhau uống thuốc, nhưng không muốn nó tạo cảm giác bị giám sát.'
    const response = await provider.reason({
      threadId: 'THREAD',
      phase: 'discover',
      message: 'Hãy phản biện giá trị người dùng và giả định nguy hiểm nhất của ý tưởng này',
      recentMessages: [
        { id: 'MESSAGE-1', threadId: 'THREAD', role: 'user', content: idea, createdAt: '2026-07-26T00:00:00.000Z' },
        { id: 'MESSAGE-2', threadId: 'THREAD', role: 'assistant', content: 'Tension ban đầu', createdAt: '2026-07-26T00:00:01.000Z' },
      ],
      responseMode: 'route',
      remoteRef: null,
    }, { modelId: 'deterministic-v1' }, new AbortController().signal)

    expect(response.result.message).toContain('nhắc nhau uống thuốc')
    expect(response.result.message).toContain('Giả định nguy hiểm nhất')
    expect(response.result.message).not.toContain('Ta có thể đào sâu')
    expect(response.suggestions.map((suggestion) => suggestion.label)).toContain('Nêu tình huống khó')
  })

  it('creates a provider-owned creative Figma blueprint with primitives and complete ZDS coverage', async () => {
    const provider = new ProviderRegistry().get('mock')
    const response = await provider.reason({
      threadId: 'THREAD',
      phase: 'deliver',
      message: 'Tạo Figma gần product',
      recentMessages: [],
      responseMode: 'figma',
      productSpec: creativeTestSpec,
      figmaComponentRoles: ['app-header', 'location-input', 'primary-button'],
      remoteRef: null,
    }, { modelId: 'deterministic-v1' }, new AbortController().signal)

    const blueprint = response.result.figmaBlueprint
    expect(blueprint?.screens.map((screen) => screen.screenId)).toEqual(creativeTestSpec.screens.map((screen) => screen.id))
    for (const screen of creativeTestSpec.screens) {
      const generated = blueprint?.screens.find((candidate) => candidate.screenId === screen.id)
      const roles = generated?.elements.flatMap((element) => element.componentRole ? [element.componentRole] : []) ?? []
      expect(roles).toEqual(expect.arrayContaining(screen.designSystemRoles))
      expect(generated?.elements.some((element) => element.kind === 'frame')).toBe(true)
      expect(generated?.elements.some((element) => element.kind === 'text' && Boolean(element.text))).toBe(true)
    }
  })

  it('creates a sparse agentic scaffold without prescribing generic card composition', () => {
    const blueprint = createScaffoldFigmaBlueprint(
      creativeTestSpec,
      ['app-header', 'location-input', 'primary-button'],
      { sparse: true },
    )
    const elements = blueprint.screens[0]!.elements

    expect(elements.map((element) => element.name)).not.toContain('Product moment')
    expect(elements.map((element) => element.name)).not.toContain('Product detail')
    expect(elements.some((element) => element.kind === 'text')).toBe(false)
    expect(elements.filter((element) => element.kind === 'component').map((element) => element.componentRole))
      .toEqual(expect.arrayContaining(['app-header', 'location-input', 'primary-button']))
    expect(blueprint.visualNarrative).toContain('Scaffold tối thiểu')
  })

  it('keeps deterministic fallback copy inside compact ZDS control limits', async () => {
    const longTitleSpec = parseProductSpec({
      ...creativeTestSpec,
      screens: [{
        ...creativeTestSpec.screens[0],
        title: 'Kết nối nguồn backup đã sẵn sàng nhưng cần xử lý lỗi đồng bộ',
        designSystemRoles: ['app-header', 'status-message', 'primary-button'],
      }],
    })
    const provider = new ProviderRegistry().get('mock')
    const response = await provider.reason({
      threadId: 'THREAD',
      phase: 'deliver',
      message: 'Tạo Figma gần product',
      recentMessages: [],
      responseMode: 'figma',
      productSpec: longTitleSpec,
      figmaComponentRoles: ['app-header', 'status-message', 'primary-button'],
      remoteRef: null,
    }, { modelId: 'deterministic-v1' }, new AbortController().signal)

    const components = response.result.figmaBlueprint?.screens[0]?.elements
      .filter((element) => element.kind === 'component') ?? []
    expect(components.find((element) => element.componentRole === 'app-header')?.componentText?.length)
      .toBeLessThanOrEqual(32)
    expect(components.find((element) => element.componentRole === 'status-message')?.componentText?.length)
      .toBeLessThanOrEqual(64)
  })

  it('keeps every active ProductSpec screen after canvas promotion expands the journey', async () => {
    const requirements = Array.from({ length: 17 }, (_, index) => ({
      id: `REQ-${index + 1}`,
      kind: 'requirement' as const,
      title: `Yêu cầu ${index + 1}`,
      description: `Nghiệp vụ cho màn hình ${index + 1}`,
      priority: 'must' as const,
      status: 'in_scope' as const,
      acceptanceCriteria: [`Màn hình ${index + 1} hoạt động`],
      dependsOn: [],
    }))
    const expandedSpec = parseProductSpec({
      ...creativeTestSpec,
      id: 'SPEC-EXPANDED',
      requirements,
      screens: requirements.map((requirement, index) => ({
        id: `SCREEN-${index + 1}`,
        kind: 'screen',
        title: `Màn hình ${index + 1}`,
        purpose: `Hoàn tất bước ${index + 1}`,
        requirementIds: [requirement.id],
        designSystemRoles: ['app-header', 'primary-button'],
      })),
      stories: [],
      relationships: [],
      artifactMappings: [],
    })
    const provider = new ProviderRegistry().get('mock')
    const response = await provider.reason({
      threadId: 'THREAD',
      phase: 'deliver',
      message: 'Tạo Figma từ ProductSpec vừa promote',
      recentMessages: [],
      responseMode: 'figma',
      productSpec: expandedSpec,
      figmaComponentRoles: ['app-header', 'primary-button'],
      remoteRef: null,
    }, { modelId: 'deterministic-v1' }, new AbortController().signal)

    expect(response.result.figmaBlueprint?.screens.map((screen) => screen.screenId))
      .toEqual(expandedSpec.screens.map((screen) => screen.id))
  })
})
