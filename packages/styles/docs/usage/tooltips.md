---
title: Tooltips
description: Tooltip host classes and positioning attributes.
order: 8
---

# Tooltips

| Class or Attribute                      | Purpose                                                        |
| --------------------------------------- | -------------------------------------------------------------- |
| `.tooltip`                              | Tooltip host. Uses `data-tooltip` as pseudo-element content.   |
| `.tooltip.tooltip-icon`                 | Circular icon-style tooltip host.                              |
| `[data-tooltip-position="top"]`         | Positions tooltip above host.                                  |
| `[data-tooltip-position="bottom"]`      | Positions tooltip below host.                                  |
| `[data-tooltip-position="left"]`        | Positions tooltip left of host.                                |
| `[data-tooltip-position="right"]`       | Positions tooltip right of host.                               |
| No `data-tooltip-position`              | Defaults to top placement.                                     |
| `[data-state="open"]`                   | Shows tooltip without hover.                                   |
| `.tooltip.raised` / `.tooltip.floating` | Adds one or two units of depth. The bubble is flat by default. |

A tooltip bubble's fill, ground color, and floor behavior are covered in [Composing → Presentation](./composing.md#presentation), and its material follows whichever [aesthetic](./aesthetics.md) is in scope, including the pseudo-element itself.

The bubble rests flat. It draws no shadow of its own on a plain page, and zeroes an aesthetic's part-based depth (such as `.neobrutalism`'s slab) the same way `.flat` does elsewhere. Add [`.raised` or `.floating`](./composing.md#elevation) to lift it — `.tooltip.floating` is the pre-0.1.0 look. An aesthetic whose shadow is a complete value, like `.glass`, still reaches the bubble as it reaches any surface.

Intent works on a tooltip the same way it works on a filled component: `.tooltip.primary` fills the bubble with the primary color, black text on a light page and white on a dark one; `.tooltip.destructive` is a red bubble with the same logic. With no intent, the bubble uses `--color-tooltip`, a plate chosen per theme rather than derived from an intent — near-white in light, mid-grey in dark; see [Composing → Presentation](./composing.md#presentation) for why.

## Example

```html
<button class="tooltip" data-tooltip="Saved 2 minutes ago">Status</button>
<button class="tooltip" data-tooltip="Opens in a new tab" data-tooltip-position="bottom">Docs</button>
<button class="tooltip primary raised" data-tooltip="Primary intent, lifted a step">Deploy</button>
<button class="tooltip" data-tooltip="Always visible, no hover needed" data-state="open">Pinned</button>
<button class="tooltip tooltip-icon" data-tooltip="More details" data-tooltip-position="right" aria-label="More details">?</button>
```

The first two show plain hosts with default (top) and explicit bottom placement. The third combines an intent with `.raised` to show they compose freely — the intent decides the bubble's fill, `.raised` decides whether it casts depth. The fourth uses `data-state="open"` to keep a tooltip visible without a hover or focus interaction, useful for a tooltip that should be demonstrated or tested without simulating pointer input. The fifth is the circular icon variant.

CSS pseudo-element tooltips are presentational. They are not a complete accessible tooltip implementation by themselves — provide accessible names/descriptions outside the CSS; see [Accessibility](../accessibility.md).
