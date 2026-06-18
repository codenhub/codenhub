# @codenhub/styles Tokens

**Status:** IMPLEMENTED
**Last updated:** 2026-06-18
**Scope:** Public CSS variable contract for `@codenhub/styles`.

Tokens are CSS custom properties. Default values apply by default. `.dark` may override any token value for that subtree.

```html
<section class="dark">
  <article class="card">Dark token subtree</article>
</section>
```

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
| `--motion-duration-normal` | Normal transition for layout and modals (`200ms`).                           |
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
