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
:where(.btn, .alert, .badge, .card, .ipt /* ... */) {
  --intent-color: var(--color-text);
  --intent-border: var(--color-border);
  /* ... */
}
```

Specificity is the whole mechanism. The reset is `:where()`, so it carries zero
specificity: an intent class on the element (0-1-0) beats it, while an inherited
value still loses to it, because any declaration on an element beats
inheritance regardless of specificity. One rule therefore replaces every
per-component intent branch, and no `:not()` chains are needed.

That selector list is the registry of components supporting intent. A component
that reads `--intent-*` without joining it fails silently: the undefined property
makes every `color-mix()` referencing it invalid at computed-value time, so the
declaration is dropped entirely and the element falls back to a preflight value.
A browser test asserts every slot resolves on every component that reads them.

`native.css` carries its own copy of the reset for the bare elements it maps,
since those carry no class.

One deliberate exception: table rows inherit their table's intent rather than
resetting it, because a row is part of a table rather than an independent
component. A row carrying its own intent class still wins.

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
| `--intent-border`   | Line color; the border gray when no intent is set.    |

Intent classes map a `--color-*` family onto these six slots and do nothing
else. Adding an intent is six declarations; adding a component that supports
every intent is zero.

`--intent-border` is separate from `--intent-color` because a neutral border
must stay the quiet border gray rather than the text color. Without it, every
component that draws a line would need its own per-intent branch again.

Neutral maps `--intent-subtle` to `--color-surface` rather than
`--color-text-subtle`. The tinted surface a neutral component sits on is the
surface token, and tooltips, key caps, code, table heads, and skeletons all read
that slot for their resting background.

A composed `box-shadow` must not fall back to `none`. `none` is valid only as an
entire value, so `<shadow>, none` is invalid and drops the whole declaration,
including the focus ring it was composed with. Composed lists use
`var(--ui-shadow, 0 0 transparent)` instead.

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

Lengths and shadows. Set by aesthetic classes; read by components.

| Token                  | Fallback           | Meaning                                                 |
| ---------------------- | ------------------ | ------------------------------------------------------- |
| `--ui-radius`          | `--radius-control` | Corner radius for controls.                             |
| `--ui-radius-surface`  | `--radius-surface` | Corner radius for surfaces such as cards and alerts.    |
| `--ui-border-width`    | `--border-width`   | Base border thickness before `--ui-border-scale`.       |
| `--ui-shadow`          | `none`             | Complete `box-shadow` value.                            |
| `--ui-bg-alpha`        | `1`                | Unitless multiplier over `--ui-fill`, for translucency. |
| `--ui-hover-transform` | `none`             | Transform applied on interactive hover.                 |

The default aesthetic is the _absence_ of these declarations, not a set of root
values. Components read each with the `var()` fallback above, which is why a
plain `.card` gets surface radius while a plain `.btn` gets control radius. A
single `:root` value could not serve both.

`backdrop-filter` and `clip-path` are deliberately not in this contract.
Applying either unconditionally creates a compositing layer and a containing
block on every component even at its no-op value, so the aesthetics that need
them apply them directly to the components they target.

## Composition rules

Components resolve every axis at their own root and expose the results as
component-scoped variables:

```css
@utility btn {
  --button-bg: color-mix(in oklab, var(--intent-color) var(--ui-fill, 100%), transparent);
  --button-border-width: calc(var(--ui-border-width, var(--border-width)) * var(--ui-border-scale, 1));
}
```

A component may clamp a token it cannot honor. Text controls and toggles cap
their fill with `min(var(--ui-fill, 0%), 12%)`, so a `.flat` container cannot put
typed text on a saturated background. Clamping resolves from the value alone and
needs no per-presentation selector, which keeps the component free of axis
branching.

Two choices there are deliberate and apply everywhere. Mixing toward
`transparent` rather than a background token lets a tinted surface adapt to
whatever it is placed on. Mixing in `oklab` keeps the wide-gamut palette intact
and blends perceptually, where `srgb` would clip it.

Component-scoped variables such as `--button-*`, `--control-*`, `--feedback-*`,
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

| Aesthetic       | Material                                                                               |
| --------------- | -------------------------------------------------------------------------------------- |
| _(default)_     | Foundation tokens: `--radius-control`, `--border-width`, `--elevation-low`, no clip.   |
| `.neobrutalism` | Thick ink border, hard unblurred offset shadow, hover translates into the shadow.      |
| `.glass`        | Large radius, `backdrop-filter` blur, low background alpha, hairline highlight border. |
| `.pixel`        | Stepped `clip-path` corners, border drawn as an inset ring, `--font-pixel`, no radius. |

Each aesthetic also exposes its own tokens for tuning: `--neo-ink` and
`--neo-offset`; `--glass-blur`, `--glass-opacity`, `--glass-fill`, and
`--glass-edge`; `--pixel-unit` and `--pixel-ink`.

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

### The neutral ink

`.neobrutalism` and `.pixel` both override `--intent-border`, which is the one
place an aesthetic reaches into the intent axis. Their defining trait is a hard
outline, and the neutral `--intent-border` is the quiet border gray: two or more
pixels of it reads as a mistake rather than as the aesthetic.

Both selectors are `:where()`, so the override carries zero specificity. It beats
the neutral default in `intent.css` only by being declared later, and loses to
any intent class on the element, so a `.destructive` card keeps its red edge.
That ordering is why aesthetics must be imported after the base stylesheet.

`.glass` sets no intent token. Its edge is a highlight rather than an outline, so
it mixes the intent into a light hairline at the point of use instead.

### Pixel layering

`clip-path` clips descendants, backgrounds, borders, shadows, and the focus
outline, so a clipped element cannot draw its edge with `border` or `outline`.
Both are rebuilt as inset shadows, which are clipped to the same stepped shape:

```css
box-shadow:
  inset 0 0 0 calc(var(--pixel-unit) * 2) var(--intent-border),
  inset 0 0 0 calc(var(--pixel-unit) * 2 + var(--focus-ring-width)) var(--focus-ring);
```

Shadows paint in order, first on top, so the edge stays visible over the wider
focus ring sitting immediately inside it.

Two constraints fall out of the geometry. The ring must be exactly as thick as
the depth of the corner cut, or the staircase is left uncovered and the edge
reads as broken at every corner. And the thickness must be computed at the point
of use rather than through an intermediate custom property, because a custom
property resolves on the element that declares it: a component that overrides
`--pixel-unit`, as the chips do, would otherwise keep the root's ring.

Because this consumes no pseudo-element, components that use `::before` or
`::after` for content need no exception. `.btn.loading`, `.alert.icon`,
`.checkbox`, `.radio`, and `.switch` all keep their marks inside a clipped box.

Three cases are still squared rather than clipped:

- `.tooltip-icon` is a tooltip host, and a host's bubble is a pseudo-element
  positioned outside its box, which clipping the host would erase. The bubble
  carries the stepped shape itself instead.
- `.table` paints cell backgrounds over any inset ring its root could draw.
- `.progress` and `.skeleton` are thinner than a stepped corner.
- `.radio` keeps its circle, the only thing distinguishing it from a checkbox at
  a glance.

### Packaging

Aesthetics ship from opt-in entrypoints so consumers that do not use them pay
nothing. They cannot be tree-shaken, because a cascading class has no static
call site.

Two build constraints apply to these files specifically:

- They contain no Tailwind directives and must not carry `@reference
"tailwindcss"`. A `@reference` in a file imported into a full build switches
  the whole build to reference mode: `@theme` stops emitting `:root` and every
  theme variable is inlined with a fallback instead. Foundation tokens such as
  `--border-width` then go undefined, which invalidates the `calc()` around them
  and drops whole `border` shorthands.
- `backdrop-filter` is written unprefixed only. The minifier adds
  `-webkit-backdrop-filter` for the Safari versions in the baseline, but if both
  are written by hand it collapses the pair to the prefixed one alone, leaving
  Firefox with no blur.

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
