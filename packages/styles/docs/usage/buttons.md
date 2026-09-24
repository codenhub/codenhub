---
title: Buttons
description: Button classes, intents, sizes, and states.
order: 5
---

# Buttons

Use `.btn` with one optional intent class, one optional fill class, one optional edge class, optional size class, and optional state. See [Composing](./composing.md) for how the intent, presentation, and aesthetic axes combine on any component.

Intent classes map color tokens into button tone slots. [Presentation](./composing.md#presentation) decides how much of that intent reaches background, text, border, and hover.

Intent classes:

| Class                  | Meaning                        |
| ---------------------- | ------------------------------ |
| `.neutral` _(default)_ | No specific intent.            |
| `.primary`             | Primary action.                |
| `.secondary`           | Secondary/accent action.       |
| `.success`             | Successful or positive action. |
| `.warning`             | Warning/caution action.        |
| `.destructive`         | Destructive or error action.   |
| `.info`                | Informational action.          |

Every component that supports intent accepts the same list and reads the same [intent tokens](./theming.md#intent-tokens), so a custom intent class works everywhere without touching a component.

`.neutral` is the only intent that does not fill all the way. Its color is the page's own text color, so a full fill of it would be a black or white slab — the loudest element on the page, for the intent that means nothing in particular. It stops at `--intent-fill-max`, which is why a `.solid` neutral is a quiet plate a step past `.soft` rather than a block of ink. Set the slot on your own intent classes; see [Theming → Intent tokens](./theming.md#intent-tokens).

Size and shape classes:

| Class                                                                  | Purpose                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.pill`                                                                | Fully rounded button corners (`border-radius: 9999px`).                                                                                                                                                                                   |
| `.sm`                                                                  | Smaller button.                                                                                                                                                                                                                           |
| `.lg`                                                                  | Larger button.                                                                                                                                                                                                                            |
| `.p-xs`                                                                | Tightest padding modifier (`px-2 py-0.5`; icon `p-0.5`). Also drops the `--control-height` minimum so a chip-sized button fits a table cell or a dense toolbar; every other size and padding class keeps that floor for a labeled button. |
| `.p-sm`                                                                | Compact padding modifier (`px-2.5 py-1`; icon `p-1`).                                                                                                                                                                                     |
| `.p-lg`                                                                | Spacious padding modifier (`px-6 py-3`; icon `p-3`).                                                                                                                                                                                      |
| `.icon`                                                                | Square icon button, sized to its own padding rather than to `--control-height`. Use an accessible name in HTML.                                                                                                                           |
| `.disabled`, `[disabled]`, `[aria-disabled="true"]`, `[data-disabled]` | Disabled styling.                                                                                                                                                                                                                         |

Examples:

```html
<button class="btn primary">Primary</button>
<button class="btn success ghost edged">Success outline</button>
<button class="btn warning soft">Warning soft</button>
<button class="btn destructive ghost edgeless">Danger ghost</button>
<button class="btn icon primary" aria-label="Create">+</button>
<button class="btn primary" disabled>
  <span class="loader sm" aria-hidden="true"></span>
  Saving
</button>
```

## Loading

The package ships no loading state of its own: a loading button is a disabled `.btn` composed with a real [`.loader`](./feedback.md) child, the same activity indicator every other component uses. Disable the button so users cannot trigger duplicate work, and drop a `.loader` in beside the label — any of its variants (`.dots-wave`, `.bars-wave`, and so on) work the same way. Whether to also hide the label is your call; the package has no built-in mechanism for that.

On the base look a press scales the button down a little (`--ui-active-transform`, `scale(0.97)`). [Aesthetics](./aesthetics.md) swap in their own press gesture, and `prefers-reduced-motion` turns it off.

Use `<button>` for actions or an accessible link for navigation; see [Accessibility](../accessibility.md).
