---
status: APPROVED
last_updated: 2026-08-10
scope: `@codenhub/styles` styling model, token contracts, and composition rules.
---

# Architecture

This document defines how `@codenhub/styles` decides what an element looks like.
It is the source of truth for the token contracts; public documents under
`docs/` describe the same model for consumers.

## The three axes

Every styled element answers three independent questions. Each question owns one
axis, one token contract, and one set of classes.

| Axis         | Question        | Tokens                  | Cascades | Classes                                                                         |
| ------------ | --------------- | ----------------------- | -------- | ------------------------------------------------------------------------------- |
| Intent       | Which color?    | `--intent-*`            | No       | `.neutral` `.primary` `.secondary` `.success` `.warning` `.destructive` `.info` |
| Presentation | How much of it? | `--ui-fill` and peers   | Yes      | `.flat` `.out` `.ghost` `.soft` `.fill`                                         |
| Aesthetic    | Made of what?   | `--ui-radius` and peers | Yes      | `.neobrutalism` `.glass` `.pixel`                                               |

The axes are orthogonal by construction: intent carries only hue, presentation
only unitless ratios, aesthetic only lengths, shadows, and shapes. A component
resolves all three at its own root and never branches on a combination.

The axes meet in exactly one place, deliberately:

```css
border-width: calc(var(--ui-border-width) * var(--ui-border-scale));
```

The aesthetic supplies the base material thickness; the presentation scales it.

## Why intent does not cascade

Presentation and aesthetic tokens are safe to inherit because they carry no
color. A container can set them once and every descendant resolves them against
its own palette.

Intent is different. A container that silently recolors every descendant is a
trap rather than a feature: a `.success` panel would turn its nested destructive
button green. So intent classes set `--intent-*`, but every component redeclares
the neutral defaults at its own root:

```css
@utility btn {
  --intent-color: var(--color-text);
  --intent-contrast: var(--color-text-contrast);
  /* ... */
}
```

A declaration on the element beats an inherited one, so the component's own reset
wins over any ancestor's intent, while `.btn.primary` still wins over the reset
through selector specificity. This is what makes intent element-scoped without
requiring `:not()` chains.

## Token contracts

### Intent tokens

Set by intent classes, read by components. Public: consumers may set them
directly to build an intent the package does not ship.

| Token               | Meaning                                               |
| ------------------- | ----------------------------------------------------- |
| `--intent-color`    | The intent's base color.                              |
| `--intent-contrast` | Readable color on top of a filled `--intent-color`.   |
| `--intent-hover`    | The intent's hovered base color.                      |
| `--intent-strong`   | High-emphasis tone; readable text on subtle surfaces. |
| `--intent-subtle`   | Low-emphasis tone; tinted surfaces and tracks.        |

Intent classes map a `--color-*` family onto these five slots and do nothing
else. Adding an intent is five declarations; adding a component that supports
every intent is zero.

### Presentation tokens

Unitless numbers and percentages only. A custom property resolves on the element
that declares it, so a value referencing an intent token here would resolve
against the container's intent and inherit down already-resolved. Numbers carry
no intent, so they inherit safely.

| Token                   | Meaning                                                          |
| ----------------------- | ---------------------------------------------------------------- |
| `--ui-fill`             | Percent of `--intent-color` mixed into the background.           |
| `--ui-fg-on-fill`       | Percent blended from the readable tone toward the contrast tone. |
| `--ui-border`           | Percent of `--intent-color` mixed into the border.               |
| `--ui-border-scale`     | Multiplier over `--ui-border-width`.                             |
| `--ui-hover-fill`       | Percent of `--intent-hover` mixed into the hovered background.   |
| `--ui-hover-fg-on-fill` | Percent blended toward the contrast tone while hovered.          |

### Material tokens

Lengths, shadows, and shapes. Set by aesthetic classes and by `:root` for the
default aesthetic; read by components.

| Token                  | Meaning                                                          |
| ---------------------- | ---------------------------------------------------------------- |
| `--ui-radius`          | Corner radius for controls; surfaces scale from it.              |
| `--ui-border-width`    | Base border thickness before `--ui-border-scale`.                |
| `--ui-shadow`          | Complete `box-shadow` value, or `none`.                          |
| `--ui-shadow-offset`   | Offset an aesthetic animates on hover and press.                 |
| `--ui-blur`            | `backdrop-filter` blur radius, or `0`.                           |
| `--ui-bg-alpha`        | Opacity applied to a resolved background, for translucent skins. |
| `--ui-hover-transform` | Transform applied on interactive hover.                          |
| `--ui-clip`            | `clip-path` applied to the element, or `none`.                   |

Components read material tokens with a `var()` fallback matching the default
aesthetic, so a component keeps its normal look when no aesthetic is in scope.

## Composition rules

Components resolve every axis at their own root and expose the results as
component-scoped variables:

```css
@utility btn {
  --intent-color: var(--color-text);

  --btn-bg: color-mix(in oklab, var(--intent-color) var(--ui-fill, 100%), transparent);
  --btn-border-width: calc(var(--ui-border-width, var(--border-width)) * var(--ui-border-scale, 1));
}
```

Two choices there are deliberate and apply everywhere. Mixing toward
`transparent` rather than a background token lets a tinted surface adapt to
whatever it is placed on. Mixing in `oklab` keeps the wide-gamut palette intact
and blends perceptually, where `srgb` would clip it.

Component-scoped variables such as `--btn-*`, `--control-*`, `--feedback-*`,
`--progress-*`, and `--tooltip-*` are internal wiring, not public contract.

## Theme values

Color tokens are declared once using `light-dark()`. Theme selectors set only
`color-scheme`:

```css
:root {
  color-scheme: light dark;
  --color-text: light-dark(var(--color-neutral-950), var(--color-neutral-50));
}

.light,
.theme-light,
[data-theme="light"] {
  color-scheme: light;
}
.dark,
.theme-dark,
[data-theme="dark"] {
  color-scheme: dark;
}
```

`light-dark()` resolves at the point of use, against the consuming element's
computed `color-scheme`. This was verified in Chromium, Firefox, and WebKit,
including resolution through `color-mix()` and through Tailwind's `@theme`, which
emits theme values as unregistered custom properties rather than `@property`
registrations.

Three consequences:

- `color-scheme: light dark` on `:root` expresses the system preference, so no
  `@media (prefers-color-scheme: dark)` block is needed.
- Theme selectors work at any depth and nest, because `color-scheme` inherits.
  The previous `:root:not(.light, ...)` media fallback only worked at the root.
- `light-dark()` accepts `<color>` only. Composite values such as `box-shadow`
  cannot use it, so `--elevation-*` is composed from a `--elevation-color` token
  that can.

This establishes a browser baseline of Chrome 123, Safari 17.5, and Firefox 120.

## Aesthetics

Aesthetics are cascading classes that set material tokens, plus their own
presentation defaults. An explicit presentation class on the element still wins,
because it is declared on the element rather than inherited.

| Aesthetic       | Material                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------- |
| _(default)_     | Foundation tokens: `--radius-control`, `--border-width`, `--elevation-low`, no clip.      |
| `.neobrutalism` | Thick border, hard unblurred offset shadow, saturated fill, hover translates into shadow. |
| `.glass`        | Large radius, `backdrop-filter` blur, low background alpha, hairline highlight border.    |
| `.pixel`        | Stepped `clip-path` corners, pixel border drawn as a layer, `--font-pixel`, no radius.    |

### Compatibility

Aesthetics and presentations are composable but not universally sensible. Bad
combinations are documented rather than blocked, because blocking them in CSS
requires per-aesthetic-per-presentation selector pairs.

| Aesthetic       | `.flat` | `.out` | `.ghost` | `.soft` |
| --------------- | ------- | ------ | -------- | ------- |
| `.neobrutalism` | Yes     | Yes    | Weak     | Yes     |
| `.glass`        | Yes     | Yes    | Yes      | Yes     |
| `.pixel`        | Yes     | Yes    | Weak     | Yes     |

"Weak" means the aesthetic's defining trait is a border or shadow that `.ghost`
removes, leaving the element nearly unstyled. Supported, but not recommended.

`.glass` requires something behind it to blur. On a flat page background it
renders as a plain translucent panel. It is intended for surfaces, overlays, and
navigation rather than dense control clusters, where nested `backdrop-filter`
layers are also expensive to composite.

### Pixel layering

`clip-path` clips descendants, backgrounds, borders, shadows, and the focus
outline. `.pixel` therefore cannot use `border` or `outline` and builds both from
layers behind the element:

```text
layer 3   focus ring     stepped, --focus-ring, present only on :focus-visible
layer 2   pixel border   stepped, --intent-color
layer 1   element        clip-path: polygon(...)
```

Layers 2 and 3 consume `::before` and `::after`. Components that already use a
pseudo-element for content -- `.btn.loading` (spinner, `::after`), `.alert.icon`
(glyph, `::before`), `.checkbox` and `.radio` (marks), `.switch` (thumb),
`.tooltip` (bubble) -- conflict. Those components opt out of pixel layering and
receive a squared-corner treatment instead; this is a documented limit of the
aesthetic, not a defect to work around.

Aesthetics ship from opt-in entrypoints so consumers that do not use them pay
nothing. They cannot be tree-shaken, because a cascading class has no static
call site.

## Accessibility constraints

- Focus must remain visible under every aesthetic. `.pixel` restores it as a
  layer; `.glass` and `.neobrutalism` keep the standard outline.
- Aesthetics must not reduce non-text contrast below WCAG 1.4.11. This is why
  neumorphism is not shipped: its defining trait is a borderless control
  distinguished only by low-contrast shadow.
- `--font-pixel` falls back to the monospace stack. The package ships no font
  binary, so `.pixel` has no network side effect.
- Aesthetic hover and press motion respects `prefers-reduced-motion` through the
  existing global reset.

## Non-goals

- No JavaScript. Semantics, ARIA, keyboard behavior, focus management,
  validation, and announcements belong to the consuming application.
- No component branching on axis combinations. A component that needs to know
  its aesthetic to look right means the axis split is wrong.
- No compatibility aliases for renamed internal component variables. They were
  never public contract.
