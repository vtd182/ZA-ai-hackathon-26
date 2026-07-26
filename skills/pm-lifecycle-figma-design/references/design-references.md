# Design references — taste and proven patterns

Wireframe fidelity is not the bar. Aim for a screen that looks like it shipped in a
top-tier Vietnamese consumer app. Study how real apps solve each domain and adapt the
pattern with ZDS controls — do not copy their brand, only their craft.

## Taste system (apply on every screen)

- **Depth:** float content and CTAs on soft shadows; never a flat wall of bordered boxes.
  Reserve the strongest elevation for the one focal element.
- **Type scale with contrast:** one large screen title (26–32), clear section headings
  (17–20 semibold), calm body (13–14), quiet captions (11–12). Weight, not just size,
  carries hierarchy.
- **One focal moment per screen:** a hero image/map/photo/number the eye lands on first.
- **Real imagery, not blobs:** a recognizable subject (map, food photo, avatar, receipt,
  chart) — structured shapes if no asset, never an empty ellipse.
- **8pt rhythm:** consistent 8/16/24 spacing; generous safe-area top and bottom.
- **Color discipline:** one brand action color, a calm neutral surface family, semantic
  success/warning. Use tint fills sparingly for emphasis, not on every card.
- **Motion-ready:** compose so a tap can Smart-Animate to the next screen (shared header,
  persistent bottom bar, consistent card positions).

## Per-domain patterns (learn from the best-in-class)

**Ride-booking** (cf. Grab / Gojek / Be): full-bleed **map hero** with pickup + dropoff
pins and route line; a **bottom sheet** that rises with the task; **car-type chips** with
price/ETA; a **driver card** (avatar, name, rating ★, plate, vehicle, arrival countdown);
live-tracking with status pill. Success = trip summary + fare breakdown + rate driver,
not a bare checkmark.

**Food / grocery ordering** (cf. ShopeeFood / GrabFood): sticky **category chips**; **photo
cards** (image, name, price, ★ rating, prep time, distance); quantity steppers; a **sticky
cart bar** with item count + total. Confirmation carries the exact items, receiver and
pickup time forward.

**Booking / scheduling**: a **slot grid or calendar** as the focal area; selected slot is
unmistakable; a compact summary (service, time, price) before confirm.

**Utility / status** (backup, wallet, tracking): a **status hero** (big state + reassurance
line), a **meter/gauge** (storage, progress, balance), a schedule/next-run row, and a
single primary action. Recovery states explain cause + a safe next step.

## Anti-patterns that read as "cheap"

- Repeated header + three tinted cards + bottom button on every screen.
- Abstract ellipse/rounded-rect standing in for a real subject.
- Tiny flat cards with no elevation and near-equal text sizes.
- Generic success checkmark that leads nowhere.
- Lifecycle/wireframe/component labels shown as user-facing copy.

Before the first screenshot, name the reference pattern you are adapting for each screen
and confirm the focal moment and depth are present — not just clean spacing.
