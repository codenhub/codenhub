---
title: Forms
description: Field, text control, and toggle class reference.
---

# Forms

| Class or Selector                                                     | Purpose                                                         |
| --------------------------------------------------------------------- | --------------------------------------------------------------- |
| `.field`                                                              | Vertical field wrapper.                                         |
| `.label`                                                              | Form label text.                                                |
| `.hint`                                                               | Secondary helper text.                                          |
| `.hint.error`                                                         | Helper text with destructive intent.                            |
| `.surface`                                                            | Shared public container composition utility.                    |
| `.text-control`                                                       | Shared public text-control composition utility.                 |
| `.ipt`                                                                | Input control styling.                                          |
| `.ipt.icon`                                                           | Opts-in to displaying an input icon.                            |
| `.left` / `.right` (on `.ipt.icon` or native inputs)                  | Icon alignment (left by default).                               |
| `.email`, `.password`, `.url`, `.tel`, `.search`, `.date`, etc.       | Input type icon selectors (class or matching `type` attribute). |
| `.textarea`                                                           | Textarea control styling.                                       |
| `.select`                                                             | Select control styling.                                         |
| `input[type="checkbox"].checkbox`                                     | Custom checkbox control styling.                                |
| `input[type="radio"].radio`                                           | Custom radio control styling.                                   |
| `input[type="checkbox"].switch`                                       | Custom switch control styling.                                  |
| `[aria-invalid="true"]` on controls                                   | Destructive border and focus color.                             |
| `[disabled]`, `[aria-disabled="true"]`, `[data-disabled]` on controls | Disabled styling.                                               |

## Input icons

`.ipt` input icons are opt-in via `.icon` (e.g.
`<input class="ipt email icon left">`). Native inputs mapped in `native.css`
get the same icon source from their type, and the same opt-in: the artwork
is drawn only where the element also carries `.icon`.

`date` and `datetime-local` depend on the engine, because their picker
button is the one browsers do not all let a stylesheet hide. Where it can be
hidden, the type opts itself into `.icon` and shows the themed calendar in
its place. Where it cannot, the native button stays and no custom icon is
drawn, since two calendar glyphs on one field read as a defect. `.icon`,
`.left`, and `.right` are inert on these two types in that case rather than
reserving space for artwork that never paints. Native WebKit search
decorations are suppressed on `search` inputs to prevent placeholder overlap
when `.icon` is omitted.

An input icon is a `background-image` on the control itself, so a field that
wants one needs no wrapper element around it.

```html
<label class="field">
  <span class="label">Email</span>
  <input class="ipt email icon" type="email" />
</label>
```

A `data:` URI is a document of its own and inherits nothing from the page,
so the artwork can read neither `currentColor` nor a custom property and
each glyph ships a light and a dark copy that a theme selector picks
between. That is the one place in the package where a theme is chosen by
selector rather than resolved by `light-dark()` at the point of use, because
`light-dark()` takes colors and these are images.

`--ipt-icon-src` on the control replaces the artwork with any image.

```html
<input class="ipt icon" style="--ipt-icon-src: url('/icons/user.svg')" />
```

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
  <input class="ipt email icon" type="email" aria-invalid="true" aria-describedby="email-error" />
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
