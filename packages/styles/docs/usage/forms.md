---
title: Forms
description: Field, text control, and toggle class reference.
---

# Forms

| Class or Selector                                                     | Purpose                                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------------- |
| `.field`                                                              | Vertical field wrapper.                                       |
| `.label`                                                              | Form label text.                                              |
| `.hint`                                                               | Secondary helper text.                                        |
| `.hint.error`                                                         | Helper text with destructive intent.                          |
| `.surface`                                                            | Shared public container composition utility.                  |
| `.text-control`                                                       | Shared public text-control composition utility.               |
| `.ipt`                                                                | Input control styling.                                        |
| `.input-group`                                                        | Wrapper that owns the field box so a control can carry icons. |
| `.textarea`                                                           | Textarea control styling.                                     |
| `.select`                                                             | Select control styling.                                       |
| `input[type="checkbox"].checkbox`                                     | Custom checkbox control styling.                              |
| `input[type="radio"].radio`                                           | Custom radio control styling.                                 |
| `input[type="checkbox"].switch`                                       | Custom switch control styling.                                |
| `[aria-invalid="true"]` on controls                                   | Destructive border and focus color.                           |
| `[disabled]`, `[aria-disabled="true"]`, `[data-disabled]` on controls | Disabled styling.                                             |

## Icons

The package ships no icons. It used to paint one per input type as a
`background-image` — a `data:` URI, which cannot read `currentColor` or a
custom property, so every glyph shipped a light and a dark copy and a theme
selector chose between them. That put icon artwork, and the package's only
theme-by-selector branch, inside a CSS-only design system whose glyphs did
not fit every aesthetic. Icons are the consumer's to choose now.

`.input-group` is the wrapper for a control that carries one. It owns the
field box — border, radius, fill, focus ring, invalid and disabled state —
and the control inside it goes flush, so the boundary is drawn once. Any
icon element works, placed before the control for a leading icon or after it
for a trailing one: an inline `<svg>`, an `<img>`, or a class from an icon
set such as `@codenhub/icons`.

```html
<label class="field">
  <span class="label">Email</span>
  <div class="input-group">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" aria-hidden="true">
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" />
    </svg>
    <input class="ipt" type="email" />
  </div>
  <div class="input-group">
    <input class="ipt" type="search" />
    <i class="ic-search" aria-hidden="true"></i>
  </div>
</label>
```

The group reads intent and both [presentation](./composing.md#presentation)
axes the same way a lone `.ipt` does — `.input-group.soft.edgeless` is the
sunk variant, `.input-group.primary` colors the boundary — and follows
whichever [aesthetic](./aesthetics.md) is in scope. `aria-invalid` or
`disabled` on the control inside propagates to the group; so does either on
the group itself. Focus is shown with `:focus-within`, so unlike a lone
field the ring also appears on a mouse click.

Non-icon input types keep the browser's native `date` and `datetime-local`
pickers. WebKit's native `search` decorations are still suppressed on
`.text-control` to keep them from overlapping the value.

## Toggles

`.checkbox`, `.radio`, and `.switch` accept the same intent classes as
buttons to set the checked color:

| Class                               | Meaning                 |
| ----------------------------------- | ----------------------- |
| `.neutral` _(default)_              | Text color, capped.     |
| `.primary`                          | Primary color.          |
| `.secondary`                        | Secondary/accent color. |
| `.success`                          | Success color.          |
| `.warning`                          | Warning color.          |
| `.destructive`, `.danger`, `.error` | Destructive color.      |
| `.info`                             | Info color.             |

All three toggles rest at `.solid`, and **`.ghost` is not supported on any of
them.** An unchecked ghost toggle is the silhouette every toggle already
has, and a checked one is a mark on nothing — a tick floating on the page, a
dot with no ring around it. A container that cascades `.ghost` onto a
toggle is floored rather than obeyed.

Presentation decides the fill in both states. Being checked lifts the cap
rather than pinning a fill, so the class still chooses:

| Toggle            | unchecked       | checked                         |
| ----------------- | --------------- | ------------------------------- |
| `.solid`, default | 20%, switch 40% | 100%, mark in the contrast tone |
| `.soft`           | 12%             | 12%, mark in the strong tone    |

A checked checkbox and a checked switch cut their mark out of that plate. A
checked radio thickens its ring to twice the resting line and takes the
intent whole on it, so `.radio.soft` is the classic ring-and-dot radio and
`.radio.solid` is a filled circle whose dot stays readable — the mark
follows the plate rather than being pinned to the intent color.

## Text controls

Text controls also take intent, which colors the resting border and the
focus-visible border, and both [presentation](./composing.md#presentation)
axes. `.ghost` fills nothing, `.soft` takes `12%`, and `.solid` takes `20%`
— quiet enough that typed text still reads on it, and ordered so the louder
name draws the stronger tint. None of them touches the line.

The boundary is the edge axis's, and it splits the same way. A container's
`.edgeless` is floored, so a toolbar cannot leave a field with no mark of
where typing goes. `.edgeless` on the control itself is honoured, which is
how the borderless field is spelled — it does not meet WCAG 1.4.11 at rest,
so it is opt-in and never a default, and the focus ring still shows.

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

`.surface` is a public low-level utility. It is the box every container in
the package composes: ghost, edged, surface radius, and the two slots only
a surface resolves — the backdrop filter and the complete surface shadow.
Use it to paint a container the package does not ship, under whichever
aesthetic is in scope. Prefer `.card` or `.panel` when they fit.

```html
<div class="surface glass">Blurred, translucent, glass corners</div>
<div class="surface pixel">Cut corners and an inset ring</div>
<div class="surface primary solid">Any intent, any presentation</div>
```

`.text-control` is a public low-level utility from the form entrypoint. It
provides the shared control dimensions, border, placeholder, focus-visible,
invalid, and disabled styles composed by `ipt`, `textarea`, and `select`.
Use it for custom text-like controls; prefer those higher-level utilities
when they fit.

## Example

```html
<label class="field">
  <span class="label">Email</span>
  <input class="ipt" type="email" aria-invalid="true" aria-describedby="email-error" />
  <span class="hint error" id="email-error">Enter a valid email.</span>
</label>
<label style="display: flex; gap: 0.5rem; align-items: center">
  <input type="checkbox" class="checkbox success" />
  <span>Accept terms</span>
</label>
<label style="display: flex; gap: 0.5rem; align-items: center">
  <input type="radio" class="radio secondary" name="plan" />
  <span>Standard plan</span>
</label>
<label style="display: flex; gap: 0.5rem; align-items: center">
  <input type="checkbox" class="switch destructive" />
  <span>Enable</span>
</label>
```

Use labels, `type`, validation logic, `aria-describedby`, and error message
relationships; see [Accessibility](../accessibility.md).
