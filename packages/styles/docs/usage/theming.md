---
title: Theming
description: The color, intent, and foundation token reference.
---

# Theming

Color tokens are how you restyle the palette; see
[Concepts → Theme selection](../concepts.md#theme-selection) for how a theme
is chosen. Intent tokens are how a component reads that palette once an
intent class is applied. Foundation tokens are the shared layout, shape, and
motion defaults underneath everything.

## Color tokens

Each color token holds both of its theme values at once through
`light-dark()`, and the element's `color-scheme` picks one.

```html
<section data-theme="dark">
  <article>Dark token subtree</article>
</section>
```

| Token                          | Purpose                                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `--color-primary`              | Primary action/content color.                                                                                     |
| `--color-primary-contrast`     | Text/icon color on primary filled surface.                                                                        |
| `--color-primary-hover`        | Primary hover state.                                                                                              |
| `--color-primary-subtle`       | Low-emphasis companion tone for primary. Use as soft surface or subtle background.                                |
| `--color-primary-strong`       | High-emphasis companion tone for primary. Use as readable text, icon, or border on subtle surfaces.               |
| `--color-accent`               | Secondary/accent surface.                                                                                         |
| `--color-accent-contrast`      | Text/icon color on accent filled surface.                                                                         |
| `--color-accent-hover`         | Accent hover state.                                                                                               |
| `--color-accent-subtle`        | Low-emphasis companion tone for accent. Use as soft surface or subtle background.                                 |
| `--color-accent-strong`        | High-emphasis companion tone for accent. Use as readable text, icon, or border on subtle surfaces.                |
| `--color-border`               | Default border color.                                                                                             |
| `--color-border-hover`         | Interactive border color.                                                                                         |
| `--color-control-border`       | Resting line on the six text controls; one value, drawn at a fraction on text inputs.                             |
| `--color-background`           | Page and default raised surface background.                                                                       |
| `--color-foreground`           | Subtle raised foreground surface.                                                                                 |
| `--color-surface`              | Nested or muted surface.                                                                                          |
| `--color-text`                 | Primary text color.                                                                                               |
| `--color-text-secondary`       | Secondary text color.                                                                                             |
| `--color-text-contrast`        | Readable color on top of a full fill of `--color-text`. A checked toggle prints it.                               |
| `--color-text-hover`           | Text hover state.                                                                                                 |
| `--color-text-subtle`          | Low-emphasis companion tone for text. Use as soft surface or subtle background.                                   |
| `--color-text-strong`          | High-emphasis companion tone for text. Use as readable text, icon, or border on subtle surfaces.                  |
| `--color-tooltip`              | Tooltip bubble plate with no intent. Chosen per theme rather than derived: near-white in light, mid grey in dark. |
| `--color-tooltip-contrast`     | Ink on `--color-tooltip`.                                                                                         |
| `--color-success`              | Success state color.                                                                                              |
| `--color-success-contrast`     | Text/icon color on success filled surface. Meets 4.5:1 as normal text on `--color-success` (5.14:1).              |
| `--color-success-hover`        | Success hover tone.                                                                                               |
| `--color-success-subtle`       | Low-emphasis companion tone for success.                                                                          |
| `--color-success-strong`       | High-emphasis companion tone for success.                                                                         |
| `--color-warning`              | Warning state color.                                                                                              |
| `--color-warning-contrast`     | The near-black tone, not the page tone. Meets 4.5:1 as normal text on `--color-warning` (6.19:1).                 |
| `--color-warning-hover`        | Warning hover tone.                                                                                               |
| `--color-warning-subtle`       | Low-emphasis companion tone for warning.                                                                          |
| `--color-warning-strong`       | High-emphasis companion tone for warning.                                                                         |
| `--color-destructive`          | Destructive/error state color.                                                                                    |
| `--color-destructive-contrast` | Text/icon color on destructive filled surface. Meets 4.5:1 as normal text on `--color-destructive` (5.78:1).      |
| `--color-destructive-hover`    | Destructive hover tone.                                                                                           |
| `--color-destructive-subtle`   | Low-emphasis companion tone for destructive.                                                                      |
| `--color-destructive-strong`   | High-emphasis companion tone for destructive.                                                                     |
| `--color-info`                 | Informational state color.                                                                                        |
| `--color-info-contrast`        | Text/icon color on info filled surface. Meets 4.5:1 as normal text on `--color-info` (6.19:1).                    |
| `--color-info-hover`           | Info hover tone.                                                                                                  |
| `--color-info-subtle`          | Low-emphasis companion tone for info.                                                                             |
| `--color-info-strong`          | High-emphasis companion tone for info.                                                                            |

> **Intent token contract**: color intent tokens own meaning and tone
> variants. Intent classes map one family onto the shared intent slots below,
> and presentation classes decide how much of it a component shows. Theme
> changes belong in token values, not broad component-level theme checks.
> Component-level theme handling should exist only when a component has an
> internal structure that cannot be expressed through the token palette
> alone.

## Intent tokens

Intent classes set these seven slots; components read them. Because every
supporting component reads the same seven names, an intent works on every
component that supports intent, and a custom intent needs no component
changes.

| Token               | Purpose                                                                               |
| ------------------- | ------------------------------------------------------------------------------------- |
| `--intent-color`    | The intent's base color. What a fill is made of.                                      |
| `--intent-contrast` | Readable color on top of a filled `--intent-color`.                                   |
| `--intent-hover`    | The intent's hovered base color.                                                      |
| `--intent-strong`   | The intent printed on a page. Text, icon, or border wherever the fill is not full.    |
| `--intent-subtle`   | Low-emphasis tone. Tinted surfaces and tracks. Neutral resolves to `--color-surface`. |
| `--intent-border`   | Line color. Resolves to `--color-border` when no intent is set.                       |
| `--intent-fill-max` | How far a fill of this intent is allowed to go. `100%` for every intent but neutral.  |

`--intent-color` and `--intent-strong` are two ends of the same family and not
interchangeable. The base is a ground, chosen to be filled with; the strong
tone is chosen to be read against a page. A `.soft` or `.ghost` component
prints the strong one, which is why an unfilled warning reads in amber-800
rather than the amber-600 its solid sibling is filled with.

The strong tone has to stay recognisably its own hue, not just readable. On a
dark page the `-100` shade of every family is a pale tint that carries almost
no chroma at small sizes: a soft success badge and a soft destructive one
printed labels that both read white, and a soft radio's dot stopped matching
the ring around it. The dark tones are `-300` for that reason, and the tinted
grounds under them are `-900` so there is room — measured at 5.0:1 or better
everywhere a partial fill prints text, and past 9:1 on the page.

`--intent-border` exists because a neutral border must stay the quiet border
gray rather than the text color. Everything that draws a line reads it:
control borders, table rules, dividers, key caps, and quote bars.

`--intent-fill-max` exists for the neutral intent, whose color is the page's
own ink. Every other intent is a hue, legible pale at 12% and saturated at
100%; a grey filled to 100% is a black or white slab, which is the loudest
thing on the page and the wrong look for the intent that means _nothing in
particular_. Neutral stops at `20%`, so `.solid` gives it a quiet plate that
still reads as a step past `.soft`. Hover adds its step on top of the cap, so
a capped fill still deepens under the pointer.

The foreground is gated by the plate rather than tied to the fill.
`--intent-contrast` is the ink for a _full_ fill, so printing it at full
strength on a fifth of one puts white on light grey. Contrast ink therefore
appears only once the fill is past halfway and reaches full at a full fill;
below that a component prints `--intent-strong`, the tone chosen to be read.

That means a capped neutral takes the strong tone whole rather than a
fraction of the way toward the page. Tying it to the fill instead cost a
neutral `.solid` button four points of contrast and a neutral tooltip nearly
ten. A state that lifts the cap on purpose — a checked checkbox is filled
with its own intent by definition — reaches a full fill and gets the contrast
whole.

Set them directly to define an intent this package does not ship. **State
every slot**, including `--intent-fill-max`: components reset all seven to
the neutral values, so a slot your intent leaves out keeps neutral's — and an
intent that omits the cap fills to 20% of its color instead of 100%.

```css
.brand {
  --intent-color: var(--color-violet-600);
  --intent-contrast: var(--color-neutral-50);
  --intent-hover: var(--color-violet-700);
  --intent-strong: var(--color-violet-800);
  --intent-subtle: var(--color-violet-100);
  --intent-border: var(--color-violet-600);
  --intent-fill-max: 100%;
}
```

```html
<button class="btn brand">Custom intent</button>
<span class="badge brand soft">Works everywhere</span>
```

> **Intent does not cascade.** Components reset these slots to the text
> palette at their own root, so a `.success` container never recolors a
> nested destructive button. Put the intent class on the element that shows
> the intent.

## Foundation tokens

Foundation tokens are not aliases for one color. They define layout, shape,
motion, focus, depth, and layering behavior used by helper classes.

The four `--elevation-*` values below are raw shadows for elements you style
yourself. They are a separate thing from `.flat`/`.raised`/`.floating`, which
scale a _component's own_ shadow geometry and default to no shadow at all
until an aesthetic or one of those classes asks for depth — see
[Composing → Elevation](./composing.md#elevation) for that system.

| Token                       | Purpose                                                                 |
| --------------------------- | ----------------------------------------------------------------------- |
| `--font-default`            | Default app font family.                                                |
| `--container-narrow`        | Narrow content width.                                                   |
| `--container-max`           | Default content width.                                                  |
| `--container-wide`          | Wide content width.                                                     |
| `--layout-gutter`           | Responsive inline page padding.                                         |
| `--layout-section-block`    | Responsive section vertical padding.                                    |
| `--layout-gap`              | Shared gap for `.view`, `.stack`, `.cluster`, and `.auto-grid`.         |
| `--layout-grid-min`         | Minimum column width for `.auto-grid`.                                  |
| `--radius-small`            | Small radius for compact utility surfaces such as code elements.        |
| `--radius-control`          | Radius for buttons, inputs, tooltips, and compact UI.                   |
| `--radius-surface`          | Radius for cards, panels, and alerts.                                   |
| `--control-height`          | Default minimum height for controls.                                    |
| `--border-width`            | Default border width.                                                   |
| `--elevation-color`         | Shadow color the four elevations compose from. Heavier in dark themes.  |
| `--elevation-none`          | No shadow. Use on an element that should read as flat against its page. |
| `--elevation-low`           | A light shadow for your own surface-level elements, such as cards.      |
| `--elevation-mid`           | A shadow for your own raised elements, such as dropdowns and popovers.  |
| `--elevation-high`          | A shadow for your own full overlays, such as modal dialogs.             |
| `--focus-ring`              | Focus-visible ring color.                                               |
| `--focus-ring-offset`       | Focus-visible outline offset. Negative, so the ring lands on the edge.  |
| `--focus-ring-width`        | Focus-visible outline/ring width.                                       |
| `--motion-duration-fast`    | Fast transition for buttons and input interactions (`120ms`).           |
| `--motion-duration-normal`  | Normal transition for layout and modals (`200ms`).                      |
| `--motion-duration-slow`    | Slow animation for skeleton loaders and progress bars (`400ms`).        |
| `--motion-ease`             | Default easing curve.                                                   |
| `--z-popover`               | Popover/tooltip z-index.                                                |
| `--surface-hover-transform` | The transform applied on interactive card/panel hover.                  |
| `--breakpoint-xs`           | Extra-small Tailwind responsive breakpoint.                             |
| `--breakpoint-2xl`          | Extended large Tailwind responsive breakpoint.                          |

Next: [Customizing](./customizing.md) covers presentation and material
tokens — how much of an intent shows, and what a component is made of.
