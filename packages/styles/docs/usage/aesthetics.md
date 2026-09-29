---
title: Aesthetics
description: The six shipped aesthetics in depth, their solo classes, and their documented exceptions.
order: 4
---

# Aesthetics

An aesthetic decides what a component is _made of_: its radius, border thickness, shadow, and shape. Aesthetics ship from opt-in entrypoints, so importing the stylesheet is what makes the classes available:

```css
@import "@codenhub/styles";
@import "@codenhub/styles/aesthetics";
```

Load order does not matter: the aesthetic classes sit in the `components` cascade layer, and every entrypoint declares the layer order before it uses one, so an aesthetic imported before the base stylesheet wins exactly as one imported after it. See [Setup → Cascade layers](../setup.md#cascade-layers).

Like presentation, an aesthetic class cascades to any subtree:

```html
<section class="neobrutalism">
  <button class="btn primary">Thick ink and a hard shadow</button>
  <div class="card destructive">The intent still wins over the aesthetic ink</div>
</section>
```

| Class           | Look                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `.neobrutalism` | No radius, a thick ink outline, a hard unblurred offset shadow, and a press that moves the element into it.                     |
| `.glass`        | Translucent surfaces over a blurred backdrop with a hairline highlight edge.                                                    |
| `.pixel`        | Corners cut by one grid unit, a chunky outline drawn as an inset ring, and the consumer-supplied `--font-pixel` over monospace. |
| `.chunky-tile`  | Rounded slabs seated on a darker shade of themselves, with a press that moves the element down into its own bar.                |
| `.cyber`        | Bevelled corners, a thin bright edge, and a glow in the component's own colour.                                                 |
| `.sketch`       | Varying elliptical corners, a solid ink line with dashed accents, a small offset shadow, and an optional handwriting face.      |

Aesthetics compose with every supported fill and edge pair. `.ghost.edgeless` intentionally removes the visible material traits from components whose aesthetic is expressed only through their fill, edge, or elevation.

An explicit presentation on the element still wins over the aesthetic's defaults. The aesthetic supplies edge thickness; presentation only decides whether that edge is drawn.

An aesthetic directly on a component likewise wins over an inherited aesthetic. This includes tooltip bubbles: `.tooltip-bubble.glass` gets the complete glass bubble under a pixel ancestor, and `.tooltip-bubble.pixel` gets the complete stepped bubble under a glass ancestor.

Your own CSS wins over an aesthetic. The aesthetic classes sit in the `components` cascade layer, so a Tailwind utility on the same element -- `font-mono` on a `.pixel` region, `[--ui-radius:0]` on a `.cyber` one -- or a rule in your own unlayered stylesheet beats them. See [Setup → Cascade layers](../setup.md#cascade-layers).

Each aesthetic that scales from one number publishes it as a knob — see [Customizing → Aesthetic tokens](./customizing.md#aesthetic-tokens) for how knobs resolve and where they can be set. This page covers what each aesthetic looks like and where it makes documented exceptions.

## Neobrutalism

The shadow is cast in the component's own intent, so a success button throws a green shadow and a destructive card a red one. With no intent, both the outline and the shadow use the ink, which follows the theme rather than the palette.

`--neo-offset` is the knob: the shadow offset and the distance the press travels are the same number, so scaling the look scales both at once.

```html
<section class="neobrutalism" style="--neo-offset: 6px">
  <button class="btn primary">A longer throw</button>
</section>
```

**Exceptions:**

- Content chips are left alone. A `.kbd`, `.code`, or `.pre` is content rather than structure, and an ink edge on one reads as a defect: a key cap keeps the quiet border color and a code chip keeps no border at all.
- Only `.btn` and an opted-in `.card` respond to hover and press. A card opts in with `.interactive`, or with one of its halves — `.hoverable` for the hover response alone, `.pressable` for the press alone; a plain card, an alert, or a panel is a container and stays put.
- An alert rests on the slab under this aesthetic and nowhere else. Here the slab is a second ink line rather than depth, and an alert is the only container the package rests flat, so without it a neobrutalist alert is the one box on the page that reads as unfinished. It is a resting default, so `.flat` still takes it off and `.floating` still doubles it.

## Glass

`.glass` needs something behind it to blur. On a flat page background it renders as a plain translucent panel.

`--glass-radius` and `--glass-radius-surface` are the corners, at `0.75rem` and `1rem`. Glass is rounder than the base geometry because a translucent panel with a tight corner reads as a cut-out rather than as a pane.

```html
<section class="glass" style="--glass-radius-surface: 1.5rem">
  <div class="card">Softer</div>
</section>
```

**Exceptions:**

- Every surface in a glass region is glass, a neutral `.card.soft`, `.panel`, and `.alert` included.
- The glass is the ground, not the fill. A presentation keeps its whole fill, so a `.solid` button, a checked toggle, and a `.solid` card or table are opaque; the default, `.soft`, and `.ghost` panes are the frosted ones.
- The blur applies to `.card`, `.panel`, `.alert`, the tooltip bubble, and a default or `.soft` `.data-table` only. Controls stay solid and sit on the glass: a blur under every control of a dense cluster costs a composited layer apiece and reads as noise. Controls still take the aesthetic's radius, border, and shadow.
- Under `prefers-reduced-transparency: reduce`, glass surfaces drop the blur and become opaque.
- Buttons and an opted-in `.card` press with the plain `scale(0.97)`; reduced motion turns it off.
- Text controls and toggles draw their line in the page's ink at 55% rather than the white hairline, which would erase an unchecked checkbox on a light page. It is `--ui-control-ink`; set it on the region to choose another.
- A table's frame and rules draw the page's ink at 20%, because the hairline vanishes on the table's plate. It is `--ui-rule-ink`.

### Liquid glass

`.glass-liquid` is a modifier of glass, after Apple's Liquid Glass: continuous corners, a bright rim where light catches the pane, a lighter blur, a clearer ground, and a lens that bends what is behind a surface at its edges. Put it beside `.glass` on the region, or on one surface inside a glass region.

```html
<section class="glass glass-liquid">
  <div class="card">A pane that bends the page behind it</div>
</section>
```

The lens is drawn by an SVG filter in `backdrop-filter`, which Chromium renders and Firefox and Safari do not yet. Elsewhere the pane keeps everything but the lens: the rim, the blur, the ground, and the corners, round rather than continuous where `corner-shape` is not drawn. Nothing needs to be in your markup: the filter ships inside the stylesheet.

**Exceptions:**

- It reaches `.card`, `.panel`, `.alert`, and the tooltip bubble. Controls stay solid, as they do under glass.
- It draws its blur and lens on each surface's `::before` and `::after`, so a surface inside a liquid region cannot carry a `::before` or `::after` of your own, and each surface becomes a positioned stacking context -- a surface you position yourself keeps your placement.
- The lens is 8px of erosion blurred over 10px at every size, and its strength is fixed. A filter cannot read a custom property, so neither is a knob. The corners are, through `--glass-radius` and `--glass-radius-surface`, with larger defaults: a continuous corner reads smaller than a round one of the same radius.
- A region of another aesthetic nested inside a liquid region, or of plain `.glass`, keeps its own material and takes no layers.
- Without `.glass` in scope it changes the corners and nothing else.
- Under `prefers-reduced-transparency: reduce` the blur and the lens go and the surface is opaque, as under glass; in forced colours the layers draw nothing.
- Text sits over a clearer pane than under glass. Over busy content, check that your text still reads -- the ground is 30% of the page colour, where glass's is 45%.

## Pixel

`--pixel-unit` is one pixel of the imaginary low-resolution grid, `4px` by default. One square unit is cut from each corner and the outline is one unit thick, so the cut and what covers it are the same size.

```html
<section class="pixel" style="--pixel-unit: 6px">
  <button class="btn primary">Chunkier</button>
</section>
```

**Exceptions:**

- Corners are one unit or nothing. Chips square instead of stepping — badges, key caps, code, checkboxes, and switches all read `--ui-clip-tight`, which this aesthetic sets to none, because one unit off each corner of a 24px badge is a bite rather than a corner. Tables, progress bars, and skeletons square too, each for its own reason: a table's `overflow: hidden` fights the clip and the corners square off where the two meet, and progress and skeleton never read a clip at all — a squaring aesthetic reaches them through `border-radius` alone. `.pre` is the one exception that steps: it carries no clip override, so it inherits the same polygon a button or a card gets, and with no border by default the cut shows with no ring around it.
- The outline is an inset ring, because a clip removes a real border — and the focus ring, for the same reason, is a second inset layer rather than an outline. Both are the element's own edge rather than a shadow, so the border answers `.edged` and `.edgeless` the way a border does: a `.edgeless` badge and a `.solid` button draw none, a `.edged` card draws one, and a field keeps one whatever a container asks for.
- The tooltip trigger and `.radio` are hardcoded past the clip rather than reached by it. `.tooltip-icon` forces `clip-path: none` because the docs call it a circular fixed identity, the same reason `.radio` forces it: the circle is the only thing telling it from a checkbox at a glance, and a stepped polygon would square either one.
- `--font-pixel` is yours to supply. The package ships no font binary, so the aesthetic has no network side effect and falls back to the monospace stack.
- Numeral legibility depends on the face you pick. At UI sizes -- pagination, counters, small badges -- some pixel/bitmap faces render lookalike digits such as `2`/`8` or `3`/`9` closely enough to misread at a glance; this is a property of the font, not something the aesthetic's CSS can correct. Prefer a face with clearly distinct digit shapes wherever small numeric text matters.

## Chunky tile

Rounded slabs sitting on a darker shade of themselves, pressed flat on click. The look mobile learning and game apps use; it is named for what it is made of rather than for any one product.

`--tile-lift` is how deep the bar is and how far a press travels, `4px` by default. One number drives both, so the top edge drops by exactly the bar's depth and the bottom edge does not move. `--tile-radius` is the corner, `0.75rem`, and it is one value rather than a control/surface pair on purpose — the shared corner is what makes a button and the card it sits in read as the same object.

```html
<section class="chunky-tile" style="--tile-lift: 6px; --tile-radius: 0.5rem">
  <button class="btn success">Continue</button>
</section>
```

The bar is a darker shade of the element's own colour rather than a shadow under it, so it follows every intent: a success button sits on a dark green edge, a destructive one on a dark red edge, and a plain card on a grey edge that matches the line it already draws. Measured on the light palette, `.btn.success` is `#007a55` on `#004c34`. On a dark page a near-black surface cannot go darker, so its bar lands lighter and reads as a rim.

**Exceptions:**

- Only what the registry rests above zero sits on a bar — buttons and cards. A badge, chip, field, or tooltip is flat until it asks for depth with `.raised`, and `.flat` takes the bar off anything:

  ```html
  <div class="card soft edgeless info flat">Promo panel, deliberately flat</div>
  ```

- `--font-rounded` is yours to supply. A heavy rounded grotesque is most of this look and the package ships no font binary, so with nothing supplied the page's own stack is used.
- Labels are drawn heavier and slightly tracked, through `--ui-label-weight` and `--ui-label-tracking`, so your own `font-*` or `tracking-*` utility still wins. It reaches `.btn` and `.badge`, and a bare `<button>` only where `/native` styles it. Casing is left alone: how a label is worded is the application's decision, so if you want uppercase buttons, write that rule in your own stylesheet.
- `.card.interactive` presses like a `.btn`, so a chunky answer tile drops onto its bar on click; `.card.pressable` gets the same press on its own. A plain `.card` stays put.
- The shipped `.primary` is a near-black-or-near-white monochrome depending on theme, and the bar mixes toward a fixed black regardless of theme. In light theme this leaves a primary button's bar almost invisible against its own near-black plate (measured `1.04:1`, 10 units of sRGB distance); in dark theme the near-white plate against the same black-anchored bar reads fine (`2.48:1`, 154 units). Give `.primary` a hue of its own if it is the call to action and needs the depth cue in both themes.
- Depth in this aesthetic is the bar, never a blurred drop shadow. Anything the registry rests flat sits flush on the page.
- Controls draw a heavier grey than the tiles around them -- `neutral-600` in light, `neutral-400` in dark -- through `--ui-control-ink`, so a field reads as a field inside a tile.

## Cyber

Bevelled corners, a 1px edge, and a glow in the component's own colour: a success button glows green, a destructive card red. The bevel is drawn with `corner-shape`, so the border, the glow, and the focus outline all follow the cut rather than being clipped by it.

Controls and surfaces take the cut on opposite diagonals, so a button and the card around it read as the same material and as different things: buttons and fields cut top-left and bottom-right, cards, panels, and alerts top-right and bottom-left. Anything fully round cuts to points -- a radio, a switch knob, and the tooltip icon become diamonds, a pill button or a badge a pointed hexagon -- and chips square, so the checkbox reads as a plain square beside the diamond radio.

`--cyber-cut` is the cut at the default size, `0.625rem`. Controls scale it with their size step, so a `.p-xs` icon button takes half of it and keeps its corners, and it stays a true 45 degrees. `--cyber-shape` and `--cyber-shape-surface` replace the default placement with any `border-radius` value, used as written. `--cyber-glow` is the glow's blur, `8px`. `--cyber-ink` is the neutral line and glow colour, which follows the theme by default -- near-black on light, near-white on dark -- and is where a neon neutral goes if you want one.

```html
<section class="cyber" style="--cyber-ink: rgb(0 229 255); --cyber-cut: 0.75rem">
  <button class="btn">Jack in</button>
</section>
```

Other shapes are a value away. Set them on the `.cyber` element or any ancestor. `--ui-radius` set on an element reaches that element and every component inside it that does not set its own. A shape you set is used as written and does not scale, so for a scaled one on a single control use `.cut-diagonal-reverse` instead.

| Shape                  | Value                 |
| ---------------------- | --------------------- |
| All four corners       | `0.625rem`            |
| The other diagonal     | `0 0.625rem`          |
| Hexagon (pointed ends) | `0.625rem / 50%`      |
| Parallelogram          | `0.625rem 0 / 100% 0` |
| One notch, top-right   | `0 0.625rem 0 0`      |

```html
<section class="cyber" style="--cyber-shape: 0.625rem / 50%">
  <button class="btn primary">Hexagonal buttons</button>
</section>
```

A parallelogram slants its sides into the content, so give a surface that takes one extra inline padding.

**Exceptions:**

- The bevel is Chromium-only today. Firefox and Safari do not draw `corner-shape` yet, and there the aesthetic squares its cut corners instead of rounding them, and what is fully round stays round, so the look degrades to square, lined, and glowing. It picks up the bevel with no change once an engine ships it.
- The glow is a halo, not depth, so every component takes it -- fields, badges, and alerts included -- and `.flat` does not take it off. `.raised` and `.floating` add no shadow under this aesthetic.
- In the light theme the glow of a neutral or `.primary` component is its near-black ink, which reads as a soft shadow rather than as light. The look is at its strongest on a dark page, or with a hued `--cyber-ink`.
- A plain `.btn.icon` is a square control, so it takes the control diagonal; a `.btn.icon.pill` is round, so it becomes a diamond.
- `--font-cyber` is yours to supply. The package ships no font binary, so the aesthetic falls back to the monospace stack.
- Casing is left alone, for the reason [Chunky tile](#chunky-tile) gives.

## Sketch

Hand-drawn outlines: controls take long, uneven elliptical corners, and cards, panels, and alerts take sharper ones that stay clear of their padding. Siblings rotate through four outlines by position, and a field's control takes its field's position, so a row of buttons or a stacked form does not repeat one shape. The rotation is stable for a given DOM order, not random on each render. Every outline is a complete `border-radius`, used as written rather than scaled by the size step or placed by `.cut-diagonal`.

The 1px ink line is solid; checkboxes, dividers, and table rules are dashed. `--ui-line-style: dashed` dashes any other component, and `--ui-rule-style: solid` puts a divider or table back to solid. The 2px hard shadow is a small neutral depth cue.

`--sketch-radius`, `--sketch-radius-surface`, and `--sketch-radius-pill` replace the control, surface, and pill-button outlines. Set one and every position takes that one outline. To shape a single component instead, set `--ui-radius` (`--ui-radius-surface` on a surface) on it.

```html
<section class="sketch" style='--font-sketch: "Comic Sans MS", cursive'>
  <button class="btn primary">Send note</button>
  <button class="btn ghost edged" style="--ui-line-style: dashed">Draft note</button>
</section>
```

The dashed button is `ghost edged` because a filled button has no separate line to dash.

`.sketch-rounded` trades the long corners for short, rounded ones, bounded so a wide element keeps straight top and bottom edges. Put it beside `.sketch` on the region, or on one component inside it. `--sketch-radius-rounded` and `--sketch-radius-surface-rounded` are its knobs.

```html
<section class="sketch sketch-rounded">
  <div class="card">
    <button class="btn primary">Rounded action</button>
  </div>
</section>
```

**Exceptions:**

- Sketch names components to rotate their outlines, so its outlines reach only this package's components; a region of another aesthetic nested inside a sketch region keeps that aesthetic's corners.
- Chips -- checkboxes, key caps, code, badges, switches, and progress bars -- rotate through small uneven outlines through `--ui-radius-tight`. Set that token on a chip to choose its shape.
- A `.btn.pill` takes a rounded pill bounded to its own height, so a wide one does not become an oval. Badges, progress bars, and switches take their chip outline. Radios and the tooltip icon stay circles, slightly uneven, so a radio is never mistaken for a checkbox. An explicit `--ui-radius-pill` on an element still wins.
- `--font-sketch` is yours to supply. The package ships no handwriting font and falls back to the platform `cursive` family.
- Buttons press with the plain `scale(0.97)`; reduced motion turns it off.
- Forced-colours mode draws the dashed accents solid, like every other material line.

## Solo classes

An aesthetic class sets material tokens and nothing paints until a component reads them, so `.glass` on an element this package does not style -- a toast from another library, a dialog, a plain `<div>` on a page without the base stylesheet -- changes nothing. Each aesthetic also ships a solo class that paints its look directly onto the one element carrying it:

| Aesthetic       | Solo class           | Paints                                                                                                                                                                                                                               |
| --------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.glass`        | `.glass-solo`        | Translucent ground, hairline edge, blur, the tucked two-layer shadow, the surface corner. With `.glass-liquid`, the liquid pane on its `::before` and `::after`.                                                                     |
| `.neobrutalism` | `.neobrutalism-solo` | 2px ink edge, square corners, the hard offset slab.                                                                                                                                                                                  |
| `.pixel`        | `.pixel-solo`        | The stepped silhouette, the inset ring in place of a border, the pixel font.                                                                                                                                                         |
| `.chunky-tile`  | `.chunky-tile-solo`  | The tile corner, 2px edge, the bar under it, the rounded font.                                                                                                                                                                       |
| `.cyber`        | `.cyber-solo`        | The surface diagonal (the control one on an action), 1px edge, the glow, the font.                                                                                                                                                   |
| `.sketch`       | `.sketch-solo`       | Uneven elliptical corners (sharp surface outline on a pane, expressive control outline on an action; subtle rounded contours when paired with `.sketch-rounded`), a 1px solid ink line, the 2px offset shadow, the handwriting face. |

```css
/* The only stylesheet from this package on the page. */
@import "@codenhub/styles/aesthetics/glass";
```

```html
<div class="toast glass-solo">A pane over whatever is behind it.</div>
```

A solo class ships in the same entrypoint as its aesthetic, and needs nothing else loaded:

- **It paints material, not colour.** Edge, corner, depth, silhouette, backdrop, font, and press. No intent, no fill amount, no hover tint -- the element has no presentation to compose. Glass's translucent ground is the one fill, because it is glass's material.
- **It reads its aesthetic's knobs and the theme's tokens, with the shipped values as fallbacks.** `--glass-radius-surface`, `--neo-offset`, `--pixel-unit`, `--tile-lift`, `--tile-radius`, `--cyber-cut`, `--cyber-shape`, `--cyber-shape-surface`, `--cyber-glow`, `--cyber-ink`, `--sketch-radius`, `--sketch-radius-surface`, `--sketch-radius-rounded`, `--sketch-radius-surface-rounded`, and the font knobs (including `--font-sketch`) all work, set on the element or any ancestor. With the theme loaded it follows it; without it, it renders the shipped look.
- **It ignores the aesthetic around it.** It reads no `--ui-*` or `--elevation-color`, so a `.glass-solo` inside a `.pixel` region keeps its corners. The elevation modifiers do not reach it either.
- **It beats a foreign component's own styles.** The rules are unlayered and one class deep, so they win over a component's zero-specificity or layered rules wherever the two load. The flip side is that a Tailwind utility on the same element (`rounded-none`) loses to it: tune a solo class through its knobs.
- **It presses only an action.** Neobrutalism, chunky tile, and cyber press a `button`, `a[href]`, `[role="button"]`, `summary`, or button-type `input` that is not disabled; a container stays put, so a toast does not sink when clicked. Reduced motion drops the movement. Chunky tile's heavier label follows the same rule.
- **Dark values need a colour scheme.** Light and dark pairs are `light-dark()`, which follows the element's `color-scheme`. The package theme sets it; a page without it gets the light values.

Do not put a solo class on this package's own components. On a `.card` it would replace the composed fill, edge, and intent with material alone; use the aesthetic class there.
