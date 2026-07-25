---
name: pm-lifecycle-figma-critic
description: Critique screenshot-backed Zalo Mini App Figma journeys for product fidelity, design taste, decision usefulness and visible defects, then prescribe concrete repairs before approval.
---

# PM Lifecycle Figma critic

Use this skill after an initial Figma screenshot and again after the last intended correction. Critique the rendered artifact, not the plan or tool-call transcript.

## Review lenses

1. **Product truth:** every screen reflects active ProductSpec requirements and excludes removed scope.
2. **Decision usefulness:** a PM can identify the assumption, state or tradeoff being reviewed.
3. **Product fidelity:** central products, objects and states are recognizable; browse and selection screens contain enough realistic alternatives to support a decision.
4. **Art direction:** the journey has a product-specific visual idea, varied screen choreography and controlled semantic color.
5. **Visual integrity:** hierarchy, spacing, clipping, contrast, touch targets, safe areas and prototype continuity survive at readable scale.

## Reject patterns

- Generic card stacks or the same skeleton on every screen.
- Empty circles, blank image wells or abstract geometry standing in for a real subject.
- A browse screen with only one thin sample when the user must choose.
- Placeholder copy, component demo labels or lifecycle narration inside product screens.
- Success screens that end at a checkmark and recovery screens that do not explain consequence.
- Decoration that consumes more attention than the primary task.
- Tiny, low-contrast or clipped text even when an automated audit misses it.

## Correction format

For each real defect, identify:

- the screen or node;
- the visible symptom;
- the product or usability consequence;
- the exact compositional, content or styling correction.

Require at least one substantial write after the initial screenshot. A token color swap or one-pixel move is not a repair unless it resolves the named defect.

## Final verdict

Pass only when:

- the complete journey and key screens have been viewed after the final write;
- central subjects and states are recognizable;
- each screen has a distinct job and useful feedback surface;
- sample data remains consistent across the flow;
- automated craft audit passes with no error issues.

Return repair directions to the design worker. Do not write outside the approved root or weaken ProductSpec truth to improve appearance.
