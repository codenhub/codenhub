---
status: DRAFT
last_updated: 2026-08-13
scope: Complete catalogue of every custom property declared by `@codenhub/styles`, with a verdict for the 0.1.0 refactor.
---

# Token inventory

Every custom property the package declares, what declares it, what reads it, and
what should happen to it in 0.1.0. Tokens are the foundation the whole styling
model is built from, so this document comes before the model: a rule about
composition is only as good as the vocabulary it composes.

This is a working document. It records the state of `src/` at the branch point
and the verdict proposed for each token. [Architecture](./architecture.md) owns
the model; this owns the vocabulary.

## How to read a verdict

| Verdict    | Means                                                                              |
| ---------- | ---------------------------------------------------------------------------------- |
| `KEEP`     | Stays as is, name included.                                                        |
| `RENAME`   | Same job, wrong name. The name misdescribes what the value is used for.            |
| `DELETE`   | Nothing reads it, or the refactor removes the thing it serves.                     |
| `INTERNAL` | Stays, but is composition scratch rather than contract, and gets the `--_` prefix. |
| `REPLACE`  | The job survives, the mechanism does not.                                          |

## Summary

228 custom properties are declared across `src/`. Half of them are one
component's internal arithmetic, and a fifth are seven input icons written out
twenty-eight times.

| Layer               | Count | Public contract | Verdict in short                                      |
| ------------------- | ----: | --------------- | ----------------------------------------------------- |
| Foundation          |    69 | Yes             | Keep, with two renames and one deletion.              |
| Intent slots        |     6 | Yes             | Keep unchanged. The one layer with no findings.       |
| Presentation slots  |     6 | Yes             | Replace: fill and edge split into two sub-axes.       |
| Material slots      |    18 | Yes             | Keep 12, add colorless shadow parts, add `--ui-ink`.  |
| Shape composition   |     5 | No              | Internal, prefix.                                     |
| Component internals |   117 | No              | Internal, prefix. 44 of them collapse to 7.           |
| Aesthetic internals |     9 | No              | Internal, prefix.                                     |
| Consumer-set inputs |     2 | Yes             | Keep, and document as the properties a consumer sets. |

The public contract should be about 70 tokens. Today all 228 are equally
reachable, equally undocumented as private, and equally available to depend on by
accident. Nothing in CSS makes a custom property private, so the separation has
to be carried by the name: **every token that is not contract takes a `--_`
prefix**. That is the cheapest line available between vocabulary and scratch, and
it makes a leak visible in review rather than in a consumer's bug report.

## Foundation

Declared in `theme.css`: in `@theme` for anything Tailwind should turn into a
utility, in `:root` for everything else. Public, and the layer a consumer
overrides to retheme the package.

### Palette scale

Read, never declared here; they arrive from Tailwind's default theme.
`--color-neutral-*` (50 through 950), `--color-emerald-100/600/800`,
`--color-amber-100/600/800`, `--color-rose-100/700/800`, and
`--color-indigo-100/600/800`.

Every semantic color below resolves to one of these. Worth stating plainly in the
public docs, because it reads as an oversight otherwise: the package ships no
brand palette. `--color-primary` is black on light and white on dark. A consumer
supplies a brand by overriding the semantic tokens, not by editing a scale.

### Semantic colors (41)

Declared once with `light-dark()`, which resolves against the element's computed
`color-scheme`. The theme selectors set `color-scheme` and nothing else.

| Token                       | Light / dark      | Job                                   | Verdict |
| --------------------------- | ----------------- | ------------------------------------- | ------- |
| `--color-primary`           | neutral-950 / 50  | Emphasis intent base.                 | KEEP    |
| `--color-primary-contrast`  | neutral-50 / 950  | Readable on a filled primary.         | KEEP    |
| `--color-primary-hover`     | neutral-700 / 200 | Hovered primary base.                 | KEEP    |
| `--color-primary-subtle`    | neutral-200 / 900 | Tinted primary surface.               | KEEP    |
| `--color-primary-strong`    | neutral-900 / 100 | Primary text on a subtle surface.     | KEEP    |
| `--color-accent`            | neutral-600 / 400 | Secondary emphasis base.              | KEEP    |
| `--color-accent-contrast`   | neutral-50 / 950  | Readable on a filled accent.          | KEEP    |
| `--color-accent-hover`      | neutral-700 / 300 | Hovered accent base.                  | KEEP    |
| `--color-accent-subtle`     | neutral-100 / 800 | Tinted accent surface.                | KEEP    |
| `--color-accent-strong`     | neutral-800 / 200 | Accent text on a subtle surface.      | KEEP    |
| `--color-success` + 4 slots | emerald family    | Same five-slot shape.                 | KEEP    |
| `--color-warning` + 4 slots | amber family      | Same five-slot shape.                 | KEEP    |
| `--color-destructive` + 4   | rose family       | Same five-slot shape.                 | KEEP    |
| `--color-info` + 4 slots    | indigo family     | Same five-slot shape.                 | KEEP    |
| `--color-background`        | neutral-50 / 950  | Page ground.                          | KEEP    |
| `--color-foreground`        | neutral-100 / 900 | **A surface tone, not a text color.** | KEEP    |
| `--color-surface`           | neutral-200 / 800 | The tone one step above that.         | KEEP    |
| `--color-border`            | neutral-300 / 700 | Quiet line color carrying no intent.  | KEEP    |
| `--color-border-hover`      | neutral-600 / 500 | Hovered line color.                   | KEEP    |
| `--color-text`              | neutral-950 / 50  | Body text.                            | KEEP    |
| `--color-text-secondary`    | neutral-700 / 400 | De-emphasized text.                   | KEEP    |
| `--color-text-contrast`     | neutral-50 / 950  | Ink for a full fill of the text tone. | KEEP    |
| `--color-text-hover`        | neutral-700 / 200 | Hovered neutral base.                 | KEEP    |
| `--color-text-strong`       | neutral-900 / 100 | High-emphasis neutral tone.           | KEEP    |
| `--color-text-subtle`       | neutral-200 / 900 | **Nothing reads it.**                 | DELETE  |

Three findings.

`--color-foreground` is a background, and the name is kept anyway. Only three
declarations read it -- the `.panel` fill base, the skeleton sheen, and the table
row hover -- and no text anywhere resolves to it, so the name does describe the
opposite of the job. Renaming the trio to a numbered ladder
(`--color-surface-0/1/2`) was considered and rejected as less intuitive than the
inherited names: a number tells a reader there is an order but not which end is
the page. Reshuffling the two existing names instead would be worse, because
`--color-surface` would keep its spelling and change its value, which breaks a
consumer silently rather than loudly.

This is therefore a documented wart, not an oversight. The ground ladder runs
`--color-background` (page), `--color-foreground` (one step up, used as the panel
and row-hover base), `--color-surface` (one step further, used as the tinted
surface tone). A future reader who spots the name and reaches for the obvious fix
should read this paragraph first.

`--color-text-subtle` is dead. It is declared, described in the public token doc,
and read by nothing. `intent.css` deliberately maps neutral's subtle slot to
`--color-surface` instead, and says why in source.

`--color-text-contrast` was deleted mid-0.1.0 and brought back, and the round
trip is worth recording. It names "text on a filled neutral"; when neutral's fill
was capped, what a `.neutral.solid` badge needed printed on its quiet plate
became the ink, so the token read as the wrong answer to its own question and
neutral's `--intent-contrast` was pointed at `--color-text`.

The question was right and the place was wrong. "How much of the foreground is
the contrast ink" is `--ui-fg-on-fill`, and it is written for the fill the
presentation asked for, so a capped intent had to cap it too -- which `box` now
does, in one `min()` beside the one that caps the fill. Answering it in the
intent slot instead broke every fill that lifts the cap on purpose: a checked
checkbox is filled with its own intent by definition, and with the slot bent it
came out a black box with a black tick, in both themes, for both `none` and
`.neutral`. The token is the ink for a _full_ fill, which is exactly what it was
named, and the cap is not its business.

The `-contrast` / `-hover` / `-subtle` / `-strong` suffixes are consistent across
all six color families, and that is the single best property of the current token
set: adding an intent really is five declarations. Keep the shape exactly.

### Layout, geometry, and motion (28)

| Token                       | Value                  | Job                                       | Verdict |
| --------------------------- | ---------------------- | ----------------------------------------- | ------- |
| `--font-default`            | Segoe UI, system-ui    | Default family; Tailwind emits a utility. | KEEP    |
| `--breakpoint-xs`           | 30rem                  | Tailwind variant only.                    | KEEP    |
| `--breakpoint-2xl`          | 90rem                  | Tailwind variant only.                    | KEEP    |
| `--container-narrow`        | 48rem                  | `.section-content.narrow` width.          | KEEP    |
| `--container-max`           | 80rem                  | `.section-content` default width.         | KEEP    |
| `--container-wide`          | 90rem                  | `.section-content.wide` width.            | KEEP    |
| `--layout-gutter`           | clamp(1rem, 4vw, 2rem) | `.section` inline padding.                | KEEP    |
| `--layout-section-block`    | clamp(4rem, 9vw, 7rem) | `.section` block padding.                 | KEEP    |
| `--layout-gap`              | 1rem                   | Shared gap for view/stack/cluster/grid.   | KEEP    |
| `--layout-grid-min`         | 16rem                  | `.auto-grid` track minimum.               | KEEP    |
| `--radius-small`            | 0.25rem                | Checkbox and other tight corners.         | KEEP    |
| `--radius-control`          | 0.5rem                 | Control corner default.                   | KEEP    |
| `--radius-surface`          | 0.875rem               | Surface corner default.                   | KEEP    |
| `--control-height`          | 2.5rem                 | Minimum interactive height.               | KEEP    |
| `--border-width`            | 1px                    | Base line thickness.                      | RENAME  |
| `--elevation-color`         | light-dark(...)        | Shadow color, themed.                     | KEEP    |
| `--elevation-low`           | two-layer shadow       | Resting card elevation.                   | KEEP    |
| `--elevation-mid`           | two-layer shadow       | Hovered card, tooltip bubble.             | KEEP    |
| `--elevation-high`          | two-layer shadow       | Unread; third rung of a public scale.     | KEEP    |
| `--focus-ring`              | primary at 64%         | Focus ring color.                         | KEEP    |
| `--focus-ring-offset`       | 2px                    | Outline offset.                           | KEEP    |
| `--focus-ring-width`        | 3px                    | Outline width.                            | KEEP    |
| `--motion-duration-fast`    | 120ms                  | Row hover and other cheap transitions.    | KEEP    |
| `--motion-duration-normal`  | 200ms                  | Standard transition.                      | KEEP    |
| `--motion-duration-slow`    | 400ms                  | Progress fill, skeleton sweep.            | KEEP    |
| `--motion-ease`             | cubic-bezier(.2,0,0,1) | Shared easing.                            | KEEP    |
| `--z-popover`               | 40                     | Tooltip bubble layer.                     | KEEP    |
| `--surface-hover-transform` | translateY(-1px)       | **Duplicates `--ui-hover-transform`.**    | RENAME  |

Three findings.

`--elevation-high` is unread by `src/`, and it stays. It is the third rung of a
three-rung elevation scale that the public token reference documents as a scale,
and a consumer building a modal or a dropdown reaches for exactly that rung. A
scale missing its top step costs more than an unused declaration does, and the
cost of keeping it is one line that participates in theming like the other two.
This is the one place where "nothing reads it" is not sufficient grounds to
delete.

`--surface-hover-transform` is a foundation token answering a question the
aesthetic axis already owns. `.card.interactive` resolves
`var(--ui-hover-transform, var(--surface-hover-transform))`, so the foundation
token is really the default value of a material slot. Name it as one
(`--ui-hover-transform-default`) or fold it into the component's `var()` fallback
and delete it. Two names for one behavior is precisely what makes the system hard
to read.

`--border-width` and `--ui-border-width` are one word apart in spelling and a
whole layer apart in meaning: the first is the foundation default, the second the
aesthetic's override of it. The distinction is real and the names do not carry
it. Proposed: `--border-width-default`, leaving `--ui-border-width` unambiguous as
the material slot.

## Intent slots (6)

Set by intent classes, read by components. Public: a consumer sets these six to
build an intent the package does not ship.

| Token               | Meaning                                               | Verdict |
| ------------------- | ----------------------------------------------------- | ------- |
| `--intent-color`    | The intent's base color.                              | KEEP    |
| `--intent-contrast` | Readable color on top of a filled `--intent-color`.   | KEEP    |
| `--intent-hover`    | The intent's hovered base color.                      | KEEP    |
| `--intent-strong`   | High-emphasis tone; readable text on subtle surfaces. | KEEP    |
| `--intent-subtle`   | Low-emphasis tone; tinted surfaces and tracks.        | KEEP    |
| `--intent-border`   | Line color; the quiet border gray with no intent set. | KEEP    |
| _(none at survey)_  | How far a fill of this intent may go.                 | ADD     |

One finding, and it surfaced after the survey rather than in it. Six slots, seven
intent classes, zero per-component branching, and the `:where()` reset that keeps
intent from cascading is the one mechanism in the package that has held up under
everything asked of it. The shape carries into 0.1.0; the count does not.

0.1.0 adds `--intent-fill-max`, a seventh slot, because two of the six were doing
two jobs each. `--intent-color` was both the ground a fill is made of and the ink
an unfilled component prints in, and no single grey satisfies both -- the neutral
intent has to be the page's ink at the tint end and something much quieter at
100%. Splitting the ink onto `--intent-strong`, which already meant "readable on
a subtle fill", took care of the text; the cap takes care of the fill. See
[Architecture](./architecture.md#intent-tokens).

One change of ownership, not of shape: `--intent-border` currently defaults to
`--color-border` inside the shared reset, and `neobrutalism.css` overrides it
through two fourteen-selector component lists to deliver its ink. In 0.1.0 the
reset reads `var(--ui-ink, var(--color-border))` and the aesthetic sets
`--ui-ink`, which deletes both selector lists and closes the native-element gap
recorded in Architecture.

## Presentation slots (6)

Unitless numbers and percentages only, so they inherit without carrying a
resolved color.

| Token                   | Meaning                                             | Verdict |
| ----------------------- | --------------------------------------------------- | ------- |
| `--ui-fill`             | Percent of `--intent-color` mixed into background.  | REPLACE |
| `--ui-fg-on-fill`       | Percent blended from readable toward contrast tone. | REPLACE |
| `--ui-border`           | Percent of `--intent-color` mixed into the border.  | REPLACE |
| `--ui-border-scale`     | Multiplier over `--ui-border-width`.                | REPLACE |
| `--ui-hover-fill`       | Percent of `--intent-hover` in hovered background.  | DELETE  |
| `--ui-hover-fg-on-fill` | Percent blended toward contrast while hovered.      | DELETE  |

The mechanism is sound and the packaging is not. Six slots are written by five
classes that bundle fill and edge together in fixed pairs, which is why a
subtle-filled bordered control -- the most common button style on the web -- is
unreachable, and why `.flat` on a button is indistinguishable from no class at
all.

0.1.0 splits them into two independent sub-axes, `fill` and `edge`, and derives
hover rather than declaring it, which is what removes the two `--ui-hover-*`
slots. The replacement slot list belongs to [Architecture](./architecture.md);
this document records only that all six are in scope for replacement.

## Material slots (18)

Lengths, shadows, and shapes. Set by aesthetic classes, read by components with a
`var()` fallback that is the component's default.

| Token                  | Fallback           | Meaning                                         | Verdict |
| ---------------------- | ------------------ | ----------------------------------------------- | ------- |
| `--ui-radius`          | `--radius-control` | Corner radius for controls.                     | KEEP    |
| `--ui-radius-surface`  | `--radius-surface` | Corner radius for surfaces.                     | KEEP    |
| `--ui-border-width`    | `--border-width`   | Base border thickness.                          | KEEP    |
| `--ui-border-max`      | `100px`            | Ceiling on the computed border width.           | KEEP    |
| `--ui-shadow`          | _none_             | Complete `box-shadow` value.                    | KEEP    |
| `--ui-bg-alpha`        | `1`                | Multiplier over fill, for translucency.         | KEEP    |
| `--ui-hover-transform` | `none`             | Transform applied on interactive hover.         | KEEP    |
| `--ui-clip`            | `none`             | Silhouette for structural components.           | KEEP    |
| `--ui-clip-tight`      | `--ui-clip`        | Silhouette for chips.                           | KEEP    |
| `--ui-edge`            | _undefined_        | Inset ring width when the edge is not a border. | KEEP    |
| `--ui-edge-tight`      | `--ui-edge`        | Inset ring width for chips.                     | KEEP    |
| `--ui-focus-inset`     | `0px`              | Focus layer depth inside the ring.              | KEEP    |

Twelve slots, all pulling their weight. `--ui-edge` having no fallback is
deliberate and load-bearing: undefined leaves the ring invalid at computed-value
time, so a component falls through to its own `box-shadow` fallback and keeps
reporting `none` rather than reporting a zero-width shadow that paints nothing.

Three additions for 0.1.0, all of which exist to delete component selector lists
from the aesthetics:

| Token                                        | Meaning                                                             |
| -------------------------------------------- | ------------------------------------------------------------------- |
| `--ui-ink`                                   | Neutral line color an aesthetic substitutes for `--color-border`.   |
| `--ui-shadow-x` / `-y` / `-blur` / `-spread` | Colorless shadow geometry, composed against the component's intent. |
| `--ui-shadow` (existing)                     | Escape hatch for a full multi-layer value, as glass needs.          |

The split matters because of the measurement already recorded in Architecture:
an indirect token resolves its `var()` references on the element that declares
it. A shadow declared on `.neobrutalism` resolves the container's intent and
inherits down already-resolved, which is why the aesthetic currently has to name
every component. Colorless geometry inherits safely and the component supplies
the color, so the selector lists become unnecessary rather than merely shorter.

## Shape composition (5)

Declared inside the `shaped` and `shaped-tight` utilities in `shape.css`. Outputs
of composition, never inputs.

| Token                  | Job                                                      | Verdict  |
| ---------------------- | -------------------------------------------------------- | -------- |
| `--shape-edge`         | Line color, blended toward the fill by the fill amount.  | INTERNAL |
| `--shape-border-width` | Aesthetic thickness scaled by presentation, then capped. | INTERNAL |
| `--shape-ring`         | The inset ring that replaces a clipped border.           | INTERNAL |
| `--shape-focus-stack`  | Ring plus focus layer, as one substitution.              | INTERNAL |
| `--shape-border-max`   | The component's own ceiling, alongside the aesthetic's.  | INTERNAL |

All five become `--_shape-*`. Architecture already states these are internal; the
prefix is what makes the statement enforceable.

## Component internals (117)

One component's arithmetic, declared at its own root so every `var()` resolves
against that component's intent. None are contract. All become `--_`-prefixed.

| Group           | Count | Tokens                                                                            |
| --------------- | ----: | --------------------------------------------------------------------------------- |
| `--ipt-icon-*`  |    44 | Seven icons in light, dark, focus-light, and focus-dark, plus two active aliases. |
| `--button-*`    |     9 | fill, bg, fg, border, hover-fill, hover-bg, hover-fg, hover-border, spinner.      |
| `--tooltip-*`   |     9 | bg, fg, gap, top, right, bottom, left, origin, transform.                         |
| `--switch-*`    |     7 | border-width, gap, height, inset, knob, travel, width.                            |
| `--control-*`   |     6 | fill, bg, fg, border, border-active, placeholder.                                 |
| `--surface-*`   |     6 | fill, bg, fg, border, elevation, padding.                                         |
| `--quote-*`     |     5 | fill, bg, line, edge, width.                                                      |
| `--loader-*`    |     5 | fill, bg, line, edge, glyph.                                                      |
| `--table-*`     |     5 | fill, border, head-bg, head-fg, row-hover.                                        |
| `--feedback-*`  |     4 | fill, surface, text, border.                                                      |
| `--skeleton-*`  |     4 | fill, base, sheen, line.                                                          |
| `--progress-*`  |     4 | color, surface, line, border.                                                     |
| `--empty-*`     |     4 | fill, bg, line, edge.                                                             |
| `--kbd-*`       |     3 | fill, line, edge.                                                                 |
| `--divider-*`   |     3 | color, strength, width.                                                           |
| `--toggle-fill` |     1 | Shared by checkbox and radio.                                                     |
| `--field-gap`   |     1 | Gap between label, control, and hint.                                             |
| `--ai-image`    |     1 | The loader's mask image.                                                          |

The repetition is the signal. Eleven components independently declare a `fill`, a
`bg`, a `line`, and an `edge` computed by the same four `color-mix()` expressions
with different fallbacks. That is the arithmetic one shared composition is meant
to own: `box` computes those four once, and `.card`, `.panel`, `.alert`,
`.table`, and `.empty-state` stop carrying private copies of the formula. The
count should fall well below a hundred without a single component losing a
capability.

### The input icons

44 tokens, 28 inline SVG data URIs, seven distinct pictures. Each icon ships in
four colors because a data URI cannot read `currentColor`, and the source
explains the constraint accurately: a text input is a replaced element with no
usable pseudo-element, so the icon is a `background-image` on the input itself,
and masking the input would clip its border, background, and typed text.

The constraint is real and the conclusion does not follow. An input cannot host a
pseudo-element, but an element wrapping it can. `.field` is not that element --
it is a `flex-column` holding label, control, and hint, so a box positioned
against it moves whenever a label is present. What is needed is a wrapper around
the control alone, which `.field` then contains. Given one, the icon becomes a
masked pseudo-element positioned over the control:

- seven URLs instead of twenty-eight;
- color comes from `background-color` over a mask, so it follows the theme and
  the intent for free;
- the focus color becomes `:focus-within`, not a second pair of URLs;
- the light/dark alias blocks, the theme selectors that repoint them, and the
  `prefers-color-scheme` block that repeats them all disappear -- about ninety
  lines of `form.css`.

Cost: the icon class moves from the input to its wrapper, which is a markup break.
Acceptable at 0.1.0, and it is the same defect as the loaders -- artwork that
carries baked-in presentation instead of taking its color from its host.

## Aesthetic internals (9)

| Token             | Aesthetic    | Job                                                 | Verdict  |
| ----------------- | ------------ | --------------------------------------------------- | -------- |
| `--glass-blur`    | glass        | Backdrop blur radius.                               | INTERNAL |
| `--glass-opacity` | glass        | Base translucency; 100% under reduced transparency. | INTERNAL |
| `--glass-fill`    | glass        | Intent tint over the translucent base.              | INTERNAL |
| `--glass-edge`    | glass        | Light hairline highlight, both themes.              | INTERNAL |
| `--glass-base`    | glass        | Background token at `--glass-opacity`.              | INTERNAL |
| `--neo-ink`       | neobrutalism | Theme-following ink color.                          | REPLACE  |
| `--neo-offset`    | neobrutalism | Hard shadow offset and hover travel.                | INTERNAL |
| `--pixel-unit`    | pixel        | One screen pixel of the imaginary grid.             | INTERNAL |
| `--pixel-ink`     | pixel        | Theme-following ink color.                          | REPLACE  |

`--neo-ink` and `--pixel-ink` are the same idea invented twice, and both exist
only to be pushed into `--intent-border` through a component selector list. They
become the value each aesthetic assigns to `--ui-ink`, which is a material slot
every component reads without being named.

`--glass-opacity` is worth keeping as a named token specifically because the
reduced-transparency media query rewrites it to `100%` and the whole aesthetic
degrades correctly from that one line.

## Consumer-set inputs (2)

Read by the package, never declared by it. These are the two properties an
application is expected to set, and the only ones today that behave like an API
rather than a theme.

| Token              | Set by                   | Job                                                | Verdict |
| ------------------ | ------------------------ | -------------------------------------------------- | ------- |
| `--progress-value` | Application, per element | Determinate progress fill width.                   | KEEP    |
| `--font-pixel`     | Application, once        | Bitmap face for `.pixel`; falls back to monospace. | KEEP    |

Both are undocumented as inputs in the public token reference, which is a gap
rather than a design decision. `--progress-value` in particular is the only way
to drive a determinate progress bar and appears only in an example.

## Findings

| #   | Finding                                                                       | Where it lands                     |
| --- | ----------------------------------------------------------------------------- | ---------------------------------- |
| T1  | 228 tokens, no naming distinction between contract and scratch.               | `--_` prefix.                      |
| T2  | 44 input-icon tokens encode 7 pictures; color is baked into the artwork.      | Masked wrapper.                    |
| T3  | `--color-foreground` names a surface tone.                                    | Keep the name, document the wart.  |
| T4  | `--color-text-subtle` is dead; `--elevation-high` is unread but load-bearing. | Delete the first, keep the second. |
| T5  | `--border-width` vs `--ui-border-width` do not carry their layer distinction. | Rename the foundation one.         |
| T6  | `--surface-hover-transform` duplicates a material slot.                       | Fold into the fallback.            |
| T7  | Eleven components declare the same four-expression fill/bg/line/edge block.   | Role layer owns it.                |
| T8  | Aesthetic ink reaches components only through component selector lists.       | `--ui-ink`.                        |
| T9  | Aesthetic shadows cannot be colorless, so they cannot inherit.                | `--ui-shadow-*` parts.             |

T1, T5, and T6 are renames with no behavior change and can land first. T2,
T7, T8, and T9 depend on the model doc and belong to the implementation waves.

## References

- [Architecture](./architecture.md)
- [Roadmap](./roadmap.md)
- [Tokens](../tokens.md), the public reference this document feeds
