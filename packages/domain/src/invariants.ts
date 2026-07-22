import type { EntityKind, ProductSpec } from './product-spec'

export interface ProductSpecInvariantIssue {
  code: 'DANGLING_REFERENCE' | 'DUPLICATE_ID' | 'UNMAPPED_MUST_HAVE'
  message: string
  entityId: string
  expectedKinds?: EntityKind[]
}

export function validateProductSpecInvariants(spec: ProductSpec): ProductSpecInvariantIssue[] {
  const issues: ProductSpecInvariantIssue[] = []
  const mappedByScreen = new Set(spec.screens.flatMap((screen) => screen.requirementIds))
  const mappedByStory = new Set(spec.stories.flatMap((story) => story.requirementIds))

  for (const requirement of spec.requirements) {
    if (requirement.priority !== 'must' || requirement.status !== 'in_scope') continue
    if (!mappedByScreen.has(requirement.id) || !mappedByStory.has(requirement.id)) {
      issues.push({
        code: 'UNMAPPED_MUST_HAVE',
        message: `${requirement.id} must map to at least one screen and one story`,
        entityId: requirement.id,
        expectedKinds: ['screen', 'story'],
      })
    }
  }
  return issues
}

