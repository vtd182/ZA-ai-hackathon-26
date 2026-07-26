---
name: pm-lifecycle-figma-design
description: Craft and visually refine product-grade Zalo Mini App Figma journeys from a PM Lifecycle ProductSpec through the allowlisted ZA Talk To Figma MCP.
---

# PM Lifecycle Figma design

Use this skill for an approved Figma design task. The goal is a believable product experience that a PM and designer can review, not a wireframe export.

## Read first

Read these references before writing:

1. `references/experience-direction.md` to turn ProductSpec into a designed journey.
2. `references/design-references.md` for the taste system and best-in-class per-domain patterns to adapt.
3. `references/component-catalog.md` for the full ZDS component families and when to use each (sheets, tabs, cards, chips, nav — not just buttons/inputs).
4. `references/zds-craft.md` before cloning or overriding ZDS instances.
5. `references/product-fidelity.md` before composing browse, selection or object-focused screens.
6. `../pm-lifecycle-figma-critic/SKILL.md` before the first screenshot and again before completion.
7. `references/visual-qa.md` before the first screenshot and again before completion.

## Boundaries

- Work only in the exact Figma session and output Page named in the task.
- Treat the provided source Page as a read-only ZDS catalog.
- Preserve the scaffold root, screen frames and lifecycle metadata. The sparse scaffold is an execution anchor, not a wireframe or visual suggestion.
- Use real ZDS instances for controls. Use custom frames, text, shapes, imagery and composition for product identity.
- Do not access files, pages, connectors or MCP servers outside the approved task.

## Craft loop

1. Inspect the ProductSpec truth, sparse scaffold and relevant ZDS source instances.
   Active requirements and each screen's purpose are authoritative. Never reintroduce a removed requirement from stale historical copy, an old decision or a broad idea summary.
2. Define one clear experience promise and a visual direction appropriate to the product.
3. Author the information architecture and composition from scratch. Make every screen serve a distinct user moment, state and decision. Avoid repeated card stacks, generic rectangles and placeholder copy.
4. Compose mobile screens at `390x844`. Keep readable hierarchy, stable spacing, realistic sample data and accessible touch targets. Use `apply_craft_patch` for coherent groups of dependent create/clone/style operations; keep each patch inside the approved root and read back after a partial failure.
5. Connect real CTA instances to their destination screens.
6. Capture an initial screenshot of the complete journey and individual screens where needed.
7. Use the Figma critic skill to inspect hierarchy, product fidelity, clipping, overlap, contrast, density, repetition, narrative continuity and ZDS fit.
8. Make at least one concrete refinement based on the screenshot, then capture a final screenshot.
9. Read back the output Page and confirm the screen count, ZDS instances and prototype links.
10. Scan final text against every removed requirement's title and description. Remove any stale concept before reporting `removedRequirementMentions: 0`.
11. Call `audit_product_craft` with the approved root and expected counts. Treat every error as repair input; never convert an audit failure into a caveat.

## Taste rules

- Start from the product's emotional and functional moment, not from a component inventory.
- Let one or two signature moments carry the visual identity; keep routine screens calmer.
- Give the journey at least one domain-specific signature composition or custom visual treatment; a stack of generic rectangles is not a finished design.
- Use more than one surface and semantic color family. Zalo blue may anchor actions without dominating every container.
- Prefer specific microcopy and plausible data over labels that describe the UI.
- Represent the actual product, object or service users choose. Empty circles, generic image placeholders and abstract geometry do not count as product fidelity.
- Give browse and selection moments enough believable options and discriminating content to support a real decision.
- Do not reuse one screen skeleton across the journey.
- Do not add decoration that competes with the primary action.
- Fix visible defects before reporting success. Tool success alone is not visual verification.
- Every cloned instance is unfinished until all visible source-demo copy has been inspected and either intentionally retained or overridden.
- Prefer a small number of strong compositions over many layers. Visual richness comes from hierarchy, rhythm, contrast, content and product-specific state, not decoration count.

## Completion

Return only the JSON report required by the caller. Set `visualQaPassed` to true only after an initial screenshot, at least one refinement and a final screenshot have all completed. Report `removedRequirementMentions: 0` only after the final semantic scan.
