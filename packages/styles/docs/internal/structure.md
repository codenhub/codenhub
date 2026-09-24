---
status: DRAFT
last_updated: 2026-09-24
scope: Decisions on the eight structural parts the material contract does not express yet -- corner scale, corner pattern, line style, depth in layers, shadow that is not depth, a painted layer, ambient motion, and label treatment -- for `@codenhub/styles@0.5.0`.
---

# Structure for 0.5.0

This is a proposal, per the repository root `docs/README.md`'s `DRAFT` status: nothing here is built until it is approved. It answers every item under [Roadmap → Structure](./roadmap.md#structure) in one place, because the answers share two rules and read better together.

Each decision is weighed under [What enters the material contract](./model.md#what-enters-the-material-contract): a part enters because a component already draws it and more than one thing can use it, in a form that keeps composition intact, weighing looks, then function, then accessibility. No decision is justified by the aesthetic that would use it.

## Two rules every answer follows

**A token is parts, not a finished value, whenever it carries a colour.** A custom property resolves its `var()` references on the element that declares it ([Indirect tokens resolve once](./model.md#indirect-tokens-resolve-once)), so an aesthetic writing `0 0 8px var(--intent-color)` on a region would colour every nested component with the region's intent. Every new shadow-like token below is published as geometry plus an amount, and `box` mixes the colour on the element itself, the way `--ui-shadow-*` already works. The one exception is a value that takes `currentColor` implicitly, which resolves at the point of use.

**Forced colours draw the plain version.** Each new part is reset in the existing unlayered `forced-colors` block: a solid line, no second shadow layer, no halo, no painted layer, no label shadow. Nothing here is measured under forced colours first; the reset is the decision.

## 1. Corner scale

**Decision.** Two tokens, and `box` computes the radius from them.

- **`--ui-scale`**, a unitless size step published by the size and padding modifiers: `.p-xs` `0.5`, `.sm` and `.p-sm` `0.75`, default `1`, `.lg` and `.p-lg` `1.25`. When both kinds sit on one element, the tighter wins: `box` reads `min()` of the two private steps, so `.lg.p-xs` is small. It is a general size token, not a corner token.
- **`--ui-corner`** and **`--ui-corner-surface`**, lengths an aesthetic sets for the corner at scale `1`.

`box` resolves `border-radius: var(--ui-radius, calc(var(--ui-corner, var(--radius-control)) * var(--ui-scale, 1)))`, and `surface` does the same with the surface pair. An explicit `--ui-radius` still wins, unscaled. `--ui-radius-pill` and `--ui-radius-tight` keep their meaning and are not scaled.

A cut stays a true 45 degrees because the corner is a length, not a percentage, so `.cyber`'s `min(<cut>, 25%)` cap retires. Chunky tile's one remaining selector list, the half lift under `.btn.icon.p-xs`, retires too: its lift reads `--ui-scale`.

**Breaking.** Every aesthetic moves from setting `--ui-radius` to setting `--ui-corner`. A consumer who set `--ui-radius` sees no change.

## 2. Corner pattern

**Decision.** Four per-corner multipliers and two classes.

- **`--ui-corner-tl`, `-tr`, `-br`, `-bl`**, each `0` or `1`, default `1`, multiplying the computed corner in `box` and `surface`.
- **`.cut-diagonal`** (top-left and bottom-right) and **`.cut-diagonal-reverse`** (top-right and bottom-left), which set the multipliers. They work under every aesthetic: under the default look a diagonal is a two-corner leaf; under `.cyber` it is two cuts.

**Not taken.** A hexagon is a bevel whose corner is half the height, which `--ui-radius: 50%` already draws under a bevelling aesthetic, so it needs no class. A parallelogram slants its sides into its content and needs a clip or a transform plus its own padding answer; it is not a corner and stays out. `.cyber`'s `--cyber-shape` knobs stay knobs.

## 3. Line style

**Decision.** **`--ui-line-style`**, default `solid`, read wherever a line is drawn: `box`, the progress track, and the table's head and foot rules. The supported values are `solid`, `dashed`, `dotted`, and `double`. Every component takes it, controls included: a dashed or dotted field line keeps its colour and so its contrast, and looks come first. `double` needs a width of at least `3px` to draw two lines, which the docs state. A pressed state has no value of its own.

**Not taken.** `outset`, `inset`, `groove`, and `ridge`: each engine derives their two tones differently, so the same token would draw three different bevels. A two-tone bevel is expressed through depth in layers instead (4).

## 4. Depth in layers

**Decision.** A second part-based shadow layer on every component: **`--ui-shadow-2-x`, `-y`, `-blur`, `-spread`**, and **`--ui-shadow-2-ink`**, an amount mixed into the element's own shadow colour the way the first layer's is. It is multiplied by elevation exactly like the first layer, so `.flat`, `.raised`, and `.floating` reach both, and it defaults to an empty layer that paints nothing. `--ui-surface-shadow` stays the surface-only escape for a complete value.

Hover and press keep their counterparts on the first layer only (`--ui-hover-shadow-*`, `--ui-active-shadow-*`). A second layer that must change on press is rare enough to wait until a component needs it.

## 5. Shadow that is not depth

**Decision.** A halo layer, **`--ui-halo-blur`**, **`--ui-halo-spread`**, and **`--ui-halo-ink`**, composed in `box` from the element's own intent colour, stacked outside the depth layers and below the focus ring. Elevation does not scale it, so `.flat` leaves it alone, and it reaches every component that composes `box`, not only the two that rest above zero. Indicators, which do not compose `box`, stay out.

`.cyber`'s glow moves onto the halo, which fixes its glow disappearing under `.flat`.

## 6. A painted layer

**Decision.** Surfaces only, like the backdrop: **`--ui-surface-image`**, read by `surface` as its `background-image`, default `none`. Controls do not take it, which keeps `.select`'s chevron and every control label off a pattern. A consumer's own `background-image` on a card, as their utility or their unlayered rule, still beats the component's declaration, the same way it does today.

The aesthetic that sets the layer owns the contrast of text over it; the docs say so. Forced colours reset it to `none` (the rule above).

## 7. Ambient motion

**Decision.** Not exposed. No component draws motion at rest, WCAG 2.2.2 wants a way to pause anything that moves past five seconds, and a CSS-only package cannot ship the control that pauses it. An application that wants rest motion writes its own animation, where it can also write the pause. The roadmap allows this outcome, and this document takes it.

## 8. Label treatment

**Decision.** `--ui-button-*` generalises to **`--ui-label-*`**, read by the components whose text is a label: `.btn` and `.badge`.

- **`--ui-label-weight`** and **`--ui-label-tracking`**, as the button pair works today.
- **`--ui-label-case`**, a `text-transform` value, default `none`.
- **`--ui-label-shadow`**, a `text-shadow` written without a colour, so it takes `currentColor` on the element. A glow of the label's own colour does not lower its contrast, and allowing only that keeps 1.4.3 where it is.

A consumer's own `font-*`, `tracking-*`, and `uppercase` utilities still win, as they do on buttons today.

**Breaking.** `--ui-button-weight` and `--ui-button-tracking` are removed without an alias, in the same window as the other removals.

## Tests

- **`axes.spec.ts`** gains each new token as a live axis: changing it changes rendering on every component the registry says reads it.
- **`registry.json`** records which components read the corner, line, second layer, halo, surface image, and label tokens, and `registry.test.ts` checks every aesthetic still names or clears them.
- **A browser test per decision** for the specific promise: the tighter scale wins; `--ui-radius` still overrides; `.cut-diagonal` rounds two corners; `.flat` keeps the halo; a consumer's `background-image` beats `--ui-surface-image`; a label utility beats `--ui-label-*`; forced colours draw every reset.

## Order

Corner scale first, because the corner pattern and chunky tile's lift build on it; then line style, the two shadow layers, the painted layer, and label treatment, each independent. The `0.5.0` changelog lists the three breaking changes above alongside the ones already landed.
