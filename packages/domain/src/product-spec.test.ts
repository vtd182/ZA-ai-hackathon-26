import { describe, expect, it } from 'vitest'
import { createDraftProductSpec, parseProductSpec } from './product-spec'

function validSpec(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id: 'SPEC-TEST',
    version: 1,
    title: 'Test spec',
    status: 'draft',
    idea: { id: 'IDEA-TEST', kind: 'idea', title: 'Idea', summary: 'Summary', productType: 'mini_app', targetUsers: ['User'] },
    goals: [],
    findings: [],
    requirements: [{
      id: 'REQ-ONE', kind: 'requirement', title: 'Requirement', description: 'Description', priority: 'must', status: 'in_scope',
      acceptanceCriteria: ['It works'], dependsOn: [],
    }],
    screens: [{ id: 'SCREEN-ONE', kind: 'screen', title: 'Screen', purpose: 'Purpose', requirementIds: ['REQ-ONE'], designSystemRoles: ['primary-button'] }],
    stories: [],
    dependencies: [],
    decisions: [],
    relationships: [{
      id: 'REL-ONE', type: 'DESIGNED_BY', source: { kind: 'requirement', id: 'REQ-ONE' }, target: { kind: 'screen', id: 'SCREEN-ONE' },
    }],
    artifactMappings: [],
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z',
  }
}

describe('ProductSpec schema', () => {
  it('creates an isolated empty draft for a new conversation thread', () => {
    const draft = createDraftProductSpec('thread-123', '2026-07-23T00:00:00.000Z')
    expect(draft.id).toBe('SPEC-THREAD-123')
    expect(draft.requirements).toEqual([])
    expect(draft.screens).toEqual([])
    expect(draft.relationships).toEqual([])
  })

  it('accepts a valid versioned spec', () => {
    expect(parseProductSpec(validSpec()).schemaVersion).toBe(1)
  })

  it('rejects unsupported schema versions', () => {
    expect(() => parseProductSpec({ ...validSpec(), schemaVersion: 2 })).toThrow()
  })

  it('rejects duplicate entity IDs', () => {
    const spec = validSpec()
    spec.goals = [{ id: 'REQ-ONE', kind: 'goal', title: 'Duplicate', metric: 'No' }]
    expect(() => parseProductSpec(spec)).toThrow(/Duplicate entity ID/)
  })

  it('rejects dangling and wrong-kind references', () => {
    const spec = validSpec()
    spec.screens = [{ id: 'SCREEN-ONE', kind: 'screen', title: 'Screen', purpose: 'Purpose', requirementIds: ['MISSING'], designSystemRoles: ['primary-button'] }]
    expect(() => parseProductSpec(spec)).toThrow(/Dangling entity reference/)
  })
})
