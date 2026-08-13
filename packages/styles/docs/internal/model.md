---
status: DRAFT
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

| Axis         | Question        | Cascades | Classes                                                                         |
| ------------ | --------------- | -------- | ------------------------------------------------------------------------------- |
| Intent       | Which color?    | No       | `.neutral` `.primary` `.secondary` `.success` `.warning` `.destructive` `.info` |
| Presentation | How much of it? | Yes      | `.solid` `.soft` `.bare` and `.edged` `.edgeless`                               |
| Aesthetic    | Made of what?   | Yes      | `.neobrutalism` `.glass` `.pixel`                                               |

Unchanged from the current model in framing, and unchanged in mechanism: intent
carries only hue, presentation only unitless ratios, aesthetic only lengths,
shadows, and shapes. What changes is presentation's shape, and the addition of a
role layer that decides which axes reach which component.

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
whole contract. This is the same defect as the input icons in
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

| Token                  | Fallback           | Meaning                                             |
| ---------------------- | ------------------ | --------------------------------------------------- |
| `--ui-radius`          | `--radius-control` | Corner radius for controls.                         |
| `--ui-radius-surface`  | `--radius-surface` | Corner radius for surfaces.                         |
| `--ui-border-width`    | `--border-width`   | Edge thickness.                                     |
| `--ui-border-max`      | `100px`            | Ceiling on the computed edge width.                 |
| `--ui-ink`             | `--color-border`   | Neutral line color when no intent is set.           |
| `--ui-shadow-x`        | `0`                | Shadow offset, colorless so it inherits safely.     |
| `--ui-shadow-y`        | `0`                | Shadow offset.                                      |
| `--ui-shadow-blur`     | `0`                | Shadow blur.                                        |
| `--ui-shadow-spread`   | `0`                | Shadow spread.                                      |
| `--ui-shadow`          | _unset_            | Complete multi-layer value; overrides the parts.    |
| `--ui-bg-alpha`        | `1`                | Multiplier over fill, for translucency.             |
| `--ui-backdrop`        | `none`             | Backdrop filter; resolved by the surface role only. |
| `--ui-hover-transform` | `none`             | Transform applied on interactive hover.             |
| `--ui-clip`            | `none`             | Silhouette for structural components.               |
| `--ui-clip-tight`      | `--ui-clip`        | Silhouette for chips.                               |
| `--ui-edge`            | _undefined_        | Inset ring width when the edge is not a border.     |
| `--ui-edge-tight`      | `--ui-edge`        | Inset ring width for chips.                         |
| `--ui-focus-inset`     | `0px`              | Focus layer depth inside the ring.                  |

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

### Rules for aesthetics

- **R1.** An aesthetic declares only material tokens. No aesthetic sets a
  presentation token or an intent slot other than `--ui-ink`.
- **R2.** A component resolves a material token unconditionally. A no-op material
  value is free, which Architecture measured in all three baseline engines.
- **R3.** An aesthetic never uses a component-scoped selector. To reach a subset
  of components it picks a token only that role resolves.

R3 is new and is the strictest rule in the document. It is achievable only
because of `--ui-ink`, the shadow parts, and `--ui-backdrop`; without those three
it would be a rule the shipped aesthetics immediately break.

## Precedence

1. **Aesthetic** supplies the base material.
2. **Presentation** decides how much fill and whether there is an edge.
3. **Intent** colors both.
4. **Role** bounds the result.

State sits above all four: a control that is `:disabled` or `aria-invalid` reads
as such regardless of every axis applied to it. State is a condition rather than
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

## Open questions for the spike

The [spike](./roadmap.md) has to answer these before this document can be
approved. Each is a place where the design is reasoned but not measured.

1. Does `--ui-ink` through the shared reset actually deliver neobrutalism's ink
   to a bare `<input>` mapped by `native.css`, where the selector-list approach
   cannot?
2. Do the colorless shadow parts compose correctly on a component whose intent
   comes from its own class, across all three aesthetics?
3. Does `--ui-backdrop` scope the blur to the surface role without a single
   component selector, and does the reduced-transparency override still reach it?
4. Is a 14% hover step visible enough on `bare` and distinguishable enough on
   `soft`, in both themes, for all seven intents?
5. Does removing `--ui-border-scale` leave outline buttons visually distinct
   enough from bordered soft ones at 1px?
6. Does the fill/edge split survive `color-mix()` nesting depth in WebKit? Three
   levels crash the renderer, which is already recorded in Architecture.

## References

- [Token inventory](./tokens-inventory.md)
- [Architecture](./architecture.md), which this supersedes on implementation
- [Roadmap](./roadmap.md)
