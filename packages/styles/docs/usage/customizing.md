---
title: Customizing
description: Presentation and material token reference, and aesthetic knobs.
order: 3
---

# Customizing

Presentation tokens decide how much of an intent shows. Material tokens decide what a component is made of. Aesthetic tokens are the small set of named knobs a shipped aesthetic exposes to scale its own look.

## Presentation tokens

Presentation tokens describe _how much_ of an intent a component shows, never _which_ intent it shows. They are unitless numbers and percentages, so they carry no color and inherit safely: a container sets them once and every component below resolves them against its own intent.

| Token             | Purpose                                                                    |
| ----------------- | -------------------------------------------------------------------------- |
| `--ui-fill`       | Percentage of the intent color mixed into the background.                  |
| `--ui-fg-on-fill` | Percentage blended from the intent readable tone toward its contrast tone. |
| `--ui-border`     | Percentage of the intent color mixed into the border color.                |

A component resolves them with `color-mix` from its published default. Hover is derived by adding `--hover-step` to the resting fill and using `--intent-hover`; there are no per-presentation hover tokens.

No fill class writes `--ui-border` and no edge class writes `--ui-fill`. A filled box with no line is `.solid.edgeless`, which is worth reaching for on a neutral component: neutral caps its fill, so the box stays translucent and a border over it paints a second coat of the same tint instead of blending into it.

```css
background: color-mix(in oklab, var(--color-primary) var(--ui-fill, 100%), transparent);
```

Two choices there are deliberate. Mixing toward `transparent` rather than a background token lets a tinted surface adapt to whatever it is placed on. Mixing in `oklab` keeps the wide-gamut token palette intact and blends perceptually, where `srgb` would clip it.

A computed color therefore reaches the page as a resolved `color-mix` result rather than the token's own `oklch` syntax. It is the same color; code that compares computed color strings should compare colors instead.

> **Presentation token contract**: only presentation classes and consumer overrides set these tokens; components only read them. Setting a value that no presentation class produces is supported but unvalidated. See [Composing](./composing.md) for the classes that ship these values.

## Material tokens

Material tokens describe what a component is _made of_ rather than which intent it shows or how strongly. They control shape, borders, shadows, translucency, filters, and transforms.

Components read each with a fallback, so leaving them unset produces the default look. Setting them on a container restyles the whole subtree. Only shadow geometry is split into colorless parts that inherit safely; color-capable inputs such as `--ui-ink` and `--ui-surface-shadow` may include their own colors.

| Token                   | Purpose                                                                                                       | Fallback                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `--ui-radius`           | Corner radius for controls.                                                                                   | `--radius-control`        |
| `--ui-radius-surface`   | Corner radius for surfaces.                                                                                   | `--radius-surface`        |
| `--ui-corner-shape`     | What every corner the two radii set draws: `round`, or `bevel` for a straight cut. Chromium only today.       | `round`                   |
| `--ui-radius-pill`      | Corner for what is fully round by default: badges, switches, progress, the tooltip icon.                      | `--ui-radius`, then full  |
| `--ui-radius-tight`     | Corner for chips -- checkbox, `.kbd`, `.code` -- before their `--radius-small` cap.                           | `--ui-radius`, then small |
| `--ui-border-width`     | Edge thickness.                                                                                               | `--border-width`          |
| `--ui-border-max`       | Ceiling on computed edge width.                                                                               | `100px`                   |
| `--ui-ink`              | Neutral line color when no intent is set.                                                                     | `--color-border`          |
| `--ui-rule`             | Lines inside a table. Unset draws the head and foot boundaries only; `0%` draws none; `100%` rules every row. | unset                     |
| `--ui-shadow-x`         | Shadow horizontal offset.                                                                                     | `0px`                     |
| `--ui-shadow-y`         | Shadow vertical offset.                                                                                       | `0px`                     |
| `--ui-shadow-blur`      | Shadow blur radius.                                                                                           | `0px`                     |
| `--ui-shadow-spread`    | Shadow spread radius.                                                                                         | `0px`                     |
| `--ui-shadow-inset`     | The `inset` keyword for an inner ring.                                                                        | Empty                     |
| `--ui-hover-shadow-x`   | Shadow horizontal offset while hovered.                                                                       | `--ui-shadow-x`           |
| `--ui-hover-shadow-y`   | Shadow vertical offset while hovered.                                                                         | `--ui-shadow-y`           |
| `--ui-active-shadow-x`  | Shadow horizontal offset while pressed.                                                                       | `--ui-shadow-x`           |
| `--ui-active-shadow-y`  | Shadow vertical offset while pressed.                                                                         | `--ui-shadow-y`           |
| `--ui-active-transform` | Transform while pressed. `none` under `prefers-reduced-motion`.                                               | `scale(0.97)`             |
| `--ui-shadow-ink`       | Percentage of shadow color taken from intent ink.                                                             | `0%`                      |
| `--ui-shadow-edge`      | Declared, even empty, when the shadow is the element's edge rather than its depth. Read for presence.         | Unset                     |
| `--ui-elevation`        | Unitless multiplier over shadow geometry.                                                                     | `1`                       |
| `--ui-surface-shadow`   | Complete multi-layer shadow accepted by surfaces only.                                                        | Unset                     |
| `--ui-surface-ground`   | Ground a surface sits on.                                                                                     | `--color-background`      |
| `--ui-bg-alpha`         | Multiplier over fill for translucent materials.                                                               | `1`                       |
| `--ui-backdrop`         | Backdrop filter accepted by surfaces only.                                                                    | `none`                    |
| `--ui-hover-transform`  | Transform while an interactive element is hovered.                                                            | `none`                    |
| `--ui-clip`             | Structural component silhouette.                                                                              | `none`                    |
| `--ui-clip-tight`       | Compact component silhouette.                                                                                 | `--ui-clip`               |
| `--ui-focus-inset`      | Inset focus layer width.                                                                                      | Unset                     |
| `--ui-button-weight`    | Button label weight. Read by `.btn` and, with `/native`, a bare `<button>`.                                   | `--font-weight-semibold`  |
| `--ui-button-tracking`  | Button label letter spacing. Unset, the button inherits it.                                                   | Unset                     |

```html
<section style="--ui-radius: 0; --ui-border-width: 3px">
  <button class="btn primary">Square and heavy</button>
  <input class="ipt" placeholder="Matches" />
</section>
```

> **Material token contract**: components read these; aesthetic classes and consumer overrides set them.

### Shape and ring composition

Clipping removes borders, outlines, and outer shadows. An aesthetic that uses a clip can replace the border with an inset shadow by setting `--ui-shadow-inset` and the four shadow geometry parts. Set `--ui-border-max: 0px` when that ring replaces the component border. Focusable components restore the clipped focus outline through `--ui-focus-inset`.

A clip is not the only way to cut a corner. `--ui-corner-shape: bevel` draws the corner the radius sets as a straight cut instead of an arc, and the border, outer shadow, focus outline, and backdrop all follow it -- so a bevelled element keeps its glow and its line, where a clipped one loses both. `.cyber` uses it. Engines without `corner-shape` ignore it and draw the radius round, so an aesthetic that bevels should square its radius under `@supports not (corner-shape: bevel)`. A bevel on a full radius cuts to points: a radio, a `.btn.pill`, and anything reading `--ui-radius-pill` become diamonds or pointed hexagons.

Because `--ui-radius` accepts any `border-radius` value, it can also place the corner per side: `10px 0` cuts only top-left and bottom-right. The pill and chip corners are separate tokens for that reason -- a pill's full radius and a chip's `min()` cap cannot take a per-corner value -- and each falls back to `--ui-radius` when unset.

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

| Token                    | Aesthetic       | Purpose                                                                                       | Default                            |
| ------------------------ | --------------- | --------------------------------------------------------------------------------------------- | ---------------------------------- |
| `--neo-offset`           | `.neobrutalism` | Hard shadow offset and distance the press travels.                                            | `4px`                              |
| `--glass-radius`         | `.glass`        | Control corner radius.                                                                        | `0.75rem`                          |
| `--glass-radius-surface` | `.glass`        | Surface corner radius.                                                                        | `1rem`                             |
| `--pixel-unit`           | `.pixel`        | One pixel of the grid. The corner cut and the ring are one.                                   | `4px`                              |
| `--font-pixel`           | `.pixel`        | Consumer-supplied pixel font stack.                                                           | Falls back to the monospace stack  |
| `--tile-radius`          | `.chunky-tile`  | Corner radius, on controls and surfaces alike.                                                | `0.75rem`                          |
| `--tile-lift`            | `.chunky-tile`  | Depth of the seated bar, and how far a press travels.                                         | `4px`                              |
| `--font-rounded`         | `.chunky-tile`  | Consumer-supplied rounded font stack.                                                         | Falls back to the page stack       |
| `--cyber-cut`            | `.cyber`        | Largest cut, on controls and surfaces alike; the default shapes cap it at 25% of the element. | `0.625rem`                         |
| `--cyber-shape`          | `.cyber`        | Where controls take the cut: any `border-radius` value.                                       | `<cut> 0` (top-left, bottom-right) |
| `--cyber-shape-surface`  | `.cyber`        | Where surfaces take the cut: any `border-radius` value.                                       | `0 <cut>` (top-right, bottom-left) |
| `--cyber-glow`           | `.cyber`        | Blur of the glow.                                                                             | `8px`                              |
| `--cyber-ink`            | `.cyber`        | Neutral line and glow colour, where no intent sets one.                                       | Theme ink (near-black, near-white) |
| `--font-cyber`           | `.cyber`        | Consumer-supplied technical font stack.                                                       | Falls back to the monospace stack  |

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

Knobs and material tokens reach in opposite directions, and telling them apart matters. A knob resolves once at the aesthetic's own class and inherits down already-resolved, so it reaches the aesthetic **from above**: setting it on the element or any ancestor works, but setting it on a _descendant_ of the aesthetic class changes nothing — the value has already been read. `--ui-radius` and the other material tokens above are read fresh by each component as it draws, so they reach **at or below** the element carrying them, which is how you round one card differently from its neighbours without touching the knob at all.

Shipped aesthetics set the shared material tokens above. `.neobrutalism`, `.pixel`, and `.cyber` set `--ui-ink` for their neutral outline; intent classes still override the intent slots on each component.

The same knobs tune each aesthetic's [solo class](./aesthetics.md#solo-classes), which reads them on its own element.

## Generated palette

`@codenhub/styles/palette` is a generated, self-contained stylesheet of every `intent x presentation` cell's composed colors, baked to flat `--palette-*` custom properties -- the same values `box.css` composes live, computed once at build time rather than re-derived. It exists for a consumer that cannot take `@codenhub/styles` as a build-time dependency (an optional peer, for example) but still wants to look consistent with it, not as a replacement for the components themselves when Tailwind is available.

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

Every value is already the composited color -- never a `var(--color-background)` or `var(--intent-subtle)` reference -- so this file never needs `./theme` loaded alongside it to resolve anything.

Naming: `--palette-<intent>-<presentation>-<slot>`, where `<intent>` is one of the seven published intents (`neutral`, `primary`, `secondary`, `success`, `warning`, `destructive`, `info`) and `<presentation>` is `solid`, `soft`, or `ghost`. `<slot>` is `bg`, `fg`, or `edge`. Two qualifiers layer on only where they apply:

- A ground qualifier (`page` or `subtle`) inserted before the slot, present only on `.soft`/`.ghost`'s `bg` and `edge` -- `.solid` is ground-independent at full fill, and `fg` never varies by ground. No qualifier means the `transparent` ground (`.badge`/`.btn`'s ground): `--palette-success-soft-bg`. `page` is `.alert`'s ground (`--color-background`): `--palette-success-soft-page-bg`. `subtle` is `.pre`/`.code`/`.kbd`/`.tooltip-bubble`'s ground (that intent's own `--intent-subtle`): `--palette-success-soft-subtle-bg`.
- A `-hover` suffix on `bg` and `edge` only -- `fg` never changes on hover: `--palette-success-soft-page-bg-hover`.

Dark values are scoped the same way `@codenhub/styles`' own explicit theme override is: `.dark`, `.theme-dark`, and `[data-theme="dark"]`, on the element or an ancestor. There is no `prefers-color-scheme` fallback in this file -- a consumer reaching for a standalone palette is already handling its own theme switching, so the OS-preference case is left to `@codenhub/styles`' own `light-dark()`-based tokens when that package is actually in use.

Three more tokens sit alongside the intent cells for the same reason, without an intent, presentation, ground, or hover axis of their own: `--palette-border`, `--palette-surface`, and `--palette-text`, flat values for `--color-border`, `--color-surface`, and `--color-text` -- the resting colors anything that is not intent-colored needs (a container's border, a dialog's background, its text), which an optional-peer consumer needs just as much as the intent cells.

## Component internals

Component classes may define scoped implementation variables such as `--surface-padding`, `--field-gap`, `--input-group-pad`, `--switch-*`, `--table-*`, `--quote-*`, and `--tooltip-*`. These variables are internal wiring for class composition and are not the public token contract.

Consumers should customize broad behavior through color, foundation, motion, elevation, radius, layout, and focus tokens first. The only supported component-scoped input is `--progress-value` on the `.progress` element, because consumers must provide a value such as `64%`.

`--layout-gap` replaces the removed `--layout-stack-gap` and `--layout-cluster-gap` tokens. No compatibility aliases are provided.

Next: [Aesthetics](./aesthetics.md) covers each shipped aesthetic's complete look and its documented exceptions.
