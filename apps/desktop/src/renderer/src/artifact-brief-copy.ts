import type { ArtifactBrief, PlannedAction } from '@pm-agent/domain'

function actionPayloadObject(action?: Pick<PlannedAction, 'payload'>): Record<string, unknown> | null {
  if (!action?.payload || typeof action.payload !== 'object' || Array.isArray(action.payload)) return null
  return action.payload
}

export function artifactBriefForAction(action?: Pick<PlannedAction, 'payload' | 'target'>): ArtifactBrief | null {
  const payload = actionPayloadObject(action)
  const brief = payload?.artifactBrief
  if (!brief || typeof brief !== 'object' || Array.isArray(brief)) return null
  const candidate = brief as Partial<ArtifactBrief>
  if (candidate.schemaVersion !== 1 || candidate.target !== action?.target) return null
  if (!candidate.mode || !candidate.surface || !candidate.outputPolicy || !candidate.designSystemPolicy) return null
  if (!candidate.sourcePayloadHash || !candidate.sourceSpecVersion || !candidate.verificationPolicy) return null
  return candidate as ArtifactBrief
}

export function artifactTargetLabel(target: PlannedAction['target']): string {
  if (target === 'jira') return 'Backlog mock'
  if (target === 'zdoc') return 'PRD.md'
  return 'Figma'
}

export function artifactBriefFacts(brief: ArtifactBrief | null): string[] {
  if (!brief) return []
  const modeLabel: Record<ArtifactBrief['mode'], string> = {
    zds_strict: 'Strict ZDS',
    zds_reference: 'Reference ZDS',
    free_adaptive: 'No-ZDS creative',
    mock: 'Mock connector',
  }
  const outputLabel: Record<ArtifactBrief['outputPolicy'], string> = {
    selected_page: 'Page đang chọn',
    managed_page: 'Page PM managed',
    mock_store: 'Mock store',
  }
  const dsLabel: Record<ArtifactBrief['designSystemPolicy'], string> = {
    required: 'DS bắt buộc',
    reference: 'DS tham chiếu',
    none: 'Không dùng DS',
  }
  return [
    modeLabel[brief.mode],
    brief.surface.replace(/_/g, ' '),
    outputLabel[brief.outputPolicy],
    dsLabel[brief.designSystemPolicy],
    `${brief.verificationPolicy.length} bước verify`,
  ]
}
