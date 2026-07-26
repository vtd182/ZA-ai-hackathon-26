# ZDS component catalog & usage

The `sourceComponents` in the brief is a **starting palette, not a limit.** Browse the
approved source ZDS Page for the richer surfaces below and clone the one that fits the
moment — a screen built from only buttons + inputs + a list reads as a wireframe, not a
shipped Mini App.

## Component families (reach for these, not just buttons/inputs)

- **App header** — screen title, back, actions.
- **Buttons** — primary / secondary / tertiary. One primary action per screen.
- **Inputs** — text, search, phone, OTP, password, dropdown/select, date, textarea.
- **List item / Card** — the workhorse for content. Use a **card** (image + title + meta +
  price/rating) for browse/選択 screens; a list item for dense settings/menus.
- **Chips** — filters, categories, quick selections (multi-select, horizontally scrollable).
- **Tabs / Segmented control** — switch between sibling views inside one screen.
- **Bottom navigation** — persistent app-level sections (fixed at the bottom safe area).
- **Modal** — a blocking decision that must be resolved (destructive confirm, required choice).
- **Bottom sheet** — a non-blocking, thumb-reachable surface that rises for selection,
  confirmation, quantity, filters or a short form. **Prefer a bottom sheet over a full-screen
  navigation for choices and confirmations — it reads as a real mobile app.**
- **Snackbar / toast** — transient feedback ("Đã thêm vào giỏ").
- **Avatar, badge, tag** — identity and status.
- **Progress, stepper (quantity)** — multi-step flows and quantity selection.
- **Switch, checkbox, radio, slider** — settings and options.
- **Calendar, rating** — scheduling and reviews.

## When to use which (heuristics)

- Choosing among options → **chips** (few, inline) or a **bottom sheet** (many, focused).
- Confirming an action → **bottom sheet** (normal) or **modal** (destructive/blocking).
- Switching views in place → **tabs / segmented**, not a new screen.
- App sections → **bottom navigation**, persistent across screens.
- Quantity / steps → **stepper / progress**.
- Feedback that doesn't need a decision → **snackbar**, not a modal.

## States (a real product shows more than the happy path)

Give at least one meaningful non-default state with the right component: empty (illustration +
primary action), loading (skeletons), error/recovery (clear cause + safe next step, e.g. a
snackbar or an inline card), and success that leads into a real next product state.

## Reference vs free mode

- **Reference mode (a ZDS ref is configured):** prefer real ZDS instances for every
  interactive control; only compose a labeled custom primitive when the ref genuinely lacks a
  surface. Keep the ref's spacing, radius and color language.
- **Free mode (no ref):** compose freely with strong art direction, but still design like the
  Zalo Mini App system (one brand action color, calm surfaces, 8pt rhythm, real content).
