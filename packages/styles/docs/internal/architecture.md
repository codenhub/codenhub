---
status: DRAFT
last_updated: 2026-08-14
scope: The `@codenhub/styles` styling model before 0.1.0. Superseded; kept for its measurements.
---

# Architecture

**Superseded by [Model](./model.md).** This document described how the package
decided what an element looked like before 0.1.0, when presentation was
`.flat`/`.out`/`.ghost`, an edge had a scale, and a silhouette arrived through
`shaped`. None of that is still true, so nothing here binds.

It is kept, at DRAFT, for the two measurements the roadmap cites and the model
builds on: [The cost of a no-op](#the-cost-of-a-no-op) and
[Indirect tokens resolve once](#indirect-tokens-resolve-once). Both outlive the
model they were made under, and re-measuring them would cost more than the page.

## The three axes

Every styled element answers three independent questions. Each question owns one
axis, one token contract, and one set of classes.

| Axis         | Question        | Tokens                  | Cascades | Classes                                                                         |
| ------------ | --------------- | ----------------------- | -------- | ------------------------------------------------------------------------------- |
| Intent       | Which color?    | `--intent-*`            | No       | `.neutral` `.primary` `.secondary` `.success` `.warning` `.destructive` `.info` |
| Presentation | How much of it? | `--ui-fill` and peers   | Yes      | `.flat` `.out` `.ghost` `.soft` `.fill`                                         |
| Aesthetic    | Made of what?   | `--ui-radius` and peers | Yes      | `.neobrutalism` `.glass` `.pixel`                                               |

The axes are orthogonal by construction: intent carries only hue, presentation
only unitless ratios, aesthetic only lengths, shadows, and shapes. A component
resolves all three at its own root and never branches on a combination.

The axes meet in one declaration, deliberately:

```css
border-width: calc(var(--ui-border-width) * var(--ui-border-scale));
```

The aesthetic supplies the base material thickness; the presentation scales it.
A component may then clamp the result, which is the fourth and last step of
[precedence](#precedence).

### Intent holds two vocabularies, not two axes

Intent answers "which color", but authors reach for it to say two different
things:

| Vocabulary   | Classes                                                         | Says                                            |
| ------------ | --------------------------------------------------------------- | ----------------------------------------------- |
| **Semantic** | `.success` `.warning` `.destructive` `.danger` `.error` `.info` | What is true of this thing.                     |
| **Emphasis** | `.primary` `.secondary`                                         | How much it matters on this page.               |
| _Neutral_    | `.neutral`, or no class                                         | Neither; the default every component resets to. |

They are one axis rather than two because they write the same seven slots, so
exactly one of them can apply. That is worth stating plainly, because the
boundary reads as blurry until you notice it is a single slot: there is no way to
express "the primary action, which is also destructive". You pick.

The rule for picking is that **semantic outranks emphasis**. A delete
confirmation's main button is `.destructive`, not `.primary`, because losing the
warning costs more than losing the emphasis.

## Axis rules

What each axis may do, and what a component may do about it. These are normative:
a component that breaks one is a defect even when it looks fine, because the next
component to copy it will not.

### Intent

- **I1.** Intent declares color and nothing else. No intent class may set a
  length, a ratio, a shadow, or a shape.
- **I2.** Exactly one intent applies, and semantic outranks emphasis.
- **I3.** Intent does not cascade. Every component redeclares the neutral
  defaults at its own root, at zero specificity, so an element's own intent class
  wins and an inherited one loses. See
  [Why intent does not cascade](#why-intent-does-not-cascade).
- **I4.** An intent class is never also a component. `.error` says destructive; it
  must not additionally mean "helper text". Where a component needs both, the
  component carries its own class and takes the intent alongside it.

### Presentation

- **P1.** Presentation declares only unitless numbers and percentages, so it
  inherits without carrying a resolved color. See
  [Presentation tokens](#presentation-tokens).
- **P2.** A presentation class states a target, not a guarantee. Every class sets
  the whole token set; a component renders only the tokens it reads.
- **P3.** A component MAY clamp a presentation token it cannot honor, as a ceiling
  or a floor, and MUST declare the bound in source with its reason. A clamp is a
  documented property of that component, not an escape hatch: a consumer has to be
  able to predict the result. "A chip's border never exceeds 1px" is a contract.
  "A chip ignores `.out`" is a surprise. Floors exist for the same reason ceilings
  do -- a text control whose border a presentation class zeroes has lost the only
  mark of where it can be typed into, which
  [Accessibility constraints](#accessibility-constraints) does not allow.
- **P4.** Presentation modulates what a component already draws. It MUST NOT give
  a component a part it does not otherwise have. A progress bar with no border by
  default must not acquire one from `.flat`.
- **P5.** Any component that draws a line MUST blend it toward its own fill by
  the fill amount, so a filled component has a seamless edge instead of a stray
  ring of another color:

  ```css
  color-mix(in oklab, var(--intent-color) var(--ui-fill, 0%), var(--intent-border))
  ```

  This is what makes `--ui-border: 100%` invisible under `.flat`, which is the
  whole reason `.flat` sets it. A component that skips the blend turns `.flat`
  into a border-adding class and breaks P4 as a side effect.

### Aesthetic

- **A1.** Aesthetic declares only material: lengths, shadows, shapes, and font
  family. See [Material tokens](#material-tokens).
- **A2.** Aesthetic tokens cascade, and a component resolves them at its own root
  with the `var()` fallback that is its default.
- **A3.** An aesthetic MAY override `--intent-border`, at zero specificity. This
  is the one sanctioned reach across axes, because a thick border in the neutral
  border gray is a gray box rather than an aesthetic. See
  [The neutral ink](#the-neutral-ink).
- **A4.** An aesthetic MUST reach a component through a token wherever the value
  carries no intent, and MAY use a component-scoped selector list only where the
  value must resolve against the component's own intent. The second case is not a
  shortcut: a token declared on the container resolves its `var()` references
  against the container and inherits down already-resolved, which is measured
  under [Indirect tokens resolve once](#indirect-tokens-resolve-once).
- **A5.** A component MAY resolve a material token unconditionally, because a
  no-op material value is free. Measured under
  [The cost of a no-op](#the-cost-of-a-no-op).

### Precedence

When more than one axis has an opinion about the same declaration, they apply in
this order:

1. **Aesthetic** supplies the base material.
2. **Presentation** scales and modulates it.
3. **Intent** colors it.
4. **Component** clamps the result, under P3.

State sits above all four: a control that is `:disabled` or `aria-invalid` must
read as such regardless of the intent, presentation, and aesthetic applied to it.
State is not a fourth axis, because it is a condition rather than a choice, but it
wins when it collides with one.

## Why intent does not cascade

Presentation and aesthetic tokens are safe to inherit because they carry no
color. A container can set them once and every descendant resolves them against
its own palette.

Intent is different. A container that silently recolors every descendant is a
trap rather than a feature: a `.success` panel would turn its nested destructive
button green. So intent classes set `--intent-*`, but every component redeclares
the neutral defaults at its own root:

```css
:where(.btn, .alert, .badge, .card, .ipt /* ... */) {
  --intent-color: var(--color-text);
  --intent-border: var(--color-border);
  /* ... */
}
```

Specificity is the whole mechanism. The reset is `:where()`, so it carries zero
specificity: an intent class on the element (0-1-0) beats it, while an inherited
value still loses to it, because any declaration on an element beats
inheritance regardless of specificity. One rule therefore replaces every
per-component intent branch, and no `:not()` chains are needed.

That selector list is the registry of components supporting intent. A component
that reads `--intent-*` without joining it fails silently: the undefined property
makes every `color-mix()` referencing it invalid at computed-value time, so the
declaration is dropped entirely and the element falls back to a preflight value.
A browser test asserts every slot resolves on every component that reads them.

`native.css` carries its own copy of the reset for the bare elements it maps,
since those carry no class.

One deliberate exception: table rows inherit their table's intent rather than
resetting it, because a row is part of a table rather than an independent
component. A row carrying its own intent class still wins.

## Token contracts

### Intent tokens

Set by intent classes, read by components. Public: consumers may set them
directly to build an intent the package does not ship.

| Token               | Meaning                                                   |
| ------------------- | --------------------------------------------------------- |
| `--intent-color`    | The intent's base color. What a fill is made of.          |
| `--intent-contrast` | Readable color on top of a filled `--intent-color`.       |
| `--intent-hover`    | The intent's hovered base color.                          |
| `--intent-strong`   | The intent printed on a page, wherever a fill is partial. |
| `--intent-subtle`   | Low-emphasis tone; tinted surfaces and tracks.            |
| `--intent-fill-max` | How far a fill of this intent may go. 100% but neutral.   |
| `--intent-border`   | Line color; the border gray when no intent is set.        |

Intent classes map a `--color-*` family onto these seven slots and do nothing
else. Adding an intent is seven declarations; adding a component that supports
every intent is zero.

Every intent writes every slot, including `--intent-fill-max`, whose value is
`100%` for six of the seven. Six identical declarations look like boilerplate
worth deleting and are not: the reset writes neutral's cap onto every component
root, so an intent that omits the slot silently inherits a limit it never asked
for. `tests/integration/registry.test.ts` fails the build on an intent missing a
slot, which is what makes this a rule rather than a habit.

`--intent-border` is separate from `--intent-color` because a neutral border
must stay the quiet border gray rather than the text color. Without it, every
component that draws a line would need its own per-intent branch again.

Neutral maps `--intent-subtle` to `--color-surface` rather than
`--color-text-subtle`. The tinted surface a neutral component sits on is the
surface token, and tooltips, key caps, code, table heads, and skeletons all read
that slot for their resting background.

`--intent-fill-max` exists for the same intent and the same reason: neutral's
color is the page's ink, which it has to be, because that ink is the text of
every unfilled component. A hue survives the whole fill range -- pale at 12%,
saturated at 100% -- and a grey does not: 100% of the ink is a black or white
slab. Filled neutral was pixel for pixel filled primary in the shipped theme,
and louder than every semantic intent. The cap lets one token stay the ink at
the tint end while `.solid` stops at a quiet plate, which is the only way to get
both out of a single color.

`--intent-color` and `--intent-strong` divide the other half of that problem.
The base is a ground and the strong tone is an ink; `box` reads the base for a
fill and the strong tone for text, so a bare component prints the tone chosen to
be read rather than the tone chosen to be filled with. This is also what closed
the soft and bare contrast gaps on the semantic intents, which sat near 3:1
while printing their mid-tone base on a white page.

A composed `box-shadow` must not fall back to `none`. `none` is valid only as an
entire value, so `<shadow>, none` is invalid and drops the whole declaration,
including the focus ring it was composed with. Composed lists use
`var(--ui-shadow, 0 0 transparent)` instead.

### Presentation tokens

Unitless numbers and percentages only. A custom property resolves on the element
that declares it, so a value referencing an intent token here would resolve
against the container's intent and inherit down already-resolved. Numbers carry
no intent, so they inherit safely.

| Token                   | Meaning                                                          |
| ----------------------- | ---------------------------------------------------------------- |
| `--ui-fill`             | Percent of `--intent-color` mixed into the background.           |
| `--ui-fg-on-fill`       | Percent blended from the readable tone toward the contrast tone. |
| `--ui-border`           | Percent of `--intent-color` mixed into the border.               |
| `--ui-border-scale`     | Multiplier over `--ui-border-width`.                             |
| `--ui-hover-fill`       | Percent of `--intent-hover` mixed into the hovered background.   |
| `--ui-hover-fg-on-fill` | Percent blended toward the contrast tone while hovered.          |

### Material tokens

Lengths and shadows. Set by aesthetic classes; read by components.

| Token                  | Fallback           | Meaning                                                 |
| ---------------------- | ------------------ | ------------------------------------------------------- |
| `--ui-radius`          | `--radius-control` | Corner radius for controls.                             |
| `--ui-radius-surface`  | `--radius-surface` | Corner radius for surfaces such as cards and alerts.    |
| `--ui-border-width`    | `--border-width`   | Base border thickness before `--ui-border-scale`.       |
| `--ui-shadow`          | `none`             | Complete `box-shadow` value.                            |
| `--ui-bg-alpha`        | `1`                | Unitless multiplier over `--ui-fill`, for translucency. |
| `--ui-hover-transform` | `none`             | Transform applied on interactive hover.                 |
| `--ui-clip`            | `none`             | Silhouette for structural components.                   |
| `--ui-clip-tight`      | `--ui-clip`        | Silhouette for chips.                                   |
| `--ui-edge`            | _undefined_        | Inset ring width, when the edge is not a border.        |
| `--ui-edge-tight`      | `--ui-edge`        | Inset ring width for chips.                             |
| `--ui-border-max`      | `100px`            | Ceiling on the computed border width.                   |
| `--ui-focus-inset`     | `0px`              | Focus layer depth inside the ring.                      |

The shape tokens are consumed through the `shaped` and `shaped-tight` utilities in
`shape.css` rather than by each component separately, because every value has to be
composed at the point of use. `--ui-edge` alone has no fallback, deliberately: with
no aesthetic in scope it leaves the ring invalid at computed-value time, so a
component falls through to its own `box-shadow` fallback and keeps reporting
`none`. A zero-width ring would paint nothing but would still report a shadow.

`--ui-clip` and `--ui-edge` are one public structural pair. Buttons, text
controls, surfaces, alerts, loaders, and tooltip bubbles consume it.
`--ui-clip-tight` and `--ui-edge-tight` are the compact pair for badges, key
caps, inline code, and preformatted blocks; each tight slot falls back to its
structural counterpart. A complete customization sets both members with matching
depths. A clip alone clips without replacing the edge, while an edge alone draws
an inset ring on the unchanged silhouette. These deterministic one-sided results
are supported CSS behavior but incomplete material customization.

Clipping removes the component border and global focus outline from view. An
aesthetic replacing them sets `--ui-border-max: 0px`, supplies the inset edge,
and uses `--ui-focus-inset` to extend a second inset layer immediately inside
that edge. Component ceilings still participate through `--shape-border-max`.
All `--shape-*` values are internal composition outputs; the public contract is
only the six `--ui-*` inputs in the table.

The default aesthetic is the _absence_ of these declarations, not a set of root
values. Components read each with the `var()` fallback above, which is why a
plain `.card` gets surface radius while a plain `.btn` gets control radius. A
single `:root` value could not serve both.

### The cost of a no-op

`clip-path` and `backdrop-filter` were once excluded from the contract above on
the grounds that applying either unconditionally costs a compositing layer and a
containing block on every component, even at its no-op value. That is false.
Measured in all three baseline engines, literal and behind a `var()` fallback:

| Declaration on the host                 | Containing block | Stacking context | Chromium layers, 400 hosts |
| --------------------------------------- | ---------------- | ---------------- | -------------------------- |
| _(none)_                                | no               | no               | 4                          |
| `clip-path: none`                       | no               | no               | 4                          |
| `clip-path: var(--ui-clip, none)`       | no               | no               | 4                          |
| `backdrop-filter: none`                 | no               | no               | 4                          |
| `backdrop-filter: var(--ui-blur, none)` | no               | no               | 4                          |
| `clip-path: inset(4px)`                 | no               | **yes**          | 4                          |
| `backdrop-filter: blur(2px)`            | **yes**          | **yes**          | **119**                    |

The last two rows are controls: without them the probe would report "no cost" for
a broken measurement. Chromium, Firefox, and WebKit agreed on every row.

Two details the original claim had backwards. `clip-path` never establishes a
containing block, even when active -- only a stacking context. `backdrop-filter`
is the property that does both, and the only one that costs layers. So a
component may resolve either token unconditionally (A5), and the reason to keep an
_active_ clip off every component is different and still real: it establishes a
stacking context in all three engines and clips descendants, backgrounds,
borders, shadows, and the focus outline. See
[Pixel layering](#pixel-layering).

### Indirect tokens resolve once

A `var()` reference inside a custom property value resolves against the element
that **declares** the custom property, not against the element that uses it. A
child overriding the referenced token is ignored. Measured identically in all
three engines, with `--unit: 8px` on the parent and `--unit: 1px` on the child:

| Declaration                                                   | Child override honored? | Result |
| ------------------------------------------------------------- | ----------------------- | ------ |
| `--shape: inset(var(--unit))`, then `clip-path: var(--shape)` | no                      | `8px`  |
| `clip-path: inset(var(--unit))` directly                      | **yes**                 | `1px`  |

This is the mechanism behind three decisions that otherwise look like
duplication, and it is why A4 permits a component-scoped selector list in exactly
one case:

- `.neobrutalism` declares `--ui-shadow` per component rather than on the
  container, so the shadow reads that component's own `--intent-border` and a
  success button casts a green shadow.
- `.pixel` computes its ring thickness at the point of use, so a component that
  overrides `--pixel-unit` gets a matching ring.
- An aesthetic's shape cannot live in one token that references a tunable unit,
  because chips override that unit. The shape needs one token slot per unit
  instead.

## Composition rules

Components resolve every axis at their own root and expose the results as
component-scoped variables:

```css
@utility btn {
  --button-bg: color-mix(in oklab, var(--intent-color) var(--ui-fill, 100%), transparent);
  --button-border-width: calc(var(--ui-border-width, var(--border-width)) * var(--ui-border-scale, 1));
}
```

A component may clamp a token it cannot honor, under P3. Text controls and toggles
cap their fill with `min(var(--ui-fill, 0%), 12%)`, so a `.flat` container cannot
put typed text on a saturated background. Clamping resolves from the value alone
and needs no per-presentation selector, which keeps the component free of axis
branching.

The ceiling belongs on the computed result rather than on the token, whenever what
the component cannot afford is a length. A chip cannot afford four pixels of
border; it has no opinion about `--ui-border-scale` itself, and clamping the scale
would leave the aesthetic's own thickness unbounded:

```css
/* Clamps what the box cannot afford, not the request that produced it. */
border-width: min(calc(var(--ui-border-width, var(--border-width)) * var(--ui-border-scale, 1)), 1px);
```

Two choices there are deliberate and apply everywhere. Mixing toward
`transparent` rather than a background token lets a tinted surface adapt to
whatever it is placed on. Mixing in `oklab` keeps the wide-gamut palette intact
and blends perceptually, where `srgb` would clip it.

Component-scoped variables such as `--button-*`, `--control-*`, `--feedback-*`,
`--progress-*`, and `--tooltip-*` are internal wiring, not public contract.

## Theme values

Color tokens are declared once using `light-dark()`. Theme selectors set only
`color-scheme`:

```css
:root {
  color-scheme: light dark;
  --color-text: light-dark(var(--color-neutral-950), var(--color-neutral-50));
}

.light,
.theme-light,
[data-theme="light"] {
  color-scheme: light;
}
.dark,
.theme-dark,
[data-theme="dark"] {
  color-scheme: dark;
}
```

`light-dark()` resolves at the point of use, against the consuming element's
computed `color-scheme`. This was verified in Chromium, Firefox, and WebKit,
including resolution through `color-mix()` and through Tailwind's `@theme`, which
emits theme values as unregistered custom properties rather than `@property`
registrations.

Three consequences:

- `color-scheme: light dark` on `:root` expresses the system preference, so no
  `@media (prefers-color-scheme: dark)` block is needed.
- Theme selectors work at any depth and nest, because `color-scheme` inherits.
  The previous `:root:not(.light, ...)` media fallback only worked at the root.
- `light-dark()` accepts `<color>` only. Composite values such as `box-shadow`
  cannot use it, so `--elevation-*` is composed from a `--elevation-color` token
  that can.

This establishes a browser baseline of Chrome 123, Safari 17.5, and Firefox 120.

### Input icons on date and datetime-local

These two types are the one place a component's appearance is decided by the
engine rather than by a class, because their picker button is the one form control
part not every engine lets a stylesheet hide.
`@supports selector(input::-webkit-calendar-picker-indicator)` splits them:

- Supported: the native button is hidden, the type opts itself into `.icon`, and
  the themed calendar takes its place. Measured `true` in Chromium.
- Not supported: the native button stays and no custom icon is drawn, because two
  calendar glyphs on one field read as a defect. Measured `false` in Firefox.

The negative branch has to actively undo `.icon` rather than merely withhold it,
using `!important` for the same reason `.no-icon` does -- `.icon.right` carries
equal specificity, so nothing else reliably wins. Without that, an author or a
fixture putting `.icon` on the field reserves 2.375rem of padding for artwork
that never paints, which is the shape of the original bug.

Both branches are duplicated in `components/form.css` and in `native.css`,
because the classed and the unclassed form of the same control have to agree.

## Aesthetics

Aesthetics are cascading classes that set material tokens, plus their own
presentation defaults. An explicit presentation class on the element still wins,
because it is declared on the element rather than inherited.

An aesthetic may likewise be inherited from an ancestor or applied directly to
the component. A directly applied aesthetic is the more specific choice and must
win when an ancestor selects another aesthetic. Component-specific aesthetic
selectors must support both forms; generic inherited material tokens alone are
not enough when the aesthetic also styles a pseudo-element. Glass and pixel
tooltip rules therefore define a complete bubble: `.tooltip.glass` clears an
inherited clip, ring, and pixel drop shadow before adding glass blur and edge;
`.tooltip.pixel` clears inherited glass blur, border, radius, and background
before adding the stepped ring and hard drop shadow.

| Aesthetic       | Material                                                                               |
| --------------- | -------------------------------------------------------------------------------------- |
| _(default)_     | Foundation tokens: `--radius-control`, `--border-width`, `--elevation-low`, no clip.   |
| `.neobrutalism` | No radius, thick ink border, hard offset shadow in the intent, hover translates in.    |
| `.glass`        | Large radius, `backdrop-filter` blur, low background alpha, hairline highlight border. |
| `.pixel`        | Stepped `clip-path` corners, border drawn as an inset ring, `--font-pixel`, no radius. |

Each aesthetic also exposes its own tokens for tuning: `--neo-ink` and
`--neo-offset`; `--glass-blur`, `--glass-opacity`, `--glass-fill`, and
`--glass-edge`; `--pixel-unit` and `--pixel-ink`.

`.pixel` writes its silhouette into `--ui-clip` and `--ui-clip-tight` as two
complete polygons rather than one scaled by a unit, because a shape token cannot
reference a length the component overrides. `--pixel-unit` still tunes the
structural polygon, since that one resolves on `.pixel` itself; the chip polygon is
written at one unit directly.

### What reaches an unclassed element, and what cannot

An aesthetic delivers its material two ways, and only one of them survives the
trip to an unclassed element.

Anything a component declares travels, because `native.css` maps a bare element
with `@apply`, which copies declarations. That covers every material token,
including the silhouette, because the silhouette is consumed inside the `shaped`
utility the component composes rather than by a rule keyed on the component's
class. Rules scoped to a class list do not travel: a `<button>` styled by the
native entrypoint never matches `.pixel :is(.btn, ...)`.

Measured on the native playground page against the same component classed:

| Under `.pixel`    | native `<button>`        | classed `.btn`               |
| ----------------- | ------------------------ | ---------------------------- |
| `clip-path`       | stepped 20-point polygon | stepped 20-point polygon     |
| `box-shadow`      | `inset 0 0 0 4px` ring   | `inset 0 0 0 4px` ring       |
| `border-width`    | `0px`                    | `0px`                        |
| `--intent-border` | `oklch(87% 0 0)` gray    | `oklch(14.5% 0 0)` pixel ink |

The silhouette, the ring, the border ceiling, and the radius all arrive. The ink
does not, and neither does neobrutalism's offset shadow, because both must resolve
against the component's own intent and so are declared per component under A4 --
a container-level token would resolve the container's intent and inherit down
already-resolved. That is the residual gap, and it is deliberate rather than
outstanding: a native element under `.pixel` gets the full stepped silhouette in
the neutral border gray instead of the aesthetic's ink.

One detail hides it and is worth knowing before diagnosing it: `.btn` draws its
border from `--intent-color`, not `--intent-border`, so a native button looks
correct anyway. The native `<input>` is where the missing ink shows.

Widening the selector lists to name bare elements would have been the wrong
repair. The aesthetics ship from their own entrypoints, so a consumer can import
one without `native.css`; element selectors there would clip and ring bare elements
the package otherwise leaves alone. A4 gave the repair instead, and the table above
is the result.

### Presentation is narrower than its class list

Every presentation class sets the whole token set, but a component only shows the
tokens it reads. Where two classes resolve to the same values on a component, or
where a class removes something the component needs, the combination is outside
the [supported surface](./roadmap.md#supported-surface) and the playground does
not render it.

| Component                                                | Renders                             | Why the rest are out                                                                  |
| -------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------- |
| `.btn`                                                   | plain, out, `out fill`, soft, ghost | Its own fallbacks are `.flat`'s values, so `.flat` repeats plain.                     |
| `.alert` `.badge` `.card` `.panel` `.kbd` `.table`       | plain, out, soft, flat, ghost       | `.fill` sets only `--ui-hover-*`, which none of them read.                            |
| `.ipt` `.textarea` `.select` `.control-base`             | plain, out, soft, flat, ghost       | `.flat` clamps to the same 6% tint as `.soft`.                                        |
| `.checkbox` `.radio`                                     | plain, out, soft, flat, ghost       | `.soft` and `.ghost` restore the full edge as an accessibility floor while unchecked. |
| `.progress`                                              | plain, flat, out                    | Reads `--ui-border` only, so the tint classes land on plain.                          |
| `.divider` `.empty-state` `.quote` `.skeleton` `.loader` | plain, out, soft, flat, ghost       | Read every presentation they can visibly express, with component clamps and floors.   |

`.fill` deserves stating plainly: it declares nothing but `--ui-hover-*`, and
`.btn` is the only component with a fill-based hover, so `.fill` is inert on
everything else. It is a button modifier, not a fourth presentation, and the
axis table above lists it only because it sets presentation tokens.

### Conformance

Narrowness and non-compliance are different things, and the table above records
only the first. Measured against the [axis rules](#axis-rules), with
`--border-width: 1px` and `--ui-border-width: 2px` under `.neobrutalism` and
`.pixel`:

No known component currently breaks the axis rules.

Resolved so far: `.progress` caps its border at one pixel and blends the line
toward its own track, so `.out` is a real outline on a 10px bar and `.flat`
disappears as it always meant to; `.badge` and `.kbd` declare the same ceiling
through `--shape-border-max`; text controls keep a bottom rule under `.soft` as
they already did under `.ghost`; unchecked checkboxes and radios restore their
full edge under both tint presentations; and `.switch` reads the aesthetic's
border width with its knob geometry derived from it. Glass composes both shadow
layers from `--elevation-color`, so consumer elevation tuning reaches the
aesthetic. Helper text uses `.hint` for component typography and `.error` only
for destructive intent, so `.hint.error` composes without reinterpreting an
intent class.

`.divider`, `.empty-state`, `.skeleton`, `.loader`, and `.quote` read presentation
through component-owned formulas. Dividers clamp their line to one through two
pixels and let ghost remove it. Empty states are bounded surfaces with a two-pixel
border ceiling. Skeletons keep at least a six-percent fill and cap their edge at
one pixel. Loaders render their mask on `::before`, allowing the host to express
surface presentation while preserving size and reduced-motion masks. Quotes clamp
their bar from one through four pixels. Filled empty states, loaders, and quotes
use contrast text or artwork.

### Shadows reach everything that draws one

`--ui-shadow` is the material token for a shadow, so anything that draws one has
to resolve it or the aesthetic stops at that component's boundary. The tooltip
bubble was the one holdout: it hardcoded `--elevation-high`, which left a
blurred drop under a brutalist tooltip and no way for an aesthetic to reach it.
It now reads `var(--ui-shadow, var(--elevation-mid))`, the elevation a raised
surface uses, since a bubble is a small transient popover rather than a modal.
`--elevation-high` remains the token for full overlays.

Two consequences fall out of that for the aesthetics themselves. Glass must
compose its shadow from `--elevation-color` in two layers, a tight contact shadow
and a wide ambient one: a single wide black blur reads as a smudge under a
translucent surface and does not follow consumer elevation tuning. Pixel cannot
use `--ui-shadow` for the bubble at all, because `clip-path` clips an outer shadow
away; it casts a
hard unblurred `drop-shadow()` filter instead, which applies after the clip and
follows the stepped silhouette. That is deliberately the only shadow in the
aesthetic. A filter also establishes a containing block for positioned
descendants, which is harmless on a leaf pseudo-element and would not be on a
card.

### Compatibility

Aesthetics and presentations are composable but not universally sensible. Bad
combinations are documented rather than blocked, because blocking them in CSS
requires per-aesthetic-per-presentation selector pairs.

| Aesthetic       | `.flat` | `.out` | `.ghost` | `.soft` |
| --------------- | ------- | ------ | -------- | ------- |
| `.neobrutalism` | Yes     | Yes    | Weak     | Yes     |
| `.glass`        | Yes     | Yes    | Yes      | Yes     |
| `.pixel`        | Yes     | Yes    | Weak     | Yes     |

"Weak" means the aesthetic's defining trait is a border or shadow that `.ghost`
removes, leaving the element nearly unstyled. Supported, but not recommended.

`.glass` requires something behind it to blur. On a flat page background it
renders as a plain translucent panel. It is intended for surfaces, overlays, and
navigation rather than dense control clusters, where nested `backdrop-filter`
layers are also expensive to composite.

### The neutral ink

`.neobrutalism` and `.pixel` both override `--intent-border`, which is the one
place an aesthetic reaches into the intent axis. Their defining trait is a hard
outline, and the neutral `--intent-border` is the quiet border gray: two or more
pixels of it reads as a mistake rather than as the aesthetic.

Both selectors are `:where()`, so the override carries zero specificity. It beats
the neutral default in `intent.css` only by being declared later, and loses to
any intent class on the element, so a `.destructive` card keeps its red edge.
That ordering is why aesthetics must be imported after the base stylesheet.

`.neobrutalism` declares its `--ui-shadow` in that same component-level rule
rather than on the container, for the reason presentation classes carry no color:
a custom property resolves on the element that declares it, so a shadow set on
the container would resolve against the container's intent and inherit down
already-resolved. Declared on the component, it reads that component's own
`--intent-border` -- the ink when there is no intent, the intent's color when
there is -- so a success button casts a green shadow.

`.kbd`, `.code`, and `.pre` are excluded from both overrides. They are content
rather than structure, and an ink edge on one reads as a defect. A key cap draws
a quiet border by design; a code chip draws none at all.

A key cap is also the only component that fills from `--intent-color` but lines
itself from `--intent-border`, so a filled one keeps a stray ring of the other
color. Both `.kbd` and the pixel edge resolve that the same way, by blending the
line toward the fill by however much fill there is:

```css
color-mix(in oklab, var(--intent-color) var(--ui-fill, 0%), var(--intent-border));
```

With no fill this is the line color untouched; `.flat` fills completely and so
lands exactly on its own background. Every other component draws both from one
slot and is unaffected.

`.glass` sets no intent token. Its edge is a highlight rather than an outline, so
it mixes the intent into a light hairline at the point of use instead.

### Pixel layering

`clip-path` clips descendants, backgrounds, borders, shadows, and the focus
outline, so a clipped element cannot draw its edge with `border` or `outline`.
Both are rebuilt as inset shadows, which are clipped to the same stepped shape:

```css
box-shadow:
  inset 0 0 0 var(--ui-edge) var(--shape-edge),
  inset 0 0 0 calc(var(--ui-edge) + var(--ui-focus-inset, 0px)) var(--focus-ring);
```

Shadows paint in order, first on top, so the edge stays visible over the wider
focus ring sitting immediately inside it. Both layers live in `shape.css` as
`--shape-focus-stack`, declared as one value so a component substitutes both or
neither.

Two constraints fall out of the geometry. The ring must be exactly as thick as
the depth of the corner cut, or the staircase is left uncovered and the edge
reads as broken at every corner -- which is why `--ui-edge` and `--ui-clip` are set
in pairs, and why the chip slots exist rather than a scaled version of one shape.
And the ring's color must be composed at the point of use, because a custom
property resolves on the element that declares it: composed on the aesthetic, every
component would share whichever intent the aesthetic's root happened to have.

Because this consumes no pseudo-element, components that use `::before` or
`::after` for content need no exception. `.btn.loading`, `.alert.icon`,
`.checkbox`, `.radio`, and `.switch` all keep their marks inside a clipped box.

The ring color is the one place the clip meets a component's own material.
`--pixel-edge` blends the border toward the fill by however much fill there is,
so a filled component has a seamless outline rather than a stray ring of another
color, and `.code` and `.pre` set it to their own background: they draw no border
of any kind, so the corners step with nothing ringing the chip.

Four cases are still squared rather than clipped:

- `.tooltip-icon` is a tooltip host, and a host's bubble is a pseudo-element
  positioned outside its box, which clipping the host would erase. The bubble
  carries the stepped shape itself instead.
- `.table` paints cell backgrounds over any inset ring its root could draw.
- `.progress` and `.skeleton` are thinner than a stepped corner. A progress bar
  needs its fill squared too: the fill is a pseudo-element with a radius of its
  own, and squaring only the track leaves a pill inside a box.
- `.radio` keeps its circle, the only thing distinguishing it from a checkbox at
  a glance.

### Packaging

Aesthetics ship from opt-in entrypoints so consumers that do not use them pay
nothing. They cannot be tree-shaken, because a cascading class has no static
call site.

Two build constraints apply to these files specifically:

- They contain no Tailwind directives and must not carry `@reference
"tailwindcss"`. A `@reference` in a file imported into a full build switches
  the whole build to reference mode: `@theme` stops emitting `:root` and every
  theme variable is inlined with a fallback instead. Foundation tokens such as
  `--border-width` then go undefined, which invalidates the `calc()` around them
  and drops whole `border` shorthands.
- A `color-mix()` nested two deep inside another, over a `light-dark()`, crashes
  the WebKit renderer outright. Reproduced on the surfaces page under `.glass`,
  where blending a progress border toward `--progress-surface` -- itself a
  `color-mix` -- took the page down rather than producing a wrong color. Two levels
  are safe. Blend toward a plain token instead of toward another mix.
- `backdrop-filter` is written unprefixed only. The minifier adds
  `-webkit-backdrop-filter` for the Safari versions in the baseline, but if both
  are written by hand it collapses the pair to the prefixed one alone, leaving
  Firefox with no blur.

## Accessibility constraints

- Focus must remain visible under every aesthetic. `.pixel` restores it as a
  layer; `.glass` and `.neobrutalism` keep the standard outline.
- No axis may reduce non-text contrast below WCAG 1.4.11. This is why
  neumorphism is not shipped: its defining trait is a borderless control
  distinguished only by low-contrast shadow. It binds presentation the same way,
  which is the floor P3 requires: a class that zeroes a control's border leaves
  the same failing control by a different route, so the component clamps rather
  than complies.
- `--font-pixel` falls back to the monospace stack. The package ships no font
  binary, so `.pixel` has no network side effect.
- Aesthetic hover and press motion respects `prefers-reduced-motion` through the
  existing global reset.

## Non-goals

- No JavaScript. Semantics, ARIA, keyboard behavior, focus management,
  validation, and announcements belong to the consuming application.
- No component branching on axis combinations. A component that needs to know
  its aesthetic to look right means the axis split is wrong.
- No compatibility aliases for renamed internal component variables. They were
  never public contract.
