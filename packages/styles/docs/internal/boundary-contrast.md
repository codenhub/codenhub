---
status: IMPLEMENTED
last_updated: 2026-09-24
scope: Decisions on how a component's line composes with its own plate and which ink draws a control's boundary under an aesthetic, and a record of the boundary contrast measured alongside them.
---

# Boundary contrast: a line that fades into its own plate, and a control ink

This is agreed direction, implemented in `0.5.0`, and the current code is expected to comply, per the repository root `docs/README.md`'s `IMPLEMENTED` status; it covers both decisions below. It states the decision and what the implementation must reproduce, not drop-in code, for the reason [`.progress` gains presentation](./progress-presentation-axes.md) gives.

It is weighed under [What enters the material contract](./model.md#what-enters-the-material-contract): looks, then function, then accessibility, balanced. Two changes pass that on every count and were taken. The others this measured would have made the package look worse, or work worse, to gain a ratio, and are recorded under [Considered and not taken](#considered-and-not-taken) so the question starts from the numbers when it comes back.

## The problem

A neutral component that draws a line drew a ring over its own plate. [Model](./model.md#fill-how-much-of-the-intent-color-fills-the-box) recorded it and placed the fix in `box`.

Measuring every component alongside it found a second problem: two aesthetics replace every control's neutral boundary with the line they draw on surfaces, which on a light page leaves a glass checkbox barely there.

## Measured

A throwaway probe loaded the built stylesheet and the aesthetics in Chromium, read every component's computed plate and line for every presentation, intent, and theme, and composited them over the page the way they are painted -- the plate runs under the border, since no component sets `background-clip` -- to report WCAG contrast ratios.

`.solid.edged` with no intent, line against its own plate. Every hue measures `1.00` (seamless), because its plate is opaque.

| Component                  | Light | Dark |
| -------------------------- | ----: | ---: |
| `.btn`, `.badge`, `.quote` |  1.54 | 1.81 |

Neutral fills are capped at 20%, so the plate is translucent. The line blended toward the plate (`color-mix(in oklab, var(--_bg) <fill>, <border>)`), so at a full fill it was the plate's own translucent colour, and the border box painted it over the plate that already ran underneath: a second coat. By the same arithmetic every hue rings under `.glass`, whose `--ui-bg-alpha: 0.8` makes every plate translucent; that case is not measured here, because Chromium in this environment reports reduced transparency and glass then goes opaque.

## Decision

### The line blends toward transparent

The line blends toward `transparent` by the fill amount, not toward the plate:

```text
line = mix(transparent <fill>, <border>)   /* was mix(--_bg <fill>, <border>) */
```

The plate already runs under the border, so a line that fades out as the fill fills in shows the plate through it: at a full fill the line is fully transparent, and a translucent plate stays one coat. `box`, `box-hover`, and `.quote`'s own copy of the blend change together; `.progress` draws its line from `--intent-border` without the blend and does not.

Simulated on the built stylesheet before it was written, by rewriting `box`'s and `box-hover`'s blend: the ring on `.btn` and `.badge` goes to `1.00` in both themes (`.quote`'s copy was not rewritten in the simulation). Every other line, on every component and presentation, moves by at most 7% of its ratio in either direction -- the largest, destructive `.soft` surfaces in light, 4.88:1 to 5.22:1 -- and none that cleared 3:1 falls below it. Hover follows, since `box-hover` restates the same blend against `--intent-hover`.

P3's wording holds; its mechanism changes. The model's note that the blend "runs toward `--_bg`, not raw `--intent-color`, so under an aesthetic that thins the fill a translucent box does not keep an opaque ring" stays true of `transparent`, and the second coat it did not account for goes.

### Controls take a control ink

`--ui-ink` is one neutral line for everything an aesthetic reaches, but the theme keeps two: `--color-border` for surfaces and `--color-control-border` for controls. An aesthetic that sets `--ui-ink` replaces both, and two of them trade a control's visibility for their surface line. Neutral boundary against the page:

| Aesthetic       | `.ipt` light / dark | `.checkbox`, `.switch` light / dark |
| --------------- | ------------------: | ----------------------------------: |
| none            |         2.25 / 2.20 |                         5.58 / 5.15 |
| `.glass`        |         1.02 / 1.38 |                         1.45 / 3.61 |
| `.chunky-tile`  |         1.65 / 1.61 |                         3.22 / 3.35 |
| the other three |       5.18+ / 7.04+ |                               18.97 |

Glass's white hairline is right for a pane. On a light page it leaves a neutral field at 1.02:1, with nothing marking where typing goes, and an unchecked checkbox at 1.45:1 -- a question of whether the control works at all, not only of its ratio. Chunky tile chose `neutral-400` as the heaviest grey that still looked right on a tile; its own comment records that fields then miss 3:1.

A material token, `--ui-control-ink`, resolved by the control reset ahead of `--ui-ink` -- `var(--ui-control-ink, var(--ui-ink, var(--color-control-border)))`, for the text controls, `.input-group`, and the toggles, classed and native -- lets each aesthetic keep its surface line and choose a control line, and exposes the distinction the theme already draws. Glass and chunky tile set it; neobrutalism, pixel, and cyber clear it with `initial`, so a region nested inside either draws its controls in its own ink.

The values were chosen on screen, from candidates measured against the page with each control inside the aesthetic's own card (a field at its 60% resting line):

| Aesthetic      | Control ink                                              | Field light / dark | Checkbox light / dark |
| -------------- | -------------------------------------------------------- | -----------------: | --------------------: |
| `.glass`       | `light-dark(rgb(0 0 0 / 0.55), rgb(255 255 255 / 0.55))` |        2.31 / 2.92 |           6.31 / 7.85 |
| `.chunky-tile` | `light-dark(neutral-600, neutral-400)`                   |        2.87 / 3.40 |           8.63 / 8.62 |

Glass's ink is translucent, so it tints whatever is behind the pane rather than drawing a flat grey. Chunky tile's runs the other way in dark, where the tile's `neutral-600` sat too close to the page.

## Considered and not taken

Measured while scoping this, and declined under the order above. The numbers are kept so the question starts from them.

### A text field's line resting whole

The default text field's line rests at `--_line-rest: 60%` of its intent's border tone, under 3:1 against the page for most intents:

| Theme | none | primary | secondary | success | warning | destructive | info |
| ----- | ---: | ------: | --------: | ------: | ------: | ----------: | ---: |
| Light | 2.25 |    5.18 |      2.87 |    2.53 |    1.95 |        3.26 | 2.87 |
| Dark  | 2.20 |    7.04 |      3.40 |    2.00 |    2.85 |        1.78 | 1.76 |

Resting whole, every intent clears 3:1 (minimum 3.06). But hover and focus move the line to a whole tone, and a line already resting there has nowhere to go. Measured as the largest sRGB channel step from rest to hover, where about 20 reads as a visible change, the step falls from 42-156 at 60% to 5-18 on most hued fields in light at 100%; moving hover to `--intent-strong` instead fails on primary (13 light, 5 dark). A field whose hover and focus no longer show costs the look and the function, and the partial rest stays.

### `.progress` resting as an outline

`.progress` rests `.soft.edgeless`: a 12% track the value moves along. Measured, the track's extent against the page is 1.05-1.31:1, and the value against the track clears 3:1 for every intent but warning in light (2.71:1) and info in dark (2.90:1). `.ghost.edged` would clear 3:1 on both halves for every intent (minimum 3.06).

The value is what carries the reading. Where it sits already says how much of the whole it is, and the track is the secondary cue that marks the maximum. A heavy outline around every bar makes the component look worse to strengthen that secondary cue, so the default stays. `.ghost.edged` remains a supported presentation for a consumer who wants the outline.

### A rule for which boundaries the package owes

A reading of WCAG 1.4.11 as a package rule -- text controls, toggles, and `.progress` owing 3:1 at their defaults under every aesthetic -- was drafted to drive the two changes above. With both declined, it would state an obligation the package does not keep, so it is not added. [Accessibility](../accessibility.md) records where each boundary stands.

## Public surface

- A neutral `.solid.edged` component, and every translucent plate under `.glass`, loses the ring around its own fill. Visual, and not breaking in any other sense.
- New material token `--ui-control-ink`, in the model's table and `docs/usage/customizing.md`. `.glass` and `.chunky-tile` controls draw a heavier line than before; nothing else changes unless an aesthetic or a consumer sets the token.

## Documents this changes

- [Model](./model.md): P3's mechanism and the ring paragraph under Fill, which this closes; the source comments in `box.css` and `content.css` (`.quote`) that explain the blend.
- [Accessibility](../accessibility.md): nothing for the ring, which was a composition defect rather than a recorded accessibility one.
- [Model](./model.md): the control ink beside `--ui-ink`, the material token table, and the glass and chunky tile variant specs; `docs/usage/aesthetics.md` and `docs/usage/customizing.md` for consumers.

## Tests

`feedback.spec.ts` composites the painted border band over the plate over the page and asserts it is the plate, for a neutral `.solid.edged` badge and button, a success badge on a plate `--ui-bg-alpha` thins (set inline, since Chromium here makes `.glass` opaque), and a neutral `.solid` quote. It failed on the old blend (a band at 164 on a plate at 202, in all three engines). The generated palette follows on its own: its edge tokens are read from rendered components, so a filled edge now publishes `transparent` and a partial one its alpha.

`aesthetics.spec.ts` asserts a checkbox inside glass and chunky tile resolves its ink to the aesthetic's control ink, not its surface ink, that the card around it keeps a line, and that a neobrutalism region nested inside either takes neobrutalism's ink; it failed before the token, resolving to the hairline and the tile grey. `registry.test.ts` holds every aesthetic to naming or clearing the token.

## References

- [Model](./model.md)
- [Accessibility](../accessibility.md)
- [Roadmap](./roadmap.md)
