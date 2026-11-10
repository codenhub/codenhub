---
title: Customizing
description: Lookup for presentation and material tokens, aesthetic knobs, the six public component variables, the generated palette, and the helpers for building your own components.
order: 9
---

# Customizing

This is a lookup page for changing the package beyond its classes. [Theming](./theming.md) covers colors and the foundation tokens; this page covers the rest:

- [Presentation tokens](#presentation-tokens): how much of an intent a component shows.
- [Material tokens](#material-tokens): what a component is made of.
- [Aesthetic tokens](#aesthetic-tokens): the knobs each aesthetic exposes.
- [Component variables](#component-variables): the six variables a single component reads.
- [Generated palette](#generated-palette): fixed color values for code that cannot load the package.
- [Composition helpers](#composition-helpers): the classes to build a component of your own from.

## Presentation tokens

Presentation tokens describe _how much_ of an intent a component shows, never _which_ intent it shows. They are unitless numbers and percentages, so they carry no color and inherit safely: a container sets them once and every component below resolves them against its own intent.

| Token             | Purpose                                                                                             | Default                             |
| ----------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `--ui-fill`       | Percentage of the intent color mixed into the background.                                           | The component's default; see below. |
| `--ui-fg-on-fill` | Percentage blended from the intent's strong tone toward its contrast color.                         | The component's default.            |
| `--ui-border`     | Percentage of the intent's border color in the border.                                              | The component's default.            |
| `--hover-step`    | Added to the resting fill under the pointer, in `--intent-hover`. Set it on `:root` or any element. | `14%`                               |

Unset, each component uses its own default, listed in [Composing → Component defaults](./composing.md#component-defaults). The presentation classes set the first three to the values in [Composing → Presentation](./composing.md#presentation). There are no hover tokens per presentation: hover is always the resting fill plus `--hover-step`, up to 100%.

No fill class writes `--ui-border` and no edge class writes `--ui-fill`. A filled box with no line is `.solid.edgeless`, and `.solid.edged` renders the same box: the line fades out as the fill fills in, so even a neutral fill, capped and translucent, shows through its own border as one coat.

```css
background: color-mix(in oklab, var(--color-primary) var(--ui-fill, 100%), transparent);
```

Two choices there are deliberate. Mixing toward `transparent` rather than a background token lets a tinted surface adapt to whatever it is placed on. Mixing in `oklab` keeps the wide-gamut token palette intact and blends perceptually, where `srgb` would clip it.

A computed color therefore reaches the page as a resolved `color-mix` result rather than the token's own `oklch` syntax. It is the same color; code that compares computed color strings should compare colors instead.

> **Presentation token contract**: only presentation classes and consumer overrides set these tokens; components only read them. Setting a value that no presentation class produces is supported but unvalidated. See [Composing](./composing.md) for the classes that ship these values.

## Material tokens

Material tokens describe what a component is _made of_ rather than which intent it shows or how strongly. They control shape, borders, shadows, translucency, filters, and transforms.

Components read each with a fallback, so leaving them unset gives the default look. Set on a container, they restyle everything inside it. The one exception is `--ui-elevation`, which does not inherit, so it reaches only the element it is set on; see [Composing → Elevation](./composing.md#elevation).

Shadow geometry is split into parts with no color in them, so they inherit safely. Tokens that take a color, such as `--ui-ink` and `--ui-surface-shadow`, may include their own.

| Token                     | Purpose                                                                                                                                              | Fallback                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `--ui-corner`             | Control corner at the default size; scaled by the size step.                                                                                         | `--radius-control`                        |
| `--ui-corner-surface`     | Surface corner at the default padding; scaled by the size step.                                                                                      | `--radius-surface`                        |
| `--ui-corner-tl`          | `0` or `1`: whether the top-left takes the corner. `-tr`, `-br`, and `-bl` for the others.                                                           | `1`                                       |
| `--ui-radius`             | A complete control radius, used as written: overrides the corner, the step, and the pattern.                                                         | Computed from the corner                  |
| `--ui-radius-surface`     | A complete surface radius, used as written.                                                                                                          | Computed from the corner                  |
| `--ui-scale`              | Overrides the size step the size and padding classes set.                                                                                            | The step                                  |
| `--ui-corner-shape`       | What every corner draws: `round`, `bevel` for a straight cut, or `squircle` for a continuous curve. Chromium only today.                             | `round`                                   |
| `--ui-radius-pill`        | Corner for what is fully round by default: badges, switches, progress, the tooltip icon; `.btn.pill` and `.radio` read it with no fallback but full. | `--ui-radius`, `--ui-corner`, then full   |
| `--ui-radius-tight`       | Complete radius for chips, such as a checkbox, `.kbd`, or `.code`, when set. Unset, a small computed default.                                        | `min(--ui-radius or --ui-corner, small)`  |
| `--ui-line-style`         | Style of every line a component draws: `solid`, `dashed`, `dotted`, or `double` (3px wide or more).                                                  | `solid`                                   |
| `--ui-border-width`       | Edge thickness.                                                                                                                                      | `--border-width`                          |
| `--ui-border-max`         | Ceiling on computed edge width.                                                                                                                      | `100px`                                   |
| `--ui-ink`                | Neutral line color when no intent is set.                                                                                                            | `--color-border`                          |
| `--ui-control-ink`        | Neutral line color of fields, selects, checkboxes, radios, and switches when no intent is set.                                                       | `--ui-ink`, then `--color-control-border` |
| `--ui-rule-ink`           | Neutral line color of a table's frame and rules when no intent is set.                                                                               | `--ui-ink`, then `--color-border`         |
| `--ui-rule`               | Lines inside a table. Unset draws the head and foot boundaries only; `0%` draws none; `100%` rules every row.                                        | unset                                     |
| `--ui-shadow-x`           | Shadow horizontal offset.                                                                                                                            | `0px`                                     |
| `--ui-shadow-y`           | Shadow vertical offset.                                                                                                                              | `0px`                                     |
| `--ui-shadow-blur`        | Shadow blur radius.                                                                                                                                  | `0px`                                     |
| `--ui-shadow-spread`      | Shadow spread radius.                                                                                                                                | `0px`                                     |
| `--ui-shadow-inset`       | The `inset` keyword for an inner ring.                                                                                                               | Empty                                     |
| `--ui-hover-shadow-x`     | Shadow horizontal offset while hovered.                                                                                                              | `--ui-shadow-x`                           |
| `--ui-hover-shadow-y`     | Shadow vertical offset while hovered.                                                                                                                | `--ui-shadow-y`                           |
| `--ui-active-shadow-x`    | Shadow horizontal offset while pressed.                                                                                                              | `--ui-shadow-x`                           |
| `--ui-active-shadow-y`    | Shadow vertical offset while pressed.                                                                                                                | `--ui-shadow-y`                           |
| `--ui-active-transform`   | Transform while pressed. Kept under `prefers-reduced-motion`, which drops only its transition.                                                       | `scale(0.97)`                             |
| `--ui-active-translate-x` | Distance a press travels into the element's depth; `-y` beside it. Scaled like the shadow.                                                           | `0px`                                     |
| `--ui-shadow-ink`         | Percentage of shadow color taken from intent ink.                                                                                                    | `0%`                                      |
| `--ui-halo-blur`          | Blur of a halo around the element; `--ui-halo-spread` beside it. Elevation does not scale it.                                                        | `0px`                                     |
| `--ui-halo-ink`           | The halo's share of the intent color, over nothing. Unset, there is no halo.                                                                         | Unset                                     |
| `--ui-shadow-edge`        | Declared, even empty, when the shadow is the element's edge rather than its depth. Read for presence.                                                | Unset                                     |
| `--ui-elevation`          | Unitless multiplier over shadow geometry. Does not inherit.                                                                                          | `1`                                       |
| `--ui-surface-shadow`     | Complete multi-layer shadow accepted by surfaces only.                                                                                               | Unset                                     |
| `--ui-surface-ground`     | Ground a surface, or a default or `.soft` table, sits on.                                                                                            | `--color-background`                      |
| `--ui-bg-alpha`           | Multiplier over every fill, `.solid` included. No shipped aesthetic sets it.                                                                         | `1`                                       |
| `--ui-backdrop`           | Backdrop filter accepted by surfaces, and by a default or `.soft` table, only.                                                                       | `none`                                    |
| `--ui-surface-image`      | A painted layer over a surface's plate: any `background-image` value. Surfaces only.                                                                 | `none`                                    |
| `--ui-hover-transform`    | Transform while an interactive element is hovered.                                                                                                   | `none`                                    |
| `--ui-clip`               | Structural component silhouette.                                                                                                                     | `none`                                    |
| `--ui-clip-tight`         | Compact component silhouette.                                                                                                                        | `--ui-clip`                               |
| `--ui-focus-inset`        | Inset focus layer width.                                                                                                                             | Unset                                     |
| `--ui-label-weight`       | Label weight of `.btn` (and, with `/native`, a bare `<button>`) and `.badge`.                                                                        | Semibold on a button, bold on a badge     |
| `--ui-label-tracking`     | Label letter spacing. Unset, it is `normal`, so neither the page's tracking nor a container's reaches the label.                                     | `normal`                                  |
| `--ui-label-case`         | Label `text-transform`.                                                                                                                              | `none` on a button; inherited on a badge  |
| `--ui-label-shadow`       | Label `text-shadow`, written without a color so it takes the label's own.                                                                            | `none` on a button; inherited on a badge  |

```html
<section style="--ui-corner: 0; --ui-border-width: 3px">
  <button class="btn primary">Square and heavy</button>
  <input class="ipt" placeholder="Matches" />
</section>
```

> **Material token contract**: components read these; aesthetic classes and consumer overrides set them.

### Corner size and pattern

The corner scales with the element. `.p-xs` sets a size step of `0.5`, `.sm` and `.p-sm` `0.75`, and `.lg` and `.p-lg` `1.25`. When a size class and a padding class sit on one element, the smaller step wins, so `.lg.p-xs` is small. `box` multiplies `--ui-corner` by the step, so a small button takes a small corner and a bevel stays a true 45 degrees. Depth follows the step down but not up: a `.p-xs` button sits on half its aesthetic's shadow, and a `.lg` one on the whole of it. A press that travels into that depth, given as `--ui-active-translate-x` and `-y`, travels the same scaled distance, so it always lands flat.

Which corners take the corner is its own choice. `.cut-diagonal` keeps the top-left and bottom-right and squares the other two; `.cut-diagonal-reverse` keeps the other pair. Both set `--ui-corner-tl`, `-tr`, `-br`, and `-bl`, which you can also set yourself: a two-corner leaf on the default look, two cuts on a control under `.cyber`. A surface under `.cyber` keeps the aesthetic's own surface shape, which the pattern does not reach, and an explicit `--ui-radius` or `--ui-radius-surface` ignores the step and the pattern.

### Lines, layers, and labels

`--ui-line-style` reaches every line a component draws: the box's edge, the progress track, and dividers and table rules. `--ui-rule-style` optionally overrides just dividers and table rules, without changing the box edge; sketch uses it for dashed accents. A dashed or dotted line keeps its color, so it keeps its contrast. A `double` line needs a width of 3px or more to draw two lines.

`--ui-halo-*` is light rather than depth: a glow in the element's own intent color. Elevation does not scale it, and `.flat` leaves it on. It appears only when its ink is set.

`--ui-surface-image` lays any `background-image` over a surface's plate: cards, panels, alerts, and tooltips, not controls. Whoever sets it owns the contrast of the text over it, and your own `background-image` on a surface still wins.

`--ui-label-*` treats the label of a button or a badge: weight, tracking, case, and a text shadow. Write the shadow without a color, such as `0 0 6px`, so it takes the label's own color and cannot lower its contrast. Your own `font-*`, `tracking-*`, and case utilities still win. A label does not inherit tracking, so a `tracking-*` utility on a container leaves its buttons and badges at `normal`; to track every label in a region, set `--ui-label-tracking` on it, which they inherit.

Under forced colors each of these draws its plain version: a solid line, no halo, no painted layer, and no label shadow. The silhouette and the ring below go too. Forced colors remove every box shadow, so `--ui-clip`, `--ui-clip-tight`, `--ui-border-max`, and `--ui-shadow-edge` are cleared and a component draws its real border at `--ui-border-width`.

### Shape and ring composition

Clipping removes borders, outlines, and outer shadows. An aesthetic that uses a clip can replace the border with an inset shadow by setting `--ui-shadow-inset` and the four shadow geometry parts. Set `--ui-border-max: 0px` when that ring replaces the component border. Focusable components restore the clipped focus outline through `--ui-focus-inset`: an inset layer of that width in `--focus-ring`, with a 2px line of `--color-background` inside it so focus still shows on a component filled with the ring's own color.

A clip is not the only way to cut a corner. `--ui-corner-shape: bevel` draws the corner the radius sets as a straight cut instead of an arc, and the border, outer shadow, focus outline, and backdrop all follow it. A beveled element therefore keeps its glow and its line, where a clipped one loses both. `.cyber` uses it. Engines without `corner-shape` ignore it and draw the radius round, so an aesthetic that bevels should square its radius under `@supports not (corner-shape: bevel)`. A bevel on a full radius cuts to points: a radio, a `.btn.pill`, and anything reading `--ui-radius-pill` become diamonds or pointed hexagons.

`--ui-radius` accepts any `border-radius` value and is used as written, so it can place the corner per side: `10px 0` cuts only top-left and bottom-right. The pill and chip corners are separate tokens. An unset chip corner computes a small default from `--ui-radius`, then `--ui-corner`, capped at `--radius-small`; an explicit `--ui-radius-tight` is used as written, even for a per-corner or elliptical value. Aesthetic and consumer overrides can therefore give a chip a larger or more irregular shape. `.btn.pill` takes `--ui-radius-pill` ahead of the other radii; under sketch it takes an uneven hand-drawn pill outline whose ends stay the same size. An explicit `--ui-radius-pill` on that button still wins.

Declare `--ui-shadow-edge` when that ring _is_ the border. The ring then takes the element's edge color, which carries the edge axis as its alpha, so `.edged` draws it and `.edgeless` does not — the same answer a real border gives. Without it the ring paints on every component the aesthetic reaches and the edge classes have no effect. Use `--ui-shadow-ink` instead when the shadow is depth cast in the intent's own ink, such as a hard offset slab, which an `.edgeless` element still gets.

The token is read for its presence, not its value: declare it empty to switch the ring on, and `initial` to switch it back off in an aesthetic nested inside one that declares it.

```css
.stepped {
  --ui-clip: polygon(/* structural silhouette */);
  --ui-clip-tight: none;
  --ui-border-max: 0px;
  --ui-shadow-inset: inset;
  --ui-shadow-edge: ;
  --ui-shadow-x: 0px;
  --ui-shadow-y: 0px;
  --ui-shadow-blur: 0px;
  --ui-shadow-spread: 4px;
  --ui-focus-inset: var(--focus-ring-width);
}
```

Variables prefixed `--_` are internal composition outputs — `--_bg`, `--_fg`, `--_edge`, `--_fill`, `--_shadow`, and the `--_d-*` resting slots a component states for `box` to read. Do not set or read them; only the `--ui-*` inputs above are public.

## Aesthetic tokens

The shipped [aesthetic classes](./aesthetics.md) set material tokens for you. Only aesthetics with a token listed below expose an aesthetic-specific token. Tune all other behavior through the shared material tokens above. Listed tokens are available only where that aesthetic's stylesheet is imported.

| Token                             | Aesthetic                    | Purpose                                                                                         | Default                                                            |
| --------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `--neo-offset`                    | `.neobrutalism`              | Hard shadow offset and distance the press travels.                                              | `4px`                                                              |
| `--glass-radius`                  | `.glass`, `.glass-liquid`    | Control corner radius. `1rem` under `.glass-liquid`.                                            | `0.75rem`                                                          |
| `--glass-radius-surface`          | `.glass`, `.glass-liquid`    | Surface corner radius. `1.5rem` under `.glass-liquid`.                                          | `1rem`                                                             |
| `--pixel-unit`                    | `.pixel`                     | One pixel of the grid. The corner cut and the ring are one.                                     | `4px`                                                              |
| `--font-pixel`                    | `.pixel`                     | Consumer-supplied pixel font stack.                                                             | Falls back to the monospace stack                                  |
| `--tile-radius`                   | `.chunky-tile`               | Corner radius, on controls and surfaces alike.                                                  | `0.75rem`                                                          |
| `--tile-lift`                     | `.chunky-tile`               | Depth of the seated bar, and how far a press travels.                                           | `4px`                                                              |
| `--font-rounded`                  | `.chunky-tile`               | Consumer-supplied rounded font stack.                                                           | Falls back to the page stack                                       |
| `--cyber-cut`                     | `.cyber`                     | The cut at the default size, on controls and surfaces alike; controls scale it with the step.   | `0.625rem`                                                         |
| `--cyber-shape`                   | `.cyber`                     | Where controls take the cut: any `border-radius` value.                                         | `<cut> 0` (top-left, bottom-right)                                 |
| `--cyber-shape-surface`           | `.cyber`                     | Where surfaces take the cut: any `border-radius` value.                                         | `0 <cut>` (top-right, bottom-left)                                 |
| `--cyber-glow`                    | `.cyber`                     | Blur of the glow.                                                                               | `8px`                                                              |
| `--cyber-ink`                     | `.cyber`                     | Neutral line and glow color, where no intent sets one.                                          | Theme ink (near-black, near-white)                                 |
| `--font-cyber`                    | `.cyber`                     | Consumer-supplied technical font stack.                                                         | Falls back to the monospace stack                                  |
| `--sketch-radius`                 | `.sketch`                    | Control outline radius: any `border-radius` value.                                              | Irregular box outline with sibling variation                       |
| `--sketch-radius-surface`         | `.sketch`                    | Surface container outline radius: any `border-radius` value.                                    | Sharp irregular square outline with sibling variation              |
| `--sketch-radius-rounded`         | `.sketch`, `.sketch-rounded` | Rounded control outline radius: expressive elliptical contour with sibling variation.           | `26px 10px 24px 11px / 12px 23px 11px 20px` with sibling variation |
| `--sketch-radius-surface-rounded` | `.sketch`, `.sketch-rounded` | Rounded surface container outline radius: expressive elliptical contour with sibling variation. | `38px 16px 36px 17px / 16px 34px 17px 32px` with sibling variation |
| `--sketch-radius-pill`            | `.sketch`                    | Radius of a pill button's outline: an uneven hand-drawn pill whose ends stay the same size.     | `24px 16px 23px 17px / 17px 21px 16px 20px` with sibling variation |
| `--font-sketch`                   | `.sketch`                    | Consumer-supplied handwriting font stack.                                                       | Falls back to `cursive`                                            |

Every aesthetic's knobs reach the same way: each knob is _read_ with its default as a `var()` fallback rather than declared, so it resolves once into a private on the aesthetic's own class (`--_pixel-unit`, `--_neo-offset`, `--_tile-radius`, `--_tile-lift`, and so on). Set a knob on the element carrying the aesthetic class, or on any ancestor including `:root`:

```html
<section class="pixel" style="--pixel-unit: 6px">
  <button class="btn primary">Chunkier</button>
</section>
```

```html
<html class="pixel" style="--pixel-unit: 6px">
  <body>
    <button class="btn primary">Also chunkier, set from the root</button>
  </body>
</html>
```

Knobs and material tokens reach in opposite directions. A knob is read once, at the element with the aesthetic class, and the result passes down. So set a knob on that element or on one above it; set on an element inside the aesthetic, it changes nothing, because the value has already been read.

`--ui-radius` and the other material tokens are read by each component as it draws. They work on the element they are set on and everything inside it, which is how you round one card differently from its neighbors without touching the knob.

Shipped aesthetics set the shared material tokens above. Every shipped aesthetic sets `--ui-ink` for its neutral line. Every shipped aesthetic also sets `--ui-control-ink`: `.glass` and `.chunky-tile` to a line of their own, heavier than their surfaces', and the others to `--color-control-border`, since their ink is near-black or near-white and a resting checkbox outlined in it would look checked. `.glass` sets `--ui-rule-ink` too, so a table's lines read on its plate; the others clear it. Intent classes still override the intent slots on each component.

The same knobs tune each aesthetic's [solo class](./solo.md), which reads them on its own element.

## Generated palette

`@codenhub/styles/palette` is a generated stylesheet of fixed colors: for every intent and presentation, the background, text, and border color a component would draw, as flat `--palette-*` custom properties. It is for code that cannot load this package's stylesheet, such as a library that lists `@codenhub/styles` as an optional peer, but wants to match it. Where you can load the stylesheet, use the components instead.

**The values are a snapshot of the shipped colors.** They were computed from the package's default theme when it was built, and they do not change when you override a token. If you set `--color-primary` to your brand color, `--palette-primary-solid-bg` is still the shipped near-black. Code that must follow your theme has to read the `--color-*` tokens, which means loading `@codenhub/styles/theme`.

```css
@import "@codenhub/styles/palette";
```

```css
.my-badge {
  background: var(--palette-success-soft-page-bg);
  color: var(--palette-success-soft-fg);
  border-color: var(--palette-success-soft-page-edge);
}
```

Every value is a finished color, never a reference to another variable, so the file needs nothing else loaded.

Naming: `--palette-<intent>-<presentation>-<slot>`, where `<intent>` is one of the seven published intents (`neutral`, `primary`, `secondary`, `success`, `warning`, `destructive`, `info`) and `<presentation>` is `solid`, `soft`, or `ghost`. `<slot>` is `bg`, `fg`, or `edge`. Two qualifiers layer on only where they apply:

- A ground qualifier, `page` or `subtle`, before the slot. It appears only on the `bg` and `edge` of `.soft` and `.ghost`, because a `.solid` fill covers its ground and the text color never depends on it.
  - No qualifier is what `.badge` and `.btn` draw, on a transparent ground: `--palette-success-soft-bg`.
  - `page` is what `.alert` draws, on the page: `--palette-success-soft-page-bg`.
  - `subtle` is what `.kbd`, `.code`, and `.pre` draw, on the intent's own subtle tone: `--palette-success-soft-subtle-bg`.

  Each value is read from the component itself, so it includes what the component does on its own. A neutral `.alert`, `.kbd`, `.code`, or `.pre` keeps a quieter fill than a neutral `.badge`, and its `neutral-soft-page` and `neutral-soft-subtle` values say so. `.tooltip-bubble` matches none of the three: with no intent it fills with its own tooltip tone, and its edge is solid rather than faded.

- A `-hover` suffix, on `bg` and `edge` only, because the text color does not change on hover: `--palette-success-soft-page-bg-hover`. `.alert`, `.kbd`, `.code`, and `.pre` have no hover of their own, so their hover values are what the component draws when you add `box-hover` to it.

Light values are set on `:root`. Dark values apply under `.dark`, `.theme-dark`, or `[data-theme="dark"]` on the element or an element above it, the same selectors the package's theme uses. The light values also apply under `.light`, `.theme-light`, and `[data-theme="light"]`, so the nearest explicit theme wins: a light area inside a dark one reads the light values.

The file does not follow `prefers-color-scheme`. Code that uses the palette on its own already switches themes itself, so it sets one of those classes or attributes.

Three more tokens have no intent, presentation, ground, or hover: `--palette-border`, `--palette-surface`, and `--palette-text`, fixed values of `--color-border`, `--color-surface`, and `--color-text`. They are for things that are not intent-colored, such as a container's border, a dialog's background, and its text.

## Component variables

Six variables are read by a single component and are supported inputs. Every other variable a component declares, such as `--surface-padding`, `--field-gap`, `--switch-*`, `--table-*`, or `--quote-*`, is internal and may change in any release.

| Variable             | Element        | Value                        | Default                                                                 | Effect                                                                                                | Where to set it                                                                               |
| -------------------- | -------------- | ---------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `--progress-value`   | `.progress`    | A percentage, `0%` to `100%` | `0%`                                                                    | Width of the filled part. Not clamped; a value without `%` is invalid and shows empty.                | The bar, or any element around it.                                                            |
| `--progress-color`   | `.progress`    | A color                      | The intent color                                                        | Color of the filled part and of the `.active` shimmer.                                                | The bar, or any element around it.                                                            |
| `--progress-surface` | `.progress`    | A color                      | The intent color at the presentation's fill: 12% by default             | Color of the track.                                                                                   | The bar, or any element around it.                                                            |
| `--progress-edge`    | `.progress`    | A color                      | The intent's border color at the presentation's border: none by default | Color of the track's border. It shows only where the track has a border width, such as with `.edged`. | The bar, or any element around it.                                                            |
| `--input-group-gap`  | `.input-group` | A length                     | `0.5rem`                                                                | Space between the control and its icon or text.                                                       | The `.input-group` itself. The group declares the default, so a value on a parent is ignored. |
| `--tooltip-linger`   | `.tooltip`     | A time                       | `300ms`                                                                 | How long the bubble stays after the pointer leaves the trigger.                                       | The `.tooltip` itself. The wrapper declares the default, so a value on a parent is ignored.   |

```html
<div class="progress" role="meter" aria-label="Storage used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="92" style="--progress-value: 92%; --progress-color: var(--color-warning)"></div>

<div class="input-group" style="--input-group-gap: 0">
  <span>app.example.com/u/</span>
  <input class="ipt" id="profile-url" aria-label="Profile address" />
</div>
```

The examples in context are in [Feedback → Show progress](./feedback.md#show-progress), [Forms → Add an icon or a fixed prefix](./forms.md#add-an-icon-or-a-fixed-prefix), and [Tooltips → Hover, linger, and Escape](./tooltips.md#hover-linger-and-escape).

## Composition helpers

To build a component the package does not ship, such as a segmented control or a filter chip, compose it from the same classes the package's components are built from. With compiled CSS, write them as classes; with Tailwind source, you can also `@apply` them.

| Class          | What it gives an element                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `box`          | The painted box: background, text color, border, corner, shadow, the aesthetic's material, the focus ring, and the disabled look. It reads intent, presentation, aesthetic, and elevation. |
| `box-hover`    | The hover color, for something pressed rather than typed into. Add it with `box`.                                                                                                          |
| `box-active`   | The press: a slight shrink, or the aesthetic's own press. Add it with `box`.                                                                                                               |
| `surface`      | `box` with a surface's defaults: no fill and a border, the surface corner, and the aesthetic's surface background, blur, and shadow, as on a card.                                         |
| `text-control` | `box` with a text field's defaults: no fill and a border, the capped fill and border rules, placeholder color, a border that changes on hover and focus, and the invalid state.            |

Filter chips for the members list, one pressed and one not:

```html
<button class="box box-hover box-active neutral soft edgeless" type="button" aria-pressed="true" style="padding: 0.25rem 0.75rem; border-radius: 999px">Admins</button>

<button class="box box-hover box-active neutral ghost edgeless" type="button" aria-pressed="false" style="padding: 0.25rem 0.75rem; border-radius: 999px">Owners</button>
```

`box` does not read `aria-pressed`, so the pressed chip looks pressed only because it has `.soft`. When your code changes `aria-pressed`, change the presentation class with it: `.soft` when pressed, `.ghost` when not.

What to give each one:

- **`box` needs a fill and an edge class.** It has no defaults of its own, so with no `.solid`, `.soft`, or `.ghost` and no `.edged` or `.edgeless`, on the element or a container, it draws nothing. `surface` and `text-control` have defaults and work alone.
- **Name the intent on `box`.** A `box` element takes the intent of the nearest element around it that has one, unlike the package's components. Put `.neutral` or an intent class on it. `surface` and `text-control` are neutral unless the element has an intent class, as components are.
- **`@apply` carries the whole helper.** `.my-field { @apply text-control; }` gets what `class="text-control"` gets: the neutral intent and the field border, `.soft`, `.solid`, and `.edgeless` on the element, and the invalid look for `aria-invalid="true"`. `@apply surface` is neutral the same way. An intent class you defined yourself must be plain CSS or a utility to color such an element, not a rule in `@layer components`.
- **A dialog works with `@apply surface`.** A closed `<dialog>` with your own `@apply surface` class stays hidden, and an open one is centered, as with `.card`. Hiding a closed one wins over a display utility such as `flex`; a margin you set still places an open one.
- **Size and spacing are yours.** None of the helpers sets padding, width, or height; `text-control` does not set the 2.5rem height that `.ipt` adds.
- **So are behavior and semantics.** Use a real `<button>`, `<input>`, or `<a href>`, or add the role and keyboard handling yourself, and set states such as `aria-pressed` or `aria-invalid`. `box` draws the disabled look for `disabled`, `.disabled`, `aria-disabled="true"`, and `data-disabled`, but only the `disabled` attribute stops input.

Do not set or read the `--_`-prefixed variables these helpers use internally; they change between releases.

## Next

[Content and layout](./content-and-layout.md) lists the layout helpers, the type scale, surfaces, tables, and content chips.
