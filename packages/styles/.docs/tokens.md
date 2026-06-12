# @codenhub/styles Tokens

**Status:** IMPLEMENTED
**Last updated:** 2026-06-12
**Scope:** Public CSS variable contract for `@codenhub/styles`.

Tokens are CSS custom properties. Light values apply by default. Dark values apply inside `.dark`.

```html
<section class="dark">
  <article class="card">Dark token subtree</article>
</section>
```

## Color Tokens

| Token                          | Purpose                                     |
| ------------------------------ | ------------------------------------------- |
| `--color-primary`              | Primary action/content color.               |
| `--color-primary-contrast`     | Text/icon color on primary.                 |
| `--color-primary-hover`        | Primary hover state.                        |
| `--color-accent`               | Secondary/accent surface.                   |
| `--color-accent-contrast`      | Text/icon color on accent.                  |
| `--color-accent-hover`         | Accent hover state.                         |
| `--color-border`               | Default border color.                       |
| `--color-border-hover`         | Interactive border color.                   |
| `--color-background`           | Page and default raised surface background. |
| `--color-foreground`           | Subtle raised foreground surface.           |
| `--color-surface`              | Nested or muted surface.                    |
| `--color-text`                 | Primary text color.                         |
| `--color-text-secondary`       | Secondary text color.                       |
| `--color-success`              | Success state color.                        |
| `--color-success-contrast`     | Text/icon color on success.                 |
| `--color-success-light`        | Light success surface.                      |
| `--color-success-dark`         | Dark success color.                         |
| `--color-warning`              | Warning state color.                        |
| `--color-warning-contrast`     | Text/icon color on warning.                 |
| `--color-warning-light`        | Light warning surface.                      |
| `--color-warning-dark`         | Dark warning color.                         |
| `--color-destructive`          | Destructive/error state color.              |
| `--color-destructive-contrast` | Text/icon color on destructive.             |
| `--color-destructive-light`    | Light destructive surface.                  |
| `--color-destructive-dark`     | Dark destructive color.                     |
| `--color-info`                 | Informational state color.                  |
| `--color-info-contrast`        | Text/icon color on info.                    |
| `--color-info-light`           | Light informational surface.                |
| `--color-info-dark`            | Dark informational color.                   |

## Foundation Tokens

Foundation tokens are not aliases for one color. They define layout, shape, motion, focus, depth, and layering behavior used by helper classes.

| Token                    | Purpose                                                                    |
| ------------------------ | -------------------------------------------------------------------------- |
| `--font-default`         | Default app font family.                                                   |
| `--container-narrow`     | Narrow content width.                                                      |
| `--container-max`        | Default content width.                                                     |
| `--container-wide`       | Wide content width.                                                        |
| `--layout-gutter`        | Responsive inline page padding.                                            |
| `--layout-section-block` | Responsive section vertical padding.                                       |
| `--layout-stack-gap`     | Default vertical stack gap.                                                |
| `--layout-cluster-gap`   | Default horizontal/wrapped cluster gap.                                    |
| `--layout-grid-min`      | Minimum column width for `.auto-grid`.                                     |
| `--radius-control`       | Radius for buttons, inputs, tooltips, and compact UI.                      |
| `--radius-surface`       | Radius for cards, panels, and alerts.                                      |
| `--radius-overlay`       | Radius for overlays such as toasts.                                        |
| `--control-height`       | Default minimum height for controls.                                       |
| `--border-width`         | Default border width.                                                      |
| `--border-width-strong`  | Strong border width for future high-contrast treatments.                   |
| `--shadow-surface`       | Default depth for cards, panels, tooltips, and skeleton-adjacent surfaces. |
| `--shadow-overlay`       | Default depth for overlays and toasts.                                     |
| `--focus-ring`           | Focus-visible ring color.                                                  |
| `--focus-ring-offset`    | Focus-visible outline offset.                                              |
| `--focus-ring-width`     | Focus-visible outline/ring width.                                          |
| `--motion-duration`      | Default transition duration.                                               |
| `--motion-duration-slow` | Slower animation duration for ambient effects.                             |
| `--motion-ease`          | Default easing curve.                                                      |
| `--backdrop-overlay`     | Backdrop filter value for overlay-like surfaces.                           |
| `--z-popover`            | Popover/tooltip z-index.                                                   |
| `--z-toast`              | Toast z-index.                                                             |
| `--breakpoint-xs`        | Extra-small Tailwind responsive breakpoint.                                |
| `--breakpoint-2xl`       | Extended large Tailwind responsive breakpoint.                             |

## Component-Scoped Tokens

Some tokens are scoped inside component classes. They exist to support class composition and profile overrides without exposing one-off aliases.

| Scope                          | Token                            | Purpose                                            |
| ------------------------------ | -------------------------------- | -------------------------------------------------- |
| `.card`, `.panel`              | `--surface-bg`                   | Surface background for that surface helper.        |
| `.card`, `.panel`              | `--surface-border`               | Surface border color.                              |
| `.card`, `.panel`              | `--surface-border-hover`         | Hover/open border color.                           |
| `.card`, `.panel`              | `--surface-radius`               | Surface radius.                                    |
| `.card`, `.panel`              | `--surface-shadow`               | Surface depth.                                     |
| `.btn`                         | `--button-bg`                    | Button intent background color.                    |
| `.btn`                         | `--button-fg`                    | Button text/icon color.                            |
| `.btn`                         | `--button-border`                | Button border color.                               |
| `.btn`                         | `--button-hover-bg`              | Button hover background.                           |
| `.btn`                         | `--button-hover-fg`              | Button hover text/icon color.                      |
| `.btn`                         | `--button-hover-border`          | Button hover border color.                         |
| `.btn`                         | `--button-ghost-fg`              | Ghost button text/icon color.                      |
| `.btn`                         | `--button-ghost-hover-bg`        | Ghost and outline soft hover background.           |
| `.btn`                         | `--button-spinner`               | Loading spinner color.                             |
| `.ipt`, `.textarea`, `.select` | `--control-bg`                   | Form control background.                           |
| `.ipt`, `.textarea`, `.select` | `--control-border`               | Form control border.                               |
| `.ipt`, `.textarea`, `.select` | `--control-border-active`        | Focus-visible border.                              |
| `.ipt`, `.textarea`, `.select` | `--control-fg`                   | Form control text color.                           |
| `.ipt`, `.textarea`, `.select` | `--control-placeholder`          | Placeholder text color.                            |
| `.alert`, `.toast`, `.badge`   | `--feedback-color`               | Semantic feedback color.                           |
| `.alert`, `.toast`, `.badge`   | `--feedback-contrast`            | Feedback contrast color.                           |
| `.alert`, `.toast`, `.badge`   | `--feedback-surface`             | Feedback surface background.                       |
| `.alert`, `.toast`, `.badge`   | `--feedback-border`              | Feedback border color.                             |
| `.tooltip`                     | `--tooltip-bg`                   | Tooltip background.                                |
| `.tooltip`                     | `--tooltip-fg`                   | Tooltip text color.                                |
| `.tooltip`                     | `--tooltip-gap`                  | Tooltip offset from host.                          |
| `.tooltip`                     | `--tooltip-*` position variables | Internal tooltip placement defaults and overrides. |
| `.progress > *`                | `--progress-value`               | Progress fill width, such as `64%`.                |

Component-scoped tokens are stable enough to override when needed. Prefer overriding foundation tokens first when the desired change is broad.
