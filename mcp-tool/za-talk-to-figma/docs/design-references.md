# Design References

`za-talk-to-figma` can use a local markdown reference to steer design taste without hardwiring a design system into the runtime.

## Recommended pattern

1. Keep the runtime free of hardcoded DS assumptions.
2. Put taste and visual heuristics into a root-level `DESIGN.md`.
3. Let the playbook layer read `DESIGN.md` first.
4. Still verify against the active Figma canvas before calling a visual task done.

## Why this is safer

- design taste can evolve without code changes
- AI gets stronger guidance than raw prompting alone
- canvas truth still wins when the live file disagrees with the reference

## Using awesome-design-md

Material inspired by [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) is useful as:

- taste direction
- spacing and typography heuristics
- board composition ideas
- naming and documentation patterns

It should not be treated as:

- a pixel source of truth
- a substitute for live Figma context
- a replacement for canvas review

## Practical workflow

When working on design tasks:

1. read `DESIGN.md`
2. inspect the current selection or canvas safely
3. design or edit in Figma
4. run canvas review again before concluding

This pattern is already reflected in the `design_reference_strategy` playbook and the safe review workflows exposed by the runtime.
