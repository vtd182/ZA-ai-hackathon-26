import { describe, expect, it } from 'vitest'
import type { ArtifactBrief, PlannedAction } from '@pm-agent/domain'
import { artifactBriefFacts, artifactBriefForAction, artifactTargetLabel } from './artifact-brief-copy'

const brief = {
  schemaVersion: 1,
  id: 'artifact:SPEC:v1:jira:abc',
  sourceSpecId: 'SPEC',
  sourceSpecVersion: 1,
  sourcePayloadHash: 'a'.repeat(64),
  target: 'jira',
  mode: 'mock',
  surface: 'admin_dashboard',
  fidelity: 'product_grade',
  outputPolicy: 'mock_store',
  designSystemPolicy: 'none',
  verificationPolicy: ['preflight', 'approval_payload_hash', 'write_receipt', 'read_back'],
  notes: ['Mock connector keeps parity.'],
  createdAt: '2026-07-30T00:00:00.000Z',
} satisfies ArtifactBrief

function action(target: PlannedAction['target'], artifactBrief: ArtifactBrief = brief): Pick<PlannedAction, 'target' | 'payload'> {
  return {
    target,
    payload: {
      schemaVersion: 1,
      type: 'mock_jira_plan',
      planHash: 'b'.repeat(64),
      artifactBrief,
    },
  }
}

describe('artifact brief copy helpers', () => {
  it('extracts package artifact briefs for their matching target', () => {
    expect(artifactBriefForAction(action('jira'))).toEqual(brief)
    expect(artifactBriefForAction(action('figma'))).toBeNull()
  })

  it('formats compact review facts for approval UI', () => {
    expect(artifactTargetLabel('jira')).toBe('Backlog mock')
    expect(artifactTargetLabel('zdoc')).toBe('PRD.md')
    expect(artifactBriefFacts(brief)).toEqual([
      'Mock connector',
      'admin dashboard',
      'Mock store',
      'Không dùng DS',
      '4 bước verify',
    ])
  })
})
