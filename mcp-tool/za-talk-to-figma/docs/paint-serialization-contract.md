# Paint serialization contract

Figma read responses preserve paint semantics as typed objects:

```json
[
  { "type": "SOLID", "color": "#0068ff", "opacity": 0.8 },
  { "type": "GRADIENT_LINEAR", "gradientStops": [] },
  { "type": "IMAGE", "scaleMode": "FILL" }
]
```

Rules:

- hidden paints are omitted;
- `opacity` is omitted when it is `1`;
- gradient stop alpha is emitted as `colorOpacity`;
- image bytes and hashes are never returned by this serializer;
- `"mixed"` is preserved for mixed Figma values;
- empty/no paint returns `undefined` and is omitted from JSON.

The Go read consumers accept this typed contract. `generate_zinstant` also accepts the legacy array-of-hex format so older captured bundles remain readable. New plugin responses must not downgrade gradients, images or opacity to the legacy hex-only shape because Design System audits need the paint type.

