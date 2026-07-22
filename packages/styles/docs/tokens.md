---
title: Tokens
---

# Design tokens

Tokens are CSS custom properties. The root starts with light values and switches
to dark values when `prefers-color-scheme: dark` matches. Explicit theme
selectors can force either palette on the root or any subtree.

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

- With no explicit selector, `:root` is light unless the system prefers dark.
- A light selector on `:root` suppresses the system dark fallback. A dark root
  selector uses dark values regardless of system preference.
- Every selector can theme a subtree. Normal CSS inheritance means a nested
  explicit selector overrides inherited values from an outer theme; the nearest
  themed ancestor therefore controls that subtree.
- If conflicting light and dark selectors are placed on the same element, the
  dark declaration wins because it appears later with equal specificity. Do not
  rely on this conflict behavior; apply one theme per element.
- Component colors inherit from tokens or `currentColor`. For example, the
  select chevron uses `currentColor`, so it follows every explicit selector and
  the system-preference fallback without a separate dark-variant rule.

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

> **Intent token contract**: color intent tokens own meaning and tone variants. Components map an intent palette into scoped component slots, and presentation classes decide which slots to consume. Theme changes belong in token values such as `.dark`, not broad component-level theme checks. Component-level theme handling should exist only when a component has an internal structure that cannot be expressed through the token palette alone.

## Foundation Tokens

Foundation tokens are not aliases for one color. They define layout, shape, motion, focus, depth, and layering behavior used by helper classes.

| Token                       | Purpose                                                                      |
| --------------------------- | ---------------------------------------------------------------------------- |
| `--font-default`            | Default app font family.                                                     |
| `--container-narrow`        | Narrow content width.                                                        |
| `--container-max`           | Default content width.                                                       |
| `--container-wide`          | Wide content width.                                                          |
| `--layout-gutter`           | Responsive inline page padding.                                              |
| `--layout-section-block`    | Responsive section vertical padding.                                         |
| `--layout-gap`              | Shared gap for `.view`, `.stack`, `.cluster`, and `.auto-grid`.              |
| `--layout-grid-min`         | Minimum column width for `.auto-grid`.                                       |
| `--radius-small`            | Small radius for compact utility surfaces such as code elements.             |
| `--radius-control`          | Radius for buttons, inputs, tooltips, and compact UI.                        |
| `--radius-surface`          | Radius for cards, panels, and alerts.                                        |
| `--control-height`          | Default minimum height for controls.                                         |
| `--border-width`            | Default border width.                                                        |
| `--elevation-low`           | Elevation for surface-level components such as cards and panels.             |
| `--elevation-mid`           | Elevation for elevated components such as dropdowns and floating containers. |
| `--elevation-high`          | Elevation for tooltips and inline overlays.                                  |
| `--focus-ring`              | Focus-visible ring color.                                                    |
| `--focus-ring-offset`       | Focus-visible outline offset.                                                |
| `--focus-ring-width`        | Focus-visible outline/ring width.                                            |
| `--motion-duration-fast`    | Fast transition for buttons and input interactions (`120ms`).                |
| `--motion-duration-normal`  | Normal transition for layout and modals (`200ms`).                           |
| `--motion-duration-slow`    | Slow animation for skeleton loaders and progress bars (`400ms`).             |
| `--motion-ease`             | Default easing curve.                                                        |
| `--z-popover`               | Popover/tooltip z-index.                                                     |
| `--surface-hover-transform` | The transform applied on interactive card/panel hover.                       |
| `--breakpoint-xs`           | Extra-small Tailwind responsive breakpoint.                                  |
| `--breakpoint-2xl`          | Extended large Tailwind responsive breakpoint.                               |

## Component Internals

Component classes may define scoped implementation variables such as `--button-*`, `--surface-*`, `--control-*`, `--feedback-*`, and `--tooltip-*`. These variables are internal wiring for class composition and are not the public token contract.

Consumers should customize broad behavior through color, foundation, motion, elevation, radius, layout, and focus tokens first. The only supported component-scoped input is `--progress-value` on the `.progress` element, because consumers must provide a value such as `64%`.

`--layout-gap` replaces the removed `--layout-stack-gap` and `--layout-cluster-gap` tokens. No compatibility aliases are provided.
