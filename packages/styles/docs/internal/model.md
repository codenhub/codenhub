---
status: IMPLEMENTED
last_updated: 2026-08-21
scope: `@codenhub/styles` styling model, token contracts, and composition rules.
---

# Model

What decides how an element looks in 0.1.0.

This document is the source of truth for the token contracts; public documents
under `docs/` describe the same model for consumers.

It is written as the argument for the model rather than as a reference to it,
because the reasoning is the part that decides the next question. Sections that
read as proposals -- [What dies](#what-dies), [Spike results](#spike-results) --
are the record of what was changed and why, and are accurate as history.

## The problem being fixed

The replaced model had three orthogonal axes with per-component clamps. It was
carefully specified and produced unpredictable results. Three causes were
structural:

**There was no default.** An element with no presentation class got whatever
`var()` fallback each component happened to declare. `--ui-fill` fell back to
100% on a button, 12% on an alert and a badge, 0% on a card and a table. The
resting look of the library was never chosen; it accumulated. This is why a plain
button was filled while a plain table was outlined, and neither was wrong under
any rule then written down.

**Every component was on every axis.** `intent.css` reset twenty-five selectors,
and the supported-surface table asked each of them to express fill, border, and
silhouette. Components that could not express those honestly were given clamps to
keep them from looking broken: a 1px ceiling on progress, another on badges and
key caps, a 6% floor on skeletons, a bottom-rule floor on text controls, an edge
restored on unchecked toggles. Each clamp was documented and each was an
exception a reader had to hold.

**Presentation bundled two decisions into one class.** Fill and edge were
separate questions, and the five classes picked fixed pairs of answers. The pairs
covered four of six possibilities, collapsed to three distinct results on most
components, and left the most common button on the web -- a subtle fill with a
border -- with no spelling at all.

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
| Presentation | How much of it does it show? | Unitless ratios only           | Yes      | `.solid` `.soft` `.ghost` and `.edged` `.edgeless`                              |
| Aesthetic    | What is it made of?          | Lengths, shadows, shapes, type | Yes      | `.neobrutalism` `.glass` `.pixel`                                               |

### What makes something an axis rather than a modifier

The three above are axes and size and elevation are modifiers, and for a long
time the only stated reason was that the three were the questions written down
first. That does not survive contact with elevation, which is a closed set of
unitless numbers that cascades and ships three classes — structurally identical
to fill.

The test that does hold:

> **An axis interacts with the other axes in the composition. A modifier
> composes independently.**

Edge blends against fill: `--_line` mixes toward `--_bg` by the fill amount,
which is P3, and it is why `.solid.edged` and `.solid.edgeless` render one box.
Two things that interact inside one expression are one question with two
dimensions, not one question and one bolt-on. Elevation multiplies shadow
geometry nothing else touches; `.pill` sets a radius nothing else touches; `.sm`
sets lengths. None of them can change what another axis produces.

So edge stays inside presentation, elevation stays a modifier, and the next
candidate is argued against this sentence rather than against precedent.

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

The implemented model changed the replaced model's presentation shape. It added
no fourth layer deciding which axes reach which component, and
[the attempt to add one](#shared-composition-not-a-taxonomy) is recorded below
along with why it was removed.

## Presentation

Presentation answers two independent questions. Each is its own closed set, and
exactly one value from each set applies.

### Fill: how much of the intent color fills the box

| Class    | `--ui-fill` | `--ui-fg-on-fill` | `--ui-border` | Reads as                                                          |
| -------- | ----------- | ----------------- | ------------- | ----------------------------------------------------------------- |
| `.solid` | `100%`      | `100%`            | `0%`          | Filled with the intent color, no line; text is the contrast tone. |
| `.soft`  | `12%`       | `0%`              |               | Tinted with the intent color; text is the intent color.           |
| `.ghost` | `0%`        | `0%`              |               | No fill at rest; text is the intent color. Tints on hover.        |

`.solid` briefly answered the edge question as well, writing `--ui-border: 0%`
alongside its fill. The problem it was aimed at is real and still open: the edge
blend runs the line toward `--_bg`, which for an opaque fill _is_ the fill and for
a capped one is a second coat of the same tint painted over the first, so every
neutral component that draws a line draws a ring over its own plate -- measured at
1.53:1 against that plate in light and 1.82:1 in dark on `.ipt` and any
`.btn.solid.edged`.

It was reverted anyway, because the cure cost more than the disease. Six
combinations stay readable only while each half means what it says; a fill class
that sometimes decides an edge turns the set into something to memorise rather
than read, and the first thing it produced in review was the question of why
`.soft` kept a frame that `.solid` removed. The ring is a fault in the blend, and
`box` is where a fix for it goes. `.solid.edgeless` is how a consumer asks for a
filled box with no line meanwhile.

`.ghost` was `.bare` until 0.1.0. The rename is the one naming defect the set
had: `.bare` and `.edgeless` both read as "less of something", so an author who
wanted no border reached for `.bare` and got no background. `.ghost` names a
fill and only a fill.

### Edge: whether the box draws a line at its boundary

| Class       | `--ui-border` | Reads as                                                       |
| ----------- | ------------- | -------------------------------------------------------------- |
| `.edged`    | `100%`        | A line in the intent color, at the aesthetic's material width. |
| `.edgeless` | `0%`          | No line.                                                       |

The edge is the silhouette and nothing else. Rules inside a component that has
an inside were briefly a second slot on this axis, written by `.edged` and
`.edgeless` and left alone by `.solid` so that a filled table kept its rows
apart. That was the wrong home for them, and the reason is not tidiness: it made
the rules arrive by implication. A table drew them because its published edge
default happened to be `edged` -- a fact about `registry.json` rather than about
the markup -- so a consumer reading their own HTML could not tell whether they
had asked for rules, and had no name to ask with.

`.ruled` is that name. Ruling every row is a style choice rather than an answer
to "does this box draw a boundary", so it is a component modifier, and
`--ui-rule` is the slot behind it -- still a token, so a container can rule a
region without classing each table, but no longer a value any presentation class
writes.

Two lines survive the switch, because they are not decoration: the one under a
head and the one above a foot. Those separate the parts of a table from each
other, so they hold at every presentation and do not wait for `.ruled`. The foot
draws its own upward rather than leaning on the last body row drawing downward,
because with rules off that row paints nothing.

Three presentation tokens total, down from six. Every value is a percentage, so
presentation still inherits without carrying a resolved color, and a container
can still set the look for a subtree while any element opts out.

### What the combinations are for

```text
<button class="btn primary">              solid            primary action
<span   class="badge success">            soft   edgeless  tinted chip
<button class="btn soft edged">           soft   edged     the common web button
<button class="btn primary ghost edged">  ghost  edged     outline button
<button class="btn ghost">                ghost  edgeless  toolbar button
<input  class="ipt soft edgeless" />      soft   edgeless  field sunk into the page
```

Five distinct boxes out of six spellings. `.solid` collapses the edge question
rather than answering it: the line blends toward the box's own background by the
fill amount, so at a full fill it _is_ the background, and `.edged` has nothing
to add that `.edgeless` takes away. That is the edge blend working -- a filled
box ringed in another colour is the thing it exists to prevent -- and it is why
the playground renders one `Solid` row for the pair.

None of the five is degenerate on a component that draws both a fill and a line.
That is the test the previous set failed.

### The ink is gated by the plate, not tied to the fill

`--ui-fg-on-fill` is what the presentation asks for. What it gets is bounded by
how much ink the plate can actually carry:

```
on-fill = min(asked, max(0%, capped fill * 2 - 100%))
```

Contrast ink is for a plate dark enough to need it. Past a half fill it comes in
and reaches full at a full fill; below that the foreground stays
`--intent-strong`, which is the tone chosen to be read on a page.

This replaced `min(asked, --intent-fill-max)`, which read plausibly — cap the
fill and the ink together, and the ink walks toward the contrast exactly as far
as the fill walks toward the color — and was wrong at the bottom of the range,
because legibility is not linear. Only one intent caps, and it is the most
common one:

| Element                    | before            | after              |
| -------------------------- | ----------------- | ------------------ |
| `.btn` no intent, `.solid` | 61 on 202, 6.63:1 | 23 on 202, 10.94:1 |
| `.tooltip` no intent       | 61 on 179, 5.18:1 | 23 on 179, 8.55:1  |

The tooltip is the one that mattered. Its ground is `--intent-subtle` and its
fill is the capped neutral over it, so the plate darkened and the ink lightened
at once, from about 15.7:1 under the pre-0.1.0 surface-and-text pairing down to
5.18:1. Both halves were this single line.

The bubble has since come off that ramp altogether, and the row above is kept
because the ramp it measures is still what every other component uses. The fix
made the plate legible and left it ugly: 20% of the page's ink over the surface
tone steps _lighter_ than the surface on a dark page and _darker_ on a light one,
so the dark bubble read as lifted and the light one as a mid-grey slab. One
derivation cannot serve both directions. `--color-tooltip` and
`--color-tooltip-contrast` state each end instead, and `intent.css` resolves the
tooltip's no-intent case onto them -- lifting the neutral cap with it, since the
token is a plate rather than an ink and has nothing to stop short of.

The bound the old form was reaching for still holds. Uncapped, a neutral
`.solid` prints near-white on light grey and loses its label; the ramp answers
that case with 0%, which is what it wanted. And `--ui-fg-on-fill` stays the
ceiling rather than becoming the result, so the presentation token still decides
— derived from the fill alone it would be declared and unread, which is the
failure `--ui-border` already had.

### Hover is derived, never declared

```
hover fill  = min(100%, resting fill + 14%)
hover color = --intent-hover, always
hover edge  = --intent-hover at the same width
```

One formula, no branches, no tokens. `ghost` picks up a 14% tint, `soft` deepens
to 26%, `solid` stays full and darkens because the base color changed. This
replaces `--ui-hover-fill` and `--ui-hover-fg-on-fill`, and it is what deletes
`.fill`: a class whose only job was to make an outline button fill on hover, and
which was inert on every other component in the library.

It is also what makes `.ghost` a fill name rather than an absence. A ghost
element rests at nothing and gains a tint under the pointer, which is the
behavior the name is chosen for.

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
- **P5.** A fill class never decides an edge, and an edge class never decides a
  fill. The axes are independent everywhere, with no exceptions.
- **P6.** A component may bound an axis **input**. It may never rewrite the
  composed **result**. See [the seams](#seams-not-rewrites).

### No fill class decides an edge

There used to be two exceptions here, both deliberate, both documented, and both
gone:

| Component   | What it did                                                | What replaced it                                                                                           |
| ----------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `.switch`   | `.soft` hid the line until hover; `.bare` hid it entirely. | A `40%` fill cap of its own, where the three fills separate as fills. Measured: 29, 67 and 144 sRGB steps. |
| Text inputs | `.soft` drew no line at rest, on hover, or on focus.       | `.soft.edgeless`. Two classes saying two things instead of one class saying both.                          |

The switch was the more expensive of the two, because it made `.soft` mean
something different there than on every other component in the library — the
thing a reader cannot learn once. It existed only because `text-control`'s 6% cap
collapsed `.solid` and `.soft` onto one tint, leaving the line as the only lever.
Raising the cap gave the fill axis back its own job.

The cost of the text-input change is that the sunk field now takes two classes
instead of one. That is the intended direction: what a consumer types is what
they get.

### Seams, not rewrites

P6 is the rule the whole edge change is built on, and it is stated because
breaking it is invisible.

`text-control` used to write, after `@apply box`:

```css
--_edge: color-mix(in oklab, var(--intent-color) var(--_fill), var(--_line));
```

That is a composed result being replaced, and replacing a result drops every term
it was composed from. `--ui-border` fell out of the expression entirely, so
`.edged` and `.edgeless` were inert on all six text controls, and `--_d-border`
was declared and never read on each of them. Nothing reported it. Every class
resolved, every token was declared, every component rendered — the only symptom
was that two documented classes did nothing.

The same shape written as a bound on an input leaves the axis live:

```css
/* box */
--_edge-amount: max(var(--ui-border, var(--_d-border)), var(--_edge-floor, 0%));
--_edge: color-mix(in oklab, var(--_line) var(--_edge-amount), transparent);

/* text-control */
--_edge-floor: 100%;
```

`--_fill-cap` and `--_line-rest` were already written this way and were already
the parts of that file that behaved. `--_edge-floor` and `--_line-tone` join
them. A component that needs something the seams cannot express needs a new
seam, which is one line in `box` and visible there.

**The test that enforces it.** `registry.json` records the axes each component
reads, and `tests/browser/axes.spec.ts` asserts it in both directions: an axis
the registry calls live must change what the component computes, and an axis it
leaves off must not. The one-directional version of that test is what the package
had, and it passed throughout the release in which the edge axis was dead.

### Element or cascade: the split that replaced the exceptions

Both surviving edge bounds turn on the same distinction, and it is the same one
[the bounds test](#the-bounds-that-survive-and-the-test-for-keeping-one) already
draws:

- **A class on a container** is our own cascade reaching something nobody
  classed. A bound may answer it.
- **A class on the element** is a consumer describing what they want. A bound may
  not answer it.

CSS expresses it directly. The utility raises the floor; a plain rule matching
the element's own class lowers it:

```css
:is(.text-control, .ipt, .textarea, .select, .switch).edgeless {
  --_edge-floor: 0%;
}
```

So a `.edgeless` toolbar cannot erase the line of a field inside it, and
`.ipt.edgeless` gets exactly the borderless field it asked for. That field does
not meet WCAG 1.4.11 at rest — a 12% tint is 1.31:1 against the page where a
control boundary is asked for 3:1 — which is now a consumer's opt-in rather than
a default the package shipped. Recorded in [Accessibility](../accessibility.md).

`.checkbox` and `.radio` are deliberately absent from that rule. An unchecked
checkbox is a transparent square and an unchecked radio a transparent circle:
removing the line removes the control, so their floor is absolute in both
directions and `.edgeless` on them is published as unsupported. They are the only
two components in the package that read one presentation axis and not the other.

### A state lifts bounds; it does not write results

R8 says a state re-declares an input rather than a painted property, and P6 adds
the same discipline one level down: an input, not a composed result. `:checked`
was the rule that broke both without looking like it.

```css
/* was */
&:checked {
  --_fill: 100%;
  --_fg: var(--intent-contrast);
}
/* is */
&:checked {
  --_fill-cap: 100%;
  --_fill-floor: 12%;
}
```

The first form is why every checked toggle rendered as the same filled box
whatever presentation it carried: the fill class had nothing left to decide.
Lifting the bounds leaves it deciding -- `.solid` reaches the 100% it asks for,
`.soft` stays at the 12% it asks for -- and the ink follows the plate through
`--_on-fill` rather than being told what to be.

The floor is the bound that pairs with it. A container's fill class can still
hand a checked toggle a fill it never asked for, and a mark with no ground under
it is a tick floating on the page. Our own cascade produces that, so the bound is
one the test allows.

One intent slot moves with the state. `--intent-fill-max` stops neutral at 20%
because a neutral fill is the page's own ink and a full one is a slab -- true of a
badge, and false of the one component whose whole job is to be unmistakably on.
So a checked toggle lifts it, declared where intents are declared for the reason
[Precedence](#precedence) gives.

### Unsupported values

`.ghost` is not supported on `.checkbox`, `.radio`, or `.switch`. Unchecked it is
the silhouette every toggle already has; checked it is a mark on nothing.

It is not supported on `.kbd`, `.code`, or `.pre` either, for the opposite
reason. Those three rest on a ground, and a ground draws the plate whatever the
fill says -- so `.ghost` took the fill away and changed nothing visible. What was
left was `--intent-subtle` alone, which is a near-page tint rather than a
distinguishing one: on the light page a ghost chip measured `#e5e5e5` for both
neutral and primary, and `#f5f5f5` at 1.04:1 against the page for secondary.
Four of eight intents rendering as one invisible chip is not a variation. All
three rest at `soft` now, which puts a real 12% of the intent over the same
ground and separates them.

`.data-table` is the counter-example that keeps the rule honest. Its plate is a
head tone rather than a chip ground, and dropping it at zero fill is exactly
what `.ghost` should mean -- so there the class is supported, it is the
component's default -- and a ghost table is boundaries and type alone.

That is a third thing a component can say about an axis, alongside reading it and
bounding it, and it is recorded as `unsupported` in the registry with its reason.
The playground does not render those rows -- it is the support surface, so a row
it draws is a claim -- and `axes.spec.ts` drops them from its probe rather than
asserting about them, because requiring an unmaintained combination to behave is
testing a promise nobody made.

Unsupported is not unreachable. A container can still cascade `.ghost` onto a
toggle, which is what the checked fill floor is for: the package clamps such a
combination to the nearest supported thing rather than rendering it broken.

## Elevation

Depth is not uniform within an aesthetic. In the chunky-tile look, white option
cards sit on a darker slab while the blue promo panel beside them is flat, the
word-bank chips are raised, and the disabled submit button is flat. Same
aesthetic, same components, different depth -- decided per element by whoever
builds the screen.

So elevation is a **modifier**, not a fourth axis. It sits with size, above the
three axes:

| Class       | `--ui-elevation` | Means                                        |
| ----------- | ---------------- | -------------------------------------------- |
| `.flat`     | `0`              | No part-based depth; complete values remain. |
| _(default)_ | `1`              | The aesthetic's depth as authored.           |
| `.raised`   | `1`              | The same, said explicitly.                   |
| `.floating` | `2`              | Twice it, for menus and popovers.            |

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
**elevation decides how much part-based geometry this element gets**. Neither
needs to know the other. `.flat` on a chunky-tile card removes a 4px slab, but it
does not reach glass's complete `--ui-surface-shadow`; under no aesthetic at all
it removes nothing, because there was nothing.

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

This modifier system is unrelated to the `--elevation-low/-mid/-high` tokens in
`theme.css`: those are raw shadow values for a consumer's own elements, read by
nothing in `src/` except the tooltip bubble's fallback. A component's registry
elevation says how much depth it takes _if_ depth is drawn, which under the
default aesthetic and with no `.raised`/`.floating` is never -- so a `card`
resting at elevation `1` currently renders identical to a `panel` resting at
`0`. That gap between the registry's stated rest level and what actually
paints, plus the two-vocabulary split itself, is tracked as a pre-`0.1.0` open
item in [Roadmap](./roadmap.md); `--elevation-none` was added to the raw scale
as the first, non-breaking step.

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

Four pass it today, and they are the same argument in different materials. Every
one is recorded in `registry.json` under the component's `bounds`, with the
composition of ours that earns it and what lifts it:

| Component            | Bound                               | What our own composition does to it                                                                                                                                                                                                           |
| -------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text-control`       | Cascaded fill capped at 6%          | A container's `.solid` cascades onto a field nobody classed and fills it with its own text color. A fill class on the element names its own cap.                                                                                              |
| Toggles              | Fill capped at 20%, switch 40%      | The 6% cap keeps _typed text_ legible and a toggle has none; it inherited the number with the utility. Lifted whole by `:checked`.                                                                                                            |
| Toggles              | Checked fill floored at 12%         | A container's `.ghost` cascades onto a checked toggle and leaves its mark with no ground under it.                                                                                                                                            |
| Text controls        | Edge floored at 100%                | A container's `.edgeless` leaves a field with no mark of where typing goes. Lifted by the element's own `.edgeless`.                                                                                                                          |
| `.checkbox` `.radio` | Edge floored at 100%, absolutely    | The same, with nothing left when the line goes. Lifted by nothing, which is why it is the only bound with no escape.                                                                                                                          |
| `.tooltip`           | Edge floored at 100%                | A container's `.solid` or `.edgeless` takes the boundary off a bubble nobody classed. In light its plate is near-white, so the line is the only thing separating the message from what is behind it. Lifted by the element's own `.edgeless`. |
| Toggles              | Inset edge capped at the line width | Under `.pixel` the aesthetic's four-pixel ring on a sixteen-pixel box leaves an eight-pixel hole, so an unchecked toggle reads as a checked one.                                                                                              |

The count went from two to eight, and that is the test working rather than
failing. Three of the additions are bounds that already existed as rewritten
results — the edge floor was `--_edge: color-mix(...)` and the switch cap was two
`--_edge: transparent` rules — and were invisible because a rewrite has nowhere to
declare itself. Written as bounds on inputs they are countable, publishable, and
testable, which is the whole argument for P6.

The number is expected to move. This is a test, not a quota: a bound that passes
it is published, and a bound that stops passing it is deleted. `.tooltip` is the
first to be deleted rather than published. Its bound was a fill pinned at solid
and a foreground pinned with it, against a container's `.ghost` cascading onto a
bubble nobody classed and leaving it boundaryless over arbitrary content.

It is also the first to come back in a narrower form. A ground answers the
cascade for the plate, and `.solid` writing `--ui-border: 0%` opened the same
hole one layer out: the bubble's line is a boundary against content nobody chose,
and a container could now take it away. The bound that returned is an edge floor
with the escape `text-control` already uses -- a class on the element is a
consumer describing what they want, a class on a container is a cascade reaching
something nobody classed -- rather than the pinned fill it replaced. Narrower,
escapable, and it leaves both axes live.

Giving the bubble a ground answers the same objection without pinning anything.
It still rests filled, so an intent still floods it, but `--intent-subtle` is
underneath, and an opaque ground is what keeps a bubble opaque at every fill
rather than at the one fill it was allowed to have. The label follows the fill
like any other label. A bound is a confession that composition failed somewhere,
and this one turned out to be a component resting on nothing.

## Intent

Unchanged from the replaced model: seven slots, seven classes, no cascade, and
the zero-specificity reset that lets an element's own intent class win over an
inherited value. This is the part inherited from that model after it held up
under everything asked of it.

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
red edge under any aesthetic. This deleted the two fourteen-selector component
lists in `neobrutalism.css` and closed a gap the replaced model had: a bare
`<input>` under `.pixel` used to get the silhouette but not the ink, because the
ink had to resolve against the component's own intent and a container-level
token could not do that.

### What intent may not do

- **I1.** Intent declares color and nothing else. No intent class may set a
  length, a ratio, a shadow, or a shape.
- **I2.** Exactly one intent applies, and semantic outranks emphasis.
- **I3.** Intent does not cascade. Every component redeclares the neutral
  defaults at its own root, at zero specificity, so an element's own intent
  class wins and an inherited one loses.
- **I4.** An intent class is never also a component. `.error` says destructive;
  it must not additionally mean "helper text". Where a component needs both,
  the component carries its own class and takes the intent alongside it.

One deliberate exception to I3: table rows inherit their table's intent rather
than resetting it, because a row is part of a table rather than an independent
component. A row carrying its own intent class still wins.

## Aesthetic

An aesthetic declares material: lengths, shadows, shapes, font family, the
neutral ink, and the colour depth is cast in. It cascades, and a component
resolves each token at its own root with the `var()` fallback that is its
default.

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
| `--elevation-color`     | _theme_              | The base that ink mixes toward; depth's own colour.   |
| `--ui-shadow-edge`      | _undefined_          | Declared, even empty, when the shadow is the edge.    |
| `--ui-elevation`        | `1`                  | Unitless multiplier over the shadow geometry.         |
| `--ui-surface-shadow`   | _unset_              | Complete value; resolved by surfaces only.            |
| `--ui-surface-ground`   | `--color-background` | Ground a surface sits on; how glass goes translucent. |
| `--ui-bg-alpha`         | `1`                  | Multiplier over fill, for translucency.               |
| `--ui-backdrop`         | `none`               | Backdrop filter; resolved by surfaces only.           |
| `--ui-hover-transform`  | `none`               | Transform applied on interactive hover.               |
| `--ui-clip`             | `none`               | Silhouette for structural components.                 |
| `--ui-clip-tight`       | `--ui-clip`          | Silhouette for chips.                                 |
| `--ui-focus-inset`      | _undefined_          | Inset focus layer width. Undefined means no layer.    |

`--elevation-color` is the one row that is not a `--ui-*` slot, and it is here
because an aesthetic legitimately names it. The theme declares it, every
elevation composes from it, and `--ui-shadow-ink` says how far a component's own
intent walks away from it -- so between the two they are the whole colour of
depth, and an aesthetic that owns shadows owns both ends of that mix. Chunky tile
is the case that proved it: at the shipped `rgb(15 23 42 / 0.08)` the mix runs
toward something nearly transparent and its bar composites out _lighter_ than the
plate it sits under. Naming the depth colour opaque is what makes the bar a shade
of the element, and the [worked example](#worked-example-the-chunky-tile-look)
records the measurement.

It is deliberately the depth colour and not the palette. `--color-*` is hue, hue
is intent's, and an aesthetic that repaints it reaches components it never meant
to -- which is R1, and now [R8](#rules-for-aesthetics) enforces the namespace
rather than trusting the prose.

The shadow split is the second half of the ink fix. A custom property resolves
its `var()` references on the element that declares it, so a complete shadow
declared on `.neobrutalism` resolves the container's intent and inherits down
already-resolved -- which is exactly why the replaced aesthetic implementation
had to name every component. Colorless geometry inherits safely, and the
component supplies the color -- see
[Indirect tokens resolve once](#indirect-tokens-resolve-once):

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
`--ui-shadow-edge` is the fourth, added later: the inset ring is not a shadow at
all but a border drawn where a `clip-path` cannot cut it, so it has to answer the
edge axis the way a real border does. Pointing it at `--_edge` is the whole
implementation, because `--_edge` already carries P3's blend toward the fill and
the edge amount as its alpha. Without it, `.edged` and `.edgeless` rendered
identically under `.pixel` and the aesthetic decided an axis that is not its to
decide.

It is read for its presence rather than its value, and that is a measured
constraint rather than a preference. As a percentage --
`color-mix(in oklab, var(--_edge) var(--ui-shadow-edge), var(--_depth-color))` --
both ends of the mix are themselves `color-mix()` results, and WebKit resolves
that nesting as though the percentage were zero: every ring came out in
`--elevation-color` at 8% alpha, in that engine alone, with Chromium and Firefox
agreeing with the spec. Declaring the token empty and selecting between two
single mixes with the guaranteed-invalid fallback idiom keeps all three engines
in agreement. An aesthetic nested inside one that declares it clears it with
`initial`.
`--ui-hover-shadow-*` lets neobrutalism collapse its shadow on hover without the
`:hover` selector R3 forbids. `--ui-surface-ground` exists because
`--ui-bg-alpha` multiplies the _fill_, and a surface's default fill is 0%: with no
ground token a glass card keeps an opaque background and its own blur is invisible
behind it.

### Rules for aesthetics

- **R1.** An aesthetic declares only material tokens. No aesthetic sets a
  presentation token, a palette entry, or an intent slot other than `--ui-ink`.
  Material cascades and is meant to; hue is not, and an aesthetic that writes
  `--color-*` or `--intent-*` repaints components it never meant to reach.
- **R2.** A component resolves a material token unconditionally. A no-op material
  value is free -- see [The cost of a no-op](#the-cost-of-a-no-op).
- **R3.** An aesthetic never names a component. It sets tokens. A treatment that
  genuinely cannot be a token -- an extra painted layer, a text transform -- is a
  selector list the aesthetic owns, recorded in the registry as `selectors` with
  a `selectorReason`, so the exception is countable rather than invisible.
- **R6.** An aesthetic declares the whole shadow geometry -- all four parts, or a
  complete value. The parts resolve independently, so an omitted part can come
  from another aesthetic in scope or fall through to component- or
  foundation-owned geometry. That produces mixed material the aesthetic did not
  author; declaring every part makes its shadow self-contained.

- **R7.** A shadow length is written with a unit, `0px` and not `0`. Elevation
  multiplies each part, and `calc(0 * 1)` is a number where a length is required:
  the whole `box-shadow` becomes invalid at computed-value time, which for a
  non-inherited property means `none`. One unitless zero in an aesthetic removes
  every shadow it reaches.

- **R8.** An aesthetic declares only what it owns the namespace of: `--ui-*`,
  its own `--_*` privates, and `--elevation-color`. A knob it publishes to
  consumers is _read_ with its default as the `var()` fallback, never declared.
  A declaration beats an inherited value whatever the specificity, so a knob
  declared on the aesthetic's own class outranks every ancestor including
  `:root` -- which is where an application themes something, and so is the only
  place the knob was ever going to be set from. All four shipped aesthetics
  wrote a knob in the declared shape first, and all four were unreachable until
  this rule was applied to them.

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

### The cost of a no-op

`clip-path` and `backdrop-filter` were once excluded from the material contract
on the grounds that applying either unconditionally costs a compositing layer
and a containing block on every component, even at its no-op value. That is
false. Measured in Chromium, Firefox, and WebKit, literal and behind a `var()`
fallback:

| Declaration on the host                     | Containing block | Stacking context | Chromium layers, 400 hosts |
| ------------------------------------------- | ---------------- | ---------------- | -------------------------- |
| _(none)_                                    | no               | no               | 4                          |
| `clip-path: none`                           | no               | no               | 4                          |
| `clip-path: var(--ui-clip, none)`           | no               | no               | 4                          |
| `backdrop-filter: none`                     | no               | no               | 4                          |
| `backdrop-filter: var(--ui-backdrop, none)` | no               | no               | 4                          |
| `clip-path: inset(4px)`                     | no               | **yes**          | 4                          |
| `backdrop-filter: blur(2px)`                | **yes**          | **yes**          | **119**                    |

The last two rows are controls: without them the probe would report "no cost"
for a broken measurement. `clip-path` never establishes a containing block, even
active -- only a stacking context. `backdrop-filter` is the property that does
both, and the only one that costs layers. So a component may resolve either
token unconditionally (R2), and the reason to keep an _active_ clip off every
component is different and still real: it establishes a stacking context in all
three engines and clips descendants, backgrounds, borders, shadows, and the
focus outline.

### Indirect tokens resolve once

A `var()` reference inside a custom property's value resolves against the
element that **declares** the custom property, not against the element that
uses it. A child overriding the referenced token is ignored. Measured
identically in Chromium, Firefox, and WebKit, with `--unit: 8px` on the parent
and `--unit: 1px` on the child:

| Declaration                                                   | Child override honored? | Result |
| ------------------------------------------------------------- | ----------------------- | ------ |
| `--shape: inset(var(--unit))`, then `clip-path: var(--shape)` | no                      | `8px`  |
| `clip-path: inset(var(--unit))` directly                      | **yes**                 | `1px`  |

This is the mechanism behind every case in this model where a value is declared
per component rather than once on a container: `.neobrutalism`'s offset shadow,
`.pixel`'s ring thickness, and `--ui-ink` all have to resolve against the
component's own intent, so a token carrying one has to be read at the component,
not written above it.

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

This rule had the most leverage left during implementation, because state is
where a design system usually grows its escape hatches. The planned second wave
added `:checked`, `:indeterminate`, `.active`, `[data-state]` and selected rows,
and each had an obvious wrong answer -- paint the property directly -- that worked
in isolation and then ignored the aesthetic, ignored elevation, and lost the
hover derivation. Before R8 was implemented consistently, `text-control`
overwrote the intent slots on `aria-invalid`, which followed R8, while `.checkbox`
and `.switch` overwrote `border-color` on `:checked`, which did not. Both looked
fine in isolation; only the first survived an aesthetic that drew its edge as an
inset ring.

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

Three steps, and there is no fourth. The replaced model's fourth step was
"component clamps the result"; the clamps are gone with the edge scale that
forced them, and the bounds left are stated where they apply.

## Defaults

Every component declares its resting pair in the registry. There is no "plain"
and no implicit default: a component with no presentation class renders the pair
the registry names for it, and that pair is published.

| Component                                    | Default        |
| -------------------------------------------- | -------------- |
| `.btn`                                       | solid edgeless |
| `.ipt` `.textarea` `.select`                 | ghost edged    |
| `.checkbox` `.radio`                         | solid edged    |
| `.switch`                                    | solid edged    |
| `.card`                                      | ghost edged    |
| `.panel`                                     | soft edgeless  |
| `.alert`                                     | soft edged     |
| `.data-table`                                | soft edgeless  |
| `.tooltip`                                   | solid edged    |
| `.pre` `.code`                               | soft edgeless  |
| `.kbd`                                       | soft edged     |
| `.badge`                                     | soft edgeless  |
| `.quote`                                     | ghost edged    |
| `.loader` `.skeleton` `.progress` `.divider` | n/a            |

Four of those name a ground as well. `.pre`, `.code` and `.kbd` are not
transparent at rest -- each is a quiet tinted block -- and that tone is not a fill
of the component's intent, it is `--intent-subtle`. They rest at `soft` over
`--_d-ground: var(--intent-subtle)`, the mechanism `surface` already uses for its
own ground, so the plate is 12% of the intent over that tone and `.solid` fills
with the intent. They rested at `ghost` until the ground made that class
meaningless on them; see [Unsupported values](#unsupported-values). The tooltip
bubble names one too, and reads `--ui-surface-ground` ahead of it so a glass
tooltip stays glass. The registry records the ground beside the pair.

These authored defaults are implemented decisions, not derivations -- there is no
rule that produces them, and there should not be. Each is stated in one place
rather than hidden as a `var()` fallback in the middle of a component.

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

Per component: class name, default fill/edge/elevation, the axes it reads, the
ground it rests on where it has one, native element selectors, and -- where one
applies -- a rename, a partial composition, or a bound, each with its reason.

```json
{
  "class": "btn",
  "default": { "fill": "solid", "edge": "edgeless", "elevation": 1 },
  "axes": ["fill", "edge"],
  "native": ["button", "input[type=\"submit\"]", "input[type=\"reset\"]"]
}
```

`axes` is what makes a dead axis findable. It is the registry's claim about the
component, and the browser suite is what holds it to it. A bound narrows an axis
without removing it, so a component that bounds one still lists it:

```json
{
  "class": "checkbox",
  "axes": ["fill"],
  "bounds": [
    {
      "token": "--ui-border",
      "kind": "floor",
      "value": "100%",
      "escape": null,
      "reason": "An unchecked checkbox is a transparent square with nothing outside its line, so removing the line removes the control."
    }
  ]
}
```

An `escape` of `null` is the register of what the package does not support.
`.checkbox` and `.radio` are the only two entries carrying one.

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

Seven checks, all of which fail the build:

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
7. Every component declares the axes it reads, and every bound it places on one
   carries the composition of ours that earns it and what lifts it.

Checks 5 and 6 are what a generator would have made unnecessary, and they cost
sixty lines instead of four hundred.

Check 7 is enforced in the browser rather than against the stylesheet text, in
`tests/browser/axes.spec.ts`, because it is the only one whose answer is a
computed value. It asserts both directions: an axis the registry calls live must
change what the component computes, and an axis it leaves off must not. The
package went a whole release with `.edged` and `.edgeless` inert on six
components and every other check passing, which is what this one exists for.

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
radius, no silhouette, and no component depth by default. The default is the
absence of material declarations, not a set of root values -- which is why a card
gets surface radius and a button gets control radius from the same unset token.
`.raised` and `.floating` opt an element into the foundation shadow geometry, and
an aesthetic can supply different geometry. The tooltip bubble is the sole
component-owned exception: it carries explicit depth because it floats over
arbitrary content and needs a boundary there.

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
- Corners are `--glass-radius` and `--glass-radius-surface`, at 0.75rem and 1rem.
  Rounder than the base geometry, because a translucent panel with a tight corner
  reads as a cut-out rather than as a pane; a full step above `--radius-surface`
  landed closer to a pill than to glass. Read with a fallback rather than
  declared, so an ancestor can set them — [R8](#rules-for-aesthetics), which these
  two were the first to break.

### `.neobrutalism`

Thick ink outline, a hard unblurred offset shadow, and a press that moves the
element into its own shadow.

- 2px edges, zero radius everywhere.
- `--neo-offset` at 4px is the knob: the shadow offset and the hover travel are
  the same number, so a consumer scaling the look scales it whole. Read with a
  fallback per [R8](#rules-for-aesthetics), so an ancestor can set it.
- Ink follows the theme, not the palette: near-black on light, near-white on
  dark. Pure black disappears on a dark page.
- The offset shadow is the component's own `--intent-border`, so a success button
  casts a green shadow and a neutral button casts ink.
- Hover moves the element by the shadow offset and shrinks the shadow to nothing.
- An alert rests on the slab, which is the one component this aesthetic names in a
  selector. Here the slab is a second ink line rather than depth, and an alert is
  the only container the registry rests flat. Written into the component's resting
  default rather than the modifier, so every elevation class still wins.

### `.pixel`

An 8-bit look built from a stepped silhouette and an inset ring.

- One square grid unit is cut from each corner, and `--pixel-unit` is that unit at
  4px. Everything is a multiple of it -- the ring is one unit thick, the corner one
  unit square -- so it is the single knob that scales the look. Read with a
  fallback per [R8](#rules-for-aesthetics), so an ancestor can set it.
- The two-step staircase this replaces approximated a curve at half the unit, which
  is the one shape a low-resolution grid cannot draw: at any size it read as a
  bevel that had not quite committed.
- Corners are one unit or nothing. Chips square rather than step, because one unit
  off each corner of a 24px badge is a bite rather than a corner.
- The edge is a one-unit inset ring, the same size as the cut, so the corner is
  covered and the line does not read as broken there.
- The ring answers the edge axis, through `--ui-shadow-edge`. It is the border,
  not depth, so `.edgeless` draws none and a field's own floor keeps one.
- No radius anywhere. `clip-path` clips a border away, so the border ceiling goes
  to zero and the ring does the drawing.
- Reads `--font-pixel` and falls back to monospace. The package ships no font
  binary.

### `.chunky-tile`

Rounded slabs seated on a darker shade of themselves, pressed flat on click.

- `--tile-radius` at 12px on controls and surfaces alike, and 2px lines. One knob
  rather than glass's pair, because the corner is what makes a 40px button and a
  200px card read as the same object; chips clamp it themselves at
  `--radius-small`. Named rather than written into `--ui-radius` directly so a
  consumer can set it from `:root`, which a declaration on the aesthetic's own
  class would otherwise outrank -- [R8](#rules-for-aesthetics), which this
  aesthetic is the worked example for.
- The bar is solid, unblurred, straight down, and spreadless. Zero x is what
  separates it from neobrutalism, whose two-axis offset reads as a card lifted off
  the page where this is a slab seated on it.
- The bar is a shade of the element rather than a repeat of it, which takes an
  opaque `--elevation-color` as well as a partial `--ui-shadow-ink`. See the
  correction under [Adding an aesthetic](#worked-example-the-chunky-tile-look).
- An unfilled tile's bar and its line are the same colour by construction: both
  resolve `--intent-border`.
- Hover holds still and the press moves, which is the opposite of neobrutalism and
  deliberate — a seated slab has one gesture.
- Actions are heavier and slightly tracked, through the one recorded selector
  list. Casing is left to the application.

## What dies

| Goes away                      | Replaced by                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Former presentation `.flat`    | `.solid`; the active `.flat` elevation modifier remains public.                                                    |
| `.out`                         | `.ghost.edged`                                                                                                     |
| `.bare`                        | `.ghost`, which is the name the old ghost button had. The fill class keeps the meaning; only the spelling moved.   |
| `.fill`                        | Derived hover. No replacement for `.out.fill`.                                                                     |
| `--ui-border-scale`            | Nothing. The aesthetic owns edge width.                                                                            |
| `--ui-edge`, `--ui-edge-tight` | The shadow parts. `--ui-shadow-inset` and a spread draw the same ring, in the vocabulary elevation already speaks. |
| `shaped`, `shaped-tight`       | `box`. It reads `--ui-clip` and draws the ring itself, so neither utility held anything of its own.                |
| `--ui-hover-fill`              | Derived hover.                                                                                                     |
| `--ui-hover-fg-on-fill`        | Derived hover.                                                                                                     |
| Per-component clamps           | Deleting the edge scale. Five bounds survive, each in `registry.json`.                                             |
| Aesthetic selector lists       | `--ui-ink`, shadow parts, `--ui-backdrop`.                                                                         |
| "Plain"                        | A published default pair per component.                                                                            |
| `.soft` dropping its line      | `.soft.edgeless`. No fill class decides an edge (P5).                                                              |
| The switch's per-fill line     | A 40% fill cap of its own. Same rule.                                                                              |

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
| Q5  | Is `ghost edged` distinct from `soft edged`?   | **Yes**, at 1px. Separation is 48-52 in both themes.             |
| Q6  | Does anything fail to resolve in WebKit?       | **No**. Every composed value resolves in all three engines.      |

Q1 is the one worth stating loudly. Under the replaced model, a bare element's
ink was a residual gap nothing could close, because the value has to resolve
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
| `ghost`, light | 250 -> 223       |         47 |
| `soft`, light  | 220 -> 202       |         31 |
| `solid`, light | 10 -> 64         |         94 |
| `ghost`, dark  | 10 -> 40         |         52 |
| `soft`, dark   | 38 -> 66         |         48 |
| `solid`, dark  | 250 -> 229       |         36 |

`soft` in light mode is the tightest at 31, still half again the visibility
threshold. 14% stands.

`ghost edged` and `soft edged` separate by 48 to 52 in both themes at a single
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
This environment-dependent branch is one reason the browser suite asserts both
computed outcomes directly instead of maintaining visual snapshots. Those
assertions verify the declared CSS and DOM contract, not the final composited
image: clipping and compositing integration, font rendering, antialiasing, and
interactions among properties that each compute correctly remain outside their
reach. [Tests](./tests.md) defines that boundary, and the package exception
records the conditions that require reevaluating it.

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

An aesthetic entrypoint carries no Tailwind directive and must not add
`@reference "tailwindcss"`. A `@reference` in a file imported into a full build
switches the whole build to reference mode: `@theme` stops emitting `:root`, and
every foundation token such as `--border-width` is inlined with a fallback
instead -- which invalidates the `calc()` built around them and drops whole
`border` shorthands.

#### Publishing a knob

An aesthetic built out of one number -- pixel's grid unit, neobrutalism's offset,
the tile's lift -- publishes that number so a consumer can scale the whole look at
once. Read it, do not declare it. R8, and the shape is always this:

```css
.chunky-tile {
  --_tile-lift: var(--tile-lift, 4px);

  --ui-shadow-y: var(--_tile-lift);
  --ui-active-transform: translateY(var(--_tile-lift));
}
```

The private is not decoration. Writing `var(--tile-lift, 4px)` at each of the
places that need it repeats the default, and two of them drifting apart is a bug
nothing catches; resolving once into `--_tile-lift` puts the default in one place.
The name mirrors the knob so the pair is obvious at a glance, and the underscore
keeps it out of a namespace a component might later want.

What is not obvious is why the knob is read rather than declared, and every
aesthetic here got it wrong first. `--tile-radius: 0.75rem` on `.chunky-tile`
looks like the declaration of a default. It is a declaration full stop, and a
declared custom property beats an inherited one whatever the specificity -- so it
outranks `:root`, a themed wrapper, and every other ancestor. That is the entire
population of places a consumer would set it from. Measured before the fix: an
ancestor setting `--glass-radius-surface` left a glass card at its stock 16px, and
the knob had bought a name and nothing else. Undeclared, an ancestor's value
inherits in and a value on the element itself still wins over it.

The trade is real and worth stating: these resolve on the aesthetic's own class
and inherit already-resolved, so a _descendant_ setting one changes nothing. The
shared material tokens are the tool for that direction -- `--ui-radius` on a card
still works, because `box` reads it at whichever element draws. Knobs reach the
element and above; material reaches the element and below. Neither replaces the
other.

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

Rounded slabs sitting on a darker shade of themselves, pressed flat on click.
Built in the spike against a real screenshot:

```css
.chunky-tile {
  --_tile-radius: var(--tile-radius, 0.75rem);
  --_tile-lift: var(--tile-lift, 4px);

  --ui-radius: var(--_tile-radius);
  --ui-radius-surface: var(--_tile-radius);
  --ui-border-width: 2px;
  --elevation-color: rgb(0 0 0);
  --ui-shadow-ink: 72%;
  --ui-shadow-y: var(--_tile-lift);
  --ui-active-shadow-y: 0px;
  --ui-active-transform: translateY(var(--_tile-lift));
}
```

The spike wrote the two lengths inline; they are knobs in the shipped file, in the
shape [Tier 1](#publishing-a-knob) describes. The spike also wrote uppercase
actions, which the aesthetic does not do — casing is how a label is worded, and
silently recasing one breaks acronyms, proper nouns, and the case rules of
languages the package does not get to know about. Weight and tracking carry the
same emphasis and are material.

**The two colour lines are a correction.** The spike wrote this block with
`--ui-shadow-ink: 100%` and no depth colour, and claimed the result below — that a
success button sits on a dark green edge. It does not. `--intent-border` _is_
`--intent-color` for all six hue intents, so at a full ink the bar equals the
plate exactly: measured when the aesthetic was built, `.btn.success` printed
`#007a55` on `#007a55`, an sRGB distance of 0, identically on both palettes. The
bar was painted and invisible, and the press then read as the button spontaneously
shortening.

Lowering the ink alone does not rescue it, because the other end of that mix is
`--elevation-color` at `rgb(15 23 42 / 0.08)`: the mix runs toward something nearly
transparent, composites against the page, and the bar comes out _lighter_ than the
plate. Naming the depth colour opaque points the same mix at black, and one value
then darkens on both palettes — `#007a55` on `#004c34`, `#e17100` on `#914600`,
`#4f39f6` on `#30219f`.

That is also the answer to "which token darkens a shadow", which this section
below says was dropped on purpose: it was not lost, it moved. `--elevation-color`
is the base the ink mixes toward, so an aesthetic names its own depth colour and
`--ui-shadow-ink` says how far the intent walks away from it. No second token, and
no nested `color-mix()` — which matters, because nesting two is what
[`--ui-shadow-edge`](#material-tokens) found WebKit resolving as though the
percentage were zero.

Depth in that aesthetic is not uniform, and it does not have to be: the promo
panel that should not sit on a slab carries `.flat`, and the aesthetic never
learns about it.

```html
<div class="card soft edgeless info flat">Promo panel, deliberately flat</div>
```

```css
.chunky-tile :is(.btn, button) {
  font-weight: 800;
  letter-spacing: 0.04em;
}
```

The spike's version of that rule also set `text-transform: uppercase`, and the
shipped one does not. Weight and tracking are what the type is made of; casing is
how a label is _worded_, which belongs to the application. An aesthetic that
recases silently also recases every acronym, proper noun, and locale whose rules
are not English's — a correctness cost for a look a consumer can write in one line
of their own.

Nine tokens and one two-selector rule. Nothing modified, and the result
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
| Chunky tile  | Everything above, and the shade under it          | Heavier, tracked action labels     |

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

## Direction

A component's own left/right is written as a logical property --
`inset-inline-start`, `border-inline-start-width`, `ps-*`/`border-s` and their
Tailwind equivalents -- so it mirrors under `dir="rtl"` for free, with no
opt-in class. `transform-origin` and `translate` have no logical form; a
component whose geometry depends on one mirrors it explicitly under
`:dir(rtl)` instead.

This does not apply to a class that is itself a direction choice an author
makes on purpose, such as `.icon.left`/`.icon.right` or a tooltip's
`data-tooltip-position`. Those name a visual side, not a text direction, and
stay physical.

## References

- [Roadmap](./roadmap.md)
