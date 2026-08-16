---
status: IMPLEMENTED
last_updated: 2026-08-14
scope: `@codenhub/styles` styling model, token contracts, and composition rules.
---

# Model

What decides how an element looks in 0.1.0.

This document is the source of truth for the token contracts; public documents
under `docs/` describe the same model for consumers. It supersedes
[Architecture](./architecture.md), which described the model 0.1.0 replaced and is
kept only for the measurements recorded in it.

It is written as the argument for the model rather than as a reference to it,
because the reasoning is the part that decides the next question. Sections that
read as proposals -- [What dies](#what-dies), [Spike results](#spike-results) --
are the record of what was changed and why, and are accurate as history.

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

What changes from the current model is presentation's shape. Nothing is added:
there is no fourth layer deciding which axes reach which component, and
[the attempt to add one](#shared-composition-not-a-taxonomy) is recorded below
along with why it was removed.

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

### What the combinations are for

```text
<button class="btn primary">              solid           primary action
<span   class="badge success">            soft  edgeless  tinted chip
<button class="btn soft edged">           soft  edged     the common web button
<button class="btn primary bare edged">   bare  edged     outline button
<button class="btn bare">                 bare  edgeless  ghost, toolbar button
```

Five distinct boxes out of six spellings. `.solid` collapses the edge question
rather than answering it: the line blends toward the box's own background by the
fill amount, so at a full fill it _is_ the background, and `.edged` has nothing
to add that `.edgeless` takes away. That is the edge blend working -- a filled
box ringed in another colour is the thing it exists to prevent -- and it is why
the playground renders one `Solid` row for the pair.

None of the five is degenerate on a component that draws both a fill and a line.
That is the test the previous set failed.

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
- **P4.** A component bounds a presentation token only when the composition
  itself produces a broken result -- not to protect a consumer from a combination
  they chose. Any bound that survives that test is published. See
  [the bounds that survive](#the-bounds-that-survive-and-the-test-for-keeping-one).

### Where a fill class decides an edge

Two components break the independence of the axes, both on purpose, and both are
listed here so the exception stays countable rather than becoming a habit:

| Component   | What it does                                                   | Why                                                                                                                  |
| ----------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `.switch`   | `.soft` hides the line until hover; `.bare` hides it entirely. | The fill cap makes the tint alone too small a difference to read as three presentations on a 32px track.             |
| Text inputs | `.soft` draws no line at rest, on hover, or on focus.          | `.soft` is meant to read as a field sunk into the page rather than drawn on it, which a line prevents by definition. |

Both are the class on the element and never a container's, so the cascade case
that the edge floor exists for is untouched in each. Neither reaches `.checkbox`
or `.radio`, which have nothing outside their line.

The text-input exception is the one with a cost: a borderless field identifies
itself by a 12% tint, which is 1.31:1 against the page where WCAG 1.4.11 asks a
boundary for 3:1. It is opt-in and never a default, and the focus ring still
draws, but `.soft` on a text input does not meet 1.4.11 at rest. Recorded as a
decision rather than a defect. See
[`.soft` drops its line](architecture.md#soft-drops-its-line-and-what-that-costs).

## Elevation

Depth is not uniform within an aesthetic. In the chunky-tile look, white option
cards sit on a darker slab while the blue promo panel beside them is flat, the
word-bank chips are raised, and the disabled submit button is flat. Same
aesthetic, same components, different depth -- decided per element by whoever
builds the screen.

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
--_sy: calc(var(--ui-shadow-y, var(--_d-shadow-y, 0px)) * var(--ui-elevation, var(--_d-elevation, 1)));
```

Offset and blur are scaled; **spread is not**. An aesthetic that draws its edge as
an inset ring spends spread on it -- `.pixel` does -- and scaling that would erase
the edge of every component the registry rests at zero. Elevation is depth, and
spread is not depth.

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

The registry gives each component its default level, and the level says how much
depth a component takes _when depth is drawn_ -- not that it rests above the
page. Nothing is raised until an aesthetic draws depth, `.raised` or `.floating`
asks for it, or the component is the one thing that floats without being asked.

That last case is the tooltip bubble and only the bubble: it is placed over
content nobody chose, so a flat panel there has no boundary at all. It supplies
its geometry in the component's own slot, one below the aesthetic's, so an
aesthetic in scope still outranks it.

Depth used to be a property of the component instead. `surface` carried a
structural `0 1px 3px`, which put a shadow under every card on a plain page --
and, because `--_d-*` inherits like any custom property and a button declares no
shadow geometry of its own, under every button and chip nested inside one too.
The geometry moved to the things that ask for depth, and the leak went with it.

### The one limitation

An aesthetic setting `--ui-surface-shadow` as a complete multi-layer value opts
out of the elevation scale on surfaces, because there is nothing for the
multiplier to reach. That hole is kept small deliberately, and it is the only one:
there is no general `--ui-shadow` slot, precisely because a complete value
reaching every component would take `.flat` away from all of them at once. Shipped
aesthetics express depth with the parts, and the complete value stays a
surface-only escape hatch for shadows that genuinely cannot be described as one
layer. An aesthetic taking it declares it in the registry, so `.flat` not reaching
its surfaces is documented rather than discovered.

## Shared composition, not a taxonomy

An earlier draft of this model had a fourth layer: five roles -- action, field,
surface, chip, indicator -- that every component belonged to, with membership in
the registry and an invariant per role. It was built, measured, and removed. The
reasoning is kept here because the question will come back.

**What was right.** Twenty-two components paint a box the same way, so the five
expressions that mix intent x presentation x aesthetic live in exactly one place:
`@utility box`. Components that share more than that share more: the six text
controls share `@utility text-control`, and the five containers -- card, panel,
alert, empty state, and the tooltip's bubble -- share `@utility surface`. Those are
shared code, named for what they are. Nothing else needs a name: a key cap, a code
chip and a table take `box` and say the rest themselves.

**What was wrong.** Naming those groups "roles" turned shared code into a
taxonomy, and a taxonomy has to be complete: every component needed a role, the
roles needed membership, membership needed generating, and an aesthetic reached
components through roles instead of through tokens. Measured at the end, three of
the five roles held one to three declarations, and blanket membership actively
broke two components -- `.tooltip` is a positioning wrapper whose bubble is a
pseudo-element, and `.quote` is a left bar, and the surface role painted both as
bordered boxes because the registry said they were surfaces.

**What replaced the invariants.** The seven per-component clamps the roles were
invented to absorb:

| Clamp                                             | What actually removed it        |
| ------------------------------------------------- | ------------------------------- |
| Progress caps its border at 1px                   | Deleting `--ui-border-scale`    |
| Empty state caps its border at 2px                | Deleting `--ui-border-scale`    |
| Quote clamps its bar to 1-4px                     | Deleting `--ui-border-scale`    |
| Badge and key cap cap their border at 1px         | Nothing. See below.             |
| Skeleton keeps a 6% fill floor                    | Indicators read no presentation |
| Unchecked toggles restore their full edge         | `text-control` draws its edge   |
| Text controls keep a bottom rule under soft/ghost | `text-control` draws its edge   |

Fixing presentation did most of it. The edge scale was what made small components
need ceilings, and with it gone they do not.

### The bounds that survive, and the test for keeping one

`.badge.edged` under `.neobrutalism` now draws the aesthetic's 2px edge. It looks
worse than a capped 1px edge would. It is also two documented features combined
exactly as documented, and the package does not degrade its own code to save a
consumer from a combination they chose. Document it; do not clamp it.

`text-control` caps its fill, and that cap stays, because it is not the same
situation:

```html
<div class="solid"><input class="ipt" /></div>
```

Nobody combined anything here. Presentation cascades **by design** -- that is how
a container sets the look of a subtree -- so `.solid` reaches the input, and an
input filled 100% with the text color has text the same color as its background.
Our own cascade produced it, so our own `min()` answers it.

That is the test. **A bound is justified when our own composition produces the
broken result, and unjustified when a consumer's own combination does.** The
first is a bug we shipped; the second is a decision they made.

Two pass it today, and they are the same argument in different materials:

| Component      | Bound                               | What our own composition does to it                                                                                                              |
| -------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `text-control` | Fill capped at 6%                   | A container's `.solid` cascades onto a field nobody classed and fills it with its own text color.                                                |
| Toggles        | Inset edge capped at the line width | Under `.pixel` the aesthetic's four-pixel ring on a sixteen-pixel box leaves an eight-pixel hole, so an unchecked toggle reads as a checked one. |

The number is expected to move. This is a test, not a quota: a bound that passes
it is published, and a bound that stops passing it is deleted. `.tooltip` is the
first to be deleted rather than published. Its bound was a fill pinned at solid
and a foreground pinned with it, against a container's `.bare` cascading onto a
bubble nobody classed and leaving it boundaryless over arbitrary content.

Giving the bubble a ground answers the same objection without pinning anything.
It still rests filled, so an intent still floods it, but `--intent-subtle` is
underneath, and an opaque ground is what keeps a bubble opaque at every fill
rather than at the one fill it was allowed to have. The label follows the fill
like any other label. A bound is a confession that composition failed somewhere,
and this one turned out to be a component resting on nothing.

## Intent

Unchanged. Seven slots, seven classes, no cascade, and the zero-specificity reset
that lets an element's own intent class win over an inherited value. It is the
part of the current model that has held up under everything asked of it.

| Token               | Meaning                                                   |
| ------------------- | --------------------------------------------------------- |
| `--intent-color`    | The intent's base color. What a fill is made of.          |
| `--intent-contrast` | Readable color on top of a filled `--intent-color`.       |
| `--intent-hover`    | The intent's hovered base color.                          |
| `--intent-strong`   | The intent printed on a page, wherever a fill is partial. |
| `--intent-subtle`   | Low-emphasis tone; tinted surfaces and tracks.            |
| `--intent-fill-max` | How far a fill of this intent may go. 100% but neutral.   |
| `--intent-border`   | Line color; the quiet border gray with no intent set.     |

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

| Token                   | Fallback             | Meaning                                               |
| ----------------------- | -------------------- | ----------------------------------------------------- |
| `--ui-radius`           | `--radius-control`   | Corner radius for controls.                           |
| `--ui-radius-surface`   | `--radius-surface`   | Corner radius for surfaces.                           |
| `--ui-border-width`     | `--border-width`     | Edge thickness.                                       |
| `--ui-border-max`       | `100px`              | Ceiling on the computed edge width.                   |
| `--ui-ink`              | `--color-border`     | Neutral line color when no intent is set.             |
| `--ui-shadow-x`         | `0px`                | Shadow offset, colorless so it inherits safely.       |
| `--ui-shadow-y`         | `0px`                | Shadow offset.                                        |
| `--ui-shadow-blur`      | `0px`                | Shadow blur.                                          |
| `--ui-shadow-spread`    | `0px`                | Shadow spread.                                        |
| `--ui-shadow-inset`     | _empty_              | The `inset` keyword, when the edge is an inner ring.  |
| `--ui-hover-shadow-x`   | `--ui-shadow-x`      | Shadow offset while hovered.                          |
| `--ui-hover-shadow-y`   | `--ui-shadow-y`      | Shadow offset while hovered.                          |
| `--ui-active-shadow-x`  | `--ui-shadow-x`      | Shadow offset while pressed.                          |
| `--ui-active-shadow-y`  | `--ui-shadow-y`      | Shadow offset while pressed.                          |
| `--ui-active-transform` | `none`               | Transform applied while pressed.                      |
| `--ui-shadow-ink`       | `0%`                 | How much of the shadow is the intent's own ink.       |
| `--ui-elevation`        | `1`                  | Unitless multiplier over the shadow geometry.         |
| `--ui-surface-shadow`   | _unset_              | Complete value; resolved by surfaces only.            |
| `--ui-surface-ground`   | `--color-background` | Ground a surface sits on; how glass goes translucent. |
| `--ui-bg-alpha`         | `1`                  | Multiplier over fill, for translucency.               |
| `--ui-backdrop`         | `none`               | Backdrop filter; resolved by surfaces only.           |
| `--ui-hover-transform`  | `none`               | Transform applied on interactive hover.               |
| `--ui-clip`             | `none`               | Silhouette for structural components.                 |
| `--ui-clip-tight`       | `--ui-clip`          | Silhouette for chips.                                 |
| `--ui-focus-inset`      | _undefined_          | Inset focus layer width. Undefined means no layer.    |

The shadow split is the second half of the ink fix. A custom property resolves
its `var()` references on the element that declares it, so a complete shadow
declared on `.neobrutalism` resolves the container's intent and inherits down
already-resolved -- which is exactly why the aesthetic has to name every
component today. Colorless geometry inherits safely, and the component supplies
the color:

```css
box-shadow: var(--ui-shadow-x, 0px) var(--ui-shadow-y, 0px) var(--ui-shadow-blur, 0px) var(--ui-shadow-spread, 0px)
  var(--intent-border);
```

`--ui-surface-shadow` is the complete-value override for the multi-layer case
glass needs, where the color is fixed rather than intent-derived. It is scoped to
surfaces deliberately. The unscoped version of the same slot was drafted and
dropped: glass's 18px drop shadow given through it would land under every button
and chip on the page as well, which is the same reach-one-kind-of-component
problem `--ui-backdrop` solves, solved the same way.

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
- **R3.** An aesthetic never names a component. It sets tokens. A treatment that
  genuinely cannot be a token -- an extra painted layer, a text transform -- is a
  selector list the aesthetic owns, recorded in the registry as `selectors` with
  a `selectorReason`, so the exception is countable rather than invisible.
- **R6.** An aesthetic declares the whole shadow geometry -- all four parts, or a
  complete value. The parts fall back individually, so an aesthetic that sets an
  offset but not a blur inherits the structural blur a surface carries and gets a
  shape it never asked for. Measured: a chunky-tile aesthetic setting only
  `--ui-shadow-y` drew a 4px slab with a 3px blur on cards and a hard slab on
  buttons.

- **R7.** A shadow length is written with a unit, `0px` and not `0`. Elevation
  multiplies each part, and `calc(0 * 1)` is a number where a length is required:
  the whole `box-shadow` becomes invalid at computed-value time, which for a
  non-inherited property means `none`. One unitless zero in an aesthetic removes
  every shadow it reaches.

R3 is new, and it is what the material additions above exist to make possible:
without `--ui-ink`, the shadow parts, `--ui-backdrop`, and the tint pair it would
be a rule the shipped aesthetics immediately break. All three now keep it, and
between them they deleted two fourteen-selector lists, a nine-selector hover
rule, and every component name an aesthetic used to have to know.

Where an aesthetic must reach one kind of component and not another, the way to
say so is a token only that kind resolves. A surface resolves `--ui-backdrop` and
`--ui-surface-shadow`; nothing else does. That is why glass blurs cards and
panels while controls stay solid, and why its two-layer drop shadow does not land
under every button on the page. Adding such a slot costs one line in the
components that accept it, and it is visible in those components rather than
inferred from a table somewhere else.

## Precedence

1. **Aesthetic** supplies the base material.
2. **Presentation** decides how much fill and whether there is an edge.
3. **Intent** colors both.

Modifiers -- size, and [elevation](#elevation) -- sit above the three, being
per-element choices rather than axis membership. State sits above the modifiers: a
control that is `:disabled` or `aria-invalid` reads as such regardless of every
axis and modifier applied to it. State is a condition rather than
a choice, so it is not an axis, but it wins when it collides with one.

**R8. A state re-declares an input, never a painted property.** It sets
`--ui-fill`, `--ui-border`, or an intent slot, and lets `box` paint. It does not
write `background-color`, `border-color`, or `box-shadow` of its own.

This is the rule with the most leverage left in the model, because state is where
a design system usually grows its escape hatches. Wave 2 adds `:checked`,
`:indeterminate`, `.active`, `[data-state]` and selected rows, and each one has an
obvious wrong answer -- paint the property directly -- that works in isolation and
then ignores the aesthetic, ignores elevation, and loses the hover derivation.
Wave 1 already spells the same idea two ways: `text-control` overwrites the intent
slots on `aria-invalid`, which is R8, while `.checkbox` and `.switch` overwrite
`border-color` on `:checked`, which is not. Both look fine today; only the first
still looks fine under an aesthetic that draws its edge as an inset ring.

R8 says what a state may declare. It does not say where, and where turns out to
decide whether the state wins at all. A state written as `&[aria-invalid="true"]`
inside `@utility` lands in the utilities layer; the intent resets land in no
layer at all; an unlayered declaration beats a layered one at any specificity. So
the moment the control classes joined the reset, the destructive slots an invalid
field declares were overruled by the neutral ones, every invalid control drew a
plain gray line, and the only thing still marking the error was the hint
underneath it. The rule is a plain rule now, and `:is(...)` gives it 0-2-0 so it
outranks an intent class on the same element by more than source order. **A state
that writes an intent slot is declared where intents are declared.**

The cost of the rule is that a state can only express itself in the vocabulary
the axes already have. That is the point: if a state needs something the
vocabulary cannot say, the vocabulary is missing a slot, and adding the slot
fixes it for every state at once rather than for that one.

Three steps, and there is no fourth. The current model's fourth step was
"component clamps the result"; the clamps are gone with the edge scale that
forced them, and the bounds left are stated where they apply.

## Defaults

Every component declares its resting pair in the registry. There is no "plain"
and no implicit default: a component with no presentation class renders the pair
the registry names for it, and that pair is published.

| Component                                    | Default        |
| -------------------------------------------- | -------------- |
| `.btn`                                       | solid edgeless |
| `.ipt` `.textarea` `.select`                 | bare edged     |
| `.checkbox` `.radio`                         | bare edged     |
| `.switch`                                    | solid edged    |
| `.card`                                      | bare edged     |
| `.panel`                                     | soft edgeless  |
| `.alert`                                     | soft edged     |
| `.data-table`                                | bare edged     |
| `.tooltip`                                   | solid edgeless |
| `.pre` `.code`                               | bare edgeless  |
| `.kbd`                                       | bare edged     |
| `.badge`                                     | soft edgeless  |
| `.quote`                                     | bare edged     |
| `.loader` `.skeleton` `.progress` `.divider` | n/a            |

Three of those name a ground as well. `.pre`, `.code` and `.kbd` are not
transparent at rest -- each is a quiet tinted block -- and that tone is not a fill
of the component's intent, it is `--intent-subtle`. Writing it as `soft` would be
a different color and would leave `.bare` looking broken. So they rest at `bare`
over `--_d-ground: var(--intent-subtle)`, the mechanism `surface` already uses for
its own ground: `.bare` is today's look exactly, `.soft` is 12% of the intent over
it, and `.solid` fills with the intent. The registry records the ground beside the
pair.

These are proposals, not derivations -- there is no rule that produces them, and
there should not be. The point is that each is a decision on one line of one file
rather than a `var()` fallback in the middle of a component.

### Components that do not take the whole of `box`

Six of them, and the registry says which rather than leaving it to be found by
reading CSS. Four are indicators: `.loader`, `.skeleton`, `.progress`, and
`.divider` paint their own artwork and do not take box presentation.

`.quote` composes none of it, because `box` draws a border on four sides and a
quotation wants one. A radius, a clip and a shadow are inert on a left bar as
well, so what is left of `box` after removing the border is not worth composing.

The cost is that the quotation reimplements the fill and the edge blend rather
than taking them, and the two copies have to agree: the ordering fix that stopped
`.edgeless` painting a ring over its own fill had to be made twice, once in `box`
and later in `.quote`, because the second copy was not where anyone looked. The
registry entry says so, so the next edge change knows there are two places.

`.data-table` takes the frame -- border, radius, clip -- and paints its head, cell
rules and row hover from private tokens, because none of those have an equivalent
on the three axes, and because its `overflow: hidden` over `border-separate` does
not compose with an aesthetic's `clip-path`.

Both carry the reason in `registry.json` next to the decision, so a third one has
to be argued for in the same place rather than appearing quietly in a stylesheet.

## The registry

`registry.json` at the package root is the source of truth for what the package
supports, with `registry.schema.json` beside it. It exists as data rather than
prose because four separate things have to agree about the same facts, and prose
lets them drift.

It carries the closed sets first -- the fill and edge classes with the tokens each
declares, the hover step, the intents and their color families, the modifiers --
then every component, helper, and aesthetic.

Per component: class name, default fill/edge/elevation, the ground it rests on
where it has one, native element selectors, and -- where one applies -- a rename or
a partial composition, each with its reason.

```json
{
  "class": "btn",
  "default": { "fill": "solid", "edge": "edgeless", "elevation": 1 },
  "native": ["button", "input[type=\"submit\"]", "input[type=\"reset\"]"]
}
```

**It describes the stylesheet; it does not produce it.** An earlier draft
generated selector lists from it, which made the CSS a build artifact and put a
CSS generator inside `packages/tools`. Both are gone. The registry is read by
things that need the list and checked against the CSS that is written by hand:

- `pnpm generate` writes the public class and token tables and the LLM files.
- The preview builds its matrix from it, so an unsupported combination cannot be
  rendered.
- Browser tests assert every declared combination resolves, and that nothing
  undeclared is claimed.
- The integration tests check the registry against the stylesheet, which is what
  keeps hand-writing safe.

### What validation enforces

Six checks, all of which fail the build:

1. No duplicate class name anywhere in the package.
2. No collision with a Tailwind static utility.
3. Every component's default names a fill and an edge that exist, unless its
   composition is explicitly `none`.
4. A rename carries its reason.
5. Every component appears in one of the two hand-maintained intent resets. A
   component missing from one reads an undefined `--intent-*`, which makes every
   `color-mix()` referencing it invalid and drops the declaration -- so it renders
   as nothing rather than as an error.
6. Every implemented component declares the resting values the registry
   publishes for it.

Checks 5 and 6 are what a generator would have made unnecessary, and they cost
sixty lines instead of four hundred.

### The one rename

`.table` becomes `.data-table`. The package's `@utility table` replaces
Tailwind's `display: table` utility for every consumer that imports it, which is
a defect nobody had noticed and check 2 now makes impossible to reintroduce.

### What leaves the public surface

`.control-base` is gone. It was the shared composition every text control
applied, and it still is -- as `@utility text-control`. `.ai` is gone as a separate
class: loader artwork is an art variant of `.loader`, listed on the component.

### The composition API

`@utility` does not make a private helper. Every name below is a class a consumer
can type, whether or not we document it, so the honest position is to publish them
as a small composition API rather than to pretend they are internal and be
surprised when someone uses one.

| Utility        | What applying it gives an element                                                               |
| -------------- | ----------------------------------------------------------------------------------------------- |
| `box`          | The whole painted box: fill, foreground, edge, radius, shadow, clip, focus, disabled.           |
| `box-hover`    | The derived hover tone, for something you press rather than type into.                          |
| `surface`      | `box` plus the surface-only slots: ground, backdrop, surface shadow.                            |
| `text-control` | `box` plus the fill cap, the edge floor, and the field affordances all six text controls share. |
| `loader-mask`  | The spinner artwork, as a mask so it takes the element's own color.                             |

They are the seam the components are built from, and a consumer composing a
component we do not ship is better served by them than by copying a component's
declarations. What they are not is a taxonomy: applying `box` says how an element
is painted, not what kind of thing it is.

## Variant specs

What each aesthetic must look like, so a change can be judged against something.

### Default

No aesthetic class in scope. 1px edges, 0.5rem control radius, 0.875rem surface
radius, no silhouette, no shadow except the card's elevation. The default is the
absence of material declarations, not a set of root values -- which is why a card
gets surface radius and a button gets control radius from the same unset token.

The card's depth is the one thing the absence of material cannot supply, so the
`surface` utility carries a structural shadow _geometry_ -- `--_d-shadow-y: 1px`,
`--_d-shadow-blur: 3px` -- behind the aesthetic's own. It is geometry only: the
colour is still the component's own line colour, so nothing about the intent model
changes, and any aesthetic that sets offsets of its own replaces it. Scaled by the
registry's per-component elevation, it is also what makes a panel flat, a card
raised, and a tooltip twice a card, with no per-component shadow anywhere.

### `.glass`

Translucent surfaces over a blurred backdrop with a hairline highlight edge.
Needs something behind it to blur; on a flat page background it is a translucent
panel and nothing more.

- Blur and saturation reach surfaces only, through `--ui-backdrop`.
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

| Goes away                      | Replaced by                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Former presentation `.flat`    | `.solid`; the active `.flat` elevation modifier remains public.                                                    |
| `.out`                         | `.bare.edged`                                                                                                      |
| `.ghost`                       | `.bare`                                                                                                            |
| `.fill`                        | Derived hover. No replacement for `.out.fill`.                                                                     |
| `--ui-border-scale`            | Nothing. The aesthetic owns edge width.                                                                            |
| `--ui-edge`, `--ui-edge-tight` | The shadow parts. `--ui-shadow-inset` and a spread draw the same ring, in the vocabulary elevation already speaks. |
| `shaped`, `shaped-tight`       | `box`. It reads `--ui-clip` and draws the ring itself, so neither utility held anything of its own.                |
| `--ui-hover-fill`              | Derived hover.                                                                                                     |
| `--ui-hover-fg-on-fill`        | Derived hover.                                                                                                     |
| Per-component clamps           | Deleting the edge scale. Two bounds survive.                                                                       |
| Aesthetic selector lists       | `--ui-ink`, shadow parts, `--ui-backdrop`.                                                                         |
| "Plain"                        | A published default pair per component.                                                                            |

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
| Q3  | Does `--ui-backdrop` scope blur to surfaces?   | **Yes**, with no component selector -- but see the ground token. |
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
4. The indicator specificity rule, which belonged to the role layer this model
   no longer has. Kept in the list because the spike did find it; see
   [Shared composition, not a taxonomy](#shared-composition-not-a-taxonomy) for
   where the layer went.
5. `--ui-shadow-ink` (a tint colour and an amount at the time), the
   `--ui-active-*` slots, and `--ui-elevation`, added when
   an aesthetic the model had never seen was built against it as a test. See
   [Adding an aesthetic](#adding-an-aesthetic): eight tokens and one two-selector rule
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

### Tier 2 -- a slot, or a selector list you own

Some aesthetics want a treatment that is not a value: a specular highlight on
surfaces, a scanline background, uppercase actions. Two ways to get one, in this
order.

**Add a slot.** If several components should accept the treatment, give them a
token to resolve, the way surfaces resolve `--ui-backdrop`. One line in each
component that accepts it, visible in that component, and every aesthetic gets the
capability rather than just the one that asked.

**Write the selector list.** If it really is "buttons in this aesthetic are
uppercase", write `.chunky-tile :is(.btn, button)`. It is a rule an aesthetic
should have to spell out, because it is the thing R3 exists to discourage, and
spelling it out is how a reviewer sees it.

An earlier draft generated a `@custom-variant role-action` per role so an
aesthetic could write `@variant role-action { ... }` without naming components.
It was removed with the roles: no shipped aesthetic used it, and a targeting
mechanism with no users is a mechanism that will be wrong when it finally has one.

### Worked example: the chunky-tile look

Rounded slabs sitting on a darker shade of themselves, pressed flat on click, with
uppercase actions. Built in the spike against a real screenshot:

```css
.duolingo {
  --ui-radius: 1rem;
  --ui-radius-surface: 1rem;
  --ui-border-width: 2px;
  --ui-shadow-y: 4px;
  --ui-shadow-ink: 100%;
  --ui-active-shadow-y: 0px;
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
.duolingo :is(.btn, button) {
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
```

Eight tokens and one two-selector rule. Nothing modified, and the result
holds across intents: a success button sits on a dark green edge, a neutral card
on a dark gray one, a selected `.soft.edged.info` card on a dark blue one --
because the shadow composes against each component's own intent at the
component, not at the container.

`--ui-shadow-ink` is what makes that work, and it generalizes to "a shade of
whatever this thing already is". An amount is a plain percentage carrying no
intent, so it inherits safely and the mix happens where the intent lives.

The spike wrote this as a tint colour and an amount -- `#000` at 26%, mixed over
the intent -- which let an aesthetic darken the shadow by an arbitrary colour.
That pair shipped as one token: the base is the neutral depth colour and the
amount says how much of the component's own ink replaces it, because the case
that actually needed spelling was "this aesthetic's depth is ink, not shade", and
the case that did not was any shadow at all on a page with no aesthetic. An
aesthetic wanting a third colour under there declares `--ui-surface-shadow` or
its own `box-shadow`, which is Tier 2 and says so.

### What the other aesthetics on the list will need

Checked against the model rather than promised:

| Aesthetic    | Tier 1 covers                                     | Needs Tier 2 for                   |
| ------------ | ------------------------------------------------- | ---------------------------------- |
| Liquid glass | Blur, translucent ground, radius, hairline edge   | Specular highlight on surfaces     |
| Cyberpunk    | Clipped corners, edge width, glow via shadow tint | Scanline background on surfaces    |
| Synthwave    | Radius, glow, gradient ground                     | Gradient text or chrome on actions |
| Chunky tile  | Everything above                                  | Uppercase actions                  |

Three of the four want a treatment on _surfaces_, which is a slot. Only the fourth
wants one on actions, and `.btn` is the only action there is.

The pattern holds in each case: shape, color, and depth come from tokens, and only
a genuinely component-kind-specific treatment reaches past them. That is the line
the tiers are drawn on.

### Where this leaves native elements

Tier 1 reaches a bare `<button>` because tokens travel through the cascade, and
because `native.css` maps the element to the same utility the class carries. An
aesthetic staying in Tier 1 works everywhere. An aesthetic writing its own
selector list works wherever it remembered to look, which is the cost of writing
one and the reason to prefer a slot.

## References

- [Token inventory](./tokens-inventory.md)
- [Architecture](./architecture.md), which this supersedes on implementation
- [Roadmap](./roadmap.md)
