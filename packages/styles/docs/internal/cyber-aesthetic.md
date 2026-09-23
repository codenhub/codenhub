---
status: DRAFT
last_updated: 2026-09-23
scope: Decision to ship a `.cyber` aesthetic, and the `--ui-corner-shape` material token it needs.
---

# Cyber: bevelled corners, a neon edge, and a glow

This is a proposal awaiting approval. Nothing here is agreed direction until the status reads `APPROVED`.

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

**`.radio` forces `round`.** Its circle is `rounded-full` over a 16px box; under a bevel that becomes a diamond (measured). The circle is the only thing telling a radio from a checkbox, which is the reason it already refuses `.pixel`'s silhouette.

**Every aesthetic declares the token.** The four shipped aesthetics declare `--ui-corner-shape: round`, so a region of any of them nested inside `.cyber` does not inherit a bevel. This is the same rule that makes each of them clear `--ui-clip` and `--ui-shadow-edge`.

### C2. The aesthetic

`.cyber`, shipped from `./aesthetics/cyber` and `./tw/aesthetics/cyber` and included in both aggregates. Tier 1 only: no selector list.

- **Corners.** `--cyber-cut`, one knob, default `0.5rem`, for controls and surfaces alike: the cut is a fixed motif, and one size is what makes a button and the card around it read as the same material. Where `corner-shape` is supported the token class sets `--ui-corner-shape: bevel` and both radius tokens to the cut. Where it is not, an `@supports not (corner-shape: bevel)` block squares the corners (radius `0`) rather than leaving them round: a rounded cyber element reads as a different aesthetic, a square one as the same aesthetic simplified.
- **Edge.** 1px, drawn in `--ui-ink`. The ink is a knob, `--cyber-ink`, defaulting to the theme-following neutral neobrutalism and pixel use (`light-dark(neutral-950, neutral-50)`). A neon hue is the look's signature, but R1 gives hue to intent; publishing the ink as a knob lets an application choose a neon neutral without the aesthetic imposing one on every palette. A named intent keeps its own edge colour, as under every aesthetic.
- **Glow.** Depth is the component's own ink blurred with no offset: x and y `0px`, spread `0px`, blur `--cyber-glow` (default `12px`), `--ui-shadow-ink: 70%` mixed toward a transparent `--elevation-color`, so the glow is the intent colour at 70% strength. It is scaled by elevation like every shadow, so it lights buttons and cards (the two components resting above zero) and anything a consumer raises, and leaves fields, badges, and alerts crisp. That is a limit of the model -- [Roadmap](./roadmap.md#later--possible) records the same one for synthwave -- and it is also a reasonable reading of the look: the actions and panels glow and the inputs do not.
- **Press.** `--ui-active-transform: scale(0.97)`, restated because a nested aesthetic must not inherit another's press, and `none` under `prefers-reduced-motion: reduce` inside the file. The shadow holds still on hover and on press.
- **Clears.** No clip, no backdrop, no inset ring, no hover transform, full fill alpha, `--ui-border-max: 100px`, `--ui-shadow-edge: initial` -- the same nesting hygiene every shipped aesthetic declares.
- **Font.** `--font-cyber`, consumer-supplied, falling back to the monospace stack `.pixel` uses. The package ships no font binary.
- **Casing.** Untouched, for the reason `.chunky-tile` gives.

### C3. Things the implementation measures before shipping

These are values chosen on the model's arithmetic, not yet on pixels. Each gets a measurement in the browser suite or the playground, and the value moves if the measurement disagrees.

- The glow's visibility in the light theme, where a near-black neutral glows as a soft dark shadow rather than as light.
- The switch at a `0.5rem` cut: the track is 20px tall and its knob about 14px, so the knob's bevel meets in the middle and draws a diamond. It follows the track's shape by construction; the playground review decides whether that reads as intended.
- The chips: a badge is about 24px tall, and a `0.5rem` cut takes a third of it.
- The focus ring in Chromium, which follows the bevel, against Firefox and WebKit, which draw it square.

## Public surface

- New exports `./aesthetics/cyber` and `./tw/aesthetics/cyber`; `.cyber` in both aggregates; `.cyber-solo` per [Solo utilities](./solo-utilities.md).
- New knobs `--cyber-cut`, `--cyber-glow`, `--cyber-ink`, and the consumer-supplied `--font-cyber`, in `docs/usage/customizing.md#aesthetic-tokens`.
- New material token `--ui-corner-shape` in the model's table and in the public material token contract.
- `registry.json` gains the aesthetic entry.
- Additive, so a minor: `0.4.0`.

## Tests

The browser suite asserts computed values, per [Tests](./tests.md), so the engine split is asserted directly:

- In Chromium, every component that reads `--ui-radius` computes `corner-shape: bevel` and the cut radius; `.radio` computes `round`.
- In Firefox and WebKit, the same components compute a zero radius.
- The glow reaches `.btn` and `.card` in the component's own intent, and not a field or a badge; `.raised` reaches a badge.
- Each knob reaches from an ancestor.
- A glass, pixel, neobrutalism, or chunky-tile region nested inside `.cyber` computes `corner-shape: round`.
- Reduced motion drops the press.

## Not in scope

- Scanlines or any painted background. They need a background-image slot, which is deferred to be designed with synthwave ([Roadmap](./roadmap.md#later--possible)); cyber can take it then as an additive change.
- A neon default palette. Hue stays with intent.

## References

- [Model](./model.md)
- [Solo utilities](./solo-utilities.md)
- [Roadmap](./roadmap.md)
