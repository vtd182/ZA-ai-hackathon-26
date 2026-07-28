import type { DesignSystemManifest, ProductSpec } from '@pm-agent/domain'

export function isManagedFigmaArtifactPage(pageName: string): boolean {
  // ZSpector is the current tag; PM / PM Lifecycle stay recognised for artifacts created before
  // the rebrand so old output Pages are still rejected as ZDS sources.
  return /^(ZSpector|PM(?:\s+Lifecycle)?)\s*[·•]/i.test(pageName.trim())
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
