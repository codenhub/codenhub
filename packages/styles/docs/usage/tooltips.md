---
title: Tooltips
description: Tooltip host classes and positioning attributes.
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

A tooltip bubble's fill, ground color, and floor behavior are covered in
[Composing → Presentation](./composing.md#presentation), and its material
follows whichever [aesthetic](./aesthetics.md) is in scope, including the
pseudo-element itself.

The bubble rests flat. It draws no shadow of its own on a plain page, and
zeroes an aesthetic's part-based depth (such as `.neobrutalism`'s slab) the
same way `.flat` does elsewhere. Add [`.raised` or
`.floating`](./composing.md#elevation) to lift it — `.tooltip.floating` is the
pre-0.1.0 look. An aesthetic whose shadow is a complete value, like `.glass`,
still reaches the bubble as it reaches any surface.

```html
<button
  class="tooltip tooltip-icon"
  data-tooltip="More details"
  data-tooltip-position="right"
  aria-label="More details"
>
  ?
</button>
```

CSS pseudo-element tooltips are presentational. They are not a complete
accessible tooltip implementation by themselves — provide accessible
names/descriptions outside the CSS; see [Accessibility](../accessibility.md).
