---
title: Forms
description: Field, text control, and toggle class reference.
order: 6
---

# Forms

| Class or Selector                                                     | Purpose                                                                  |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `.field`                                                              | Vertical field wrapper.                                                  |
| `.label`                                                              | Form label text.                                                         |
| `.hint`                                                               | Secondary helper text.                                                   |
| `.hint.destructive`                                                   | Helper text with destructive intent.                                     |
| `.surface`                                                            | Shared public container composition utility.                             |
| `.text-control`                                                       | Shared public text-control composition utility.                          |
| `.ipt`                                                                | Input control styling.                                                   |
| `.input-group`                                                        | Wrapper that owns the field box so a control can carry an icon or affix. |
| `.textarea`                                                           | Textarea control styling.                                                |
| `.select`                                                             | Select control styling.                                                  |
| `input[type="checkbox"].checkbox`                                     | Custom checkbox control styling.                                         |
| `input[type="radio"].radio`                                           | Custom radio control styling.                                            |
| `input[type="checkbox"].switch`                                       | Custom switch control styling.                                           |
| `[aria-invalid="true"]` on controls                                   | Destructive border and focus color.                                      |
| `[disabled]`, `[aria-disabled="true"]`, `[data-disabled]` on controls | Disabled styling.                                                        |

## Icons

The package ships no icon for text inputs. Icons for `.input-group` are the consumer's to choose: artwork painted as a `data:` URI could not read `currentColor` or a custom property, so it could not follow the theme or fit every aesthetic. The toggle marks below are the exception: small, fixed, built-in glyphs. `.alert` likewise takes a consumer-supplied icon; see [Feedback](./feedback.md#example).

`.input-group` is the wrapper for a control that carries one. It owns the field box — border, radius, fill, focus ring, invalid and disabled state — and the control inside it goes flush, so the boundary is drawn once. Any icon element works, placed before the control for a leading icon or after it for a trailing one: an inline `<svg>`, an `<img>`, or a class from an icon set such as `@codenhub/icons`.

```html
<div class="field">
  <label class="label" for="contact-email">Email</label>
  <div class="input-group">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" aria-hidden="true">
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" />
    </svg>
    <input class="ipt" type="email" id="contact-email" />
  </div>
</div>
<div class="field">
  <label class="label" for="site-search">Search</label>
  <div class="input-group">
    <input class="ipt" type="search" id="site-search" />
    <i class="ic-search" aria-hidden="true"></i>
  </div>
</div>
```

The group reads intent and both [presentation](./composing.md#presentation) axes the same way a lone `.ipt` does — `.input-group.soft.edgeless` is the sunk variant, `.input-group.primary` colors the boundary — and follows whichever [aesthetic](./aesthetics.md) is in scope. `aria-invalid` or `disabled` on the control inside propagates to the group; so does either on the group itself. Focus is shown with `:focus-within`, so unlike a lone field the ring also appears on a mouse click.

Non-icon input types keep the browser's native `date` and `datetime-local` pickers. WebKit's native `search` decorations are still suppressed on `.text-control` to keep them from overlapping the value.

The slot works the same way for a text affix — a URL host, a currency symbol, a unit — not just an icon:

```html
<div class="input-group">
  <span>example.com/</span>
  <input class="ipt" type="text" />
</div>
```

The gap between the control and its adornment is `--input-group-gap`, `0.5rem` by default: the right amount of breathing room for a distinct icon glyph, and too much for text meant to read as glued to the value — `example.com/` followed by a gap reads as a stray space breaking the path apart. Set `--input-group-gap: 0` on the group for a flush affix; icon compositions keep the default unchanged.

## Toggles

`.checkbox`, `.radio`, and `.switch` accept the same intent classes as buttons to set the checked color:

| Class                  | Meaning                 |
| ---------------------- | ----------------------- |
| `.neutral` _(default)_ | Text color, capped.     |
| `.primary`             | Primary color.          |
| `.secondary`           | Secondary/accent color. |
| `.success`             | Success color.          |
| `.warning`             | Warning color.          |
| `.destructive`         | Destructive color.      |
| `.info`                | Info color.             |

All three toggles rest at `.soft`. Presentation decides the _unchecked_ plate; checked is pinned to one look regardless of which class is on the element, so a checkbox, a radio, and a switch each have a single "on" identity rather than one per presentation:

| Toggle           | unchecked | checked                                  |
| ---------------- | --------- | ---------------------------------------- |
| `.ghost`         | 0%        | 100%, mark in the contrast tone (pinned) |
| `.soft`, default | 12%       | 100%, mark in the contrast tone (pinned) |
| `.solid`         | 40%       | 100%, mark in the contrast tone (pinned) |

A checked checkbox and a checked switch cut their mark out of that pinned plate. A checked radio thickens its ring to twice the resting line and takes the intent whole on it, and the dot follows the same pinned plate, so `.radio.soft` and `.radio.solid` render the same filled circle once checked — presentation only changes what the radio looks like before it's picked.

## Text controls

Text controls also take intent, which colors the resting border and the focus-visible border, and both [presentation](./composing.md#presentation) axes. `.ghost` fills nothing, `.soft` takes `12%`, and `.solid` takes `20%` — quiet enough that typed text still reads on it, and ordered so the louder name draws the stronger tint. None of them touches the line.

The boundary is the edge axis's, and it splits the same way. A container's `.edgeless` is floored, so a toolbar cannot leave a field with no mark of where typing goes. `.edgeless` on the control itself is honoured, which is how the borderless field is spelled — it does not meet WCAG 1.4.11 at rest, so it is opt-in and never a default, and the focus ring still shows.

```html
<input class="ipt success" placeholder="Valid" />
<input class="ipt ghost edged" placeholder="Outlined" />
<input class="ipt soft edged" placeholder="Tinted with a border" />
<input class="ipt soft edgeless" placeholder="Sunk into the page" />
<div class="soft">
  <input class="ipt" placeholder="Tinted from the container, capped at 6%" />
</div>
<div class="edgeless">
  <input class="ipt" placeholder="Keeps its line; the floor holds" />
</div>
```

`.surface` is a public low-level utility. It is the box every container in the package composes: ghost, edged, surface radius, and the two slots only a surface resolves — the backdrop filter and the complete surface shadow. Use it to paint a container the package does not ship, under whichever aesthetic is in scope. Prefer `.card` or `.panel` when they fit.

```html
<div class="surface glass">Blurred, translucent, glass corners</div>
<div class="surface pixel">Cut corners and an inset ring</div>
<div class="surface primary solid">Any intent, any presentation</div>
```

`.text-control` is a public low-level utility from the form entrypoint. It provides the shared control dimensions, border, placeholder, focus-visible, invalid, and disabled styles composed by `ipt`, `textarea`, and `select`. Use it for custom text-like controls; prefer those higher-level utilities when they fit.

## Example

```html
<div class="field">
  <label class="label" for="email">Email</label>
  <input class="ipt" type="email" id="email" aria-invalid="true" aria-describedby="email-error" />
  <span class="hint destructive" id="email-error">Enter a valid email.</span>
</div>
<label style="display: flex; gap: 0.5rem; align-items: center">
  <input type="checkbox" class="checkbox success" />
  <span>Accept terms</span>
</label>
<label style="display: flex; gap: 0.5rem; align-items: center">
  <input type="radio" class="radio secondary" name="plan" />
  <span>Standard plan</span>
</label>
<label style="display: flex; gap: 0.5rem; align-items: center">
  <input type="checkbox" class="switch destructive" role="switch" />
  <span>Enable</span>
</label>
```

Keep a hint or error message outside the `<label>` and point `aria-describedby` at it, so it is announced as a description rather than read as part of the field's name. Give a `.switch` `role="switch"`. Use labels, `type`, validation logic, `aria-describedby`, and error message relationships; see [Accessibility](../accessibility.md).
