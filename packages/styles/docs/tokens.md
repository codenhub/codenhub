---
title: Tokens
---

# Design tokens

Tokens are CSS custom properties. Each color token holds both of its theme
values at once through `light-dark()`, and the element's `color-scheme` picks
one. Explicit theme selectors can force either palette on the root or any
subtree.

```html
<section data-theme="dark">
  <article>Dark token subtree</article>
</section>
```

## Theme selection and precedence

| Theme | Equivalent selectors                             |
| ----- | ------------------------------------------------ |
| Light | `.light`, `.theme-light`, `[data-theme="light"]` |
| Dark  | `.dark`, `.theme-dark`, `[data-theme="dark"]`    |

- Theme selectors set `color-scheme` and nothing else. Because `color-scheme`
  inherits, a selector themes its entire subtree.
- With no explicit selector, `:root` uses `color-scheme: light dark`, so the
  system preference decides.
- A theme selector on `:root` overrides the system preference in either
  direction.
- A nested explicit selector overrides an inherited theme, so the nearest themed
  ancestor controls that subtree at any depth.
- If conflicting light and dark selectors are placed on the same element, the
  dark declaration wins because it appears later with equal specificity. Do not
  rely on this conflict behavior; apply one theme per element.
- Component colors resolve from tokens or `currentColor`, so they follow the
  theme without separate dark-variant rules. Input icons are the one exception:
  they are `background-image` data URIs, which cannot read a custom property, so
  they ship a light and a dark artwork and the theme re-points an alias.

Setting `color-scheme` yourself on an element also re-themes the tokens below
it, because that is the only signal the palette reads. This also themes native
UI such as scrollbars and form-control internals to match.

This mechanism requires Chrome 123, Safari 17.5, or Firefox 120 and newer.

## Color Tokens

| Token                          | Purpose                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `--color-primary`              | Primary action/content color.                                                                                 |
| `--color-primary-contrast`     | Text/icon color on primary filled surface.                                                                    |
| `--color-primary-hover`        | Primary hover state.                                                                                          |
| `--color-primary-subtle`       | Low-emphasis companion tone for primary. Use as soft surface or subtle background.                            |
| `--color-primary-strong`       | High-emphasis companion tone for primary. Use as readable text, icon, or border on subtle surfaces.           |
| `--color-accent`               | Secondary/accent surface.                                                                                     |
| `--color-accent-contrast`      | Text/icon color on accent filled surface.                                                                     |
| `--color-accent-hover`         | Accent hover state.                                                                                           |
| `--color-accent-subtle`        | Low-emphasis companion tone for accent. Use as soft surface or subtle background.                             |
| `--color-accent-strong`        | High-emphasis companion tone for accent. Use as readable text, icon, or border on subtle surfaces.            |
| `--color-border`               | Default border color.                                                                                         |
| `--color-border-hover`         | Interactive border color.                                                                                     |
| `--color-background`           | Page and default raised surface background.                                                                   |
| `--color-foreground`           | Subtle raised foreground surface.                                                                             |
| `--color-surface`              | Nested or muted surface.                                                                                      |
| `--color-text`                 | Primary text color.                                                                                           |
| `--color-text-secondary`       | Secondary text color.                                                                                         |
| `--color-text-contrast`        | Text/icon color on text filled surface.                                                                       |
| `--color-text-hover`           | Text hover state.                                                                                             |
| `--color-text-subtle`          | Low-emphasis companion tone for text. Use as soft surface or subtle background.                               |
| `--color-text-strong`          | High-emphasis companion tone for text. Use as readable text, icon, or border on subtle surfaces.              |
| `--color-success`              | Success state color.                                                                                          |
| `--color-success-contrast`     | Text/icon color on success filled surface. Meets 3:1 UI component contrast against `--color-success`.         |
| `--color-success-hover`        | Success hover tone.                                                                                           |
| `--color-success-subtle`       | Low-emphasis companion tone for success.                                                                      |
| `--color-success-strong`       | High-emphasis companion tone for success.                                                                     |
| `--color-warning`              | Warning state color.                                                                                          |
| `--color-warning-contrast`     | Text/icon color on warning filled surface. Meets 3:1 UI component contrast against `--color-warning`.         |
| `--color-warning-hover`        | Warning hover tone.                                                                                           |
| `--color-warning-subtle`       | Low-emphasis companion tone for warning.                                                                      |
| `--color-warning-strong`       | High-emphasis companion tone for warning.                                                                     |
| `--color-destructive`          | Destructive/error state color.                                                                                |
| `--color-destructive-contrast` | Text/icon color on destructive filled surface. Meets 3:1 UI component contrast against `--color-destructive`. |
| `--color-destructive-hover`    | Destructive hover tone.                                                                                       |
| `--color-destructive-subtle`   | Low-emphasis companion tone for destructive.                                                                  |
| `--color-destructive-strong`   | High-emphasis companion tone for destructive.                                                                 |
| `--color-info`                 | Informational state color.                                                                                    |
| `--color-info-contrast`        | Text/icon color on info filled surface. Meets 3:1 UI component contrast against `--color-info`.               |
| `--color-info-hover`           | Info hover tone.                                                                                              |
| `--color-info-subtle`          | Low-emphasis companion tone for info.                                                                         |
| `--color-info-strong`          | High-emphasis companion tone for info.                                                                        |

> **Intent token contract**: color intent tokens own meaning and tone variants. Intent classes map one family onto the shared intent slots below, and presentation classes decide how much of it a component shows. Theme changes belong in token values, not broad component-level theme checks. Component-level theme handling should exist only when a component has an internal structure that cannot be expressed through the token palette alone.

## Intent Tokens

Intent classes set these five slots; components read them. Because every
supporting component reads the same five names, an intent works on every
component that supports intent, and a custom intent needs no component changes.

| Token               | Purpose                                                                               |
| ------------------- | ------------------------------------------------------------------------------------- |
| `--intent-color`    | The intent's base color.                                                              |
| `--intent-contrast` | Readable color on top of a filled `--intent-color`.                                   |
| `--intent-hover`    | The intent's hovered base color.                                                      |
| `--intent-strong`   | High-emphasis tone. Readable text, icon, or border on subtle fills.                   |
| `--intent-subtle`   | Low-emphasis tone. Tinted surfaces and tracks. Neutral resolves to `--color-surface`. |
| `--intent-border`   | Line color. Resolves to `--color-border` when no intent is set.                       |

`--intent-border` exists because a neutral border must stay the quiet border
gray rather than the text color. Everything that draws a line reads it: control
borders, table rules, dividers, key caps, and quote bars.

Set them directly to define an intent this package does not ship:

```css
.brand {
  --intent-color: var(--color-violet-600);
  --intent-contrast: var(--color-neutral-50);
  --intent-hover: var(--color-violet-700);
  --intent-strong: var(--color-violet-800);
  --intent-subtle: var(--color-violet-100);
  --intent-border: var(--color-violet-600);
}
```

```html
<button class="btn brand">Custom intent</button>
<span class="badge brand soft">Works everywhere</span>
```

> **Intent does not cascade.** Components reset these slots to the text palette
> at their own root, so a `.success` container never recolors a nested
> destructive button. Put the intent class on the element that shows the intent.

## Foundation Tokens

Foundation tokens are not aliases for one color. They define layout, shape, motion, focus, depth, and layering behavior used by helper classes.

| Token                       | Purpose                                                                    |
| --------------------------- | -------------------------------------------------------------------------- |
| `--font-default`            | Default app font family.                                                   |
| `--container-narrow`        | Narrow content width.                                                      |
| `--container-max`           | Default content width.                                                     |
| `--container-wide`          | Wide content width.                                                        |
| `--layout-gutter`           | Responsive inline page padding.                                            |
| `--layout-section-block`    | Responsive section vertical padding.                                       |
| `--layout-gap`              | Shared gap for `.view`, `.stack`, `.cluster`, and `.auto-grid`.            |
| `--layout-grid-min`         | Minimum column width for `.auto-grid`.                                     |
| `--radius-small`            | Small radius for compact utility surfaces such as code elements.           |
| `--radius-control`          | Radius for buttons, inputs, tooltips, and compact UI.                      |
| `--radius-surface`          | Radius for cards, panels, and alerts.                                      |
| `--control-height`          | Default minimum height for controls.                                       |
| `--border-width`            | Default border width.                                                      |
| `--elevation-color`         | Shadow color the three elevations compose from. Heavier in dark themes.    |
| `--elevation-low`           | Elevation for surface-level components such as cards and panels.           |
| `--elevation-mid`           | Elevation for raised components such as dropdowns, tooltips, and popovers. |
| `--elevation-high`          | Elevation for full overlays such as modal dialogs.                         |
| `--focus-ring`              | Focus-visible ring color.                                                  |
| `--focus-ring-offset`       | Focus-visible outline offset.                                              |
| `--focus-ring-width`        | Focus-visible outline/ring width.                                          |
| `--motion-duration-fast`    | Fast transition for buttons and input interactions (`120ms`).              |
| `--motion-duration-normal`  | Normal transition for layout and modals (`200ms`).                         |
| `--motion-duration-slow`    | Slow animation for skeleton loaders and progress bars (`400ms`).           |
| `--motion-ease`             | Default easing curve.                                                      |
| `--z-popover`               | Popover/tooltip z-index.                                                   |
| `--surface-hover-transform` | The transform applied on interactive card/panel hover.                     |
| `--breakpoint-xs`           | Extra-small Tailwind responsive breakpoint.                                |
| `--breakpoint-2xl`          | Extended large Tailwind responsive breakpoint.                             |

## Presentation Tokens

Presentation tokens describe _how much_ of an intent a component shows, never
_which_ intent it shows. They are unitless numbers and percentages, so they carry
no color and inherit safely: a container sets them once and every component below
resolves them against its own intent.

| Token                   | Purpose                                                                    |
| ----------------------- | -------------------------------------------------------------------------- |
| `--ui-fill`             | Percentage of the intent color mixed into the background.                  |
| `--ui-fg-on-fill`       | Percentage blended from the intent readable tone toward its contrast tone. |
| `--ui-border`           | Percentage of the intent color mixed into the border color.                |
| `--ui-border-scale`     | Multiplier applied to `--border-width`.                                    |
| `--ui-hover-fill`       | Percentage of the intent hover color mixed into the hovered background.    |
| `--ui-hover-fg-on-fill` | Percentage blended toward the contrast tone while hovered.                 |

A component resolves them with `color-mix`, supplying its own default as the
`var()` fallback so it keeps its normal look when no presentation is in scope:

```css
background: color-mix(in oklab, var(--color-primary) var(--ui-fill, 100%), transparent);
```

Two choices there are deliberate. Mixing toward `transparent` rather than a
background token lets a tinted surface adapt to whatever it is placed on. Mixing
in `oklab` keeps the wide-gamut token palette intact and blends perceptually,
where `srgb` would clip it.

A computed color therefore reaches the page as a resolved `color-mix` result
rather than the token's own `oklch` syntax. It is the same color; code that
compares computed color strings should compare colors instead.

> **Presentation token contract**: only presentation classes and consumer overrides
> set these tokens; components only read them. Setting a value that no presentation
> class produces is supported but unvalidated. See
> [Classes](./classes.md#presentation) for the classes that ship these values.

## Material Tokens

Material tokens describe what a component is _made of_ rather than which intent
it shows or how strongly. They are lengths and shadows, so like presentation
tokens they carry no color and inherit safely.

Components read each with a fallback, so leaving them unset produces the default
look. Setting them on a container restyles the whole subtree. The `--ui-shadow`
fallback is whatever the component draws on its own: `none` for most, an
elevation for cards and tooltip bubbles.

| Token                  | Purpose                                                      | Fallback           |
| ---------------------- | ------------------------------------------------------------ | ------------------ |
| `--ui-radius`          | Corner radius for controls.                                  | `--radius-control` |
| `--ui-radius-surface`  | Corner radius for surfaces such as alerts.                   | `--radius-surface` |
| `--ui-border-width`    | Base border thickness, before `--ui-border-scale`.           | `--border-width`   |
| `--ui-shadow`          | Complete `box-shadow` value.                                 | Per component      |
| `--ui-bg-alpha`        | Unitless multiplier over `--ui-fill`, for translucency.      | `1`                |
| `--ui-hover-transform` | `transform` applied while an interactive element is hovered. | `none`             |

Glass composes its two shadow layers from `--elevation-color`. Set that token on
the `.glass` element when tuning the aesthetic; a custom property referenced by
an inherited `--ui-shadow` resolves where the shadow is declared, not later on a
descendant component.

Presentation and material meet in one place. The aesthetic supplies the base
thickness and the presentation scales it:

```css
border-width: calc(var(--ui-border-width) * var(--ui-border-scale));
```

```html
<section style="--ui-radius: 0; --ui-border-width: 3px">
  <button class="btn primary">Square and heavy</button>
  <input class="ipt" placeholder="Matches" />
</section>
```

> **Material token contract**: components read these; aesthetic classes and
> consumer overrides set them.

### Aesthetic Tokens

The shipped [aesthetic classes](./classes.md#aesthetics) set material tokens for
you. Each also exposes its own tokens so you can tune it without rebuilding it.
They are available only where that aesthetic's stylesheet is imported.

| Token             | Aesthetic       | Purpose                                                   | Default                                 |
| ----------------- | --------------- | --------------------------------------------------------- | --------------------------------------- |
| `--neo-ink`       | `.neobrutalism` | Outline and shadow color with no intent set.              | Near-black on light, near-white on dark |
| `--neo-offset`    | `.neobrutalism` | Hard shadow offset, and the distance hover travels.       | `4px`                                   |
| `--glass-blur`    | `.glass`        | Backdrop blur radius.                                     | `14px`                                  |
| `--glass-opacity` | `.glass`        | Percentage of the background token kept under a surface.  | `45%`                                   |
| `--glass-fill`    | `.glass`        | Percentage of the intent mixed into a surface.            | `12%`                                   |
| `--glass-edge`    | `.glass`        | Highlight color the intent border is mixed into.          | Translucent white                       |
| `--pixel-unit`    | `.pixel`        | One pixel of the grid. Corners step by it; edges are two. | `2px`, and `1px` on chips               |
| `--pixel-ink`     | `.pixel`        | Outline color.                                            | Near-black on light, near-white on dark |
| `--font-pixel`    | `.pixel`        | Pixel font stack. Yours to supply; no font binary ships.  | Falls back to the monospace stack       |

`.neobrutalism` and `.pixel` also set `--intent-border`, the one place an
aesthetic touches the intent axis: a thick outline in the quiet border gray reads
as a mistake rather than as the aesthetic. They set it at zero specificity, so an
intent class on the element still wins, which is also what makes a neobrutalist
shadow take the component's own intent color. Key caps are excluded from both, so
a `.kbd` keeps its quiet edge under either aesthetic.

## Component Internals

Component classes may define scoped implementation variables such as `--button-*`, `--surface-*`, `--control-*`, `--feedback-*`, and `--tooltip-*`. These variables are internal wiring for class composition and are not the public token contract.

Consumers should customize broad behavior through color, foundation, motion, elevation, radius, layout, and focus tokens first. The only supported component-scoped input is `--progress-value` on the `.progress` element, because consumers must provide a value such as `64%`.

`--layout-gap` replaces the removed `--layout-stack-gap` and `--layout-cluster-gap` tokens. No compatibility aliases are provided.
