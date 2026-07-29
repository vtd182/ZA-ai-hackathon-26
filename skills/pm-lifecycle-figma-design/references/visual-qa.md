# Visual QA

Review the complete journey and key screens at readable scale.

## First screenshot critique

Inspect:

- hierarchy and focal point;
- text clipping, overflow and unreadable opacity;
- repeated card stacks or repeated screen skeletons;
- realistic content and state continuity;
- CTA prominence and safe-area spacing;
- contrast across neutral, brand and semantic surfaces;
- whether each screen communicates a different user moment;
- whether the success screen leads somewhere useful;
- stray source-demo copy inside cloned components.

Write at least one real correction after this screenshot. Moving a node by one pixel without addressing a visible issue is not a refinement pass.

## Final gates

- No visible placeholder/default component copy.
- No removed or forbidden ProductSpec concept.
- No text outside its product screen/frame, whether mobile, web, dashboard or landing page.
- No visible text below usable opacity.
- In ZDS/reference mode, no ZDS instance extends outside its mobile screen or immediate parent.
- No two top-level ZDS controls visibly overlap unless one is intentionally decorative and named as such.
- Interactive ZDS controls keep usable touch targets; do not shrink buttons, inputs, tabs, chips or list items below 32x32.
- Expected screen count is exact.
- In ZDS/reference mode, at least one real ZDS instance exists and all required controls remain instance-backed. In no-ZDS/free mode, ZDS instance count may be 0.
- Expected prototype links are present on real interaction nodes.
- Final screenshot is taken after the last correction.
- `audit_product_craft` returns `passed: true`.

If the independent audit fails, resume the existing Page and repair only the reported defects. Do not rebuild a new Page and do not claim visual QA passed.
