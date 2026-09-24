---
status: IMPLEMENTED
last_updated: 2026-09-24
scope: Decision to ship a `.cyber` aesthetic, and the `--ui-corner-shape`, `--ui-radius-pill`, and `--ui-radius-tight` material tokens it needs.
---

# Cyber: bevelled corners, a neon edge, and a glow

This is agreed direction, shipped in `0.4.0`. Future work touching this surface MUST follow it, and the current code is expected to comply, per the repository root `docs/README.md`'s `IMPLEMENTED` status.

It states the decision and the values the implementation must reproduce, not drop-in code, for the reason [`.progress` gains presentation](./progress-presentation-axes.md) gives.

## The look

Bevelled (chamfered) corners, a thin bright edge, a glow in the component's own colour, and a technical typeface. Actions press.

## What the model allowed, and what it did not

[Model](./model.md#what-the-other-aesthetics-on-the-list-will-need) listed cyberpunk as "clipped corners, edge width, glow via shadow tint" in Tier 1. That combination does not hold:

- **A clip removes the glow.** `clip-path` clips every outer shadow, so a chamfer cut with `--ui-clip` leaves nothing outside the silhouette to glow.
- **A clip removes the diagonal edge.** `.pixel` gets away with an inset ring because its cut is square and exactly as deep as the ring, so the ring covers the step. A 45-degree cut has no ring along the diagonal, and the outline reads as broken at every corner.

`corner-shape: bevel` is the property that draws the corner itself. It keeps `border-radius` as the cut size, and the border, the outer shadow, the focus outline, and the backdrop all follow the bevel. Measured in Chromium for this proposal: border, 12px glow, and a 3px offset outline all follow the cut, and nothing is clipped.

Support, measured and checked against caniuse on 2026-09-23: Chromium and Edge from 139; not Firefox; Safari only in Technology Preview. Playwright's bundled Firefox and WebKit report `CSS.supports("corner-shape", "bevel")` as false.

## Decision

### C1. A new material token, `--ui-corner-shape`

| Token               | Fallback | Meaning                                   |
| ------------------- | -------- | ----------------------------------------- |
| `--ui-corner-shape` | `round`  | Shape of every corner `--ui-radius` sets. |

Every site that reads `--ui-radius` or `--ui-radius-surface` reads it beside, as `corner-shape: var(--ui-corner-shape, round)`: `box`, `surface`, and the components that write their own `border-radius` (badge, switch track and knob, progress track and fill, the tooltip bubble and icon, the checkbox, and the content chips). `round` is the property's initial value, so the declaration is a no-op wherever no aesthetic sets the token, and an engine without the property drops it at parse time. The implementation measures its layer cost the way [The cost of a no-op](./model.md#the-cost-of-a-no-op) did, and adds the row.

**Fully round becomes a diamond.** A bevel on a full radius cuts to points: a diamond on something square, a pointed hexagon on something wider than it is tall. Revised after review of the first implementation: every fully round shape takes that cut rather than refusing it -- `.radio` and its dot, `.btn.pill`, and the components that are pills by default (badge, switch track and knob, progress track and fill, tooltip icon). The first draft forced `.radio` and `.btn.pill` round, on the reasoning that a diamond radio reads as neither a radio nor a checkbox; reviewed on pixels, the diamond radio is unmistakable beside a checkbox that is a plain square (below), and it keeps its dot.

### C1a. Two corner tokens beside the radius

A per-corner shape (C2) cannot reach the components that are pills by default, or the chips that cap their corner, through `--ui-radius` alone: a pill's fallback is a full radius that `--ui-radius` would replace with the control shape, and a chip's cap is `min(--ui-radius, --radius-small)`, which takes a single length and turns invalid on a multi-value radius. Two tokens, each read ahead of `--ui-radius` so an aesthetic that sets neither changes nothing:

| Token               | Read as                                                           | Read by                                                             |
| ------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| `--ui-radius-pill`  | `var(--ui-radius-pill, var(--ui-radius, <full>))`                 | badge, switch track and knob, progress track and fill, tooltip icon |
| `--ui-radius-tight` | `min(var(--ui-radius-tight, var(--ui-radius, <small>)), <small>)` | checkbox, `.kbd`, `.code`                                           |

`.radio` and `.btn.pill` draw a full radius of their own and read neither.

**Every aesthetic declares the three tokens.** The four shipped aesthetics declare `--ui-corner-shape: round` and clear `--ui-radius-pill` and `--ui-radius-tight` with `initial`, so a region of any of them nested inside `.cyber` inherits none of its corners. This is the same rule that makes each of them clear `--ui-clip` and `--ui-shadow-edge`.

### C2. The aesthetic

`.cyber`, shipped from `./aesthetics/cyber` and `./tw/aesthetics/cyber` and included in both aggregates. Tier 1 only: no selector list.

- **Corners.** `--cyber-cut`, default `0.625rem` (raised from the first draft's `0.5rem` on review), is the one cut size for controls and surfaces alike, so a button and the card around it read as the same material. Two shapes then place that cut on opposite diagonals, so they read as different things: controls cut top-left and bottom-right (`<cut> 0`), surfaces top-right and bottom-left (`0 <cut>`). Each shape is a knob that takes any `border-radius` value, `--cyber-shape` and `--cyber-shape-surface`, and the documentation lists presets -- all four corners, a hexagon, a parallelogram, a single notch -- as copy-paste values rather than as classes. Pills cut to points through `--ui-radius-pill`, and chips square through `--ui-radius-tight: 0`, which is what tells the checkbox from the diamond radio.
- **The cut is a ceiling.** The default shapes cap it at a quarter of the element's own box, `min(<cut>, 25%)`, so a normal button or a card takes the full cut and a 15-19px icon button about 4-5px instead of losing its corners to it. Added after review: nothing in the model scales a corner with a component's size, and a radius percentage is the one length that already knows the box. Horizontal percentages resolve against the width and vertical ones against the height, so on a small wide button the cut runs slightly shallower than 45 degrees; at those sizes it is not visible. A shape set through a knob is taken as written. Superseded in `0.5.0` by the corner scale in [Structure for 0.5.0](./structure.md#1-corner-scale): the cut is `--ui-corner`, `box` scales it with the size step, and the cap is gone. The glow moved onto the halo in the same release ([5](./structure.md#5-shadow-that-is-not-depth)).
- **Fallback.** Where `corner-shape` is not supported, an `@supports not (corner-shape: bevel)` block squares the control and surface corners (radius `0`) rather than leaving them round: a rounded cyber element reads as a different aesthetic, a square one as the same aesthetic simplified. What is fully round stays round there -- a square radio is a checkbox, and a pill is the nearest a diamond gets without a bevel.
- **Edge.** 1px, drawn in `--ui-ink`. The ink is a knob, `--cyber-ink`, defaulting to the theme-following neutral neobrutalism and pixel use (`light-dark(neutral-950, neutral-50)`). A neon hue is the look's signature, but R1 gives hue to intent; publishing the ink as a knob lets an application choose a neon neutral without the aesthetic imposing one on every palette. A named intent keeps its own edge colour, as under every aesthetic.
- **Glow.** Depth is the component's own ink blurred with no offset: x and y `0px`, spread `0px`, blur `--cyber-glow` (default `8px`), `--ui-shadow-ink: 40%` mixed toward a transparent `--elevation-color`, so the glow is the intent colour at 40% strength. The first draft's `12px` at 70% read too strong on review, heaviest on the near-black neutral in the light theme, and a second pass at `10px` and 55% was lowered again. It is scaled by elevation like every shadow, so it lights buttons and cards (the two components resting above zero) and anything a consumer raises, and leaves fields, badges, and alerts crisp. That is a limit of the model -- [Roadmap](./roadmap.md#structure) records it as a shadow that is not depth -- and it is also a reasonable reading of the look: the actions and panels glow and the inputs do not.
- **Press.** `--ui-active-transform: scale(0.97)`, restated because a nested aesthetic must not inherit another's press, and `none` under `prefers-reduced-motion: reduce` inside the file. The shadow holds still on hover and on press.
- **Clears.** No clip, no backdrop, no inset ring, no hover transform, full fill alpha, `--ui-border-max: 100px`, `--ui-shadow-edge: initial` -- the same nesting hygiene every shipped aesthetic declares.
- **Font.** `--font-cyber`, consumer-supplied, falling back to the monospace stack `.pixel` uses. The package ships no font binary.
- **Casing.** Untouched, for the reason `.chunky-tile` gives.

### C3. What the review of the first implementation settled

The first draft's values were chosen on the model's arithmetic. Reviewed on screenshots in both themes, in Chromium and Firefox, they moved as recorded above: the cut from `0.5rem` to `0.625rem`, the glow from `12px` at 70% to `8px` at 40% over two passes, one shape on all four corners to the two diagonals, and radio and pill from forced-round to diamonds. The switch knob, which the first draft already drew as a diamond, is now intended rather than tolerated. The focus outline follows the bevel in Chromium and draws square elsewhere, which is the fallback working.

Per-element shape classes (`.cut-diagonal`, `.cut-hex`) were considered as the way to expose the presets and deferred to [Roadmap](./roadmap.md#structure), where they are now the corner pattern: a knob covers everything under the aesthetic, and a single element can already take a shape through `--ui-radius` set inline.

## Public surface

- New exports `./aesthetics/cyber` and `./tw/aesthetics/cyber`; `.cyber` in both aggregates; `.cyber-solo` per [Solo utilities](./solo-utilities.md).
- New knobs `--cyber-cut`, `--cyber-shape`, `--cyber-shape-surface`, `--cyber-glow`, `--cyber-ink`, and the consumer-supplied `--font-cyber`, in `docs/usage/customizing.md#aesthetic-tokens`.
- New material tokens `--ui-corner-shape`, `--ui-radius-pill`, and `--ui-radius-tight` in the model's table and in the public material token contract.
- `registry.json` gains the aesthetic entry.
- Additive, so a minor: `0.4.0`.

## Tests

The browser suite asserts computed values, per [Tests](./tests.md), so the engine split is asserted directly:

- In Chromium, the cut on a small button is smaller than on a full-size one, measured by hit-testing inside the corner, since no computed style reports a used radius.
- In Chromium, controls compute the cut on top-left and bottom-right, surfaces on top-right and bottom-left, everything fully round a full radius, chips a zero radius, and all of them `corner-shape: bevel`.
- In Firefox and WebKit, controls and surfaces compute a zero radius and everything fully round keeps a full one.
- The glow reaches `.btn` and `.card` in the component's own intent, and not a field or a badge; `.raised` reaches a badge.
- Each knob reaches from an ancestor.
- A glass, pixel, neobrutalism, or chunky-tile region nested inside `.cyber` computes `corner-shape: round`, and its pills and chips take its own radius rather than cyber's.
- Reduced motion drops the press.

## Not in scope

- Scanlines or any painted background. They need a painted layer the model does not expose; [Roadmap](./roadmap.md#structure) plans it as a structural part, and cyber can take it then as an additive change.
- A neon default palette. Hue stays with intent.

## References

- [Model](./model.md)
- [Solo utilities](./solo-utilities.md)
- [Roadmap](./roadmap.md)
