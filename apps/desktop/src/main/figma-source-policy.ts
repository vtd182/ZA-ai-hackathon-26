import type { DesignSystemManifest, ProductSpec } from '@pm-agent/domain'

export function isManagedFigmaArtifactPage(pageName: string): boolean {
  // DualMind is the current tag; ZSpector (previous rebrand) and PM / PM Lifecycle (original) stay
  // recognised so artifacts created before each rename are still rejected as ZDS sources.
  return /^(DualMind|ZSpector|PM(?:\s+Lifecycle)?)\s*[·•]/i.test(pageName.trim())
}

export function requiredFigmaRoles(spec: ProductSpec): string[] {
  const activeRequirementIds = new Set(
    spec.requirements
      .filter((requirement) => requirement.status !== 'removed')
      .map((requirement) => requirement.id),
  )
  return [...new Set(spec.screens
    .filter((screen) => screen.requirementIds.some((id) => activeRequirementIds.has(id)))
    .flatMap((screen) => screen.designSystemRoles))]
    .sort()
}

export function missingFigmaRoles(spec: ProductSpec, manifest: DesignSystemManifest): string[] {
  const available = new Set(
    manifest.components
      .filter((component) => !component.deprecated && component.semanticRole !== 'unmapped')
      .map((component) => component.semanticRole),
  )
  return requiredFigmaRoles(spec).filter((role) => !available.has(role))
}
