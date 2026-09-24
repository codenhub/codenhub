---
status: IMPLEMENTED
last_updated: 2026-09-24
scope: Decisions on the eight structural parts the material contract does not express yet -- corner scale, corner pattern, line style, depth in layers, shadow that is not depth, a painted layer, ambient motion, and label treatment -- for `@codenhub/styles@0.5.0`.
---

# Structure for 0.5.0

Implemented in `0.5.0`. It answers every structural part [Model](./model.md#what-the-material-contract-did-not-express) listed in one place, because the answers share two rules and read better together. Where building an answer settled a detail the proposal left open, the section says so under **Built**.

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

**Built.** The modifiers write two privates, `--_scale-size` and `--_scale-pad`; `box` restates both `initial` so a `.card.p-xs` does not shrink the buttons inside it, and an unset step takes the other's value, so a lone `.lg` still grows. `--ui-scale` is the public override, and the package never declares it. Depth scales by the step too, capped at `1` -- down with a small element, never up, so a press that travels an aesthetic's whole depth still lands flat on a `.lg` button; that is what retires chunky tile's list. The pill and chip corners fall back through `--ui-radius`, then `--ui-corner`. Every aesthetic but `.cyber` clears `--ui-radius` and `--ui-radius-surface` to `initial`, so a region nested inside `.cyber` does not inherit its knob.

## 2. Corner pattern

**Decision.** Four per-corner multipliers and two classes.

- **`--ui-corner-tl`, `-tr`, `-br`, `-bl`**, each `0` or `1`, default `1`, multiplying the computed corner in `box` and `surface`.
- **`.cut-diagonal`** (top-left and bottom-right) and **`.cut-diagonal-reverse`** (top-right and bottom-left), which set the multipliers. They work under every aesthetic: under the default look a diagonal is a two-corner leaf; under `.cyber` it is two cuts.

**Built.** `.skeleton` and the tooltip bubble, which set their own radius, read the pattern too. `.cyber` places its control diagonal through the switches; its surfaces cut the opposite diagonal, which the four shared switches cannot say at the same time, so its surface shape is a whole `--ui-radius-surface`, unscaled -- a card is large enough that the full cut is right at every padding. `--cyber-shape` is read as `--ui-radius` with no fallback, so left unset it is guaranteed-invalid and the computed corner draws.

**Not taken.** A hexagon is a bevel whose corner is half the height, which `--ui-radius: 50%` already draws under a bevelling aesthetic, so it needs no class. A parallelogram slants its sides into its content and needs a clip or a transform plus its own padding answer; it is not a corner and stays out. `.cyber`'s `--cyber-shape` knobs stay knobs.

## 3. Line style

**Decision.** **`--ui-line-style`**, default `solid`, read wherever a line is drawn: `box`, the progress track, and the table's head and foot rules. The supported values are `solid`, `dashed`, `dotted`, and `double`. Every component takes it, controls included: a dashed or dotted field line keeps its colour and so its contrast, and looks come first. `double` needs a width of at least `3px` to draw two lines, which the docs state. A pressed state has no value of its own.

**Built.** The table reads it on every rule, the row rules as well as the head and foot boundaries, since they are one line style in one table.

**Not taken.** `outset`, `inset`, `groove`, and `ridge`: each engine derives their two tones differently, so the same token would draw three different bevels. A two-tone bevel is expressed through depth in layers instead (4).

## 4. Depth in layers

**Decision.** A second part-based shadow layer on every component: **`--ui-shadow-2-x`, `-y`, `-blur`, `-spread`**, and **`--ui-shadow-2-ink`**, an amount mixed into the element's own shadow colour the way the first layer's is. It is multiplied by elevation exactly like the first layer, so `.flat`, `.raised`, and `.floating` reach both, and it defaults to an empty layer that paints nothing. `--ui-surface-shadow` stays the surface-only escape for a complete value.

Hover and press keep their counterparts on the first layer only (`--ui-hover-shadow-*`, `--ui-active-shadow-*`). A second layer that must change on press is rare enough to wait until a component needs it.

**Built.** The layer's ink is its presence: `--ui-shadow-2-ink` has no fallback, so undeclared, the whole layer -- its leading comma included -- is invalid and `box` drops it, and no empty layer sits in every component's shadow. `--ui-shadow-2-inset` carries the `inset` keyword, like the first layer's, because a two-tone bevel is two inset layers.

## 5. Shadow that is not depth

**Decision.** A halo layer, **`--ui-halo-blur`**, **`--ui-halo-spread`**, and **`--ui-halo-ink`**, composed in `box` from the element's own intent colour, stacked outside the depth layers and below the focus ring. Elevation does not scale it, so `.flat` leaves it alone, and it reaches every component that composes `box`, not only the two that rest above zero. Indicators, which do not compose `box`, stay out.

`.cyber`'s glow moves onto the halo, which fixes its glow disappearing under `.flat`.

**Built.** Present only when `--ui-halo-ink` is declared, the way the second layer is. Blur and spread default to `0px`. `.cyber`'s fields and chips glow now, which is the reach the decision asked for.

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

**Built.** A button falls back to `none` for case and shadow, which is what the user agent already gives it; a badge leaves both undefined, so it inherits as its text always has. A badge's weight falls back to bold, its weight before the token.

**Breaking.** `--ui-button-weight` and `--ui-button-tracking` are removed without an alias, in the same window as the other removals.

## Tests

- **`registry.json`** records under `material` which utilities read each new token, `registry.test.ts` holds that record against the stylesheets, and it checks every aesthetic names or clears each one.
- **`structure.spec.ts`**, one browser test per decision, on the built files a consumer links: the tighter scale wins; `--ui-radius` still overrides; `.cut-diagonal` rounds two corners; `.flat` keeps the halo; a consumer's `background-image` beats `--ui-surface-image`; a label utility beats `--ui-label-*`; forced colours draw every reset.

## Order

Built in that order: corner scale and pattern together, because `.cyber`'s move to `--ui-corner` needed both; then line style, the two shadow layers, the painted layer, and label treatment. The `0.5.0` changelog lists the breaking changes above alongside the ones already landed.
