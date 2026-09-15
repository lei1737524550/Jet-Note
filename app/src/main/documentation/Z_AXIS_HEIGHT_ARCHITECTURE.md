# Jet Note Z-axis height architecture

Native Android layers use small semantic Z-axis heights. CSS `z-index` remains a separate WebView-internal stacking system.

## Native semantic heights

- Content: `0`
- Media: `100`
- Tool / Browser / Dictionary: `200`
- App overlay: `300`

## Frozen A -> B transition

A transition does not search the whole root and does not own a permanent global maximum.

For the actual participating source A and target B:

- `base = max(Z_A, Z_B)`
- full-screen configured Background curtain: `base + 1`
- frozen bitmap animation: `base + 2`

A and B retain their original Z-axis heights. After both bitmap halves have reached their final geometry and the committed frame has survived the next animation frame, the two temporary layers are removed atomically and B remains at its original height.

If A is a native Tool/Browser/Dictionary overlay that must be removed before B can be captured, its real semantic Z-axis height is carried into the transition call instead of being rediscovered from the root after removal.

Do not introduce giant Native Z values such as 2,147,483,647. Android View Z is float-based and cannot reliably represent +1/+2 increments at that magnitude.
