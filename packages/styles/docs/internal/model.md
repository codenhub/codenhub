---
status: APPROVED
last_updated: 2026-08-13
scope: The styling model proposed for `@codenhub/styles` 0.1.0.
---

# Model

What decides how an element looks in 0.1.0.

This document supersedes [Architecture](./architecture.md) once the refactor is
implemented. Until then Architecture remains the accurate record of what the code
does, and this is the proposal. Where the two conflict, the code follows
Architecture and future work follows this.

## The problem being fixed

The current model is three orthogonal axes with per-component clamps. It is
carefully specified and it produces unpredictable results. Three causes, all
structural:

**There is no default.** An element with no presentation class gets whatever
`var()` fallback each component happens to declare. `--ui-fill` falls back to
100% on a button, 12% on an alert and a badge, 0% on a card and a table. The
resting look of the library was never chosen; it accumulated. This is why a plain
button is filled while a plain table is outlined, and why neither is wrong under
any rule currently written down.

**Every component is on every axis.** `intent.css` resets twenty-five selectors,
and the supported-surface table asks each of them to express fill, border, and
silhouette. Components that cannot express those honestly were given clamps to
keep them from looking broken: a 1px ceiling on progress, another on badges and
key caps, a 6% floor on skeletons, a bottom-rule floor on text controls, an edge
restored on unchecked toggles. Each clamp is documented and each is an exception
a reader has to hold.

**Presentation bundles two decisions into one class.** Fill and edge are separate
questions, and the five classes pick fixed pairs of answers. The pairs cover four
of six possibilities, collapse to three distinct results on most components, and
leave the most common button on the web -- a subtle fill with a border -- with no
spelling at all.

The fix is not more rules. It is fewer decisions, each made explicitly.

## The axes

Three questions, asked in plain language before any CSS is involved:

**What does this thing mean?** A delete button and a save button are the same
control doing opposite things, and a reader has to know which is which before
reading a word of the label. That is **intent**. It is a meaning, not a color --
the color is downstream of the meaning, which is why `.destructive` is the name
and `.red` is not. Intent holds two vocabularies that share one slot: semantic
(`.success` `.warning` `.destructive` `.info`) says what is _true_ of the thing,
and emphasis (`.primary` `.secondary`) says how much it _matters here_. Exactly
one applies, and semantic outranks emphasis: a delete confirmation's main button
is `.destructive`, because losing the warning costs more than losing the
emphasis.

**How much of that meaning does it show?** The same destructive action is a
filled red slab in a confirmation dialog and a quiet red word in a settings row.
Nothing about the meaning changed; the composition did. That is
**presentation**: how much of the intent fills the element, and whether it draws
an edge. It is the volume knob, not the message.

**What is it made of?** A button is a rounded slab, or a thick-inked box with a
hard shadow, or a stepped 8-bit rectangle, or a chunky tile sitting on a darker
shade of itself. Radius, edge thickness, shadow, silhouette, typography, motion:
the style language everything is built from. That is **aesthetic**. Swap it and
the same markup, with the same intents and the same presentations, becomes a
visibly different product.

Put shortly: intent is _what it says_, presentation is _how loudly_, aesthetic is
_in what voice_.

| Axis         | Answers                      | Owns                           | Cascades | Classes                                                                         |
| ------------ | ---------------------------- | ------------------------------ | -------- | ------------------------------------------------------------------------------- |
| Intent       | What does this mean?         | Hue only                       | No       | `.neutral` `.primary` `.secondary` `.success` `.warning` `.destructive` `.info` |
| Presentation | How much of it does it show? | Unitless ratios only           | Yes      | `.solid` `.soft` `.bare` and `.edged` `.edgeless`                               |
| Aesthetic    | What is it made of?          | Lengths, shadows, shapes, type | Yes      | `.neobrutalism` `.glass` `.pixel`                                               |

The three are orthogonal by construction, and the "Owns" column is what enforces
it. Intent may only produce color, so it can never change a shape. Presentation
may only produce unitless numbers, so it inherits down a subtree without dragging
a resolved color with it. Aesthetic may only produce material, so it can restyle
a whole page without knowing what anything means.

Two of them cascade and one does not, and that is the same rule seen from two
sides. A container saying "everything below me is quiet and glassy" is useful. A
container saying "everything below me is a success" is a trap: it would turn a
nested destructive button green. So presentation and aesthetic inherit, and
intent is redeclared by every component at its own root.

What changes from the current model is presentation's shape, and the addition of
a role layer that decides which axes reach which component.

## Presentation

Presentation answers two independent questions. Each is its own closed set, and
exactly one value from each set applies.

### Fill: how much of the intent color fills the box

| Class    | `--ui-fill` | `--ui-fg-on-fill` | Reads as                                                 |
| -------- | ----------- | ----------------- | -------------------------------------------------------- |
| `.solid` | `100%`      | `100%`            | Filled with the intent color; text is the contrast tone. |
| `.soft`  | `12%`       | `0%`              | Tinted with the intent color; text is the intent color.  |
| `.bare`  | `0%`        | `0%`              | No fill at all; text is the intent color.                |

### Edge: whether the box draws a line at its boundary

| Class       | `--ui-border` | Reads as                                                       |
| ----------- | ------------- | -------------------------------------------------------------- |
| `.edged`    | `100%`        | A line in the intent color, at the aesthetic's material width. |
| `.edgeless` | `0%`          | No line.                                                       |

Three presentation tokens total, down from six. Every value is a percentage, so
presentation still inherits without carrying a resolved color, and a container
can still set the look for a subtree while any element opts out.

### What the six combinations are for

```text
<button class="btn primary">              solid edgeless  primary action
<button class="btn primary edged">        solid edged     filled with an ink outline
<span   class="badge success">            soft  edgeless  tinted chip
<button class="btn soft edged">           soft  edged     the common web button
<button class="btn primary bare edged">   bare  edged     outline button
<button class="btn bare">                 bare  edgeless  ghost, toolbar button
```

None is degenerate on a component that draws both a fill and a line. That is the
test the previous set failed.

### Hover is derived, never declared

```
hover fill  = min(100%, resting fill + 14%)
hover color = --intent-hover, always
hover edge  = --intent-hover at the same width
```

One formula, no branches, no tokens. `bare` picks up a 14% tint, `soft` deepens
to 26%, `solid` stays full and darkens because the base color changed. This
replaces `--ui-hover-fill` and `--ui-hover-fg-on-fill`, and it is what deletes
`.fill`: a class whose only job was to make an outline button fill on hover, and
which was inert on every other component in the library.

The cost is stated plainly: an outline button no longer fills completely on
hover. It tints. `.out.fill` has no replacement spelling and is not coming back.

### The edge is never scaled

`--ui-border-scale` is deleted. The edge width comes from the aesthetic and
nothing else. The old `.out` doubled it, which is why small components needed
ceilings: two pixels of border a side on a 10px progress track leaves two pixels
of bar. Remove the scale and the ceilings stop being necessary, which is one
token and five documented exceptions gone for a change nobody will see.

### What presentation may not do

- **P1.** Presentation declares only unitless numbers and percentages.
- **P2.** Presentation modulates what a component already draws. It never gives a
  component a part it does not otherwise have.
- **P3.** Any component that draws a line blends it toward its own fill by the
  fill amount, so a filled component has a seamless edge rather than a stray ring
  of another color.
- **P4.** A component never clamps a presentation token. Where a bound is needed,
  it belongs to the role, not to the component. See [Roles](#roles).

P4 is the rule that did not exist before, and it is the one that keeps the model
predictable. A clamp on a component is invisible until you hit it. A bound on a
role applies to a named group and can be learned once.

## Elevation

Depth is not uniform within an aesthetic. In the chunky-tile look, white option
cards sit on a darker slab while the blue promo panel beside them is flat, the
word-bank chips are raised, and the disabled submit button is flat. Same
aesthetic, same roles, different depth -- decided per element by whoever builds
the screen.

So elevation is a **modifier**, not a fourth axis. It sits with size, above the
three axes:

| Class       | `--ui-elevation` | Means                                   |
| ----------- | ---------------- | --------------------------------------- |
| `.flat`     | `0`              | No depth, whatever the aesthetic draws. |
| _(default)_ | `1`              | The aesthetic's depth as authored.      |
| `.raised`   | `1`              | The same, said explicitly.              |
| `.floating` | `2`              | Twice it, for menus and popovers.       |

One unitless number, multiplied into the aesthetic's shadow geometry where the
component composes it:

```css
--_sy: calc(var(--ui-shadow-y, 0px) * var(--ui-elevation, 1));
```

The division of labor is the point. **The aesthetic decides what depth looks
like** -- a hard bottom slab, a soft ambient blur, a stepped ring -- and
**elevation decides how much of it this element gets**. Neither needs to know the
other. `.flat` on a chunky-tile card removes a 4px slab; on a glass card it would
remove a soft shadow; under no aesthetic at all it removes nothing, because there
was nothing.

Being unitless is what makes it safe to inherit, so a container can flatten a
whole toolbar with one class and any element inside can opt back in.

Zero lengths are written `0px` rather than `0` in the fallbacks, because
`calc(0 * 1)` produces a number and a shadow position requires a length.

The registry gives each component its default level, so "a card is raised and an
input is not" is a published fact rather than an accident of which aesthetic
happens to be loaded.

### The one limitation

An aesthetic setting `--ui-shadow` as a complete multi-layer value opts out of the
elevation scale, because there is nothing for the multiplier to reach. That hole
is kept small deliberately: shipped aesthetics express depth with the parts, and
the complete-value form stays an escape hatch for shadows that genuinely cannot be
described as one layer. An aesthetic taking the escape hatch declares it in the
registry, so `.flat` not working on it is documented rather than discovered.

## Roles

A role answers "what kind of thing is this", and the role decides which axes
reach the component and what invariant it holds. Every component has exactly one.

| Role        | Members                                                                      | Fill       | Edge         | Invariant                              |
| ----------- | ---------------------------------------------------------------------------- | ---------- | ------------ | -------------------------------------- |
| `action`    | `.btn`                                                                       | all three  | both         | None. All six combinations.            |
| `field`     | `.ipt` `.textarea` `.select` `.checkbox` `.radio` `.switch`                  | bare, soft | always edged | A field always shows where input goes. |
| `surface`   | `.card` `.panel` `.alert` `.table` `.empty-state` `.pre` `.quote` `.tooltip` | all three  | both         | None. All six combinations.            |
| `chip`      | `.badge` `.kbd` `.code`                                                      | all three  | both         | Edge width never exceeds 1px.          |
| `indicator` | `.loader` `.skeleton` `.progress` `.divider`                                 | —          | —            | Neither sub-axis applies. Color only.  |

Four invariants, replacing every per-component clamp in the current model:

| Current clamp                                     | Becomes                             |
| ------------------------------------------------- | ----------------------------------- |
| Progress caps its border at 1px                   | Indicator: no edge at all           |
| Badge and key cap cap their border at 1px         | Chip invariant                      |
| Skeleton keeps a 6% fill floor                    | Indicator: fill is not presentation |
| Text controls keep a bottom rule under soft/ghost | Field invariant                     |
| Unchecked toggles restore their full edge         | Field invariant                     |
| Empty state caps its border at 2px                | Unnecessary once the scale is gone  |
| Quote clamps its bar to 1-4px                     | Unnecessary once the scale is gone  |

### Why `indicator` exists

A loader is an animated SVG. A skeleton is a shimmering block. A progress bar is
a track and a fill. A divider is a line. None of them has a "background tinted by
intent, bordered by intent, silhouetted by the aesthetic" reading that means
anything, and every attempt to give them one produced a clamp.

Under this role they take a color and their own geometry, and nothing else. A
loader is a mask over `currentColor`; an intent class colors it, and that is the
whole contract.

One implementation detail decides whether that works, and the spike got it wrong
first: the `currentColor` default belongs in the zero-specificity reset next to the
other intent defaults, not in the role's own block. Declared in the block it
carries 0-1-0 and, being later in the stylesheet, beats `.success` -- which makes
every indicator silently ignore every intent class. This is the same defect as the input icons in
[the token inventory](./tokens-inventory.md#the-input-icons): artwork carrying
baked-in presentation instead of taking color from its host.

### Why `field` is separate from `action`

Both are interactive, and their affordances are opposites. A button may be quiet
-- a toolbar full of ghost buttons is a normal design. A text input may not: a
control with no fill and no border has lost the only mark of where typing goes,
which WCAG 1.4.11 does not allow. Splitting them lets `action` carry no invariant
at all rather than carrying a bound that only fields need.

Fields therefore support two of the six combinations, `bare edged` and
`soft edged`, and the registry says so. A consumer writing `.ipt.solid` gets
`soft edged`, predictably, because the role's ceiling is published.

### Roles are the aesthetic's targeting mechanism

An aesthetic that must reach some components and not others selects a token that
only those components resolve, rather than naming them:

```css
/* Only the surface role composes `--ui-backdrop`. */
backdrop-filter: var(--ui-backdrop, none);
```

Glass sets `--ui-backdrop` at container level and gets blur on cards, panels,
alerts, and tooltip bubbles while controls stay solid -- the scope it wants
today, achieved with two 4-selector lists. This is what makes
[R3](#rules-for-aesthetics) enforceable rather than aspirational.

## Intent

Unchanged. Six slots, seven classes, no cascade, and the zero-specificity reset
that lets an element's own intent class win over an inherited value. It is the
part of the current model that has held up under everything asked of it.

| Token               | Meaning                                               |
| ------------------- | ----------------------------------------------------- |
| `--intent-color`    | The intent's base color.                              |
| `--intent-contrast` | Readable color on top of a filled `--intent-color`.   |
| `--intent-hover`    | The intent's hovered base color.                      |
| `--intent-strong`   | High-emphasis tone; readable text on subtle surfaces. |
| `--intent-subtle`   | Low-emphasis tone; tinted surfaces and tracks.        |
| `--intent-border`   | Line color; the quiet border gray with no intent set. |

One change of ownership. The shared reset declares:

```css
--intent-border: var(--ui-ink, var(--color-border));
```

An aesthetic sets `--ui-ink` to substitute its own neutral line color, and an
intent class still overrides the whole slot, so a destructive control keeps its
red edge under any aesthetic. This deletes the two fourteen-selector component
lists in `neobrutalism.css` and closes the native-element gap Architecture
records: a bare `<input>` under `.pixel` currently gets the silhouette but not
the ink.

Rules I1 through I4 from Architecture carry over unchanged, including the one
deliberate exception where table rows inherit their table's intent.

## Aesthetic

An aesthetic declares material: lengths, shadows, shapes, font family, and the
neutral ink. It cascades, and a component resolves each token at its own root
with the `var()` fallback that is its default.

### Material tokens

| Token                     | Fallback             | Meaning                                               |
| ------------------------- | -------------------- | ----------------------------------------------------- |
| `--ui-radius`             | `--radius-control`   | Corner radius for controls.                           |
| `--ui-radius-surface`     | `--radius-surface`   | Corner radius for surfaces.                           |
| `--ui-border-width`       | `--border-width`     | Edge thickness.                                       |
| `--ui-border-max`         | `100px`              | Ceiling on the computed edge width.                   |
| `--ui-ink`                | `--color-border`     | Neutral line color when no intent is set.             |
| `--ui-shadow-x`           | `0`                  | Shadow offset, colorless so it inherits safely.       |
| `--ui-shadow-y`           | `0`                  | Shadow offset.                                        |
| `--ui-shadow-blur`        | `0`                  | Shadow blur.                                          |
| `--ui-shadow-spread`      | `0`                  | Shadow spread.                                        |
| `--ui-shadow-inset`       | _empty_              | The `inset` keyword, when the edge is an inner ring.  |
| `--ui-hover-shadow-x`     | `--ui-shadow-x`      | Shadow offset while hovered.                          |
| `--ui-hover-shadow-y`     | `--ui-shadow-y`      | Shadow offset while hovered.                          |
| `--ui-active-shadow-x`    | `--ui-shadow-x`      | Shadow offset while pressed.                          |
| `--ui-active-shadow-y`    | `--ui-shadow-y`      | Shadow offset while pressed.                          |
| `--ui-active-transform`   | `none`               | Transform applied while pressed.                      |
| `--ui-shadow-tint`        | `transparent`        | Color mixed into the shadow, over its own intent.     |
| `--ui-shadow-tint-amount` | `0%`                 | How much of that tint.                                |
| `--ui-elevation`          | `1`                  | Unitless multiplier over the shadow geometry.         |
| `--ui-shadow`             | _unset_              | Complete multi-layer value; overrides the parts.      |
| `--ui-surface-ground`     | `--color-background` | Ground a surface sits on; how glass goes translucent. |
| `--ui-bg-alpha`           | `1`                  | Multiplier over fill, for translucency.               |
| `--ui-backdrop`           | `none`               | Backdrop filter; resolved by the surface role only.   |
| `--ui-hover-transform`    | `none`               | Transform applied on interactive hover.               |
| `--ui-clip`               | `none`               | Silhouette for structural components.                 |
| `--ui-clip-tight`         | `--ui-clip`          | Silhouette for chips.                                 |
| `--ui-edge`               | _undefined_          | Inset ring width when the edge is not a border.       |
| `--ui-edge-tight`         | `--ui-edge`          | Inset ring width for chips.                           |
| `--ui-focus-inset`        | `0px`                | Focus layer depth inside the ring.                    |

The shadow split is the second half of the ink fix. A custom property resolves
its `var()` references on the element that declares it, so a complete shadow
declared on `.neobrutalism` resolves the container's intent and inherits down
already-resolved -- which is exactly why the aesthetic has to name every
component today. Colorless geometry inherits safely, and the component supplies
the color:

```css
box-shadow: var(--ui-shadow-x, 0) var(--ui-shadow-y, 0) var(--ui-shadow-blur, 0) var(--ui-shadow-spread, 0)
  var(--intent-border);
```

`--ui-shadow` remains as a complete-value override for the multi-layer case glass
needs, where the color is fixed rather than intent-derived.

Three of those slots exist because the spike found the first four insufficient.
`--ui-shadow-inset` carries the `inset` keyword, without which pixel's ring has to
be written as a complete value and loses the component's own intent.
`--ui-hover-shadow-*` lets neobrutalism collapse its shadow on hover without the
`:hover` selector R3 forbids. `--ui-surface-ground` exists because
`--ui-bg-alpha` multiplies the _fill_, and a surface's default fill is 0%: with no
ground token a glass card keeps an opaque background and its own blur is invisible
behind it.

### Rules for aesthetics

- **R1.** An aesthetic declares only material tokens. No aesthetic sets a
  presentation token or an intent slot other than `--ui-ink`.
- **R2.** A component resolves a material token unconditionally. A no-op material
  value is free, which Architecture measured in all three baseline engines.
- **R3.** An aesthetic never names a component. It sets tokens, or it targets a
  role. See [Adding an aesthetic](#adding-an-aesthetic).

R3 is new, and it is what the material additions above exist to make possible:
without `--ui-ink`, the shadow parts, `--ui-backdrop`, and the tint pair it would
be a rule the shipped aesthetics immediately break. Where a token genuinely cannot
express a component-kind-specific treatment, a role block can, under R4 and R5.

## Precedence

1. **Aesthetic** supplies the base material.
2. **Presentation** decides how much fill and whether there is an edge.
3. **Intent** colors both.
4. **Role** bounds the result.

Modifiers -- size, and [elevation](#elevation) -- sit above the four, being
per-element choices rather than axis membership. State sits above the modifiers: a
control that is `:disabled` or `aria-invalid` reads as such regardless of every
axis and modifier applied to it. State is a condition rather than
a choice, so it is not an axis, but it wins when it collides with one.

Note the change from the current order, where the fourth step was "component
clamps the result". A role bounds; a component does not.

## Defaults

Every component declares its resting pair in the registry. There is no "plain"
and no implicit default: a component with no presentation class renders the pair
the registry names for it, and that pair is published.

| Component                                    | Default        |
| -------------------------------------------- | -------------- |
| `.btn`                                       | solid edgeless |
| `.ipt` `.textarea` `.select`                 | bare edged     |
| `.checkbox` `.radio` `.switch`               | bare edged     |
| `.card`                                      | bare edged     |
| `.panel`                                     | soft edgeless  |
| `.alert`                                     | soft edged     |
| `.table`                                     | bare edged     |
| `.empty-state`                               | bare edged     |
| `.tooltip`                                   | solid edgeless |
| `.pre` `.code` `.kbd`                        | soft edgeless  |
| `.badge`                                     | soft edgeless  |
| `.quote`                                     | bare edged     |
| `.loader` `.skeleton` `.progress` `.divider` | n/a            |

These are proposals, not derivations -- there is no rule that produces them, and
there should not be. The point is that each is a decision on one line of one file
rather than a `var()` fallback in the middle of a component.

## The registry

`registry.json` is the source of truth for what the package supports. Per
component: name, role, default pair, allowed pairs, allowed intents, native
element mapping, aesthetic participation, and implementation wave.

It feeds three consumers, which is the point of it being data:

- `pnpm generate` writes the public class and token tables and the LLM files.
- The playground builds its matrix from it, so a combination that is not
  supported cannot be rendered.
- Browser tests assert every declared combination resolves, and that no
  undeclared one is claimed.

It also validates every class name against Tailwind's static utility list and
fails the build on a collision. `.table` collides today: the package's `@utility
table` replaces Tailwind's `display: table` utility for every consumer.

## Variant specs

What each aesthetic must look like, so a change can be judged against something.

### Default

No aesthetic class in scope. 1px edges, 0.5rem control radius, 0.875rem surface
radius, no silhouette, no shadow except the card's elevation. The default is the
absence of material declarations, not a set of root values -- which is why a card
gets surface radius and a button gets control radius from the same unset token.

### `.glass`

Translucent surfaces over a blurred backdrop with a hairline highlight edge.
Needs something behind it to blur; on a flat page background it is a translucent
panel and nothing more.

- Blur and saturation reach the surface role only, through `--ui-backdrop`.
  Controls stay solid: an active blur costs a compositing layer apiece, and one
  under every control of a dense cluster reads as noise.
- The edge is a light hairline in both themes, because glass catches light from
  above regardless of what is under it.
- Both shadow layers pull in with negative spread, so the shadow tucks under the
  surface instead of haloing onto the backdrop.
- Under `prefers-reduced-transparency`, opacity goes to 100% and the blur is
  dropped. Transparency is the whole aesthetic, so the honest degradation is an
  opaque surface rather than a softer blur.

### `.neobrutalism`

Thick ink outline, a hard unblurred offset shadow, and a press that moves the
element into its own shadow.

- 2px edges, zero radius everywhere.
- Ink follows the theme, not the palette: near-black on light, near-white on
  dark. Pure black disappears on a dark page.
- The offset shadow is the component's own `--intent-border`, so a success button
  casts a green shadow and an unintented one casts ink.
- Hover moves the element by the shadow offset and shrinks the shadow to nothing.

### `.pixel`

An 8-bit look built from a stepped silhouette and an inset ring.

- Corners step by a 2px grid unit; chips step by 1px on their own polygon.
- The edge is an inset ring of the same depth as the cut. A thinner ring leaves
  the staircase uncovered and the border reads as broken at every corner.
- No radius anywhere. `clip-path` clips a border away, so the border ceiling goes
  to zero and the ring does the drawing.
- Reads `--font-pixel` and falls back to monospace. The package ships no font
  binary.

## What dies

| Goes away                | Replaced by                                    |
| ------------------------ | ---------------------------------------------- |
| `.flat`                  | `.solid`                                       |
| `.out`                   | `.bare.edged`                                  |
| `.ghost`                 | `.bare`                                        |
| `.fill`                  | Derived hover. No replacement for `.out.fill`. |
| `--ui-border-scale`      | Nothing. The aesthetic owns edge width.        |
| `--ui-hover-fill`        | Derived hover.                                 |
| `--ui-hover-fg-on-fill`  | Derived hover.                                 |
| Per-component clamps     | Role invariants.                               |
| Aesthetic selector lists | `--ui-ink`, shadow parts, `--ui-backdrop`.     |
| "Plain"                  | A published default pair per component.        |

`.soft` keeps its name and changes meaning slightly: it is now fill only, and an
author who wants the old bordered-soft look writes `.soft.edged`.

## Spike results

A throwaway implementation of this model -- plain CSS, no build -- was measured in
Chromium, Firefox, and WebKit. All six questions are answered. The model stands;
three material slots and one specificity rule were added because of what it found.

| #   | Question                                       | Answer                                                           |
| --- | ---------------------------------------------- | ---------------------------------------------------------------- |
| Q1  | Does `--ui-ink` reach a bare element?          | **Yes**, all three engines, identically to a classed component.  |
| Q2  | Do colorless shadow parts take the own intent? | **Yes**, and the chip's 1px cap holds under a 2px aesthetic.     |
| Q3  | Does `--ui-backdrop` scope blur to a role?     | **Yes**, with no component selector -- but see the ground token. |
| Q4  | Is a 14% hover step visible?                   | **Yes**, comfortably. Smallest separation measured is 31.        |
| Q5  | Is `bare edged` distinct from `soft edged`?    | **Yes**, at 1px. Separation is 48-52 in both themes.             |
| Q6  | Does anything fail to resolve in WebKit?       | **No**. Every composed value resolves in all three engines.      |

Q1 is the one worth stating loudly. Architecture records the missing ink on bare
elements as a residual gap A4 could not close, because the value has to resolve
against the component's own intent and a container-level token cannot. Routing it
through `--ui-ink` in the shared reset closes it: a bare `<button>` and a bare
`<input>` under `.neobrutalism` and `.pixel` report exactly the ink, border width,
ring, and silhouette the classed component reports, and a `.destructive` component
still keeps its red edge and casts a red shadow.

Q4 and Q5 were measured on composited pixels rather than on computed strings,
because a computed `color-mix()` carrying alpha says nothing about what the eye
gets. Distances are sRGB, where roughly 20 is a clearly visible step:

| Fill level     | Resting -> hover | Separation |
| -------------- | ---------------- | ---------: |
| `bare`, light  | 250 -> 223       |         47 |
| `soft`, light  | 220 -> 202       |         31 |
| `solid`, light | 10 -> 64         |         94 |
| `bare`, dark   | 10 -> 40         |         52 |
| `soft`, dark   | 38 -> 66         |         48 |
| `solid`, dark  | 250 -> 229       |         36 |

`soft` in light mode is the tightest at 31, still half again the visibility
threshold. 14% stands.

`bare edged` and `soft edged` separate by 48 to 52 in both themes at a single
pixel of border, so dropping `--ui-border-scale` costs nothing legible.

### What the spike changed

1. `--ui-shadow-inset`, because pixel's inset ring cannot be expressed by offset,
   blur, and spread alone, and writing it as a complete value costs the
   component's own intent.
2. `--ui-hover-shadow-x` and `-y`, because neobrutalism's press-into-the-shadow
   hover otherwise needs a `:hover` selector inside the aesthetic, which R3
   forbids.
3. `--ui-surface-ground`, because a glass card rendered opaque: `--ui-bg-alpha`
   multiplies the fill, a surface's default fill is 0%, and the blur sat behind a
   solid background. This is the one finding that would have shipped as a visible
   defect.
4. The indicator specificity rule under [Roles](#why-indicator-exists).
5. `--ui-shadow-tint`, the `--ui-active-*` slots, and `--ui-elevation`, added when
   an aesthetic the model had never seen was built against it as a test. See
   [Adding an aesthetic](#adding-an-aesthetic): eight tokens and one role block
   reproduced a chunky-tile look end to end, across intents, with no component
   touched.

### One thing to know before writing the tests

Chromium in this environment reports `prefers-reduced-transparency: reduce`, where
Firefox and WebKit report no preference. Glass therefore renders opaque and
unblurred in Chromium and translucent in the other two, from the same stylesheet
-- which is the degradation working correctly, and it got exercised by accident.
Visual snapshots of any glass surface must pin the media state or they will differ
per machine and per engine.

## Adding an aesthetic

Aesthetic is the axis most likely to grow, so it gets the most deliberate
extension story. Liquid glass, cyberpunk, synthwave, and the chunky-tile look
Duolingo uses are all aesthetics, and each wants something material tokens alone
do not offer: a button that behaves differently from a card.

Two tiers, and an aesthetic reaches for the second only when the first genuinely
cannot express it.

### Tier 1 -- material tokens

Set tokens, touch nothing else. This tier cascades, needs no knowledge of any
component, and reaches bare `<button>` and `<input>` elements carrying no class at
all. Most of an aesthetic lives here.

### Tier 2 -- role blocks

Arbitrary declarations, scoped to a role rather than to a component. The registry
generates the selector list for each role, native element mappings included, so an
aesthetic never writes a component name and never falls behind when a component
joins a role.

```css
/* The author writes the role. */
@role action {
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 800;
}
```

Three rules govern this tier, and they are what keep it from becoming the
selector-list sprawl it replaces:

- **R3.** An aesthetic never names a component. It sets tokens, or it targets a
  role.
- **R4.** A role block declares material only. No color literal encoding an
  intent, and no presentation ratio. A role block may say "actions in this
  aesthetic are uppercase"; it may not say "actions in this aesthetic are green".
- **R5.** Every role block an aesthetic declares is listed in the registry, so the
  conformance tests know to check it and the docs know to describe it. A role
  block nobody registered is a defect even when it renders correctly.

R4 is the load-bearing one. A color depending on the component's own intent cannot
be written in a role block correctly anyway -- it would resolve against whatever
the block matched -- so the rule forbids what is already broken, and pushes the
author back to a token, where the composition happens at the component.

### Worked example: the chunky-tile look

Rounded slabs sitting on a darker shade of themselves, pressed flat on click, with
uppercase actions. Built in the spike against a real screenshot:

```css
.duolingo {
  --ui-radius: 1rem;
  --ui-radius-surface: 1rem;
  --ui-border-width: 2px;
  --ui-shadow-y: 4px;
  --ui-shadow-tint: #000;
  --ui-shadow-tint-amount: 26%;
  --ui-active-shadow-y: 0;
  --ui-active-transform: translateY(4px);
}
```

Depth in that aesthetic is not uniform, and it does not have to be: the promo
panel that should not sit on a slab carries `.flat`, and the aesthetic never
learns about it.

```html
<div class="card soft edgeless info flat">Promo panel, deliberately flat</div>
```

```css
@role action {
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
```

Eight tokens and one role block. No component named, none modified, and the result
holds across intents: a success button sits on a dark green edge, a neutral card
on a dark gray one, a selected `.soft.edged.info` card on a dark blue one --
because the tint composes against each component's own intent at the component,
not at the container.

`--ui-shadow-tint` is what makes that work, and it generalizes to "a shade of
whatever this thing already is". A tint is a plain color and an amount is a plain
percentage; neither carries intent, so both inherit safely, and the mix happens
where the intent lives.

### What the other aesthetics on the list will need

Checked against the model rather than promised:

| Aesthetic    | Tier 1 covers                                     | Needs a role block for             |
| ------------ | ------------------------------------------------- | ---------------------------------- |
| Liquid glass | Blur, translucent ground, radius, hairline edge   | Specular highlight on surfaces     |
| Cyberpunk    | Clipped corners, edge width, glow via shadow tint | Scanline background on surfaces    |
| Synthwave    | Radius, glow, gradient ground                     | Gradient text or chrome on actions |
| Chunky tile  | Everything above                                  | Uppercase actions                  |

The pattern holds in each case: shape, color, and depth come from tokens, and only
a genuinely component-kind-specific treatment reaches for a role block. That is
the line the tiers are drawn on.

### Where this leaves native elements

Tier 1 reaches a bare `<button>` because tokens travel through the cascade. Tier 2
reaches it too, because the registry generates each role's selector list from the
same native element mapping `native.css` uses. An aesthetic staying in Tier 1
works everywhere; an aesthetic using Tier 2 works everywhere the registry says the
role lives.

## References

- [Token inventory](./tokens-inventory.md)
- [Architecture](./architecture.md), which this supersedes on implementation
- [Roadmap](./roadmap.md)
