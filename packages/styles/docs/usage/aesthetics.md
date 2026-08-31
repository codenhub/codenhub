---
title: Aesthetics
description: The four shipped aesthetics in depth, including their documented exceptions.
---

# Aesthetics

An aesthetic decides what a component is _made of_: its radius, border thickness, shadow, and shape. Aesthetics ship from opt-in entrypoints, so importing the stylesheet is what makes the classes available:

```css
@import "@codenhub/styles";
@import "@codenhub/styles/aesthetics";
```

Import them after the base stylesheet. `.neobrutalism` and `.pixel` replace the neutral border color, and they do so at zero specificity, so source order is what lets them win.

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

Aesthetics compose with every supported fill and edge pair. `.ghost.edgeless` intentionally removes the visible material traits from components whose aesthetic is expressed only through their fill, edge, or elevation.

An explicit presentation on the element still wins over the aesthetic's defaults. The aesthetic supplies edge thickness; presentation only decides whether that edge is drawn.

An aesthetic directly on a component likewise wins over an inherited aesthetic. This includes tooltip pseudo-elements: `.tooltip.glass` gets the complete glass bubble under a pixel ancestor, and `.tooltip.pixel` gets the complete stepped bubble under a glass ancestor.

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

- The blur applies to `.card`, `.panel`, `.alert`, and the tooltip bubble only. Controls stay solid and sit on the glass: a blur under every control of a dense cluster costs a composited layer apiece and reads as noise. Controls still take the aesthetic's radius, border, and shadow.
- Under `prefers-reduced-transparency: reduce`, glass surfaces drop the blur and become opaque.

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
- The tooltip trigger and `.radio` are hardcoded past the clip rather than reached by it. `.tooltip-icon` forces `clip-path: none`, since a stepped badge would clip its own bubble away with it. `.radio` forces the same, because the circle is the only thing telling it from a checkbox at a glance, and a stepped polygon would square it.
- `--font-pixel` is yours to supply. The package ships no font binary, so the aesthetic has no network side effect and falls back to the monospace stack.

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
- Action labels are drawn heavier and slightly tracked. Casing is left alone: how a label is worded is the application's decision, so if you want uppercase buttons, write that rule in your own stylesheet.
- `.card.interactive` presses like a `.btn`, so a chunky answer tile drops onto its bar on click; `.card.pressable` gets the same press on its own. A plain `.card` stays put.
- The shipped `.primary` is a near-black monochrome, which leaves a primary button's bar almost invisible against its own plate; give `.primary` a hue if it is the call to action.
- Depth in this aesthetic is the bar, never a blurred drop shadow. Anything the registry rests flat sits flush on the page.
