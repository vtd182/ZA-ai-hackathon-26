import type { ChangePreview, ExecutionSummary, PlannedAction, ProductSpec } from '@pm-agent/domain'
import { productSpecReadiness } from './productspec-readiness'

export type WorkflowReceiptTone = 'neutral' | 'active' | 'verified' | 'warning'

export interface WorkflowStateReceipt {
  tone: WorkflowReceiptTone
  title: string
  status: string
  facts: string[]
  nextActions: string[]
}

export interface WorkflowStateReceiptInput {
  productSpec?: ProductSpec
  preview?: ChangePreview
  execution?: ExecutionSummary
  artifactActions?: PlannedAction[]
  canvasItemCount: number
  sending: boolean
  artifactBusy: boolean
}

function targetLabel(target: PlannedAction['target']): string {
  if (target === 'figma') return 'Figma'
  if (target === 'jira') return 'Backlog mock'
  return 'PRD.md'
}

function activeRequirementCount(productSpec: ProductSpec): number {
  return productSpec.requirements.filter((item) => item.status !== 'removed').length
}

export function workflowStateReceipt(input: WorkflowStateReceiptInput): WorkflowStateReceipt {
  if (input.artifactBusy) {
    return {
      tone: 'active',
      title: 'Artifact sync',
      status: 'Agent Core đang write/read-back theo approval hiện có.',
      facts: ['External writes đang bị khóa theo lượt này.', 'Receipt sẽ được lưu trước khi verify.'],
      nextActions: ['Đợi read-back', 'Retry target lỗi nếu cần'],
    }
  }

  if (input.sending) {
    return {
      tone: 'active',
      title: 'Reasoning turn',
      status: 'Provider đang đề xuất; Agent Core sẽ validate trước khi mutate state.',
      facts: ['Chat/canvas/artifact chưa đổi cho tới khi có output hợp lệ.'],
      nextActions: ['Đợi kết quả', 'Dừng turn nếu provider bị treo'],
    }
  }

  if (input.execution?.status === 'verified') {
    const verifiedTargets = input.execution.actions
      .filter((action) => action.status === 'verified')
      .map((action) => targetLabel(action.target))
    return {
      tone: 'verified',
      title: 'Kickoff verified',
      status: `${verifiedTargets.join(', ')} đã có receipt và read-back.`,
      facts: [
        input.productSpec ? `ProductSpec v${input.productSpec.version} là confirmed truth.` : 'ProductSpec đã được materialize.',
        `${verifiedTargets.length} artifact verified.`,
      ],
      nextActions: ['Export review bundle', 'Yêu cầu change impact khi scope đổi'],
    }
  }

  if (input.execution?.status === 'partial_failure') {
    const failedTargets = input.execution.actions
      .filter((action) => action.status === 'failed' || action.status === 'verification_failed')
      .map((action) => targetLabel(action.target))
    return {
      tone: 'warning',
      title: 'Artifact sync cần xử lý',
      status: failedTargets.length > 0 ? `${failedTargets.join(', ')} chưa verified.` : 'Một phần kickoff package chưa verified.',
      facts: ['Target đã verified được giữ nguyên.', 'Retry chỉ chạy lại phần lỗi.'],
      nextActions: ['Retry target lỗi', 'Kiểm tra Figma setup nếu lỗi Figma'],
    }
  }

  if (input.preview) {
    return {
      tone: 'active',
      title: 'Impact preview',
      status: `ProductSpec v${input.preview.before.version} -> v${input.preview.after.version}; ${input.preview.affectedEntityIds.length} entity bị ảnh hưởng.`,
      facts: ['Chưa có external write nào chạy.', `${input.preview.actions.length} artifact plan sẽ cần approval.`],
      nextActions: ['Review before/after', 'Duyệt hoặc từ chối change plan'],
    }
  }

  const pendingArtifactActions = (input.artifactActions ?? []).filter((action) => action.status === 'pending_approval')
  if (pendingArtifactActions.length > 0) {
    return {
      tone: 'active',
      title: 'Kickoff plan ready',
      status: `${pendingArtifactActions.map((action) => targetLabel(action.target)).join(', ')} đang chờ approval.`,
      facts: [
        input.productSpec ? `Nguồn: ProductSpec v${input.productSpec.version}.` : 'Nguồn ProductSpec đã được snapshot.',
        'Payload hash cố định; đổi payload sẽ mất approval.',
      ],
      nextActions: ['Review ArtifactBrief', 'Duyệt & tạo hoặc hủy writes'],
    }
  }

  if (input.productSpec) {
    const readiness = productSpecReadiness(input.productSpec)
    if (input.productSpec.status === 'approved') {
      return {
        tone: readiness.artifactReady ? 'verified' : 'warning',
        title: 'Confirmed ProductSpec',
        status: `ProductSpec v${input.productSpec.version} · ${readiness.surfaceLabel} · ${readiness.artifactLabel}.`,
        facts: [
          `${activeRequirementCount(input.productSpec)} requirement, ${input.productSpec.screens.length} screen, ${input.productSpec.stories.length} story.`,
          input.canvasItemCount > 0 ? `${input.canvasItemCount} canvas item có thể dùng để feedback.` : 'Canvas chưa có sketch bổ sung.',
        ],
        nextActions: readiness.nextActions.slice(0, 2),
      }
    }

    if (activeRequirementCount(input.productSpec) > 0 || input.canvasItemCount > 0) {
      return {
        tone: 'neutral',
        title: 'Draft ProductSpec',
        status: `ProductSpec v${input.productSpec.version} đang chờ review trước artifact.`,
        facts: [
          `${activeRequirementCount(input.productSpec)} requirement, ${input.productSpec.screens.length} screen, ${input.productSpec.stories.length} story.`,
          input.canvasItemCount > 0 ? `${input.canvasItemCount} canvas item chưa tự động thành business truth.` : 'Canvas chưa có sketch bổ sung.',
        ],
        nextActions: readiness.nextActions.slice(0, 2),
      }
    }
  }

  return {
    tone: 'neutral',
    title: 'Conversation state',
    status: 'Chưa có ProductSpec hoặc artifact được confirm trong thread này.',
    facts: input.canvasItemCount > 0
      ? [`${input.canvasItemCount} canvas item đang ở exploratory state.`]
      : ['Canvas đang trống và chưa có scope được chốt.'],
    nextActions: input.canvasItemCount > 0
      ? ['Sync canvas vào chat', 'Promote canvas khi đã đủ scope']
      : ['Mô tả ý tưởng', 'Vẽ flow khi cần nhìn trực quan'],
  }
}
