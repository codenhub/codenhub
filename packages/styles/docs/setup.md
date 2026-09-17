---
title: Setup
description: Install the package, pick an entrypoint, and render a first component.
order: 1
---

# Setup

## Installation

```sh
pnpm add @codenhub/styles
```

## Quick start

Import the compiled stylesheet for the complete token, reset, utility, and component-class surface, then compose helper classes in markup:

```css
@import "@codenhub/styles";
```

```html
<main class="stack">
  <p class="text-label">Status</p>
  <h1 class="text-title">Ready to publish</h1>
  <button class="btn primary">Continue</button>
</main>
```

The full stylesheet applies global reset and focus-visible rules, but does not apply the optional classless native-element mappings, and does not include aesthetics. Import focused entrypoints when global rules are not appropriate; see [Import paths](#import-paths) below.

Aesthetics are opt-in. Import the combined aesthetics stylesheet, or one aesthetic on its own, after the base stylesheet so its rules win:

```css
@import "@codenhub/styles";
@import "@codenhub/styles/aesthetics";
```

```html
<section class="neobrutalism">
  <button class="btn primary">Thick ink and a hard shadow</button>
</section>
```

A project already running Tailwind CSS v4 imports the source entrypoint instead; see [Integrating → Tailwind CSS v4](./integrating/tailwind.md).

## Configuration

The root follows the operating-system color-scheme preference. Apply `.light` or `.dark` to the root or any ancestor to force token values for that subtree. `.theme-light`, `.theme-dark`, and `data-theme="light|dark"` are aliases.

```html
<html class="dark">
  <body>
    <button class="btn primary">Dark themed button</button>
  </body>
</html>
```

See [Concepts → Theme selection](./concepts.md#theme-selection) for how selectors resolve and [Usage → Theming](./usage/theming.md) for the full color token reference.

### Dark variant

`/tw` source entrypoints define a custom `dark:` variant for your own utilities. It fires under an explicit dark selector (`.dark`, `.theme-dark`, or `[data-theme="dark"]`, on the element or an ancestor), or under the system preference when nothing under it forces a theme explicitly:

```html
<html>
  <body>
    <p class="dark:text-white">Follows the OS preference here</p>
    <div class="light">
      <p class="dark:text-white">Stays light -- this subtree forced it</p>
    </div>
  </body>
</html>
```

An explicit selector at any depth wins over the system preference, in either direction, the same as the token theme it tracks.

The one place it does not track the token theme: nesting an explicit selector inside the opposite one. `color-scheme` inherits, so a `.light` nested inside `.dark` themes its own tokens correctly regardless of depth -- the nearest declaration always wins. `dark:` matches by selector instead, and `.dark *` matches every descendant of a `.dark` element with no way to stop at a nearer `.light` in between, so a `dark:` utility inside that nested `.light` still fires even though the tokens around it are light. Apply one theme per subtree rather than nesting opposite ones if a page uses both tokens and `dark:` utilities together.

## Import paths

Compiled entrypoints are ready-to-import CSS and require only tooling that can resolve package CSS imports. `/tw` entrypoints publish copied, uncompiled source from `dist/tw`; a Tailwind v4 build must still process their `@theme`, `@utility`, `@apply`, and related directives. Focused source component entrypoints include theme tokens so their classes can work independently.

| Import path                      | Composition and effects                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@codenhub/styles`               | Compiled complete surface: Tailwind base/theme output, tokens, typography, utilities, components, and reset. Applies global reset, root theme, and focus rules.                                                                                                                                                                                                                                                                                                    |
| `@codenhub/styles/theme`         | Compiled Tailwind theme variables, Codenhub tokens, and the presentation classes. Sets root theme properties and system/explicit theme selectors; no reset or component classes.                                                                                                                                                                                                                                                                                   |
| `@codenhub/styles/palette`       | Generated, self-contained `--palette-*` custom properties: every intent/presentation cell's fill, text, and edge color, pre-composed to a flat value. For a consumer that cannot take this package as a build-time dependency (an optional peer, for example) but wants to look consistent with it. Not a replacement for the components themselves when Tailwind is available -- see [Customizing → Generated palette](./usage/customizing.md#generated-palette). |
| `@codenhub/styles/components`    | Compiled theme tokens, typography utilities, and every component class. Includes static reduced-motion loader masks; no reset, layout/content utilities, or native mappings.                                                                                                                                                                                                                                                                                       |
| `@codenhub/styles/native`        | Compiled complete surface plus classless mappings for headings, text, content elements, form controls, and buttons. Applies the reset and broad element selectors.                                                                                                                                                                                                                                                                                                 |
| `@codenhub/styles/aesthetics`    | Compiled `.neobrutalism`, `.glass`, `.pixel`, and `.chunky-tile` classes. Adds no tokens or components of its own; import after the base stylesheet.                                                                                                                                                                                                                                                                                                               |
| `@codenhub/styles/aesthetics/*`  | One compiled aesthetic: `/neobrutalism`, `/glass`, `/pixel`, or `/chunky-tile`. Same rules and ordering as the combined file.                                                                                                                                                                                                                                                                                                                                      |
| `@codenhub/styles/tw`            | Source equivalent of the complete stylesheet. Imports Tailwind itself, theme, typography, utilities, components, and reset; applies the same global rules.                                                                                                                                                                                                                                                                                                         |
| `@codenhub/styles/tw/theme`      | Source theme, tokens, and presentation classes. Imports Tailwind's theme layer; emits root/system/explicit theme selectors and defines the package's custom `dark:` variant.                                                                                                                                                                                                                                                                                       |
| `@codenhub/styles/tw/components` | Published Tailwind source for theme, typography, buttons, feedback, forms, loaders, surfaces, and tooltips, including static reduced-motion loader masks. No reset, layout/content utilities, or native mappings.                                                                                                                                                                                                                                                  |
| `@codenhub/styles/tw/surface`    | Source theme plus `.surface`, `.card`, and `.panel`.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `@codenhub/styles/tw/button`     | Published Tailwind source for theme and `.btn`. Pair it with `/tw/loader` for a loading state composed from `.loader`.                                                                                                                                                                                                                                                                                                                                             |
| `@codenhub/styles/tw/form`       | Source theme plus field, public `text-control`, input, textarea, select, checkbox, radio, and switch utilities.                                                                                                                                                                                                                                                                                                                                                    |
| `@codenhub/styles/tw/feedback`   | Source theme plus alert, badge, skeleton, and progress utilities and their keyframes.                                                                                                                                                                                                                                                                                                                                                                              |
| `@codenhub/styles/tw/loader`     | Published Tailwind source for activity indicators and loaders, including static reduced-motion masks. It has no theme or reset side effects and uses `currentColor`.                                                                                                                                                                                                                                                                                               |
| `@codenhub/styles/tw/tooltip`    | Source theme plus tooltip utilities.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `@codenhub/styles/tw/reset`      | Source theme, typography utilities, and global reset/accessibility rules. It changes root/body/elements and selection, motion, focus, scrollbar, and forced colors.                                                                                                                                                                                                                                                                                                |
| `@codenhub/styles/tw/native`     | Source complete surface plus reset and classless native-element mappings; broadest global effects.                                                                                                                                                                                                                                                                                                                                                                 |
| `@codenhub/styles/tw/typography` | Source theme plus typography utilities; sets theme selectors but no reset or classless mappings.                                                                                                                                                                                                                                                                                                                                                                   |
| `@codenhub/styles/tw/utilities`  | Source theme and typography composition plus layout and content utilities; safelists the package utility names.                                                                                                                                                                                                                                                                                                                                                    |
| `@codenhub/styles/tw/aesthetics` | Source aesthetics, combined. `/tw/aesthetics/neobrutalism`, `/glass`, `/pixel`, and `/chunky-tile` publish one apiece. Plain CSS with no theme or reset side effects.                                                                                                                                                                                                                                                                                              |

Avoid importing overlapping entrypoints in the same build unless duplicate generated CSS is acceptable; pick the narrowest entrypoint that covers what a page needs.

## Requirements

- Consumer tooling must resolve package CSS imports.
- Chrome 123, Safari 17.5, or Firefox 121 and newer. Color tokens are declared with `light-dark()` and selected by `color-scheme` (Firefox 120), and `.input-group` propagates a nested control's invalid and disabled state with `:has()` (Firefox 121).
- Tailwind CSS 4 or newer is required only for `/tw` source entrypoints.
- The package has no JavaScript runtime. Apps must provide semantic HTML, ARIA, keyboard behavior, focus management, validation, and announcements; see [Accessibility](./accessibility.md).
