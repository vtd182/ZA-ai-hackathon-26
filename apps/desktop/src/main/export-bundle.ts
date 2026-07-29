import {
  artifactBriefSchema,
  type ArtifactBrief,
  type ExecutionSummary,
  type PlannedAction,
} from '@pm-agent/domain'

export interface ExportedArtifactContract {
  target: PlannedAction['target']
  actionId: string
  actionStatus: PlannedAction['status']
  payloadHash: string
  planHash: string | null
  artifactBrief: ArtifactBrief
  executionStatus: string | null
  attempts: number | null
  externalId: string | null
  verified: boolean | null
  verificationIssueCodes: string[]
}

export interface ArtifactContractExport {
  schemaVersion: 1
  sourcePayloadHash: string | null
  sourceHashAligned: boolean
  targets: ExportedArtifactContract[]
}

function payloadValue(action: PlannedAction, key: string): unknown {
  return action.payload && typeof action.payload === 'object' && !Array.isArray(action.payload)
    ? action.payload[key]
    : undefined
}

function artifactBriefForAction(action: PlannedAction): ArtifactBrief | null {
  const parsed = artifactBriefSchema.safeParse(payloadValue(action, 'artifactBrief'))
  if (!parsed.success || parsed.data.target !== action.target) return null
  return parsed.data
}

export function buildArtifactContractExport(
  actions: PlannedAction[],
  execution: ExecutionSummary | null,
): ArtifactContractExport {
  const executionByActionId = new Map((execution?.actions ?? []).map((item) => [item.actionId, item]))
  const targets = actions.flatMap((action): ExportedArtifactContract[] => {
    const artifactBrief = artifactBriefForAction(action)
    if (!artifactBrief) return []
    const executed = executionByActionId.get(action.id)
    const planHash = payloadValue(action, 'planHash')
    return [{
      target: action.target,
      actionId: action.id,
      actionStatus: action.status,
      payloadHash: action.payloadHash,
      planHash: typeof planHash === 'string' ? planHash : null,
      artifactBrief,
      executionStatus: executed?.status ?? null,
      attempts: executed?.attempts ?? null,
      externalId: executed?.receipt?.externalId ?? null,
      verified: executed?.verification?.verified ?? null,
      verificationIssueCodes: executed?.verification?.issues.map((issue) => issue.code) ?? [],
    }]
  })
  const hashes = [...new Set(targets.map((target) => target.artifactBrief.sourcePayloadHash))]
  return {
    schemaVersion: 1,
    sourcePayloadHash: hashes.length === 1 ? hashes[0]! : null,
    sourceHashAligned: targets.length > 0 && hashes.length === 1,
    targets,
  }
}

function targetLabel(target: PlannedAction['target']): string {
  if (target === 'jira') return 'Backlog mock'
  if (target === 'zdoc') return 'PRD.md'
  return 'Figma'
}

export function renderArtifactContractsMarkdown(summary: ArtifactContractExport): string {
  const lines = [
    '# Kickoff artifact contracts',
    '',
    `Source ProductSpec hash: ${summary.sourcePayloadHash ?? 'mixed or unavailable'}`,
    `Hash aligned: ${summary.sourceHashAligned ? 'yes' : 'no'}`,
    '',
  ]
  if (summary.targets.length === 0) {
    lines.push('_No approved or pending artifact contracts were present at export time._')
    return lines.join('\n')
  }
  for (const target of summary.targets) {
    lines.push(
      `## ${targetLabel(target.target)}`,
      '',
      `- Action: \`${target.actionId}\` · ${target.actionStatus}`,
      `- Payload hash: \`${target.payloadHash}\``,
      `- Plan hash: \`${target.planHash ?? 'n/a'}\``,
      `- ArtifactBrief: ${target.artifactBrief.mode} · ${target.artifactBrief.surface} · ${target.artifactBrief.outputPolicy} · ${target.artifactBrief.designSystemPolicy}`,
      `- Source: ProductSpec v${target.artifactBrief.sourceSpecVersion} · \`${target.artifactBrief.sourcePayloadHash}\``,
      `- Verification policy: ${target.artifactBrief.verificationPolicy.join(', ')}`,
      `- Execution: ${target.executionStatus ?? 'not started'} · attempts ${target.attempts ?? 0} · external ${target.externalId ?? 'n/a'}`,
      `- Verified: ${target.verified === null ? 'n/a' : target.verified ? 'yes' : 'no'}`,
      target.verificationIssueCodes.length ? `- Verification issues: ${target.verificationIssueCodes.join(', ')}` : '- Verification issues: none',
      '',
    )
  }
  return lines.join('\n')
}
