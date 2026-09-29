---
status: IMPLEMENTED
last_updated: 2026-09-29
scope: `@codenhub/styles` styling model, token contracts, and composition rules.
---

# Model

What decides how an element looks.

This document is the source of truth for the token contracts; public documents under `docs/` describe the same model for consumers. It states the rules and the reason for each, because the reason is what settles the next question. Superseded designs are not kept here; git history holds them.

## The axes

Three questions, asked in plain language before any CSS is involved:

**What does this thing mean?** A delete button and a save button are the same control doing opposite things, and a reader has to know which is which before reading a word of the label. That is **intent**. It is a meaning, not a color -- the color is downstream of the meaning, which is why `.destructive` is the name and `.red` is not. Intent holds two vocabularies that share one slot: semantic (`.success` `.warning` `.destructive` `.info`) says what is _true_ of the thing, and emphasis (`.primary` `.secondary`) says how much it _matters here_. Exactly one applies, and semantic outranks emphasis: a delete confirmation's main button is `.destructive`, because losing the warning costs more than losing the emphasis.

**How much of that meaning does it show?** The same destructive action is a filled red slab in a confirmation dialog and a quiet red word in a settings row. Nothing about the meaning changed; the composition did. That is **presentation**: how much of the intent fills the element, and whether it draws an edge. It is the volume knob, not the message.

**What is it made of?** A button is a rounded slab, or a thick-inked box with a hard shadow, or a stepped 8-bit rectangle, or a chunky tile sitting on a darker shade of itself. Radius, edge thickness, shadow, silhouette, typography, motion: the style language everything is built from. That is **aesthetic**. Swap it and the same markup, with the same intents and the same presentations, becomes a visibly different product.

Put shortly: intent is _what it says_, presentation is _how loudly_, aesthetic is _in what voice_.

| Axis         | Answers                      | Owns                           | Cascades | Classes                                                                         |
| ------------ | ---------------------------- | ------------------------------ | -------- | ------------------------------------------------------------------------------- |
| Intent       | What does this mean?         | Hue only                       | No       | `.neutral` `.primary` `.secondary` `.success` `.warning` `.destructive` `.info` |
| Presentation | How much of it does it show? | Unitless ratios only           | Yes      | `.solid` `.soft` `.ghost` and `.edged` `.edgeless`                              |
| Aesthetic    | What is it made of?          | Lengths, shadows, shapes, type | Yes      | `.neobrutalism` `.glass` `.pixel` `.chunky-tile` `.cyber` `.sketch`             |

The "Owns" column is what keeps the axes orthogonal. Intent may only produce color, so it can never change a shape. Presentation may only produce unitless numbers, so it inherits down a subtree without dragging a resolved color with it. Aesthetic may only produce material, so it can restyle a whole page without knowing what anything means.

Two of them cascade and one does not, and that is the same rule seen from two sides. A container saying "everything below me is quiet and glassy" is useful. A container saying "everything below me is a success" is a trap: it would turn a nested destructive button green. So presentation and aesthetic inherit, and intent is redeclared by every component at its own root.

### What makes something an axis rather than a modifier

> **An axis interacts with the other axes in the composition. A modifier composes independently.**

Edge blends against fill: `--_line` fades out by the fill amount (P3), which is why `.solid.edged` and `.solid.edgeless` render one box. Two things that interact inside one expression are one question with two dimensions, not one question and one bolt-on. Elevation multiplies shadow geometry nothing else touches; `.pill` sets a radius nothing else touches; `.sm` sets lengths. None of them can change what another axis produces.

So edge stays inside presentation, size and elevation are modifiers, and a new candidate is argued against this sentence.

There is no fourth layer deciding which axes reach which component. Each component reads the axes through the shared composition ([Shared composition](#shared-composition)) and the registry records which of them it reads.

## Presentation

Presentation answers two independent questions. Each is its own closed set, and exactly one value from each set applies.

### Fill: how much of the intent color fills the box

| Class    | `--ui-fill` | `--ui-fg-on-fill` | Reads as                                                   |
| -------- | ----------- | ----------------- | ---------------------------------------------------------- |
| `.solid` | `100%`      | `100%`            | Filled with the intent color; text is the contrast tone.   |
| `.soft`  | `12%`       | `0%`              | Tinted with the intent color; text is the intent color.    |
| `.ghost` | `0%`        | `0%`              | No fill at rest; text is the intent color. Tints on hover. |

`.ghost` names a fill and only a fill. It is not `.edgeless`: an author who wants no border must not get no background.

A fill class never decides an edge (P5). The line fades toward `transparent` by the fill amount (P3), so a translucent plate shows through its own border as one coat rather than ringed in a second: measured on neutral buttons and badges in both themes, the border-to-plate contrast is 1.00:1.

### Edge: whether the box draws a line at its boundary

| Class       | `--ui-border` | Reads as                                                       |
| ----------- | ------------- | -------------------------------------------------------------- |
| `.edged`    | `100%`        | A line in the intent color, at the aesthetic's material width. |
| `.edgeless` | `0%`          | No line.                                                       |

The edge is the silhouette and nothing else. Rules inside a component that has an inside are a component modifier, not part of this axis: `.ruled` and `.ruleless` on `.data-table`, backed by `--ui-rule`, a token a container can set to rule a region without classing each table.

Two lines are not decoration and hold at every presentation without `.ruled`: the one under a table head and the one above a foot. They separate the parts of a table from each other. The foot draws its own upward line rather than leaning on the last body row drawing downward, because with rules off that row paints nothing.

Three presentation tokens total. Every value is a percentage, so presentation inherits without carrying a resolved color, and a container sets the look for a subtree while any element opts out.

### What the combinations are for

```text
<button class="btn primary">              solid            primary action
<span   class="badge success">            soft   edgeless  tinted chip
<button class="btn soft edged">           soft   edged     the common web button
<button class="btn primary ghost edged">  ghost  edged     outline button
<button class="btn ghost">                ghost  edgeless  toolbar button
<input  class="ipt soft edgeless" />      soft   edgeless  field sunk into the page
```

Five distinct boxes out of six spellings. `.solid` collapses the edge question rather than answering it: the line fades out by the fill amount, so at a full fill the border shows the fill running under it, and `.edged` has nothing to add that `.edgeless` takes away. The playground renders one `Solid` row for the pair.

None of the five is degenerate on a component that draws both a fill and a line.

### The ink is gated by the plate, not tied to the fill

`--ui-fg-on-fill` is what the presentation asks for. What it gets is bounded by how much ink the plate can carry:

```
on-fill = min(asked, max(0%, capped fill * 2 - 100%))
```

Contrast ink is for a plate dark enough to need it. Past a half fill it comes in and reaches full at a full fill; below that the foreground stays `--intent-strong`, the tone chosen to be read on a page. Legibility is not linear in the fill, so the gate is not `min(asked, --intent-fill-max)`. Only neutral caps, and it is the most common intent: a neutral `.solid` button prints `--intent-strong` (10.94:1 on its plate) where a fill-proportional ink would print a mid tone at 6.63:1.

`--ui-fg-on-fill` stays the ceiling rather than becoming the result, so the presentation token still decides; derived from the fill alone it would be declared and unread.

The tooltip bubble is off this ramp. `--color-tooltip` and `--color-tooltip-contrast` state the plate and ink of each theme, and `intent.css` resolves the tooltip's no-intent case onto them, lifting the neutral cap with it because the token is a plate rather than an ink. One derivation cannot serve both directions: 20% of the page's ink over the surface tone steps lighter than the surface on a dark page and darker on a light one.

### A capped fill rests on the page

The cap stops the ink, not the plate. A neutral `.solid` fills to 20% of the page's ink, and that 20% needs a ground of its own or it shows whatever is behind it -- glass's backdrop, an image, a filled card around it -- and reads as a tint. So wherever the intent's cap stops the fill short, `box` paints it over the page background:

```
plate  = 100% when the intent's cap stopped the fill, else 0%
ground = color-mix(--color-background plate, the component's own ground)
```

It is a step rather than a ramp, because the two percentages cannot be divided in every engine, and a fill the cap stopped is one the presentation asked to be full. The component's own cap is measured out first, so what it reinterprets stays a tint: a text control's 20% `.solid` wash and a neutral `.card.soft`'s 0% are the same at every intent. A toggle lifts the intent cap, so its plate never takes this ground. `.quote` composes its own fill and takes the same step. The generated palette follows: neutral `.solid` is ground-independent like every other `.solid`.

### Hover is derived, never declared

```
hover fill  = min(100%, resting fill + 14%)
hover color = --intent-hover, always
hover edge  = --intent-hover at the same width
```

One formula, no branches, no tokens beyond `--hover-step`. `ghost` picks up a 14% tint, `soft` deepens to 26%, `solid` stays full and darkens because the base color changed. A ghost element rests at nothing and gains a tint under the pointer, which is what makes `.ghost` a fill name rather than an absence. An outline button tints on hover; it does not fill completely.

Measured on composited pixels, in sRGB distance where roughly 20 is a clearly visible step: the smallest rest-to-hover separation is `soft` in light at 31; `ghost` is 47 in light and 52 in dark, `soft` 48 in dark, `solid` 94 in light and 36 in dark. `.ghost.edged` and `.soft.edged` separate by 48 to 52 in both themes at a single pixel of border.

### The edge is never scaled

The edge width comes from the aesthetic and nothing else; no presentation class scales it. Small components need no ceilings, because nothing doubles a border on a 10px progress track.

### What presentation may not do

- **P1.** Presentation declares only unitless numbers and percentages.
- **P2.** Presentation modulates what a component already draws. It never gives a component a part it does not otherwise have.
- **P3.** Any component that draws a line fades it out by the fill amount, toward `transparent` rather than toward its plate -- the plate already runs under the border -- so a filled component has a seamless edge rather than a stray ring, of another colour or of its own tint painted twice.
- **P4.** A component bounds a presentation token only when the composition itself produces a broken result -- not to protect a consumer from a combination they chose. Any bound that survives that test is published. See [the bounds that survive](#the-bounds-that-survive-and-the-test-for-keeping-one).
- **P5.** A fill class never decides an edge, and an edge class never decides a fill. The axes are independent everywhere, with no exceptions.
- **P6.** A component may bound an axis **input**. It may never rewrite the composed **result**. See [Seams, not rewrites](#seams-not-rewrites).

### Seams, not rewrites

P6 is stated because breaking it is invisible. A component that replaces a composed result drops every term the result was composed from, and nothing reports it: every class resolves, every token is declared, every component renders, and two documented classes do nothing.

A bound written on an input leaves the axis live:

```css
/* box */
--_edge-amount: max(var(--ui-border, var(--_d-border)), var(--_edge-floor, 0%));
--_edge: color-mix(in oklab, var(--_line) var(--_edge-amount), transparent);

/* text-control */
--_edge-floor: 100%;
```

`--_fill-cap`, `--_line-rest`, `--_edge-floor`, and `--_line-tone` are the seams. A component that needs something they cannot express needs a new seam, which is one line in `box` and visible there.

**The test that enforces it.** `registry.json` records the axes each component reads, and `tests/browser/axes.spec.ts` asserts it in both directions: an axis the registry calls live must change what the component computes, and an axis it leaves off must not.

### Element or cascade

Both surviving edge bounds turn on one distinction, the one [the bounds test](#the-bounds-that-survive-and-the-test-for-keeping-one) draws:

- **A class on a container** is our own cascade reaching something nobody classed. A bound may answer it.
- **A class on the element** is a consumer describing what they want. A bound may not answer it.

CSS expresses it directly. The utility raises the floor; a plain rule matching the element's own class lowers it:

```css
:is(.text-control, .ipt, .textarea, .select, .switch, .input-group).edgeless {
  --_edge-floor: 0%;
}
```

So a `.edgeless` toolbar cannot erase the line of a field inside it, and `.ipt.edgeless` gets exactly the borderless field it asked for. That field does not meet WCAG 1.4.11 at rest -- a 12% tint is 1.31:1 against the page where a control boundary is asked for 3:1 -- which is a consumer's opt-in rather than a default. Recorded in [Accessibility](../accessibility.md).

`.checkbox` and `.radio` are absent from that rule. An unchecked checkbox is a transparent square and an unchecked radio a transparent circle: removing the line removes the control, so their floor is absolute in both directions and `.edgeless` on them is published as unsupported. They are the only two components that read one presentation axis and not the other.

`.switch.ghost.edgeless` is the one other case that keeps its line: `.ghost` already asks for zero fill, so removing the line too would leave nothing marking the track but the knob. It renders the same as `.switch.ghost.edged`, and is published unsupported as a distinct look.

### A state declares inputs and lifts bounds; it does not write results

S1 says a state re-declares an input rather than a painted property, and P6 adds the same discipline one level down: an input, not a composed result. `:checked` is the state that exercises both:

```css
&:checked {
  --ui-fill: 100%;
  --ui-fg-on-fill: 100%;
  --_fill-cap: 100%;
}
```

The checked fill is `100%` whatever presentation the element or a container asks for, so a checkbox, a radio, and a switch each have one "on" identity. Presentation instead separates the _unchecked_ plate: `checkbox`/`radio` raise their own resting cap to `40%` (see [the bounds that survive](#the-bounds-that-survive-and-the-test-for-keeping-one)), matching `.switch`'s, so `.ghost` (0%), `.soft` and the unclassed default (12%), and `.solid` (the cap) read as three distinct plates instead of three shades of one wash. All three toggles rest at `.soft`'s pair (`--_d-fill: 12%`, `--_d-fg-on-fill: 0%`), so an unclassed toggle sits at the quiet tint and `.solid` is what a consumer reaches for to ask for the louder plate.

`:checked` declares full contrast ink beside the full fill: a checked `.ghost` or `.soft` toggle with an opaque plate and an ink still asking for none would render a mark almost the colour of its own background.

It writes the inputs, not private floors, because of the layer map ([Cascade layers](#cascade-layers)): `:checked` in `utilities` at 0-2-0 beats every fill class in `components`, and a state is the one kind of rule the map lets write a public token from `utilities`, so a consumer's own `[--ui-fill:...]` loses to it, as it loses to `aria-invalid`. A toggle is a void `<input>`, so the inputs reach nothing but its own mark.

Two properties of `box` make that safe. `text-control` does not restate `box`'s fill and ink formulas, because `box`'s ramp sees `--_fill-cap`; the ink ramps in one place. And `box` ramps the ink against the bounded fill _before_ `--ui-bg-alpha` thins it, so a checked toggle under a region that sets it keeps full contrast ink on a thinned plate; `forms.spec.ts` asserts it.

`--_fill-cap` is a private seam. A component writing `--ui-fill` from `utilities` would beat a consumer's utility, which the layer map reserves for state; and `--ui-fill` cascades, so a neutral panel writing `0%` would turn every badge inside it ghost, where a cap bounds the component and stops there.

One intent slot moves with this. `--intent-fill-max` stops neutral at 20% everywhere else, because a neutral fill is the page's own ink and a full one is a slab -- true of a badge, and false of a toggle at rest, where the common case carries no intent class at all and still has to look like a present, interactive control. So the three toggles lift it unconditionally, declared above the intent classes for the reason [Precedence](#precedence) gives.

### Unsupported values

`.ghost` is not supported on `.kbd`, `.code`, or `.pre`. Those three rest on a ground, and a ground draws the plate whatever the fill says -- so `.ghost` takes the fill away and changes nothing visible. What is left is `--intent-subtle` alone, a near-page tint: on the light page a ghost chip measures `#e5e5e5` for both neutral and primary, and `#f5f5f5` at 1.04:1 for secondary. All three rest at `soft`, which puts a real 12% of the intent over the same ground and separates them.

`.data-table` is the counter-example that keeps the rule honest. Its plate is a head tone rather than a chip ground, and dropping it at zero fill is exactly what `.ghost` should mean -- so there the class is supported, and a ghost table is boundaries and type alone.

`unsupported` is a third thing a component can say about an axis, alongside reading it and bounding it, and it is recorded in the registry with its reason. The playground does not render those rows -- it is the support surface, so a row it draws is a claim -- and `axes.spec.ts` drops them from its probe rather than asserting about them.

Unsupported is not unreachable. A container can still cascade `.ghost` onto `.kbd`/`.code`/`.pre`, which is why each keeps its ground rather than reading `--_d-ground` as transparent: the package clamps such a combination to the nearest supported thing rather than rendering it broken.

`.solid` is unsupported on `.progress`, unconditionally: the value fill is always `--intent-color` at full strength, so a fully-filled track composes the same colour and the one thing a progress bar exists to show -- how much of the track is filled -- disappears. `.ghost.edgeless` is a different case, one degenerate _combination_ rather than a whole unsupported value: `.ghost.edged` renders an outline capsule around the moving fill, and pairing `.ghost` with `.edgeless` leaves the track with no visible frame at rest. A consumer who writes both chose that pairing, so it is documented in prose rather than recorded as `unsupported`, which names a whole axis value, not a pair. The supported track pairs are `.soft.edged`, the default `.soft.edgeless`, and `.ghost.edged`; `.ghost.edgeless` renders but is discouraged.

## Elevation

Depth is not uniform within an aesthetic. In the chunky-tile look, white option cards sit on a darker slab while the blue promo panel beside them is flat, the word-bank chips are raised, and the disabled submit button is flat. Same aesthetic, same components, different depth -- decided per element by whoever builds the screen.

So elevation is a **modifier**, not a fourth axis. It sits with size, above the three axes:

| Class       | `--ui-elevation` | Means                                        |
| ----------- | ---------------- | -------------------------------------------- |
| `.flat`     | `0`              | No part-based depth; complete values remain. |
| _(default)_ | `1`              | The aesthetic's depth as authored.           |
| `.raised`   | `1`              | The same, said explicitly.                   |
| `.floating` | `2`              | Twice it, for menus and popovers.            |

The names say what the class does rather than a scale step; bare `sm`/`md`/`lg` are not available because `sm` and `lg` are the size modifier's class names. A fourth level is not shipped: three covers what the modifier needs.

One unitless number, multiplied into the aesthetic's shadow geometry where the component composes it:

```css
--_sy: calc(var(--ui-shadow-y, var(--_d-shadow-y, 0px)) * var(--ui-elevation, var(--_d-elevation, 1)));
```

Offset and blur are scaled; **spread is not**. An aesthetic that draws its edge as an inset ring spends spread on it -- `.pixel` does -- and scaling that would erase the edge of every component the registry rests at zero. Elevation is depth, and spread is not depth.

The division of labor is the point. **The aesthetic decides what depth looks like** -- a hard bottom slab, a soft ambient blur, a stepped ring -- and **elevation decides how much part-based geometry this element gets**. Neither needs to know the other. `.flat` on a chunky-tile card removes a 4px slab, but it does not reach glass's complete `--ui-surface-shadow`; under no aesthetic at all it removes nothing, because there was nothing.

`--ui-elevation` and the plain-page fallback geometry it multiplies (`--elevation-y`, `--elevation-blur`) are registered non-inheriting (`@property`, `inherits: false`, no `initial-value`), so a class sets them on the element it is written on and nothing else picks them up. Depth is not the same kind of thing as color or material: a button inside a raised card is not itself more raised, it is resting normally inside an already-raised surface, and an inherited multiplier would double the shadow of every unclassed button in a `.floating` dialog. There is no way to lift a whole unclassed subtree at once; each element that wants depth takes its own elevation class. `--ui-shadow-*`, what an aesthetic supplies, is a separate mechanism and cascades normally -- an aesthetic reaches every nested component.

Zero lengths are written `0px` rather than `0` in the fallbacks, because `calc(0 * 1)` produces a number and a shadow position requires a length.

The registry gives each component its default level, and the level says how much depth a component takes _when depth is drawn_ -- not that it rests above the page. Nothing is raised until an aesthetic draws depth, or `.raised` or `.floating` asks for it, and no component is exempt, the tooltip bubble included: it rests at `0`, and its boundary is its floored edge. `.tooltip-bubble.raised` and `.tooltip-bubble.floating` add depth the same way they do anywhere else. An aesthetic in scope still shapes and shadows the bubble as the surface it is.

Depth is a property of the element and the aesthetic, not of the component's structure: `surface` carries no shadow geometry, so a plain card and a plain panel render identically until something asks for depth. Giving every registry rest level real fallback geometry with no aesthetic and no modifier was considered and not done, to avoid a visual change to every unclassed component.

This modifier system is separate from the `--elevation-none/-sm/-md/-lg` tokens in `theme.css`: those are raw shadow values for a consumer's own elements, read by nothing else in `src/`. A `.raised` card and `--elevation-sm` written on your own element mean roughly the same weight of depth, but one multiplies an aesthetic's shadow parts and the other is a fixed value, so they will not always paint identically.

### The one limitation

An aesthetic setting `--ui-surface-shadow` as a complete multi-layer value opts out of the elevation scale on surfaces, because there is nothing for the multiplier to reach. That hole is kept small deliberately, and it is the only one: there is no general `--ui-shadow` slot, because a complete value reaching every component would take `.flat` away from all of them at once. Shipped aesthetics express depth with the parts, and the complete value stays a surface-only escape hatch for shadows that cannot be described as one layer. An aesthetic taking it declares it in the registry, so `.flat` not reaching its surfaces is documented rather than discovered.

## Shared composition

Twenty-one components paint a box the same way, so the five expressions that mix intent x presentation x aesthetic live in exactly one place: `@utility box`. Components that share more share more: the six text controls share `@utility text-control`, and the four containers -- card, panel, alert, and the tooltip's bubble -- share `@utility surface`. Those are shared code, named for what they are. Nothing else needs a name: a key cap, a code chip and a table take `box` and say the rest themselves.

There is no taxonomy of roles above them. A role would have to be complete -- every component needs one, membership needs generating, and an aesthetic would reach components through roles instead of through tokens -- and blanket membership paints components that are not boxes: `.tooltip` is a positioning wrapper whose bubble is a pseudo-element, and `.quote` is a left bar. Per-component differences are stated by the component, as [bounds](#the-bounds-that-survive-and-the-test-for-keeping-one) or as registry entries.

### The bounds that survive, and the test for keeping one

`.badge.edged` under `.neobrutalism` draws the aesthetic's 2px edge. It looks worse than a capped 1px edge would. It is also two documented features combined exactly as documented, and the package does not degrade its own code to save a consumer from a combination they chose. Document it; do not clamp it.

`text-control` caps its fill, because that is a different situation:

```html
<div class="solid"><input class="ipt" /></div>
```

Nobody combined anything here. Presentation cascades **by design** -- that is how a container sets the look of a subtree -- so `.solid` reaches the input, and an input filled 100% with the text color has text the same color as its background. Our own cascade produced it, so our own `min()` answers it.

That is the test. **A bound is justified when our own composition produces the broken result, and unjustified when a consumer's own combination does.** The first is a bug we shipped; the second is a decision they made.

Seven bounds pass it, and they are the same argument in different materials. Every one is recorded in `registry.json` under the component's `bounds`, with the composition of ours that earns it and what lifts it:

| Component            | Bound                                      | What our own composition does to it                                                                                                                                                                                                                                               |
| -------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text-control`       | Cascaded fill capped at 6%                 | A container's `.solid` cascades onto a field nobody classed and fills it with its own text color. A fill class on the element names its own cap.                                                                                                                                  |
| Toggles              | Resting fill capped at 40%                 | The 6% cap keeps _typed text_ legible and a toggle has none; 40% is where `.ghost`/`.soft`/`.solid` separate as three plates, measured. Escaped by the default and the element's own `.soft` (both `12%`); lifted whole by `:checked`, the state that declares the checked plate. |
| Text controls        | Edge floored at 100%                       | A container's `.edgeless` leaves a field with no mark of where typing goes. Lifted by the element's own `.edgeless`.                                                                                                                                                              |
| `.checkbox` `.radio` | Edge floored at 100%, absolutely           | The same, with nothing left when the line goes. Lifted by nothing.                                                                                                                                                                                                                |
| `.tooltip`           | Edge floored at 100%                       | A container's `.solid` or `.edgeless` takes the boundary off a bubble nobody classed. In light its plate is near-white, so the line is the only thing separating the message from what is behind it. Lifted by the element's own `.edgeless`.                                     |
| Toggles              | Inset ring spread capped at the line width | Under `.pixel` the aesthetic's four-pixel ring on a sixteen-pixel box leaves an eight-pixel hole, so an unchecked toggle reads as a checked one. Capped at `--ui-border-width`.                                                                                                   |
| `.radio`             | Checked line width capped at 3px           | A checked radio doubles its line, and a thick aesthetic doubled closes the circle over its own dot; 3px leaves 10px of interior for an 8px mark.                                                                                                                                  |

The number is expected to move. This is a test, not a quota: a bound that passes it is published, and a bound that stops passing it is deleted. The tooltip bubble is the worked example of a bound that had to be narrowed. Pinning its fill at solid failed the test, because it took an axis away from a consumer. What it carries instead is an edge floor with the escape `text-control` uses, and an opaque ground: the bubble rests filled, so an intent still floods it, but `--intent-subtle` is underneath, and an opaque ground keeps a bubble opaque at every fill rather than at the one fill it was allowed. The label follows the fill like any other label. A bound is a confession that composition failed somewhere, and this one turned out to be a component resting on nothing.

### Which files import the theme

`box` and `surface` live beside each other at the root of `src/`, and every component that composes them `@reference`s them. Tailwind marks every `@theme` value a referenced file reaches as reference-only and leaves it out of the output, and a later write of the same value replaces an earlier one, flag included. So a shared file that imports the theme, or that references Tailwind after the theme has been imported, silently strips the tokens from every entry that pulls it in: the package's own colour tokens in the first case, and Tailwind's palette ramp they are built from in the second.

The rules that follow:

- A file other files `@reference` -- `box.css`, `surface.css` -- imports neither the theme nor Tailwind.
- A file that references Tailwind imports the theme straight after it, so the theme is the last word. `loader.css` and the layout and content utilities, which must not carry the theme or never stand alone, reference neither.
- A compiled entry imports the theme before its own `@reference "tailwindcss"`. Tailwind writes the theme's variables where it meets the first `@theme`, and after the reference that is Tailwind's own reference-only one.

`exports.test.ts` holds it: every compiled entry, every `/tw` entry that carries the theme, and the documented `/tw/button` and `/tw/loader` pairing must declare every `--color-*` they read.

## Intent

Seven slots, seven classes, no cascade, and a zero-specificity reset that lets an element's own intent class win over an inherited value. The neutral values are also declared at `:root`; see [The root floor](#the-root-floor).

| Token               | Meaning                                                   |
| ------------------- | --------------------------------------------------------- |
| `--intent-color`    | The intent's base color. What a fill is made of.          |
| `--intent-contrast` | Readable color on top of a filled `--intent-color`.       |
| `--intent-hover`    | The intent's hovered base color.                          |
| `--intent-strong`   | The intent printed on a page, wherever a fill is partial. |
| `--intent-subtle`   | Low-emphasis tone; tinted surfaces and tracks.            |
| `--intent-fill-max` | How far a fill of this intent may go. 100% but neutral.   |
| `--intent-border`   | Line color; the quiet border gray with no intent set.     |

The shared reset declares:

```css
--intent-border: var(--ui-ink, var(--color-border));
```

An aesthetic sets `--ui-ink` to substitute its own neutral line color, and an intent class still overrides the whole slot, so a destructive control keeps its red edge under any aesthetic. A bare `<input>` under `.pixel` gets the silhouette and the ink, because the ink resolves against the component's own intent.

Controls -- the text controls, `.input-group`, and the toggles -- read `--ui-control-ink` ahead of it (`var(--ui-control-ink, var(--ui-ink, var(--color-control-border)))`), because the theme keeps a control border apart from a surface border and an aesthetic's surface line is not always a control's boundary. Glass's hairline leaves a light-theme unchecked checkbox at 1.45:1 against the page, and chunky tile's surface grey leaves a field below 3:1. Their separate control inks preserve their surface treatment while making controls visible. The ink aesthetics -- neobrutalism, pixel, cyber, and sketch -- name the theme's `--color-control-border` there: their ink is near-black on light and near-white on dark, which is `--color-primary` in both themes, and a resting neutral toggle or field drawn in it reads as loudly as a primary one. Every aesthetic names the token rather than clearing it, so a region nested inside glass or chunky tile does not inherit theirs. The rule is `:where()` for the unclassed case and `.neutral` beside it at 0-2-0, as the tooltip bubble's is: `.neutral` alone carries 0-1-0 and would beat the `:where()`, so a `.neutral` field under glass would draw the hairline an unclassed one does not.

A table's lines read `--ui-rule-ink` the same way, ahead of `--ui-ink`, because they are drawn on a plate rather than at a pane's edge against the backdrop. Glass's hairline vanishes on a table's light plate, so glass names a rule ink, the theme's ink at a fifth; every other aesthetic clears it, and a bare `<table>` reads it as `.data-table` does.

The resting text-field line stays partially blended: making it full strength would push the measured rest-to-hover colour step on most hued fields below a visibly distinct change. `.progress` keeps its quiet `.soft.edgeless` track rather than a heavy outline; its measured value, not the track, conveys the quantity. `.ghost.edged` is available for a stronger frame. Neither default makes a blanket 3:1 boundary promise under every aesthetic; [Accessibility](../accessibility.md) records the limits.

### What intent may not do

- **I1.** Intent declares color and nothing else. No intent class may set a length, a ratio, a shadow, or a shape.
- **I2.** Exactly one intent applies, and semantic outranks emphasis.
- **I3.** Intent does not cascade **into a component**. Every component redeclares the neutral defaults at its own root, at zero specificity, so an element's own intent class wins and an inherited one loses. The neutral values also sit at `:root` as the floor for everything else; the per-component redeclaration is what keeps that floor -- and any ancestor intent -- out of a component. See [The root floor](#the-root-floor).
- **I4.** An intent class is never also a component. `.destructive` says destructive; it must not additionally mean "helper text". Where a component needs both, the component carries its own class and takes the intent alongside it.

One deliberate exception to I3: table rows inherit their table's intent rather than resetting it, because a row is part of a table rather than an independent component. A row carrying its own intent class still wins.

### The root floor

`box` reads `var(--intent-color)` and the other six slots with no fallback, so an element that resolves none of them composes from an undefined value -- and an undefined `var()` inside `color-mix()` invalidates the whole declaration, so the element paints nothing. Every registered component is in one of the two resets, so this only bites a component reached another way: `@apply code` on a consumer's own `.prose code`, a bare `<code>` with no native stylesheet loaded, anything the package's selector lists do not name.

The neutral values are declared at `:root` to close that. It is a floor, not a barrier, and the distinction is why it does not reopen I3:

- **A floor** is an inherited value. It applies only where nothing sets the slot on the element itself.
- **A barrier** is a rule matching the element. `.neutral`, the two `:where()` resets, and every intent class are barriers -- each sets the slots _on the component_, which beats any inherited value whatever its specificity, floor and ancestor intent alike.

So a registered component is unaffected: its own reset still fires, and `.success` on a container still cannot reach it. An unnamed `@apply` target composes neutral instead of nothing, or picks up an ancestor's _explicit_ intent if one is in scope.

The cost is a fourth copy of the neutral mapping, after `.neutral` and the two resets. CSS has no "use the root value, ignore what's inherited" primitive, so the barriers cannot reference the floor -- they restate it. `registry.test.ts` holds all four copies to the same slots and fails the build on drift.

## Aesthetic

An aesthetic declares material: lengths, shadows, shapes, font family, the neutral ink, and the colour depth is cast in. It cascades, and a component resolves each token at its own root with the `var()` fallback that is its default.

### What enters the material contract

The material contract is built for structure, not for a look. A token enters it because it names a real part of what a component is made of -- a part the component already draws, whose material is fixed today -- and because more than one thing can use it: several components resolve it, and more than one look can be made from it. It never enters because one aesthetic asked for it. An aesthetic is a composition of what the contract exposes; one that the contract cannot yet express waits, rather than bending the model to fit.

A token enters only in a form that keeps composition intact -- the axes stay orthogonal, elevation keeps reaching what it scales, a consumer's own utility still beats the families under [Cascade layers](#cascade-layers) -- and the rules below. A capability that can only be exposed by breaking one of those is not exposed. Ambient motion is one: a CSS-only package cannot ship the pause control WCAG 2.2.2 requires for motion lasting more than five seconds, so resting animation is not a material token and a consumer who adds it owns its pause mechanism.

Beyond composition, the package strives for three things, in this order: that it **looks good**, that it **works**, and that it is **accessible**. The order settles a conflict; it is not a ranking of what matters. A look is not made worse to buy a contrast ratio, and accessibility is not given away where the look does not need it -- contrast, forced colours, reduced motion and transparency, and focus visibility are kept wherever keeping them costs the look nothing, and each decision that trades one of the three records the trade. A field's resting line is the example: it rests under 3:1 so that hover and focus have somewhere to move it, because a line that rests at full strength leaves both states without a visible change, which costs the look and the function together.

### Material tokens

| Token                     | Fallback                           | Meaning                                                                     |
| ------------------------- | ---------------------------------- | --------------------------------------------------------------------------- |
| `--ui-corner`             | `--radius-control`                 | Control corner at scale 1; `box` scales it by the step.                     |
| `--ui-corner-surface`     | `--radius-surface`                 | Surface corner at scale 1; `surface` scales it.                             |
| `--ui-corner-tl`          | `1`                                | `0` or `1`: whether the top-left takes the corner.                          |
| `--ui-corner-tr`          | `1`                                | The same, top-right.                                                        |
| `--ui-corner-br`          | `1`                                | The same, bottom-right.                                                     |
| `--ui-corner-bl`          | `1`                                | The same, bottom-left.                                                      |
| `--ui-radius`             | _computed_                         | A complete control radius, taken as written, unscaled.                      |
| `--ui-radius-surface`     | _computed_                         | A complete surface radius, taken as written, unscaled.                      |
| `--ui-scale`              | _the step_                         | Override for the size step the modifiers publish.                           |
| `--ui-corner-shape`       | `round`                            | What the radius draws: an arc, or a `bevel` cut.                            |
| `--ui-radius-pill`        | `--ui-radius`, `--ui-corner`, full | Corner for what is fully round; `.btn.pill` and `.radio` fall back to full. |
| `--ui-radius-tight`       | _small computed_                   | Complete chip radius, used as written when set.                             |
| `--ui-line-style`         | `solid`                            | `solid`, `dashed`, `dotted`, or `double` (3px and up).                      |
| `--ui-rule-style`         | `--ui-line-style`                  | Divider and table rules without changing box edges.                         |
| `--ui-border-width`       | `--border-width`                   | Edge thickness.                                                             |
| `--ui-border-max`         | `100px`                            | Ceiling on the computed edge width.                                         |
| `--ui-ink`                | `--color-border`                   | Neutral line color when no intent is set.                                   |
| `--ui-control-ink`        | `--ui-ink`                         | Neutral line color for controls; read ahead of `--ui-ink`.                  |
| `--ui-rule-ink`           | `--ui-ink`                         | Neutral line color of a table's frame and rules; read ahead of `--ui-ink`.  |
| `--ui-shadow-x`           | `0px`                              | Shadow offset, colorless so it inherits safely.                             |
| `--ui-shadow-y`           | `0px`                              | Shadow offset.                                                              |
| `--ui-shadow-blur`        | `0px`                              | Shadow blur.                                                                |
| `--ui-shadow-spread`      | `0px`                              | Shadow spread.                                                              |
| `--ui-shadow-inset`       | _empty_                            | The `inset` keyword, when the edge is an inner ring.                        |
| `--ui-hover-shadow-x`     | `--ui-shadow-x`                    | Shadow offset while hovered.                                                |
| `--ui-hover-shadow-y`     | `--ui-shadow-y`                    | Shadow offset while hovered.                                                |
| `--ui-active-shadow-x`    | `--ui-shadow-x`                    | Shadow offset while pressed.                                                |
| `--ui-active-shadow-y`    | `--ui-shadow-y`                    | Shadow offset while pressed.                                                |
| `--ui-active-transform`   | `scale(0.97)`                      | Transform while pressed; `none` under reduced motion.                       |
| `--ui-active-translate-x` | `0px`                              | Press travel into the depth, `-y` too; scaled like it.                      |
| `--ui-shadow-ink`         | `0%`                               | How much of the shadow is the intent's own ink.                             |
| `--ui-halo-blur`          | `0px`                              | Halo blur; `--ui-halo-spread` beside it.                                    |
| `--ui-halo-ink`           | _undefined_                        | Halo's share of the intent colour; undefined, no halo.                      |
| `--elevation-color`       | _theme_                            | The base that ink mixes toward; depth's own colour.                         |
| `--ui-shadow-edge`        | _undefined_                        | Declared, even empty, when the shadow is the edge.                          |
| `--ui-elevation`          | `1`                                | Unitless multiplier over the shadow geometry.                               |
| `--ui-surface-shadow`     | _unset_                            | Complete value; resolved by surfaces only.                                  |
| `--ui-surface-ground`     | `--color-background`               | Ground a surface or a table sits on; how glass goes translucent.            |
| `--ui-bg-alpha`           | `1`                                | Multiplier over fill. No shipped aesthetic thins one.                       |
| `--ui-backdrop`           | `none`                             | Backdrop filter; resolved by surfaces and the data table only.              |
| `--ui-surface-image`      | `none`                             | Painted layer; resolved by surfaces only.                                   |
| `--ui-hover-transform`    | `none`                             | Transform applied on interactive hover.                                     |
| `--ui-clip`               | `none`                             | Silhouette for structural components.                                       |
| `--ui-clip-tight`         | `--ui-clip`                        | Silhouette for chips.                                                       |
| `--ui-focus-inset`        | _undefined_                        | Inset focus layer width. Undefined means no layer.                          |
| `--ui-label-weight`       | per component                      | Label weight; `.btn` and `.badge`.                                          |
| `--ui-label-tracking`     | _undefined_                        | Label tracking; undefined inherits.                                         |
| `--ui-label-case`         | per component                      | `text-transform`; `.btn` falls back to `none`.                              |
| `--ui-label-shadow`       | per component                      | `text-shadow` with no colour, so it takes the label's.                      |

`registry.json` records under `material` which utilities read each of the corner, line, halo, surface image, and label tokens, and the surface ground, surface shadow, fill alpha, and backdrop beside them: the tokens a region nested inside glass would otherwise inherit. Every aesthetic names or clears every one of them, and every token any other aesthetic declares, `--elevation-color` and `--ui-focus-inset` included: a token one aesthetic sets is one a region nested inside it inherits. `registry.test.ts` checks the declarations, and `aesthetics.spec.ts` checks that every aesthetic nested inside every other paints a focused button and a card exactly as it does alone.

On a checkbox, key cap, or code chip, an unset `--ui-radius-tight` computes the small default as `min(--ui-radius or --ui-corner, --radius-small)`; an explicit `--ui-radius-tight` is a whole radius, including slash-separated elliptical values, and is not capped. A material that asks for a large chip corner gets one.

Corner scale uses the tighter of a size and padding modifier on the same element; their private steps are restated on each box so a small card does not shrink its children. `.p-xs` sets a step of `0.5`, `.sm` and `.p-sm` `0.75`, and `.lg` and `.p-lg` `1.25`. Depth follows the step down, never up. A public `--ui-scale` overrides the step. A complete `--ui-radius` overrides the computed corner and is not scaled. Four `--ui-corner-*` switches let `.cut-diagonal` and `.cut-diagonal-reverse` place that computed corner; a whole surface radius (as in cyber) bypasses the pattern. A `double` line needs at least 3px to show two strokes. The surface image does not reach controls, where it could obscure a select's chevron or its label. Label shadows take the label's own `currentColor`, rather than an unrelated hue.

Colour-bearing depth and halo are parts rather than completed shadows: a completed value declared on an ancestor would resolve its intent colour there instead of on the nested component. `--ui-halo-ink` is a presence switch; undeclared, the whole layer disappears. Depth scales with elevation while the halo does not, so `.flat` removes depth without extinguishing the glow. In forced colours, the halo, surface image, label shadow, and non-solid line styles reset to the plain treatment.

`--elevation-color` is the one row that is not a `--ui-*` slot, and it is here because an aesthetic legitimately names it. The theme declares it, every elevation composes from it, and `--ui-shadow-ink` says how far a component's own intent walks away from it -- so between the two they are the whole colour of depth, and an aesthetic that owns shadows owns both ends of that mix. It is deliberately the depth colour and not the palette. `--color-*` is hue, hue is intent's, and an aesthetic that repaints it reaches components it never meant to -- which is R1, and [R8](#rules-for-aesthetics) enforces the namespace.

The shadow is split so the ink resolves against the component's own intent. A custom property resolves its `var()` references on the element that declares it, so a complete shadow declared on `.neobrutalism` would resolve the container's intent and inherit down already-resolved. Colorless geometry inherits safely, and the component supplies the color -- see [Indirect tokens resolve once](#indirect-tokens-resolve-once):

```css
box-shadow: var(--ui-shadow-x, 0px) var(--ui-shadow-y, 0px) var(--ui-shadow-blur, 0px) var(--ui-shadow-spread, 0px) var(--intent-border);
```

`--ui-surface-shadow` is the complete-value override for the multi-layer case glass needs, where the color is fixed rather than intent-derived. It is scoped to surfaces deliberately: glass's 18px drop shadow given through an unscoped slot would land under every button and chip on the page, the same reach-one-kind-of-component problem `--ui-backdrop` solves, solved the same way.

`--ui-shadow-inset` carries the `inset` keyword, without which pixel's ring would have to be a complete value and lose the component's own intent. `--ui-shadow-edge` says the inset ring is not a shadow at all but a border drawn where a `clip-path` cannot cut it, so it answers the edge axis the way a real border does. Pointing it at `--_edge` is the whole implementation, because `--_edge` already carries P3's blend and the edge amount as its alpha. It is read for its presence rather than its value, and that is a measured constraint. As a percentage -- `color-mix(in oklab, var(--_edge) var(--ui-shadow-edge), var(--_depth-color))` -- both ends of the mix are themselves `color-mix()` results, and WebKit resolves that nesting as though the percentage were zero: every ring comes out in `--elevation-color` at 8% alpha, in that engine alone. Declaring the token empty and selecting between two single mixes with the guaranteed-invalid fallback idiom keeps all three engines in agreement. An aesthetic nested inside one that declares it clears it with `initial`.

`--ui-hover-shadow-x` and `-y` let an aesthetic move or hold its shadow between rest and hover without the `:hover` selector R3 forbids. `--ui-surface-ground` exists because `--ui-bg-alpha` multiplies the _fill_, and a surface's default fill is 0%: with no ground token a glass card keeps an opaque background and its own blur is invisible behind it.

### Rules for aesthetics

The numbering is stable; R4 and R5 are not used.

- **R1.** An aesthetic declares only material tokens. No aesthetic sets a presentation token, a palette entry, or an intent slot other than `--ui-ink`. Material cascades and is meant to; hue is not, and an aesthetic that writes `--color-*` or `--intent-*` repaints components it never meant to reach.
- **R2.** A component resolves a material token unconditionally. A no-op material value is free -- see [The cost of a no-op](#the-cost-of-a-no-op).
- **R3.** An aesthetic never names a component. It sets tokens. A treatment that genuinely cannot be a token -- an extra painted layer, a text transform -- is a selector list the aesthetic owns, recorded in the registry as `selectors` with a `selectorReason`, so the exception is countable rather than invisible.
- **R6.** An aesthetic declares the whole shadow geometry -- all four parts, or a complete value. The parts resolve independently, so an omitted part can come from another aesthetic in scope or fall through to component- or foundation-owned geometry. That produces mixed material the aesthetic did not author; declaring every part makes its shadow self-contained.
- **R7.** A shadow length is written with a unit, `0px` and not `0`. Elevation multiplies each part, and `calc(0 * 1)` is a number where a length is required: the whole `box-shadow` becomes invalid at computed-value time, which for a non-inherited property means `none`. One unitless zero in an aesthetic removes every shadow it reaches.
- **R8.** An aesthetic declares only what it owns the namespace of: `--ui-*`, its own `--_*` privates, and `--elevation-color`. A knob it publishes to consumers is _read_ with its default as the `var()` fallback, never declared. A declaration beats an inherited value whatever the specificity, so a knob declared on the aesthetic's own class outranks every ancestor including `:root` -- which is where an application themes something, and so is the only place the knob was ever going to be set from.

Where an aesthetic must reach one kind of component and not another, the way to say so is a token only that kind resolves. A surface resolves `--ui-backdrop` and `--ui-surface-shadow`, and a data table resolves the backdrop and the surface ground, because it is a pane of content; nothing else does. That is why glass blurs cards, panels, and tables while controls stay solid, and why its two-layer drop shadow does not land under every button on the page. Adding such a slot costs one line in the components that accept it, and it is visible in those components rather than inferred from a table somewhere else.

### The cost of a no-op

`clip-path` and `backdrop-filter` can be resolved unconditionally on every component, because applying either at its no-op value costs nothing. Measured in Chromium, Firefox, and WebKit, literal and behind a `var()` fallback:

| Declaration on the host                     | Containing block | Stacking context | Chromium layers, 400 hosts |
| ------------------------------------------- | ---------------- | ---------------- | -------------------------- |
| _(none)_                                    | no               | no               | 4                          |
| `clip-path: none`                           | no               | no               | 4                          |
| `clip-path: var(--ui-clip, none)`           | no               | no               | 4                          |
| `backdrop-filter: none`                     | no               | no               | 4                          |
| `backdrop-filter: var(--ui-backdrop, none)` | no               | no               | 4                          |
| `clip-path: inset(4px)`                     | no               | **yes**          | 4                          |
| `backdrop-filter: blur(2px)`                | **yes**          | **yes**          | **119**                    |

The last two rows are controls: without them the probe would report "no cost" for a broken measurement.

`corner-shape` was measured the same way, with `backdrop-filter: blur(2px)` as the control (a containing block, a stacking context, and 407 Chromium layers for 400 hosts against a baseline of 5). `corner-shape: round`, `corner-shape: var(--ui-corner-shape, round)`, and an active `border-radius: 8px; corner-shape: bevel` all report no containing block, no stacking context, and the baseline 5 layers, in all three engines -- in Firefox and WebKit because neither parses the property yet. Unlike a clip, even the active value costs nothing, so every radius site reads the token unconditionally (R2). `clip-path` never establishes a containing block, even active -- only a stacking context. `backdrop-filter` is the property that does both, and the only one that costs layers. The reason to keep an _active_ clip off every component is different and real: it establishes a stacking context in all three engines and clips descendants, backgrounds, borders, shadows, and the focus outline.

### Indirect tokens resolve once

A `var()` reference inside a custom property's value resolves against the element that **declares** the custom property, not against the element that uses it. A child overriding the referenced token is ignored. Measured identically in Chromium, Firefox, and WebKit, with `--unit: 8px` on the parent and `--unit: 1px` on the child:

| Declaration                                                   | Child override honored? | Result |
| ------------------------------------------------------------- | ----------------------- | ------ |
| `--shape: inset(var(--unit))`, then `clip-path: var(--shape)` | no                      | `8px`  |
| `clip-path: inset(var(--unit))` directly                      | **yes**                 | `1px`  |

This is the mechanism behind every case in this model where a value is declared per component rather than once on a container: `.neobrutalism`'s offset shadow, `.pixel`'s ring thickness, and `--ui-ink` all have to resolve against the component's own intent, so a token carrying one has to be read at the component, not written above it.

## Precedence

1. **Aesthetic** supplies the base material.
2. **Presentation** decides how much fill and whether there is an edge.
3. **Intent** colors both.

Modifiers -- size, and [elevation](#elevation) -- sit above the three, being per-element choices rather than axis membership. State sits above the modifiers: a control that is `:disabled` or `aria-invalid` reads as such regardless of every axis and modifier applied to it. State is a condition rather than a choice, so it is not an axis, but it wins when it collides with one. There is no fourth step: a component does not clamp the composed result, and the bounds it places on inputs are stated where they apply.

**S1. A state re-declares an input, never a painted property.** It sets `--ui-fill`, `--ui-border`, or an intent slot, and lets `box` paint. It does not write `background-color`, `border-color`, or `box-shadow` of its own.

State is where a design system usually grows escape hatches: `:checked`, `:indeterminate`, `.active`, `[data-state]`, selected rows each have an obvious wrong answer -- paint the property directly -- that works in isolation and then ignores the aesthetic, ignores elevation, and loses the hover derivation. S1 closes that. `aria-invalid` and `:checked` follow it; a state that painted `border-color` would look fine in isolation and fail under an aesthetic that draws its edge as an inset ring.

S1 says what a state may declare. It does not say where, and where decides whether the state wins at all. The intent resets are in `components`; a state written as `&[aria-invalid="true"]` inside `@utility` lands in `utilities`, which beats `components`, and `:is(...)` gives it 0-2-0 so it also outranks its own component's utility. **A state that writes an intent slot is declared above the intents: in `utilities`, at a specificity that beats its own component.** A consumer's utility setting an intent slot on an invalid field loses to it too, because state wins over every choice.

The cost of the rule is that a state can only express itself in the vocabulary the axes already have. That is the point: if a state needs something the vocabulary cannot say, the vocabulary is missing a slot, and adding the slot fixes it for every state at once rather than for that one.

## Cascade layers

CSS shipped by the package is placed across Tailwind's four cascade layers, in Tailwind's order (with documented unlayered exceptions), on every entrypoint, and every entrypoint states that order before it uses a layer -- a browser orders layers by the first time it meets each name, so a sheet opening `components` first would rank it lowest. This applies to standalone `/components`, `/native`, `/theme`, `/palette`, and aesthetic entries as well as the aggregate: loading an aesthetic before components does not change which layer wins. Built-file browser probes cover Tailwind utilities, plain consumer CSS, and raw entries in Chromium, Firefox, and WebKit.

| Layer        | Holds                                                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `theme`      | Tailwind's theme, the `:root` foundation tokens, the colour-scheme selectors, and `./palette`.                             |
| `base`       | The reset and the native element styles.                                                                                   |
| `components` | The four class families: intent (floor, classes, both resets), presentation, elevation, and every aesthetic's token class. |
| `utilities`  | Every component, and the seams that must beat their own component.                                                         |
| _unlayered_  | The `forced-colors` and loader reduced-motion overrides, the `<dialog>` restatement, solo classes, and `@property`.        |

So a consumer's own utility, or their unlayered CSS, beats any class of the four families on the same element. A consumer's utility and a component contest one layer, by specificity and then source order: components cannot sit below `utilities`, because `@apply` reaches only `@utility` rules and `box`, `surface`, and `text-control` are applied that way.

Where a rule goes follows from what it writes. A rule writing a property or a public token a consumer may set goes in `components` (or `theme`, for a foundation token), where a consumer's utility beats it. A rule writing only package privates, or a state, goes in `utilities` at the specificity it needs to beat its own component. State is the deliberate exception to a utility's override: `aria-invalid` and `:checked` win over normal intent and fill classes. Chunky tile's heavier label is a slot (`--ui-label-weight`) because a selector writing its painted weight could neither beat the component in `components` nor yield to a consumer's `font-*` in `utilities`.

Neutral soft surfaces use a private `--_d-surface-ground` instead of writing the public `--ui-surface-ground` in a component utility: the latter would overrule `.glass` on the same element and leak its inherited ground into nested ghost cards. Under glass, neutral soft cards, panels, and alerts therefore become glass too. `surface` resets the private at each component root. Form seams that must beat their own utility share `utilities` at greater specificity. Solo classes stay unlayered to beat foreign components' unlayered zero-specificity rules; consumer Tailwind utilities do not override them. Accessibility overrides and the closed-dialog restatement stay unlayered because they must beat components regardless of layer.

`integration/exports.test.ts` holds every built entrypoint to the order and to the unlayered allowlist, and `browser/layers.spec.ts` asserts a consumer's override on the raw files a non-Tailwind consumer links.

## Defaults

Every component declares its resting pair in the registry. There is no "plain" and no implicit default: a component with no presentation class renders the pair the registry names for it, and that pair is published.

| Component                        | Default        |
| -------------------------------- | -------------- |
| `.btn`                           | solid edgeless |
| `.ipt` `.textarea` `.select`     | ghost edged    |
| `.input-group`                   | ghost edged    |
| `.checkbox` `.radio`             | soft edged     |
| `.switch`                        | soft edged     |
| `.card`                          | ghost edged    |
| `.panel`                         | soft edgeless  |
| `.alert`                         | soft edged     |
| `.data-table`                    | soft edgeless  |
| `.tooltip`                       | solid edged    |
| `.pre` `.code`                   | soft edgeless  |
| `.kbd`                           | soft edged     |
| `.badge`                         | soft edgeless  |
| `.quote`                         | ghost edged    |
| `.progress`                      | soft edgeless  |
| `.loader` `.skeleton` `.divider` | n/a            |

Four of those name a ground as well. `.pre`, `.code` and `.kbd` are not transparent at rest -- each is a quiet tinted block -- and that tone is not a fill of the component's intent, it is `--intent-subtle`. They rest at `soft` over `--_d-ground: var(--intent-subtle)`, the mechanism `surface` uses for its own ground, so the plate is 12% of the intent over that tone and `.solid` fills with the intent. The tooltip bubble names one too, and reads `--ui-surface-ground` ahead of it so a glass tooltip stays glass. The registry records the ground beside the pair.

Everything else rests on nothing, and `box` says so on itself: it declares `--_d-ground: transparent` rather than leaving the value to the `var(--_d-ground, transparent)` fallback in its fill blend. The token inherits like any custom property, so a `surface` setting it to an opaque plate would reach every box nested inside -- a `.ghost` button in a card would blend its zero fill over the page colour and paint an opaque slab where it asked for no fill. An own declaration on `box` beats the inherited one, so a nested control keeps its own ground; the four components above restate theirs after `@apply box` for the same reason.

These authored defaults are decisions, not derivations -- there is no rule that produces them. Each is stated in one place rather than hidden as a `var()` fallback in the middle of a component.

### `.input-group` owns the box; the control inside gives it up

`.input-group` is the composition that carries an icon or affix. It is a wrapper that takes the whole of `box` through `text-control`: the group draws the border, radius, fill, focus treatment, invalid and disabled state. The control inside it switches its own paint off -- `--_fill-cap: 0%`, `border: none`, no background, no shadow, and its `:focus-visible` ring suppressed -- so the boundary is drawn once, by the group. It reads the same axes and the same bounds a lone `.ipt` does, so `.input-group.soft.edgeless` is the sunk field and a `.solid` container is still capped at `6%`. Icons are the consumer's: the package paints none, because a `data:` URI resolves no custom property and could not follow the theme or fit every aesthetic.

Two deviations from a lone field, both because a `<div>` is not a control. `:focus-within` stands in for `:focus-visible`, so the ring also shows on a mouse click. And `:has()` bridges an inner control's `aria-invalid` or `disabled` to the group, because a wrapper cannot see a descendant's state otherwise. `:has(:focus-visible)` is not used for the ring: the inner control only matches `:focus-visible` while the document itself has focus, which makes the ring flicker out whenever focus leaves the page.

### Components that do not take the whole of `box`

Six of them, and the registry says which rather than leaving it to be found by reading CSS. Three are indicators: `.loader` is a single mask silhouette, `.divider` is a line rather than a box with an inside, and `.skeleton` is a single placeholder gradient. None has a track separate from a value and none reads box presentation. `.progress` alone has a frame holding a measured value: its track takes fill and edge while the value stays at full-strength intent colour. Its `--ui-border-width` override reaches the track just as it reaches other edged components.

`.quote` and `.progress` each compose none of `box`, but both still read `fill` and `edge` -- they reimplement the formula rather than taking it whole. `.quote` cannot take it because `box` draws a border on four sides and a quotation wants one; a radius, a clip and a shadow are inert on a left bar as well, so what is left of `box` after removing the border is not worth composing. `.progress` cannot because its value fill is a `::after`, not the element's own background, so there is nowhere for `box`'s single `--_bg` to land without also painting behind the value it measures. Only the track -- the element's own box -- composes the formula; the value fill stays `--intent-color` at full strength, the same contract `.loader` and `.skeleton` have.

The cost is that each reimplements the fill and the edge blend, and every copy has to agree with `box`. Each registry entry says so, so an edge change knows how many places it has: `box`, `.quote`, and `.progress`.

`.data-table` takes the frame -- border and plate, with a surface's corner rather than a control's, since it is a pane of content -- and paints its head, cell rules and row hover from private tokens, because none of those have an equivalent on the three axes. Nothing clips it. Chromium and WebKit lay a `<caption>` out inside the table's own box while painting the plate and the frame around the rows alone, so anything acting on the whole box spans the caption: an `overflow: hidden` would round the caption's corners and leave the head's square, and cut the caption's first letter. The corner cells take the table's corners instead -- each section and row inherits them, and each corner cell takes its own as a longhand -- and the head plate and row hover are painted on cells, which those corners round. A cell spanning rows into a corner is not reached. Glass's backdrop and liquid glass's layers act on the whole box, so under either a caption sits on the pane in those two engines; that is recorded rather than worked around.

Both carry the reason in `registry.json` next to the decision, so a further exception has to be argued for in the same place rather than appearing quietly in a stylesheet.

## The registry

`registry.json` at the package root is the source of truth for what the package supports, with `registry.schema.json` beside it. It exists as data rather than prose because four separate things have to agree about the same facts, and prose lets them drift.

It carries the closed sets first -- the fill and edge classes with the tokens each declares, the hover step, the intents and their color families, the modifiers -- then every component, helper, and aesthetic.

Per component: class name, default fill/edge/elevation, the axes it reads, the ground it rests on where it has one, native element selectors, and -- where one applies -- a rename, a partial composition, or a bound, each with its reason.

```json
{
  "class": "btn",
  "default": { "fill": "solid", "edge": "edgeless", "elevation": 1 },
  "axes": ["fill", "edge"],
  "native": ["button", "input[type=\"submit\"]", "input[type=\"reset\"]"]
}
```

`axes` is what makes a dead axis findable. It is the registry's claim about the component, and the browser suite holds it to it. A bound narrows an axis input without removing it, so a component that bounds one still lists the axis -- and a bound may also clamp a piece of material geometry a chip cannot spend in full, `--ui-shadow-spread` or `--ui-border-width`, which `registry.test.ts` holds against the `min()` seam in the component's own block:

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

An `escape` of `null` is the register of what nothing lifts: the edge floor that is absolute on `.checkbox` and `.radio`, and the chip geometry caps -- the inset-ring spread on all three toggles and the checked line width on `.radio` -- which are clamped by their nature rather than against a cascade.

**It describes the stylesheet; it does not produce it.** The CSS is written by hand, and the registry is read by things that need the list and checked against that CSS:

- `pnpm generate` writes the public class and token tables and the LLM files.
- The preview builds its matrix from it, so an unsupported combination cannot be rendered.
- Browser tests assert every declared combination resolves, and that nothing undeclared is claimed.
- The integration tests check the registry against the stylesheet, which is what keeps hand-writing safe.

### What validation enforces

These checks fail the build:

1. No duplicate class name anywhere in the package.
2. No collision with a Tailwind static utility.
3. Every component's default names a fill and an edge that exist, unless its composition is explicitly `none`.
4. A rename carries its reason.
5. Every component appears in one of the two hand-maintained intent resets. A component missing from one reads an undefined `--intent-*`, which makes every `color-mix()` referencing it invalid and drops the declaration -- so it renders as nothing rather than as an error.
6. Every implemented component declares the resting values the registry publishes for it.
7. Every component declares the axes it reads, and every bound it places on one carries the composition of ours that earns it and what lifts it.
8. Every `--ui-shadow-spread` or `--ui-border-width` bound in the registry has a matching `min()` seam in the component's own block, and every such seam in the stylesheet has a bound -- so a chip geometry cap cannot be added to the CSS without being published, and cannot be published without existing.

Check 7's axis half is enforced in the browser rather than against the stylesheet text, in `tests/browser/axes.spec.ts`, because it is the only one whose answer is a computed value. It asserts both directions: an axis the registry calls live must change what the component computes, and an axis it leaves off must not. Check 8 is a text check in `registry.test.ts`, because a `min()` seam is a stylesheet fact rather than a computed one.

### Names that avoid a collision

The table component is `.data-table`, not `.table`: an `@utility table` would replace Tailwind's `display: table` utility for every consumer that imports the package, and check 2 makes that impossible. For the same reason the visually-hidden helper is `.visually-hidden`, not `.sr-only`.

### The composition API

`@utility` does not make a private helper. Every name below is a class a consumer can type, whether or not it is documented, so they are published as a small composition API.

| Utility        | What applying it gives an element                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `box`          | The whole painted box: `border-box` sizing, fill, foreground, edge, radius, shadow, clip, focus, disabled.                                       |
| `box-hover`    | The derived hover tone, for something you press rather than type into. `btn`, and `.card.interactive` / `.card.hoverable`.                       |
| `box-active`   | The `:active` press: the base `scale(0.97)`, or the aesthetic's active shadow and transform. `btn`, and `.card.interactive` / `.card.pressable`. |
| `surface`      | `box` plus the surface-only slots: ground, backdrop, surface shadow.                                                                             |
| `text-control` | `box` plus the fill cap, the edge floor, and the field affordances all six text controls share.                                                  |
| `loader-mask`  | The spinner artwork, as a mask so it takes the element's own color.                                                                              |

They are the seam the components are built from, and a consumer composing a component the package does not ship is better served by them than by copying a component's declarations. What they are not is a taxonomy: applying `box` says how an element is painted, not what kind of thing it is.

`box` declares `box-sizing: border-box` on itself. A box sizes itself as `min-height`/`min-width: var(--control-height)` plus its own padding and the composed `border` shorthand, so its geometry only resolves correctly under `border-box`. `reset.css` sets that on `*`, but the reset ships only with `.`, `/native`, and `/tw/reset`; `/components` and the granular `/tw/*` component entrypoints carry neither it nor Preflight. A component's own geometry is not an external reset's responsibility; the universal rule in `reset.css` covers only the consumer's own markup.

## Variant specs

What each aesthetic must look like, so a change can be judged against something.

### Default

No aesthetic class in scope. 1px edges, 0.5rem control radius, 0.875rem surface radius, no silhouette, and no component depth by default. The default is the absence of material declarations rather than a set of root values -- which is why a card gets surface radius and a button gets control radius from the same unset token. The one material value it declares at `:root` is `--ui-active-transform: scale(0.97)`, so a press on `.btn` or `.card.interactive` (equivalently `.card.pressable`, its press half) registers on a plain page; reduced motion drops it. `.raised` and `.floating` opt an element into the foundation shadow geometry, and an aesthetic can supply different geometry. No component carries depth on its own under the default; see [Elevation](#elevation).

### `.glass`

Translucent surfaces over a blurred backdrop with a hairline highlight edge. Needs something behind it to blur; on a flat page background it is a translucent panel and nothing more.

- Blur and saturation reach surfaces and the data table only, through `--ui-backdrop`. Controls stay solid: an active blur costs a compositing layer apiece, and one under every control of a dense cluster reads as noise. A table is a pane of content, and next to frosted cards an opaque one reads as a slab. Only its default and `.soft` forms frost: a `.solid` table is opaque, and a `.ghost` one has nothing behind its type to blur.
- The glass is the ground, not the fill. Translucency is `--ui-surface-ground`, the plate a partial fill is painted over; every presentation keeps its whole fill, so a `.solid` button, a checked toggle, and a `.solid` card are opaque. Glass does not set `--ui-bg-alpha`: thinning every fill would make how much colour a presentation asks for depend on the aesthetic, which is presentation's question ([R1](#rules-for-aesthetics)).
- The edge is a light hairline in both themes, because glass catches light from above regardless of what is under it. Text controls and toggles do not take it: the hairline erases an unchecked checkbox on a light page, so their line is `--ui-control-ink`, the theme's ink at 55% -- translucent, so it tints what is behind the pane rather than drawing a flat grey. A table's frame and rules do not take it either: it vanishes on the table's plate, so they draw `--ui-rule-ink`, the same ink at 20%. Buttons and badges keep the hairline.
- Both shadow layers pull in with negative spread, so the shadow tucks under the surface instead of haloing onto the backdrop.
- A press is the base `scale(0.97)`, dropped under reduced motion. Controls carry no shadow here, so there is no slab to press into.
- Every surface in its region is glass, a neutral `.card.soft`, `.panel`, and `.alert` included: their quiet ground is a private default beneath `--ui-surface-ground`, so glass's ground wins over it.
- Under `prefers-reduced-transparency`, opacity goes to 100% and the blur is dropped. Transparency is the whole aesthetic, so the honest degradation is an opaque surface rather than a softer blur.
- Corners are `--glass-radius` and `--glass-radius-surface`, at 0.75rem and 1rem. Rounder than the base geometry, because a translucent panel with a tight corner reads as a cut-out rather than as a pane; a full step above `--radius-surface` lands closer to a pill than to glass. Read with a fallback rather than declared, so an ancestor can set them ([R8](#rules-for-aesthetics)).

#### `.glass-liquid`

A modifier of glass, after Apple's Liquid Glass, the way `.sketch-rounded` is of sketch.

- **Refraction needs no SVG in the DOM.** Chromium renders `backdrop-filter: url()` pointing at a data URI, at an external file, or inline, identically. Firefox and WebKit accept the value -- `CSS.supports` is true in all three, so no feature query can gate it -- and draw nothing for it.
- **The silhouette needs no `clip-path: path()`.** `--ui-corner-shape: squircle` follows the box's own radius. `squircle` is Chromium-only, as cyber's `bevel` is; a continuous corner degrades to round, which is closer than bevel's square.
- **The lens is not a warp.** Its displacement map is built inside the filter from the filter region itself: a flood eroded by 8px, blurred over 10px into a ramp, and the ramp's slope across x and y taken as the two displacement channels. Every length is absolute, so the band is the same width on a tooltip and a page-wide card; nothing is a percentage of the box. The blur is wider than the erosion because the square core otherwise shows through as loops at every corner. A filter reads no custom property, so the band and strength are fixed, not knobs.
- **The blur and the lens are layers, not the surface's own filter.** A surface with a backdrop filter is a backdrop root, and a layer inside one sees only the surface, never the page -- measured: a lens on the `::before` of a blurred surface bent nothing. So `.glass-liquid` sets `--ui-backdrop: none` and draws the blur on `::before` and the lens on `::after`, behind the content, inside a surface made a stacking context so they land above its plate.
- **The two are separate layers so an engine that cannot draw the lens keeps the blur.** A filter list with a reference it cannot use is dropped whole; in one list, the lens would take the blur down with it where it does not render. Whether Firefox and Safari drop the list was not measurable -- neither engine's test build draws `backdrop-filter` at all -- so the split is the precaution that makes the answer not matter.
- **The rim and the sheen are on the lens layer**, the topmost, because the surface's own box shadow sits under the layers and would blur with the page.
- Only the corners apply without `.glass` in scope. The ink, ground, and blur are set only on `.glass.glass-liquid` and `.glass .glass-liquid`: a lone modifier would otherwise make surfaces translucent with nothing to blur and fields' lines near-invisible.
- The layers are a selector list glass owns, [R3](#rules-for-aesthetics)'s exception, recorded in the registry: a pseudo-element is not a value a token reaches. Anchoring them writes `position: relative` and `isolation: isolate` on the surface, which no surface writes itself; the tooltip bubble's own `absolute` wins. A region of another aesthetic nested inside, or of plain glass, keeps its own material and takes no layers.
- Surfaces and the frosted table only, as under glass. The fields cannot host a pseudo-element; see [the budget](#pseudo-element-budget). In Chromium and WebKit a table's box holds its caption, so the layers cover the caption as well as the rows.
- Lighter than glass: `blur(2px) saturate(1.8)`, a 30% ground where glass's is 45%, and corners of 1rem and 1.5rem through glass's own knobs. The lens needs detail left to bend. Reduced transparency drops the blur and the lens and makes the ground opaque; forced colours draw no layer.
- `.glass-solo.glass-liquid` paints the same pane on a solo element. Its anchor is the one layered declaration a solo class makes, so an element's own `fixed` or `absolute` beats it and a toast keeps its placement.

### `.neobrutalism`

Thick ink outline, a hard unblurred offset shadow, and a press that moves the element into its own shadow.

- 2px edges, zero radius everywhere.
- `--neo-offset` at 4px is the knob: the shadow offset and the press travel are the same number, so a consumer scaling the look scales it whole. Read with a fallback per [R8](#rules-for-aesthetics), so an ancestor can set it.
- Ink follows the theme, not the palette: near-black on light, near-white on dark. Pure black disappears on a dark page. Controls take the theme's control border instead, through `--ui-control-ink`: the ink is the primary colour in both themes.
- The offset shadow is the component's own `--intent-border`, so a success button casts a green shadow and a neutral button casts ink.
- The press moves the element by the shadow offset and shrinks the shadow to nothing. Hover holds the slab still; the derived fill tint is its whole response.
- An alert rests on the slab, which is the one component this aesthetic names in a selector. Here the slab is a second ink line rather than depth, and an alert is the only container the registry rests flat. It is written into the component's resting default rather than the modifier, so every elevation class still wins.

### `.pixel`

An 8-bit look built from a stepped silhouette and an inset ring.

- One square grid unit is cut from each corner, and `--pixel-unit` is that unit at 4px. Everything is a multiple of it -- the ring is one unit thick, the corner one unit square -- so it is the single knob that scales the look. Read with a fallback per [R8](#rules-for-aesthetics), so an ancestor can set it.
- The corner is a one-unit square cut rather than a two-step staircase, because a staircase approximates a curve at half the unit, which is the one shape a low-resolution grid cannot draw.
- Corners are one unit or nothing. Chips square rather than step, because one unit off each corner of a 24px badge is a bite rather than a corner.
- The edge is a one-unit inset ring, the same size as the cut, so the corner is covered and the line does not read as broken there.
- The ring answers the edge axis, through `--ui-shadow-edge`. It is the border, not depth, so `.edgeless` draws none and a field's own floor keeps one.
- No radius anywhere. `clip-path` clips a border away, so the border ceiling goes to zero and the ring does the drawing. A table takes no clip, because the clip would span its caption, so it is square, and its rules read the uncapped width: capped, the head and foot rules and `.ruled` would draw nothing.
- Controls draw the theme's control border, as under neobrutalism. A switch's knob sits inside the ring, which it reads through `--ui-shadow-edge`: sized from the zero border alone, it would cover the ring and both states would read as two halves.
- Reads `--font-pixel` and falls back to monospace. The package ships no font binary.

### `.chunky-tile`

Rounded slabs seated on a darker shade of themselves, pressed flat on click.

- `--tile-radius` at 12px on controls and surfaces alike, and 2px lines. One knob rather than glass's pair, because the corner is what makes a 40px button and a 200px card read as the same object; chips clamp it themselves at `--radius-small`. Read with a fallback so a consumer can set it from `:root` -- [R8](#rules-for-aesthetics), which this aesthetic is the worked example for.
- The tile grey, `neutral-400`/`-600`, is the line of tiles and surfaces. Controls draw a heavier one through `--ui-control-ink`: `neutral-600` in light and `neutral-400` in dark.
- The bar is solid, unblurred, straight down, and spreadless. Zero x is what separates it from neobrutalism, whose two-axis offset reads as a card lifted off the page where this is a slab seated on it.
- The bar is a shade of the element rather than a repeat of it, which takes an opaque `--elevation-color` as well as a partial `--ui-shadow-ink`. See [Worked example](#worked-example-the-chunky-tile-look).
- An unfilled tile's bar and its line are the same colour by construction: both resolve `--intent-border`.
- Hover holds still and the press moves: a seated slab has one gesture and it belongs to the press.
- Labels are heavier and slightly tracked, through `--ui-label-weight` and `--ui-label-tracking`, which `.btn` and `.badge` read, so a consumer's `font-*` utility still beats them. Casing is left to the application.
- A `.p-xs` button sits on half the lift and a `.sm` one on three quarters: `box` scales depth down with the size step, so the aesthetic names no component.

### `.cyber`

Bevelled corners, a thin bright edge, and a glow in the component's own colour. A clip would remove both the glow and the diagonal edge; `corner-shape: bevel` preserves the border, shadow, and focus outline. Engines without `corner-shape` square the cut corners while leaving fully round controls round.

- The bevel is `corner-shape: bevel` through `--ui-corner-shape`. The border, the glow, and the focus outline follow the cut.
- `--cyber-cut` at `0.625rem` is the cut at scale 1, set as `--ui-corner`, so `box` scales it with the size step and a `.p-xs` button takes half of it at a true 45 degrees. Controls cut top-left and bottom-right through the four corner switches; surfaces cut top-right and bottom-left through a whole `--ui-radius-surface`, unscaled, because the switches cannot place two patterns at once. `--cyber-shape` and `--cyber-shape-surface` take any `border-radius` value and are used as written, read with a fallback per [R8](#rules-for-aesthetics).
- What is fully round cuts to points through `--ui-radius-pill` -- a diamond radio, switch knob, and tooltip icon, a pointed hexagon for a pill or a badge -- and chips square through `--ui-radius-tight: 0`, which keeps the checkbox distinct from the radio.
- Where `corner-shape` is not supported the control and surface radii go to zero, so those corners square rather than round; what is fully round stays round.
- 1px edges in `--ui-ink`, which is the `--cyber-ink` knob over the theme-following neutral neobrutalism and pixel use. Hue stays with intent. Controls take the theme's control border, as under neobrutalism.
- The glow is the halo: the intent colour at 40% (`--ui-halo-ink`), blurred by `--cyber-glow` (`8px`) with no offset or spread. Elevation does not scale it, so every component glows, fields and chips included, and `.flat` does not put it out. There is no depth.
- The press is the base `scale(0.97)`, restated, and `none` under reduced motion. The glow holds still on hover and on press.
- Reads `--font-cyber` and falls back to monospace.
- Every other aesthetic declares `--ui-corner-shape: round` and resets `--ui-radius-pill` and `--ui-radius-tight` to its own material (or clears them), so a region nested inside `.cyber` inherits none of its corners.

### `.sketch`

Uneven elliptical corners, solid ink with dashed accents, and a small hard offset shadow.

- Every outline is a complete radius -- `--ui-radius`, `--ui-radius-surface`, `--ui-radius-tight`, and `--ui-radius-pill` -- so the size step and the corner switches do not reshape it. Controls take long uneven corners; surfaces take sharper ones that stay clear of their padding.
- One region token would give every element the same outline, so the aesthetic writes a rotation onto components by sibling position, four steps, and a field's control takes its field's position. This is its R3 exception, recorded in the registry. The rules share one root that skips any region of another aesthetic nested inside a sketch region; that root is the only place the other aesthetics are named, and `registry.test.ts` fails when one is missing.
- `.sketch-rounded` is a modifier: short rounded corners, bounded in pixels so a wide element keeps straight top and bottom edges, rotated the same way. On the region or on one component.
- A `.btn.pill` takes a rounded pill bounded to the button's half-height; badges, progress bars, and switches take their chip outline; radios and the tooltip icon stay slightly uneven circles, so a radio is never read as a checkbox.
- Knobs `--sketch-radius`, `--sketch-radius-surface`, `--sketch-radius-pill`, `--sketch-radius-rounded`, and `--sketch-radius-surface-rounded` are read with fallbacks per [R8](#rules-for-aesthetics); a set knob replaces every step of its rotation. An explicit radius on a component wins over the rotation.
- The edge is 1px solid through `--ui-line-style`; checkboxes are dashed, and dividers and table rules take `--ui-rule-style: dashed`. Forced colours draws them solid. Controls draw the theme's control border, as under neobrutalism, and a table rotates with the surfaces.
- The shadow is a neutral 2px right-and-down offset with no blur or spread, scaled by elevation like every part-based depth cue.
- Buttons press with `scale(0.97)`, like the plain look; reduced motion turns off that transform.
- Reads `--font-sketch` and falls back to the platform `cursive` generic family. The package ships no font binary.

## Solo classes

Every aesthetic ships a second class, `.<aesthetic>-solo`, which paints the aesthetic's material directly onto the element carrying it -- for an element this package does not style, where the token class changes nothing because nothing reads the tokens. A cascading aesthetic cannot also paint its scope element without turning themed regions into panels. Solo classes are element-only and unlayered to beat foreign components' zero-specificity rules; they read their own knobs and theme colors with standalone fallbacks, but no `--ui-*`, `--intent-*`, or `--elevation-color` inherited from a different aesthetic. Elevation modifiers do not reach them. Only actions press, and reduced motion removes the travel.

A solo class is not an aesthetic in the sense the rules above govern. It names no component, but it writes painted properties rather than tokens, it reads no `--ui-*`, `--intent-*`, or `--elevation-color` (the first two are the aesthetic cascade's and the intent reset's, and a solo element has to look the same inside any aesthetic), and it is unlayered so it beats a foreign component's own rules. `registry.json` records each one as the aesthetic's `solo`, and `registry.test.ts` holds that the class exists and reads none of those tokens.

## Adding an aesthetic

Aesthetic is the axis most likely to grow, so it gets the most deliberate extension story. Each new aesthetic wants something material tokens alone may not offer: a button that behaves differently from a card. Two tiers, and an aesthetic reaches for the second only when the first cannot express it.

A new aesthetic is added to sketch's and glass's exclusion lists, clears every token the other aesthetics declare (`--ui-rule-ink` included), and needs a solo class, compiled and `/tw` exports, a registry entry, public documentation, playground coverage, and cross-browser tests.

### Tier 1 -- material tokens

Set tokens, touch nothing else. This tier cascades, needs no knowledge of any component, and reaches bare `<button>` and `<input>` elements carrying no class at all. Most of an aesthetic lives here.

An aesthetic entrypoint carries no Tailwind directive and must not add `@reference "tailwindcss"`. A `@reference` in a file imported into a full build switches the whole build to reference mode: `@theme` stops emitting `:root`, and every foundation token such as `--border-width` is inlined with a fallback instead -- which invalidates the `calc()` built around them and drops whole `border` shorthands.

#### Publishing a knob

An aesthetic built out of one number -- pixel's grid unit, neobrutalism's offset, the tile's lift -- publishes that number so a consumer can scale the whole look at once. Read it, do not declare it (R8). The shape is always this:

```css
.chunky-tile {
  --_tile-lift: var(--tile-lift, 4px);

  --ui-shadow-y: var(--_tile-lift);
  --ui-active-translate-y: var(--_tile-lift);
}
```

The private is not decoration. Writing `var(--tile-lift, 4px)` at each of the places that need it repeats the default, and two of them drifting apart is a bug nothing catches; resolving once into `--_tile-lift` puts the default in one place. The name mirrors the knob so the pair is obvious at a glance, and the underscore keeps it out of a namespace a component might later want.

The knob is read rather than declared because a declared custom property beats an inherited one whatever the specificity -- so it would outrank `:root`, a themed wrapper, and every other ancestor, which is the entire population of places a consumer sets it from. Undeclared, an ancestor's value inherits in and a value on the element itself still wins over it.

The trade: these resolve on the aesthetic's own class and inherit already-resolved, so a _descendant_ setting one changes nothing. The shared material tokens are the tool for that direction -- `--ui-radius` on a card works, because `box` reads it at whichever element draws. Knobs reach the element and above; material reaches the element and below. Neither replaces the other.

### Tier 2 -- a slot, or a selector list you own

Some aesthetics want a treatment that is not a value: a specular highlight on surfaces, a scanline background, uppercase actions. Two ways to get one, in this order.

**Add a slot.** If several components should accept the treatment, give them a token to resolve, the way surfaces resolve `--ui-backdrop`. One line in each component that accepts it, visible in that component, and every aesthetic gets the capability rather than just the one that asked.

**Write the selector list.** If it really is "buttons in this aesthetic are uppercase", write `.chunky-tile :is(.btn, button)`. It is a rule an aesthetic should have to spell out, because it is the thing R3 exists to discourage, and spelling it out is how a reviewer sees it.

A selector list works only for a property the components it names do not write themselves, and a list that writes tokens is placed by the rule [Cascade layers](#cascade-layers) gives. A painted property the component already writes -- anything `box` sets: `background-color`, `color`, `border`, `border-radius`, `corner-shape`, `box-shadow`, `clip-path`, `transform` -- has no layer that works: in `components` the list loses to the component, and in `utilities` it beats the consumer's own utility. A treatment on one of those properties is a slot.

### Pseudo-element budget

A treatment neither of Tier 2's options reaches -- a specular highlight, a scanline, a corner fold that is not a value at all -- sometimes wants a `::before` or `::after` of its own, and CSS caps every element at two. Most components spend neither: `.alert`, `.btn`, `.badge`, `.card`, `.panel`, `.kbd`/`.code`/`.pre`, `.quote`, `.data-table`, `.tooltip-bubble`, `.skeleton`, and the divider all reach an aesthetic through tokens or a real child element, so both slots are open.

Three cannot host one at all. `.ipt`, `.textarea`, and `.select` are fields on `<input>`, `<textarea>`, and `<select>`, and none of the three generates a `::before` or `::after` in any engine -- measured in Chromium, Firefox, and WebKit, where a checkbox or radio `<input>`, a `<button>`, an `<hr>`, and a `<table>` all do. A treatment that needs a pseudo-element does not reach a field, and says so where it ships; `.input-group` is a `<div>` with both slots open, so a grouped field is reachable through its group.

Two groups spend theirs:

| Component                        | Spends                                                                                   | Free       |
| -------------------------------- | ---------------------------------------------------------------------------------------- | ---------- |
| `.checkbox`, `.radio`, `.switch` | `::after` -- the checkmark, dot, or knob                                                 | `::before` |
| `.progress`                      | `::before` (the `.active` shimmer) and `::after` (the fill, reused for `.indeterminate`) | none       |

The three toggles keep `::before` free because an `<input>` is a void element: composing a mark in as a real child would mean wrapping every checkbox, radio, and switch in a span whether or not anything ever reaches for the freed slot -- a cost paid by every consumer of the package's most common form control. Their `::after` is spoken for by the checked state itself, generated by the control rather than authored by a consumer, which is what a pseudo-element is for. An aesthetic wanting a treatment on a toggle writes it to the open `::before`.

`.progress` has no free slot: the fill's width and the shimmer are the bar's only visible state, so a real child would still need a wrapper around it and would not be a consumer's own content. An aesthetic reaching `.progress` goes through `--progress-color`/`--progress-surface`/`--progress-edge` ([Tier 1](#tier-1----material-tokens)) or a selector rule on the track itself, `.my-aesthetic .progress` -- never a third pseudo-element, because there is not one to spend.

`.glass-liquid` spends both slots of every surface, and of a default or `.soft` table, for its blur and lens layers, and only inside a liquid region.

### Worked example: the chunky-tile look

Rounded slabs sitting on a darker shade of themselves, pressed flat on click:

```css
.chunky-tile {
  --_tile-radius: var(--tile-radius, 0.75rem);
  --_tile-lift: var(--tile-lift, 4px);

  --ui-corner: var(--_tile-radius);
  --ui-corner-surface: var(--_tile-radius);
  --ui-border-width: 2px;
  --elevation-color: rgb(0 0 0);
  --ui-shadow-ink: 72%;
  --ui-shadow-y: var(--_tile-lift);
  --ui-active-shadow-y: 0px;
  --ui-active-translate-y: var(--_tile-lift);
}
```

**The two colour lines make the bar a shade.** `--intent-border` _is_ `--intent-color` for all six hue intents, so at a full `--ui-shadow-ink` the bar equals the plate exactly (`.btn.success` would print `#007a55` on `#007a55`, an sRGB distance of 0) and the press would read as the button spontaneously shortening. Lowering the ink alone does not rescue it, because the other end of the mix is `--elevation-color`, which the theme declares as `rgb(15 23 42 / 0.08)`: the mix runs toward something nearly transparent, composites against the page, and the bar comes out _lighter_ than the plate. Naming the depth colour opaque points the same mix at black, and one value darkens on both palettes -- `#007a55` on `#004c34`, `#e17100` on `#914600`, `#4f39f6` on `#30219f`.

That is also the answer to "which token darkens a shadow": `--elevation-color` is the base the ink mixes toward, so an aesthetic names its own depth colour and `--ui-shadow-ink` says how far the intent walks away from it. No second token, and no nested `color-mix()` -- nesting two is what [`--ui-shadow-edge`](#material-tokens) found WebKit resolving as though the percentage were zero.

`--ui-shadow-ink` generalizes to "a shade of whatever this thing already is". An amount is a plain percentage carrying no intent, so it inherits safely and the mix happens where the intent lives. It is a base colour plus an amount of the component's own ink; an aesthetic wanting a third colour under there declares `--ui-surface-shadow` or its own `box-shadow`, which is Tier 2 and says so.

Depth in that aesthetic is not uniform, and it does not have to be: the promo panel that should not sit on a slab carries `.flat`, and the aesthetic never learns about it.

```html
<div class="card soft edgeless info flat">Promo panel, deliberately flat</div>
```

Eight tokens and no component modified. The result holds across intents: a success button sits on a dark green edge, a neutral card on a dark gray one, a selected `.soft.edged.info` card on a dark blue one -- because the shadow composes against each component's own intent at the component, not at the container.

Uppercase actions are not part of it. Casing is how a label is worded, and silently recasing one breaks acronyms, proper nouns, and the case rules of languages the package does not get to know about. Weight and tracking carry the same emphasis and are material.

### Where this leaves native elements

Tier 1 reaches a bare `<button>` because tokens travel through the cascade, and because `native.css` maps the element to the same utility the class carries. An aesthetic staying in Tier 1 works everywhere. An aesthetic writing its own selector list works wherever it remembered to look, which is the cost of writing one and the reason to prefer a slot.

## Direction

A component's own left/right is written as a logical property -- `inset-inline-start`, `border-inline-start-width`, `ps-*`/`border-s` and their Tailwind equivalents -- so it mirrors under `dir="rtl"` for free, with no opt-in class. `transform-origin` and `translate` have no logical form; a component whose geometry depends on one mirrors it explicitly under `:dir(rtl)` instead.

This does not apply to a class or attribute that is itself a direction choice an author makes on purpose, such as a tooltip's `data-tooltip-position`. Those name a visual side, not a text direction, and stay physical.

## References

- [Roadmap](./roadmap.md)
- [Tests](./tests.md)
- [Generated palette](./generated-palette.md)
- [Accessibility](../accessibility.md)
