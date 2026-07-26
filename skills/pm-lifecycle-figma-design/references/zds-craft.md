# ZDS craft

Use the source Page as a catalog and the output Page as the only writable surface.

## Choosing instances

- Inspect nearby source labels and component properties before cloning.
- Prefer the semantic role and state that match the ProductSpec moment.
- The brief's `sourceComponents` is a starting palette, not a limit: browse the source ZDS
  Page for the richer surfaces (bottom sheets, tabs, cards, chips, bottom navigation, avatars)
  and clone the one that fits — see `references/component-catalog.md`. A screen of only
  buttons + inputs + a plain list is a wireframe, not a shipped Mini App.
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
- Treat every cloned ZDS control as a real app component, not decoration: it must stay fully inside its screen and parent, avoid overlapping other controls, and keep a readable touch target.
- If a component is intentionally decorative, name it clearly with `icon`, `badge`, `avatar`, `logo`, `illustration`, `image` or `thumbnail` so automated craft audit can distinguish it from an interactive control.

## Prototype

Connect the actual visible CTA instance or interaction surface, not an invisible overlay and not the whole frame unless the screen is explicitly time-driven. Read back reactions from the source nodes and count real `NODE` destinations.
