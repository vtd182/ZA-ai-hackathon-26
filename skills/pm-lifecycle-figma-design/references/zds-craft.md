# ZDS craft

Use the source Page as a catalog and the output Page as the only writable surface.

## Choosing instances

- Inspect nearby source labels and component properties before cloning.
- Prefer the semantic role and state that match the ProductSpec moment.
- Use app headers, inputs, checkbox/switch controls, snackbar/status and buttons where interaction familiarity matters.
- Avoid cloning a component only because its outer shape resembles the desired primitive.

## Override hygiene

A copied ZDS instance can contain demo labels in visible and hidden descendants. After every clone:

1. Scan its text nodes.
2. Identify every visible label, prefix, suffix, helper, action and status string.
3. Override all visible demo copy.
4. Hide irrelevant optional descendants or choose a cleaner variant.
5. Re-scan after resizing because variant visibility can change.

Reject visible defaults such as `Button`, `Long text button`, `Helper text`, `Weak`, `Slot`, component instructions or source-page documentation.

Use `apply_craft_patch` to clone, place and override related controls in one round-trip. Stable aliases may be referenced as `$alias` by later operations in the same patch. A clone source may be on the read-only ZDS Page, but its parent and every modified target must stay inside the approved artifact root.

## Layout hygiene

- Keep mobile screens at `390x844`.
- Respect Mini App header and bottom safe areas.
- Size controls to their intended width before composing surrounding text.
- Do not stretch a component until internal labels clip or become visually sparse.
- Keep controls aligned to a consistent content grid, but let signature compositions break the grid deliberately.

## Prototype

Connect the actual visible CTA instance or interaction surface, not an invisible overlay and not the whole frame unless the screen is explicitly time-driven. Read back reactions from the source nodes and count real `NODE` destinations.
