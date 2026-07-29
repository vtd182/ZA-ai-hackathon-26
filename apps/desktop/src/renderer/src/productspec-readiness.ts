import { validateProductSpecInvariants, type ProductSpec } from '@pm-agent/domain'

export interface ProductSpecReadinessMetric {
  label: string
  value: number
}

export interface ProductSpecReadiness {
  surfaceLabel: string
  truthLabel: string
  artifactLabel: string
  artifactReady: boolean
  metrics: ProductSpecReadinessMetric[]
  blockers: string[]
  nextActions: string[]
}

export function productSurfaceLabel(productSpec: ProductSpec): string {
  return productSpec.findings.find((finding) => finding.id === 'FINDING-PRODUCT-SURFACE')?.evidence
    ?? productSpec.idea.productType
}

export function productSpecReadiness(productSpec: ProductSpec): ProductSpecReadiness {
  const activeRequirements = productSpec.requirements.filter((item) => item.status !== 'removed')
  const activeMustRequirements = activeRequirements.filter((item) => item.priority === 'must')
  const invariantIssues = validateProductSpecInvariants(productSpec)
  const hasArtifactCoverage = productSpec.screens.length > 0 && productSpec.stories.length > 0
  const blockers: string[] = []

  if (activeRequirements.length === 0) {
    blockers.push('Chưa có requirement in-scope để tạo artifact.')
  }
  if (!hasArtifactCoverage && activeRequirements.length > 0) {
    blockers.push('Cần ít nhất một screen và một story map vào requirement.')
  }
  if (invariantIssues.length > 0) {
    blockers.push(`${invariantIssues.length} must-have requirement chưa đủ traceability.`)
  }
  if (productSpec.status !== 'approved') {
    blockers.push('ProductSpec chưa được chốt làm source of truth.')
  }

  const nextActions = productSpec.status === 'approved'
    ? ['Tạo kickoff package', 'Vẽ/refine canvas nếu cần', 'Chuẩn bị change impact khi scope đổi']
    : activeRequirements.length === 0
      ? ['Hoàn thiện ProductSpec', 'Vẽ flow để làm rõ scope', 'Chốt ProductSpec sau khi review']
      : ['Review requirement/screen/story', 'Chốt ProductSpec', 'Tạo kickoff package sau approval']

  return {
    surfaceLabel: productSurfaceLabel(productSpec),
    truthLabel: productSpec.status === 'approved' ? 'Confirmed truth' : 'Draft truth',
    artifactLabel: productSpec.status === 'approved' && blockers.length === 0
      ? 'Artifact-ready'
      : 'Needs review',
    artifactReady: blockers.length === 0,
    metrics: [
      { label: 'Req', value: activeRequirements.length },
      { label: 'Must', value: activeMustRequirements.length },
      { label: 'Screen', value: productSpec.screens.length },
      { label: 'Story', value: productSpec.stories.length },
    ],
    blockers,
    nextActions,
  }
}
