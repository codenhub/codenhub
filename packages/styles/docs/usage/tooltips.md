---
title: Tooltips
description: Tooltip composition classes and positioning attributes.
order: 8
---

# Tooltips

| Class or Attribute                     | Purpose                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------ |
| `.tooltip`                             | Wrapper around a trigger and a bubble. Paints nothing itself.            |
| `.tooltip-bubble`                      | The message. A real element, styled like any other surface.              |
| `.tooltip-icon`                        | Circular icon-style trigger, for a message with nothing else to hang on. |
| `[data-tooltip-position="top"]`        | Positions the bubble above the trigger, on `.tooltip`.                   |
| `[data-tooltip-position="bottom"]`     | Positions the bubble below the trigger, on `.tooltip`.                   |
| `[data-tooltip-position="left"]`       | Positions the bubble left of the trigger, on `.tooltip`.                 |
| `[data-tooltip-position="right"]`      | Positions the bubble right of the trigger, on `.tooltip`.                |
| No `data-tooltip-position`             | Defaults to top placement.                                               |
| `[data-state="open"]`                  | Shows the bubble without hover, on `.tooltip`.                           |
| `.tooltip-bubble.raised` / `.floating` | Adds one or two units of depth. The bubble is flat by default.           |

A tooltip is composition, not a single class: `.tooltip` wraps a trigger element and a `.tooltip-bubble`, and shows the bubble on hover or focus within the wrapper. This replaced a `::after` pseudo-element that carried the message as `content: attr(data-tooltip)` — CSS generated content is not reliably exposed to assistive tech, and cannot be the target of an `aria-describedby`, since that needs a real element with a real `id`. A real bubble can be. Wire the association yourself: give the bubble an `id`, give the trigger `aria-describedby` pointing at it, and put `role="tooltip"` on the bubble.

A tooltip bubble's fill, ground color, and floor behavior are covered in [Composing → Presentation](./composing.md#presentation), and its material follows whichever [aesthetic](./aesthetics.md) is in scope. Intent, presentation, aesthetic, and elevation classes go on `.tooltip-bubble` — the element that actually paints — not on `.tooltip`, the same rule every component in this package follows: put the class on the element that shows it.

The bubble rests flat. It draws no shadow of its own on a plain page, and zeroes an aesthetic's part-based depth (such as `.neobrutalism`'s slab) the same way `.flat` does elsewhere. Add [`.raised` or `.floating`](./composing.md#elevation) to lift it, on the bubble itself — `.tooltip-bubble.floating` is the pre-0.1.0 look. An aesthetic whose shadow is a complete value, like `.glass`, still reaches the bubble as it reaches any surface.

Intent works on a tooltip bubble the same way it works on a filled component: `.tooltip-bubble.primary` fills the bubble with the primary color, black text on a light page and white on a dark one; `.tooltip-bubble.destructive` is a red bubble with the same logic. With no intent, the bubble uses `--color-tooltip`, a plate chosen per theme rather than derived from an intent; see [Composing → Presentation](./composing.md#presentation) for why.

## Example

```html
<span class="tooltip">
  <button aria-describedby="status-bubble">Status</button>
  <span class="tooltip-bubble" role="tooltip" id="status-bubble">Saved 2 minutes ago</span>
</span>

<span class="tooltip" data-tooltip-position="bottom">
  <button aria-describedby="docs-bubble">Docs</button>
  <span class="tooltip-bubble" role="tooltip" id="docs-bubble">Opens in a new tab</span>
</span>

<span class="tooltip">
  <button class="btn primary" aria-describedby="deploy-bubble">Deploy</button>
  <span class="tooltip-bubble raised primary" role="tooltip" id="deploy-bubble">Primary intent, lifted a step</span>
</span>

<span class="tooltip" data-state="open">
  <span aria-describedby="pinned-bubble">Pinned</span>
  <span class="tooltip-bubble" role="tooltip" id="pinned-bubble">Always visible, no hover needed</span>
</span>

<span class="tooltip" data-tooltip-position="right">
  <span class="tooltip-icon" tabindex="0" aria-label="More details" aria-describedby="icon-bubble">?</span>
  <span class="tooltip-bubble" role="tooltip" id="icon-bubble">More details</span>
</span>
```

The first two show plain triggers with default (top) and explicit bottom placement. The third combines an intent with `.raised` on the bubble to show they compose freely — the intent decides the bubble's fill, `.raised` decides whether it casts depth. The fourth uses `data-state="open"` on the wrapper to keep a tooltip visible without a hover or focus interaction, useful for a tooltip that should be demonstrated or tested without simulating pointer input. The fifth uses `.tooltip-icon` as the trigger, for a message with no other element to hang it on.

`.tooltip` composes with any trigger: wrap an existing `.btn` or `.badge` in it and both keep their own look, gaining a bubble beside them. `.tooltip-icon` is only the circular chip for the case where there is nothing else to be the trigger.

Showing and hiding the bubble is CSS-only — `:hover` and `:focus-within` on `.tooltip` — but that is presentational. It is not a complete accessible tooltip implementation by itself: provide the `id`/`aria-describedby`/`role="tooltip"` association outside the CSS; see [Accessibility](../accessibility.md).

Next: [Content and layout](./content-and-layout.md) covers layout helpers, content chips and tables, surfaces, and typography utilities.
