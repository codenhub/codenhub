---
status: DRAFT
last_updated: 2026-09-24
scope: Decision on which component boundaries `@codenhub/styles` owes WCAG 1.4.11 contrast, and the composition changes that keep them.
---

# Boundary contrast: what the package owes, and the line that keeps it

This is a proposal for review, per the repository root `docs/README.md`'s `DRAFT` status. It states the decision and what the implementation must reproduce, not drop-in code, for the reason [`.progress` gains presentation](./progress-presentation-axes.md) gives. [Roadmap](./roadmap.md#cleanup) lists it as the boundary-contrast cleanup for `0.5.0`.

## The problem

Three defects were recorded before this was measured: a neutral component with a line draws a ring over its own plate ([Model](./model.md#fill-how-much-of-the-intent-color-fills-the-box)), `.soft.edged` borders on alerts, panels, badges, and chips miss 3:1 against their fill, and `.progress`'s default track misses WCAG 1.4.11 ([Accessibility](../accessibility.md)).

Measuring every component turned up a larger problem than the three. The resting line of every text field is under 3:1 against the page for five of seven intents in each theme, the neutral field included. [Accessibility](../accessibility.md) records it as "under 3:1 by choice", a choice made so hover would read. Under [What enters the material contract](./model.md#what-enters-the-material-contract) that trade is not available: a hover cue does not outrank the boundary that identifies a field. Two shipped aesthetics also replace every control's neutral boundary with a line meant for surfaces, and `.progress`'s value misses 3:1 against its own track for two intents.

## Measured

A throwaway probe loaded the built stylesheet and the aesthetics in Chromium, read every component's computed plate and line for every presentation, intent, and theme, and composited them over the page the way they are painted -- the plate runs under the border, since no component sets `background-clip` -- to report WCAG contrast. The pixels are sRGB composites, so the ratios hold in any engine that computes the same colours; the browser suite already asserts the colours agree across the three.

### Text fields at rest

The default `.ipt`, `.textarea`, `.select`, and `.input-group` (`.ghost.edged`), line against page:

| Theme | none | primary | secondary | success | warning | destructive | info |
| ----- | ---: | ------: | --------: | ------: | ------: | ----------: | ---: |
| Light | 2.25 |    5.18 |      2.87 |    2.53 |    1.95 |        3.26 | 2.87 |
| Dark  | 2.20 |    7.04 |      3.40 |    2.00 |    2.85 |        1.78 | 1.76 |

The line is `--_line-rest: 60%` of the intent's border tone. At 100% the same fields measure 4.54/4.18 neutral and at least 3.07 (warning, light) and 3.06 (info, dark) for every hue. The toggles already draw their line whole and pass today, at the same minimums.

### Aesthetics

Neutral boundary against the page, where an aesthetic's `--ui-ink` replaces the theme's control border:

| Aesthetic       | `.ipt` light / dark | `.checkbox`, `.switch` light / dark |
| --------------- | ------------------: | ----------------------------------: |
| none            |         2.25 / 2.20 |                         5.58 / 5.15 |
| `.glass`        |         1.02 / 1.38 |                         1.45 / 3.61 |
| `.chunky-tile`  |         1.65 / 1.61 |                         3.22 / 3.35 |
| the other three |       5.18+ / 7.04+ |                               18.97 |

`--ui-ink` is one neutral line for everything, but the theme already keeps two: `--color-border` for surfaces and `--color-control-border` for controls. Glass's white hairline is right for a pane and erases a checkbox; chunky tile chose `neutral-400` as the heaviest grey that still looked right on a tile, and its own comment records that fields then miss 3:1.

### The ring

`.solid.edged` with no intent, line against its own plate. Every hue measures `1.00` (seamless), because its plate is opaque.

| Component                  | Light | Dark |
| -------------------------- | ----: | ---: |
| `.btn`, `.badge`, `.quote` |  1.54 | 1.81 |

Neutral fills are capped at 20%, so the plate is translucent. The line blends toward the plate (`color-mix(in oklab, var(--_bg) <fill>, <border>)`), so at a full fill it is the plate's own translucent colour, and the border box paints it over the plate that already runs underneath: a second coat. By the same arithmetic every hue rings under `.glass`, whose `--ui-bg-alpha: 0.8` makes every plate translucent; that case is not measured here, because Chromium in this environment reports reduced transparency and glass then goes opaque.

### Progress

Default `.soft.edgeless`, and the two edged alternatives. Track extent is the line (or plate) against the page; value is the fill against the track it moves along.

| Presentation     | Track extent, min | Value vs track, min                      |
| ---------------- | ----------------: | ---------------------------------------- |
| `.soft.edgeless` |       1.05 (dark) | 2.71 (warning, light)                    |
| `.soft.edged`    |       3.06 (dark) | 2.71 (warning, light); 2.90 (info, dark) |
| `.ghost.edged`   |       3.06 (dark) | 3.06 (info, dark)                        |

A 12% tint of a hue that itself sits near 3:1 against the page pulls the value under 3:1 however the track is edged.

### Decorative lines

`.soft.edged` on buttons, alerts, panels, badges, cards, and the content chips: line against page ranges from 1.77 (neutral, dark) to 16.33, and against its own plate from 1.39 to 11.9.

## Decision

### B1. What a boundary is owed

WCAG 1.4.11 asks 3:1 for the visual information required to identify a user interface component, and for the parts of a graphic required to understand it. In this package that is:

- **Text controls** -- `.ipt`, `.textarea`, `.select`, `.input-group`: the boundary is what shows where typing goes.
- **Toggles** -- `.checkbox`, `.radio`, `.switch`: the line is the control.
- **`.progress`**: the track's extent and the value along it are the graphic.

Each owes 3:1 against the page at rest, for every intent, in both themes, under every shipped aesthetic, at its registered default and at any presentation the package's own cascade can hand it. A presentation the consumer writes on the element is theirs; where one of the three can miss 3:1 (`.edgeless` on a field or a switch, `.soft` on a progress track), [Accessibility](../accessibility.md) says so, as it already does for `.edgeless`.

Nothing else owes a boundary. A button, a card, an alert, a badge, a chip, a quote, and a tooltip are identified by what they contain; their line is material, judged by composition (P3), not by contrast. The "soft-edged border" row in [Accessibility](../accessibility.md) stops being a known defect and states that, which is a reading of the criterion rather than a relaxation of it: those lines were never what identified the component.

This goes into [Model](./model.md) as the rule, beside the bounds.

### B2. The line blends toward transparent

The line blends toward `transparent` by the fill amount, not toward the plate:

```text
line = mix(transparent <fill>, <border>)   /* was mix(--_bg <fill>, <border>) */
```

The plate already runs under the border, so a line that fades out as the fill fills in shows the plate through it: at a full fill the line is fully transparent, and a translucent plate stays one coat. `box`, `box-hover`, and `.quote`'s own copy of the blend change together; `.progress` draws its line from `--intent-border` without the blend and does not.

Simulated on the built stylesheet, by rewriting `box`'s and `box-hover`'s blend: the ring on `.btn` and `.badge` goes to `1.00` in both themes (`.quote`'s copy was not rewritten in the simulation); every other line, on every component and presentation, moves by at most 7% of its ratio in either direction (the largest, destructive `.soft` surfaces in light, 4.88:1 to 5.22:1), and none that cleared 3:1 falls below it. Hover follows, since `box-hover` restates the same blend against `--intent-hover`.

P3's wording holds; its mechanism changes. The model's note that the blend "runs toward `--_bg`, not raw `--intent-color`, so under an aesthetic that thins the fill a translucent box does not keep an opaque ring" stays true of `transparent`, and the second coat it did not account for goes.

### B3. A text field's line rests whole

`--_line-rest` goes: a text control's resting line is its intent's whole border tone, as a toggle's already is. With it, [the table above](#text-fields-at-rest) reaches at least 3.06:1 everywhere, and the private seam that exists only to lower it is removed.

What moves on hover is an open question below.

### B4. A control ink, separate from the surface ink

A new material token, resolved by the control reset ahead of `--ui-ink`:

| Token              | Fallback                                  | Read by                                    |
| ------------------ | ----------------------------------------- | ------------------------------------------ |
| `--ui-control-ink` | `--ui-ink`, then `--color-control-border` | text controls, `.input-group`, and toggles |

It exposes a distinction the theme already draws (`--color-control-border` against `--color-border`), which `--ui-ink` collapsed. An aesthetic whose neutral line suits surfaces but not a control's boundary sets it; one whose ink already clears 3:1 does not, and clears it with `initial` so a region nested inside another aesthetic does not inherit the other's control ink. `.glass` and `.chunky-tile` set it -- simulated at `var(--color-control-border)`, which brings both to the theme's own 4.54/4.18 neutral field and 5.58/5.15 toggle, final values to be reviewed on pixels. `.pixel`, `.neobrutalism`, and `.cyber` clear it.

A rule joins R1-R8: **an aesthetic keeps B1.** Its control ink, and any ink it sets that reaches a control, clears 3:1 against the page in both themes.

### B5. `.progress` rests at `ghost edged`

The registered default moves from `soft edgeless` to `ghost edged`: an outlined capsule with the value moving along the page. It is the one presentation where both halves of the graphic clear 3:1 for every intent (minimum 3.06). `.soft` stays supported, and [Accessibility](../accessibility.md) states which intents its value misses 3:1 against its own track.

### B6. The palette carries the margin

Warning in light and info in dark sit at 3.07:1 and 3.06:1 against the page, and every B1 boundary in those intents is exactly that margin. A palette change that lowers either breaks B1 without touching a component. The browser suite asserts every hue's `--intent-border` and `--intent-color` clear 3:1 against the page in both themes, so it cannot happen silently.

## Open question: what hover moves

With the line resting whole, hovering a field has less room to move it. Measured as the largest sRGB channel step from rest to hover, where about 20 reads as a visible change:

| Hover moves the line to  | Light, weakest                                | Dark, weakest          |
| ------------------------ | --------------------------------------------- | ---------------------- |
| `--intent-hover` (today) | success 5, destructive 7, warning 13, info 13 | warning 18, success 20 |
| `--intent-strong`        | primary 13                                    | primary 5              |

Neither tone separates every intent. The options:

1. **Keep `--intent-hover`.** Hover stays visible on neutral (51, 114) and fades to nothing on hued fields in light. A hued field is usually a validation state, which hover does not need to restate.
2. **A derived fill tint.** Text controls opt into the same `min(100%, rest + 14%)` hover buttons and interactive cards use, which the spike measured at 31 or more on every fill. It gives up the rule that on something you type into only the line responds to a pointer, and needs typed-text contrast re-measured over the hover plate.
3. **Line and tint.** Option 1's line plus option 2's tint.

Hover is not a state WCAG asks to be visible, and focus keeps the global ring and the line moving to the intent. This is a feel decision for the maintainer; the proposal recommends option 1 unless a hued field's hover is wanted.

## Public surface

Pre-1.0 breaking, visually: default text fields draw a heavier line at rest, `.progress` rests as an outline, a neutral `.solid.edged` loses its ring, and `.glass` and `.chunky-tile` controls take a darker line. The release notes name each.

- New material token `--ui-control-ink`, in the model's table and `docs/usage/customizing.md`.
- `registry.json`: `.progress` default `ghost edged`.
- [Accessibility](../accessibility.md): the control-boundary row states 3:1 at rest; the progress row stops being a known gap and names `.soft`'s intents; the soft-edged row states B1's reading.
- `docs/usage/feedback.md` and `docs/usage/forms.md` where they describe the resting look.

## Documents this changes

- [Model](./model.md): B1 as a rule; P3's mechanism (B2) and the source comments in `box.css` that explain the blend; the defaults table (`.progress`); the material token table and a rule for aesthetics (B4); the ring paragraph under Fill, which this closes.
- `chunky-tile.css`'s comment on its ink, which records the 60% rest this removes.

## Tests

- A browser spec asserting B1 directly: every text control, toggle, and progress track at its default, for every intent, both themes, and every aesthetic, clears 3:1 against the page; and progress's value clears 3:1 against its track.
- The seamless line: a `.solid.edged` box's line composites to its own plate, neutral and under `.glass`.
- The palette margin (B6).
- Aesthetic hygiene: every aesthetic declares `--ui-control-ink`, a value or `initial`, as it already declares its corner and ring tokens.

## Not in scope

- A consumer's own `.edgeless` on a field or switch, which stays a documented opt-out.
- Hover beyond the open question above.
- Contrast of text (1.4.3), which the package already asserts.

## References

- [Model](./model.md)
- [Accessibility](../accessibility.md)
- [Roadmap](./roadmap.md)
- [Cascade layers](./cascade-layers.md)
