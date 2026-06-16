# @codenhub/styles Tokens

**Status:** IMPLEMENTED
**Last updated:** 2026-06-16
**Scope:** Public CSS variable contract for `@codenhub/styles`.

Tokens are CSS custom properties. Light values apply by default. Dark values apply inside `.dark`.

```html
<section class="dark">
  <article class="card">Dark token subtree</article>
</section>
```

## Color Tokens

| Token                          | Purpose                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `--color-primary`              | Primary action/content color.                                                                            |
| `--color-primary-contrast`     | Text/icon color on primary filled surface.                                                               |
| `--color-primary-hover`        | Primary hover state.                                                                                     |
| `--color-primary-light`        | Light companion for primary. Use as subtle background or soft surface.                                   |
| `--color-primary-dark`         | Dark companion for primary. Use as high-contrast text or icon in light context.                          |
| `--color-accent`               | Secondary/accent surface.                                                                                |
| `--color-accent-contrast`      | Text/icon color on accent filled surface.                                                                |
| `--color-accent-hover`         | Accent hover state.                                                                                      |
| `--color-accent-light`         | Light companion for accent. Use as subtle background or soft surface.                                    |
| `--color-accent-dark`          | Dark companion for accent. Use as high-contrast text or icon in light context.                           |
| `--color-border`               | Default border color.                                                                                    |
| `--color-border-hover`         | Interactive border color.                                                                                |
| `--color-background`           | Page and default raised surface background.                                                              |
| `--color-foreground`           | Subtle raised foreground surface.                                                                        |
| `--color-surface`              | Nested or muted surface.                                                                                 |
| `--color-text`                 | Primary text color.                                                                                      |
| `--color-text-secondary`       | Secondary text color.                                                                                    |
| `--color-success`              | Success state color.                                                                                     |
| `--color-success-contrast`     | Text/icon color on success filled surface. Meets normal text contrast against `--color-success`.         |
| `--color-success-light`        | Light companion for success. Always a literal light value regardless of theme.                           |
| `--color-success-dark`         | Dark companion for success. Always a literal dark value regardless of theme.                             |
| `--color-warning`              | Warning state color.                                                                                     |
| `--color-warning-contrast`     | Text/icon color on warning filled surface. Meets normal text contrast against `--color-warning`.         |
| `--color-warning-light`        | Light companion for warning. Always a literal light value.                                               |
| `--color-warning-dark`         | Dark companion for warning. Always a literal dark value.                                                 |
| `--color-destructive`          | Destructive/error state color.                                                                           |
| `--color-destructive-contrast` | Text/icon color on destructive filled surface. Meets normal text contrast against `--color-destructive`. |
| `--color-destructive-light`    | Light companion for destructive. Always a literal light value.                                           |
| `--color-destructive-dark`     | Dark companion for destructive. Always a literal dark value.                                             |
| `--color-info`                 | Informational state color.                                                                               |
| `--color-info-contrast`        | Text/icon color on info filled surface. Meets normal text contrast against `--color-info`.               |
| `--color-info-light`           | Light companion for info. Always a literal light value.                                                  |
| `--color-info-dark`            | Dark companion for info. Always a literal dark value.                                                    |

> **Companion token contract**: `*-light` and `*-dark` companion tokens are static, literal colors. They do not invert when the theme changes. Components consume the appropriate companion depending on context. For example, ghost and outline buttons use `*-dark` text in a light context and `*-light` text inside `.dark`; soft buttons pair that readable text with the opposite companion surface.

## Foundation Tokens

Foundation tokens are not aliases for one color. They define layout, shape, motion, focus, depth, and layering behavior used by helper classes.

| Token                      | Purpose                                                                      |
| -------------------------- | ---------------------------------------------------------------------------- |
| `--font-default`           | Default app font family.                                                     |
| `--container-narrow`       | Narrow content width.                                                        |
| `--container-max`          | Default content width.                                                       |
| `--container-wide`         | Wide content width.                                                          |
| `--layout-gutter`          | Responsive inline page padding.                                              |
| `--layout-section-block`   | Responsive section vertical padding.                                         |
| `--layout-stack-gap`       | Default vertical stack gap.                                                  |
| `--layout-cluster-gap`     | Default horizontal/wrapped cluster gap.                                      |
| `--layout-grid-min`        | Minimum column width for `.auto-grid`.                                       |
| `--radius-control`         | Radius for buttons, inputs, tooltips, and compact UI.                        |
| `--radius-surface`         | Radius for cards, panels, and alerts.                                        |
| `--radius-overlay`         | Radius for overlays such as toasts.                                          |
| `--control-height`         | Default minimum height for controls.                                         |
| `--border-width`           | Default border width.                                                        |
| `--elevation-low`          | Elevation for surface-level components such as cards and panels.             |
| `--elevation-mid`          | Elevation for elevated components such as dropdowns and floating containers. |
| `--elevation-high`         | Elevation for tooltips and inline overlays.                                  |
| `--elevation-overlay`      | Elevation for full-screen overlays and toasts.                               |
| `--focus-ring`             | Focus-visible ring color.                                                    |
| `--focus-ring-offset`      | Focus-visible outline offset.                                                |
| `--focus-ring-width`       | Focus-visible outline/ring width.                                            |
| `--motion-duration-fast`   | Fast transition for buttons and input interactions (`120ms`).                |
| `--motion-duration-normal` | Normal transition for layout, modals, and banners (`200ms`).                 |
| `--motion-duration-slow`   | Slow animation for skeleton loaders and progress bars (`400ms`).             |
| `--motion-ease`            | Default easing curve.                                                        |
| `--backdrop-overlay`       | Backdrop filter value for overlay-like surfaces.                             |
| `--z-popover`              | Popover/tooltip z-index.                                                     |
| `--z-toast`                | Toast z-index.                                                               |
| `--breakpoint-xs`          | Extra-small Tailwind responsive breakpoint.                                  |
| `--breakpoint-2xl`         | Extended large Tailwind responsive breakpoint.                               |

## Component Internals

Component classes may define scoped implementation variables such as `--button-*`, `--surface-*`, `--control-*`, `--feedback-*`, and `--tooltip-*`. These variables are internal wiring for class composition and are not the public token contract.

Consumers should customize broad behavior through color, foundation, motion, elevation, radius, layout, and focus tokens first. The only supported component-scoped input is `--progress-value` on the child fill element inside `.progress`, because consumers must provide a value such as `64%`.
