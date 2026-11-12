---
title: Aesthetics
description: The six optional looks, what each one changes about a component, its knobs, and its limits.
order: 6
---

# Aesthetics

The settings screen has your colors. An aesthetic changes what its components are made of: the corners, the thickness of the borders, the shadow, and the shape. Put `.neobrutalism` on the `<main>` of the settings screen and every card, button, field, and badge in it gets square corners, a thick outline in the ink color, and a hard offset shadow, while keeping its colors. This page shows how to add one, then describes each of the six: what it changes, the number you can tune, and where it behaves differently from the default look.

## Add an aesthetic

Aesthetics ship in a separate entrypoint, so load it next to the stylesheet:

```css
@import "@codenhub/styles";
@import "@codenhub/styles/aesthetics";
```

Load order does not matter: the aesthetic classes sit in the `components` cascade layer, and every entrypoint declares the layer order before it uses one, so an aesthetic imported before the base stylesheet wins exactly as one imported after it. See [Setup → Cascade layers](../setup.md#cascade-layers).

Then put the class on any element. Unlike intent, an aesthetic passes down: everything inside the element takes it.

```html
<main class="neobrutalism stack">
  <section class="card stack" aria-labelledby="profile-title">…</section>
  <section class="card soft destructive stack" aria-labelledby="danger-title">
    …
    <button class="btn destructive" type="button">Delete account</button>
  </section>
</main>
```

The danger zone keeps its red: under neobrutalism its outline and shadow are red too, because this aesthetic draws them in the component's own intent. To load one aesthetic instead of all six, import it by name, such as `@codenhub/styles/aesthetics/neobrutalism`; [Setup → All entrypoints](../setup.md#all-entrypoints) lists them.

| Class           | Look                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `.neobrutalism` | No radius, a thick ink outline, a hard unblurred offset shadow, and a press that moves the element into it.                     |
| `.glass`        | Translucent surfaces over a blurred backdrop with a hairline highlight edge.                                                    |
| `.pixel`        | Corners cut by one grid unit, a chunky outline drawn as an inset ring, and the consumer-supplied `--font-pixel` over monospace. |
| `.chunky-tile`  | Rounded tiles seated on a darker bar of their own color, with a press that moves the element down into its own bar.             |
| `.cyber`        | Beveled corners, a thin bright edge, and a glow in the component's own color.                                                   |
| `.sketch`       | Varying elliptical corners, a solid ink line with dashed accents, a small offset shadow, and an optional handwriting face.      |

Aesthetics work with every fill and edge combination. `.ghost.edgeless` removes the fill and the border, so on a component whose aesthetic shows only through those and its shadow, little of the aesthetic is left; that is intended.

A presentation class on the element still wins over the aesthetic's defaults. The aesthetic sets how thick the border is; presentation decides whether it is drawn.

An aesthetic class on a component wins over one inherited from a container. This includes tooltip bubbles: `.tooltip-bubble.glass` gets the complete glass bubble under a pixel ancestor, and `.tooltip-bubble.pixel` gets the complete stepped bubble under a glass ancestor.

Your own CSS wins over an aesthetic. The aesthetic classes sit in the `components` cascade layer, so a rule in your own unlayered stylesheet beats them, and so does a Tailwind utility on the same element, such as `font-mono` on a `.pixel` region or `[--ui-radius:0]` on a `.cyber` one. See [Setup → Cascade layers](../setup.md#cascade-layers).

Most aesthetics scale from one number you can set, such as the offset of the neobrutalism shadow or the size of a pixel. These are the aesthetic's knobs, and each section below names its own. [Customizing → Aesthetic tokens](./customizing.md#aesthetic-tokens) explains where they can be set.

To paint an aesthetic onto an element from another library, such as a toast or a dialog, use its [solo class](./solo.md).

## Neobrutalism

The shadow is cast in the component's own intent, so a success button throws a green shadow and a destructive card a red one. With no intent, the outline and the shadow are the ink: near-black on a light page and near-white on a dark one. Fields and toggles are the exception. They draw the theme's control border, as they do with no aesthetic, because a resting checkbox outlined in near-black would look as loud as a checked one. The same holds under pixel, cyber, and sketch.

`--neo-offset` is the knob: the shadow offset and the distance the press travels are the same number, so scaling the look scales both at once.

```html
<section class="neobrutalism" style="--neo-offset: 6px">
  <button class="btn primary">A deeper shadow</button>
</section>
```

**Exceptions:**

- Content chips take the aesthetic too. A `.kbd` key cap's border changes from the quiet border gray to the ink, and from 1px to 2px, like every other border. A `.code` or `.pre` has no border by default, so it gets none; add `.edged` to give one an ink border.
- Only `.btn` and an opted-in `.card` respond to hover and press. A card opts in with `.interactive`, or with one of its halves — `.hoverable` for the hover response alone, `.pressable` for the press alone; a plain card, an alert, or a panel is a container and stays put.
- An alert sits on the offset shadow under this aesthetic, and under no other. An alert is otherwise flat, but here the shadow is a second outline rather than depth, and an alert without it looks unfinished next to everything else. This includes an alert inside a nested `.neobrutalism` region, and an alert that carries the class itself, `.alert.neobrutalism`. `.flat` still removes it and `.floating` still doubles it.
- The tooltip trigger takes the zero corner like everything else and draws square; `.radio` keeps its circle.
- Under `prefers-reduced-motion: reduce` the press still happens, but at once: the element lands in its shadow without travelling there. The press is the feedback that a click registered, so only its motion goes.
- It has no font of its own and sets the theme's, `--font-default`, on the region, so a neobrutalist region nested inside pixel, cyber, sketch, or chunky tile does not take their face. A font you set with `font-family` alone, on `body` or a container, does not reach inside the region; set it in `--font-default` too, as [Theming → Fonts](./theming.md#fonts) describes.

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
- Under `prefers-reduced-transparency: reduce`, and in forced colors, glass surfaces drop the blur and become opaque. Forced colors replace the colors but keep their transparency, so without this a pane would show the page through the system's background.
- Buttons and an opted-in `.card` press with the plain `scale(0.97)`; under reduced motion the press still happens, at once.
- It has no font of its own and sets the theme's, `--font-default`, on the region, as neobrutalism does.
- Text controls and toggles draw their line in the page's ink at 55% rather than the white hairline, which would erase an unchecked checkbox on a light page. It is `--ui-control-ink`; set it on the region to choose another.
- A table's frame and rules draw the page's ink at 20%, because the hairline vanishes on the table's plate. It is `--ui-rule-ink`.
- A table with a `<caption>` blurs behind the caption as well as its rows in Chromium and Safari, whose table box includes the caption, and under `.glass-liquid` the rim and sheen frame the caption too. Firefox keeps the caption off the pane. Label the table from a heading outside it with `aria-labelledby` where that matters.

### Liquid glass

`.glass-liquid` is a modifier of glass, after Apple's Liquid Glass: continuous corners, a bright rim where light catches the pane, a lighter blur, a clearer ground, and a lens that bends what is behind a surface at its edges. Put it beside `.glass` on the region, or on one surface inside a glass region.

```html
<section class="glass glass-liquid">
  <div class="card">A pane that bends the page behind it</div>
</section>
```

The lens is drawn by an SVG filter in `backdrop-filter`, which Chromium renders and Firefox and Safari do not yet. Elsewhere the pane keeps everything but the lens: the rim, the blur, the ground, and the corners, round rather than continuous where `corner-shape` is not drawn. Nothing needs to be in your markup: the filter ships inside the stylesheet.

**Exceptions:**

- It reaches `.card`, `.panel`, `.alert`, `.surface`, the tooltip bubble, a component of your own built with `@apply surface`, and a default or `.soft` `.data-table`. Controls stay solid, as they do under glass, except a button that asks: see [Liquid buttons](#liquid-buttons).
- It draws its blur and lens on each surface's `::before` and `::after`, so a surface inside a liquid region cannot carry a `::before` or `::after` of your own. Each surface also becomes a positioned stacking context; a surface you position yourself keeps your placement.
- Anything else that frosts under glass keeps liquid's light blur and its clearer ground, without the lens or the rim: a bare `<table>` under `/native`.
- The lens is 8px of erosion blurred over 10px on every surface, and 3px blurred over 3.5px on a button; its strength is fixed. A filter cannot read a custom property, so neither is a knob. The corners are, through `--glass-radius` and `--glass-radius-surface`, with larger defaults: a continuous corner reads smaller than a round one of the same radius.
- The nearest region decides. A region of another aesthetic nested inside a liquid region, or of plain `.glass`, keeps its own material and takes no layers, and a liquid region nested again inside that takes them back.
- Without `.glass` in scope it changes the corners and nothing else.
- Under `prefers-reduced-transparency: reduce`, and in forced colors, the blur and the lens go and the surface is opaque, as under glass.
- Text sits over a clearer pane than under glass. Over busy content, check that your text still reads: the ground is 30% of the page color, where glass's is 45%.

#### Liquid buttons

A button is a liquid pane when it carries `.glass-liquid` itself, inside a glass region. The modifier on the region alone leaves every button solid: a blur and a lens under each control of a dense toolbar cost two composited layers apiece and read as noise, so the one button that is meant to be glass says so.

```html
<section class="glass glass-liquid">
  <button class="btn primary">Solid, like every control</button>
  <button class="btn ghost glass-liquid">A clear pane</button>
  <button class="btn soft success glass-liquid">A tinted pane</button>
</section>
```

- The fill is still [presentation's](./composing.md#presentation). `.ghost` is the clear pane and `.soft` the tinted one; a `.solid` button keeps its opaque plate and takes the rim and sheen over it. Intent, size, `.pill`, `.icon`, hover, and press all work as on any button.
- It works in a plain `.glass` region too, and on a button inside a liquid card.
- It spends the button's `::before` and `::after`, so a liquid button cannot carry one of your own.
- A disabled liquid button keeps the ground and the rim and loses the blur and the lens: it is dimmed with `opacity`, which cuts its layers off from the page behind it.
- The label sits over whatever is behind the button. Over busy content, check that it still reads, or use `.solid`.
- It reaches `.btn`, and a bare `<button>` only through its `.btn` class: the layers are a list of classes, which `/native`'s element mapping does not join.

## Pixel

`--pixel-unit` is one pixel of the imaginary low-resolution grid, `4px` by default. One square unit is cut from each corner and the outline is one unit thick, so the cut and what covers it are the same size.

```html
<section class="pixel" style="--pixel-unit: 6px">
  <button class="btn primary">Chunkier</button>
</section>
```

**Exceptions:**

- Corners are one unit or nothing. Small chips are square instead of stepped: badges, key caps, inline code, checkboxes, and switches. One unit off each corner of a 24px badge would look like a bite, not a corner.
- Surfaces are square too: a `.card`, `.panel`, or `.alert` keeps the inset ring but takes no cut and clips nothing. A clip would cut everything inside it, so a tooltip in a card, a shadow, or a focus ring there would be trimmed.
- Tables, progress bars, and skeletons are square too. A table takes no cut because in Chromium and WebKit its box includes its caption, and the cut would land on the caption instead of the rows. Progress bars and skeletons take only the square corner.
- A `.pre` code block is stepped like a button. It has no border by default, so the cut shows with no outline around it.
- The outline is an inset ring, because a clip removes a real border — and the focus ring, for the same reason, is a second inset layer rather than an outline. Both are the element's own edge rather than a shadow, so the border answers `.edged` and `.edgeless` the way a border does: a `.edgeless` badge and a `.solid` button draw none, a `.edged` card draws one, and a field keeps one whatever a container asks for.
- The inset focus ring carries a 2px line of the page color inside it. The ring is the primary color, so on a `.solid.primary` button it would be drawn over its own color; the line is what shows there.
- In forced colors the ring and the cut both go, because the system removes every box shadow: components draw a real 2px border and square corners, and `.pixel-solo` an inward outline.
- `.radio` and `.tooltip-icon` are never stepped. The circle is what tells a radio from a checkbox at a glance, so a radio stays round. A stepped 20px tooltip trigger would look bitten, so it is a plain square.
- `--font-pixel` is yours to supply. The package ships no font binary, so the aesthetic has no network side effect and falls back to the monospace stack.
- Whether digits are easy to read depends on the font you pick. At small sizes, such as page numbers, counters, and badges, some pixel fonts draw `2` and `8`, or `3` and `9`, so alike that they are misread. The CSS cannot fix that. Where small numbers matter, choose a font with clearly different digits.

## Chunky tile

Rounded tiles seated on a darker bar of their own color, pressed flat on click. The look mobile learning and game apps use; it is named for what it is made of rather than for any one product.

`--tile-lift` is how deep the bar is and how far a press travels, `4px` by default. One number drives both, so the top edge drops by exactly the bar's depth and the bottom edge does not move. `--tile-radius` is the corner, `0.75rem`, and it is one value rather than a control/surface pair on purpose — the shared corner is what makes a button and the card it sits in read as the same object.

```html
<section class="chunky-tile" style="--tile-lift: 6px; --tile-radius: 0.5rem">
  <button class="btn success">Continue</button>
</section>
```

The bar is a darker shade of the element's own color rather than a shadow under it, so it follows every intent: a success button sits on a dark green edge, a destructive one on a dark red edge, and a plain card on a gray edge that matches the line it already draws. Measured on the light palette, `.btn.success` is `#007a55` on `#004c34`. On a dark page a near-black surface cannot go darker, so its bar lands lighter and reads as a rim.

**Exceptions:**

- Only buttons and cards sit on a bar, because they are the components resting above zero elevation. A badge, chip, field, or tooltip is flat until it asks for depth with `.raised`, and `.flat` takes the bar off anything:

  ```html
  <div class="card soft edgeless info flat">Promo panel, deliberately flat</div>
  ```

- `--font-rounded` is yours to supply. A heavy rounded grotesque is most of this look and the package ships no font binary, so with nothing supplied the page's own stack is used.
- Labels are drawn heavier and slightly tracked, through `--ui-label-weight` and `--ui-label-tracking`, so your own `font-*` or `tracking-*` utility still wins. It reaches `.btn` and `.badge`, and a bare `<button>` only where `/native` styles it. Casing is left alone: how a label is worded is the application's decision, so if you want uppercase buttons, write that rule in your own stylesheet.
- `.card.interactive` presses like a `.btn`, so a chunky answer tile drops onto its bar on click; `.card.pressable` gets the same press on its own. A plain `.card` stays put.
- The shipped `.primary` is near-black on a light page and near-white on a dark one, and the bar is always mixed toward black. On a light page, a primary button's bar is almost invisible against its near-black face (measured `1.04:1`). On a dark page, the near-white face against the same bar reads well (`2.48:1`). Give `.primary` a hue of its own if it is the call to action and needs the depth cue in both themes.
- Under `prefers-reduced-motion: reduce` the press still happens, but at once, as under neobrutalism.
- Depth in this aesthetic is the bar, never a blurred drop shadow. Anything that rests flat sits flush on the page.
- Controls draw a heavier gray than the tiles around them, `neutral-600` in light and `neutral-400` in dark, through `--ui-control-ink`, so a field reads as a field inside a tile.

## Cyber

Beveled corners, a 1px edge, and a glow in the component's own color: a success button glows green, a destructive card red. The bevel is drawn with `corner-shape`, so the border, the glow, and the focus outline all follow the cut rather than being clipped by it.

Controls and surfaces take the cut on opposite diagonals, so a button and the card around it read as the same material and as different things: buttons and fields cut top-left and bottom-right, cards, panels, and alerts top-right and bottom-left. Anything fully round cuts to points: a radio, a switch knob, and the tooltip icon become diamonds, and a pill button or a badge becomes a pointed hexagon. Chips go square, so the checkbox reads as a plain square beside the diamond radio.

`--cyber-cut` is the cut at the default size, `0.625rem`. Controls scale it with their size step, so a `.p-xs` icon button takes half of it and keeps its corners, and it stays a true 45 degrees. `--cyber-shape` and `--cyber-shape-surface` replace the default placement with any `border-radius` value, used as written. `--cyber-glow` is the glow's blur, `8px`. `--cyber-ink` is the neutral line and glow color. By default it follows the theme, near-black on a light page and near-white on a dark one; set it for a neon neutral.

```html
<section class="cyber" style="--cyber-ink: rgb(0 229 255); --cyber-cut: 0.75rem">
  <button class="btn">Open terminal</button>
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
- The glow is a halo, not depth, so every component takes it, fields, badges, and alerts included, and `.flat` does not take it off. `.raised` and `.floating` add no shadow under this aesthetic.
- In the light theme the glow of a neutral or `.primary` component is its near-black ink, which reads as a soft shadow rather than as light. The look is at its strongest on a dark page, or with a hued `--cyber-ink`.
- A plain `.btn.icon` is a square control, so it takes the control diagonal; a `.btn.icon.pill` is round, so it becomes a diamond.
- `--font-cyber` is yours to supply. The package ships no font binary, so the aesthetic falls back to the monospace stack.
- Casing is left alone, for the reason [Chunky tile](#chunky-tile) gives.

## Sketch

Hand-drawn outlines: controls take long, uneven elliptical corners, and cards, panels, alerts, and tables take sharper ones that stay clear of their padding. Siblings rotate through four outlines by position, and a field's control takes its field's position, so a row of buttons or a stacked form does not repeat one shape. The rotation is stable for a given DOM order, not random on each render. Every outline is a complete `border-radius`, used as written rather than scaled by the size step or placed by `.cut-diagonal`.

The 1px ink line is solid; checkboxes, dividers, and table rules are dashed. `--ui-line-style: dashed` dashes any other component, and `--ui-rule-style: solid` puts a divider or table back to solid. The 2px hard shadow is a small neutral depth cue.

`--sketch-radius`, `--sketch-radius-surface`, and `--sketch-radius-pill` replace the control, surface, and pill-button outlines. Set one on the region or on any element inside it, and every position below takes that one outline. To shape a single component instead, set `--ui-radius` (`--ui-radius-surface` on a surface) on it.

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

- Sketch names components to rotate their outlines, so its outlines reach only this package's components; a region of another aesthetic nested inside a sketch region keeps that aesthetic's corners. The nearest region decides, so a sketch region nested again inside that one rotates.
- Chips, such as checkboxes, key caps, code, badges, switches, and progress bars, rotate through small uneven outlines set in `--ui-radius-tight`. Set that token on a chip to choose its shape.
- A `.btn.pill` takes a rounded pill bounded to its own height, so a wide one does not become an oval. Badges, progress bars, and switches take their chip outline. Radios and the tooltip icon stay circles, slightly uneven, so a radio is never mistaken for a checkbox. An explicit `--ui-radius-pill` on an element still wins.
- `--font-sketch` is yours to supply. The package ships no handwriting font and falls back to the platform `cursive` family.
- Buttons press with the plain `scale(0.97)`; under reduced motion the press still happens, at once.
- With [`/native`](../setup.md#classless-html), a plain `<hr>`, `<table>`, and checkbox take the dashed accents of `.divider`, `.data-table`, and `.checkbox`.
- Forced-colors mode draws the dashed accents solid, like every other material line.

## Solo classes

An aesthetic class changes nothing on an element this package does not style, such as a toast from another library. Each aesthetic also ships a solo class, such as `.glass-solo`, that paints its look onto that one element. [Solo classes](./solo.md) covers them.

## Next

[Solo classes](./solo.md) applies these looks to components from other libraries. If every component on your screen comes from this package, the guides end here: [Composing](./composing.md), [Customizing](./customizing.md), and [Content and layout](./content-and-layout.md) are the lookup pages, and [Accessibility](../accessibility.md) lists what your application still owes its users.
