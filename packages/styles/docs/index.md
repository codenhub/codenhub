---
title: Overview
---

# Style Codenhub interfaces

`@codenhub/styles` provides CSS-only design tokens, base styles, typography and
layout utilities, and composable classes for common UI elements.

## Compose the three axes

Components separate color, presentation, and material so each choice can change
without a component-specific variant:

| Axis         | Question        | Classes                                                                   | Inheritance  |
| ------------ | --------------- | ------------------------------------------------------------------------- | ------------ |
| Intent       | Which color?    | `.primary`, `.secondary`, `.success`, `.warning`, `.destructive`, `.info` | Element only |
| Presentation | How much of it? | `.flat`, `.out`, `.soft`, `.ghost`                                        | Cascades     |
| Aesthetic    | Made of what?   | `.neobrutalism`, `.glass`, `.pixel` from an optional aesthetic stylesheet | Cascades     |

```html
<section class="soft pixel">
  <button class="btn primary">Soft primary pixel button</button>
  <button class="btn destructive out">Outlined destructive override</button>
</section>
```

Intent stays on the component so a semantic container cannot accidentally
recolor nested controls. Presentation and aesthetic cascade from a container;
putting either class directly on a component overrides the inherited choice.
Components apply documented clamps when an axis would remove an essential edge
or overwhelm compact geometry.

The maintained contract is the intersection of the combinations described in
the [class reference](./classes.md#component-axis-reference) and demonstrated by
the playground. Undocumented and undemonstrated combinations may produce CSS but
are not supported behavior.

## Setup

### Installation

```sh
pnpm add @codenhub/styles
```

### Quick start

Import the compiled stylesheet for the complete token, reset, utility, and
component-class surface, then compose helper classes in markup:

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

The full stylesheet applies global reset and focus-visible rules, but does not
apply the optional classless native-element mappings. Import focused entrypoints
when global rules are not appropriate.

### Configuration

The root follows the operating-system preference. Apply `.light` or `.dark` to
the root or any ancestor to force token values for that subtree.
`.theme-light`, `.theme-dark`, and `data-theme="light|dark"` are aliases. The
[token reference](./tokens.md) documents their precedence.

```html
<html class="dark">
  <body>
    ...
  </body>
</html>
```

Customize the public CSS properties documented in [Tokens](./tokens.md). Do not
depend on component-scoped implementation variables.

## Reference: import paths

Compiled entrypoints are ready-to-import CSS and require only tooling that can
resolve package CSS imports. `/tw` entrypoints publish copied, uncompiled source
from `dist/tw`; a Tailwind v4 build must still process their `@theme`, `@utility`,
`@apply`, and related directives. Focused source component entrypoints include
theme tokens so their classes can work independently.

| Import path                      | Composition and effects                                                                                                                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@codenhub/styles`               | Compiled complete surface: Tailwind base/theme output, tokens, typography, utilities, components, and reset. Applies global reset, root theme, and focus rules.                                                   |
| `@codenhub/styles/theme`         | Compiled Tailwind theme variables, Codenhub tokens, and the presentation classes. Sets root theme properties and system/explicit theme selectors; no reset or component classes.                                  |
| `@codenhub/styles/components`    | Compiled theme tokens, typography utilities, and every component class. Includes static reduced-motion loader masks; no reset, layout/content utilities, or native mappings.                                      |
| `@codenhub/styles/native`        | Compiled complete surface plus classless mappings for headings, text, content elements, form controls, and buttons. Applies the reset and broad element selectors.                                                |
| `@codenhub/styles/aesthetics`    | Compiled `.neobrutalism`, `.glass`, and `.pixel` classes. Adds no tokens or components of its own; import after the base stylesheet.                                                                              |
| `@codenhub/styles/aesthetics/*`  | One compiled aesthetic: `/neobrutalism`, `/glass`, or `/pixel`. Same rules and ordering as the combined file.                                                                                                     |
| `@codenhub/styles/tw`            | Source equivalent of the complete stylesheet. Imports Tailwind itself, theme, typography, utilities, components, and reset; applies the same global rules.                                                        |
| `@codenhub/styles/tw/theme`      | Source theme, tokens, and presentation classes. Imports Tailwind's theme layer; emits root/system/explicit theme selectors and defines the package's custom `dark:` variant.                                      |
| `@codenhub/styles/tw/components` | Published Tailwind source for theme, typography, buttons, feedback, forms, loaders, surfaces, and tooltips, including static reduced-motion loader masks. No reset, layout/content utilities, or native mappings. |
| `@codenhub/styles/tw/surface`    | Source theme plus `.empty-state`.                                                                                                                                                                                 |
| `@codenhub/styles/tw/button`     | Published Tailwind source for theme, activity indicators, and `.btn`; includes static reduced-motion masks because buttons compose `.ai` for loading state.                                                       |
| `@codenhub/styles/tw/form`       | Source theme plus field, public `control-base`, input, textarea, select, checkbox, radio, and switch utilities.                                                                                                   |
| `@codenhub/styles/tw/feedback`   | Source theme plus alert, badge, skeleton, and progress utilities and their keyframes.                                                                                                                             |
| `@codenhub/styles/tw/loader`     | Published Tailwind source for activity indicators and loaders, including static reduced-motion masks. It has no theme or reset side effects and uses `currentColor`.                                              |
| `@codenhub/styles/tw/tooltip`    | Source theme plus tooltip utilities.                                                                                                                                                                              |
| `@codenhub/styles/tw/reset`      | Source theme, typography utilities, and global reset/accessibility rules. It changes root/body/elements and selection, motion, focus, scrollbar, and forced colors.                                               |
| `@codenhub/styles/tw/native`     | Source complete surface plus reset and classless native-element mappings; broadest global effects.                                                                                                                |
| `@codenhub/styles/tw/typography` | Source theme plus typography utilities; sets theme selectors but no reset or classless mappings.                                                                                                                  |
| `@codenhub/styles/tw/utilities`  | Source theme and typography composition plus layout and content utilities; safelists the package utility names.                                                                                                   |
| `@codenhub/styles/tw/aesthetics` | Source aesthetics, combined. `/tw/aesthetics/neobrutalism`, `/glass`, and `/pixel` publish one apiece. Plain CSS with no theme or reset side effects.                                                             |

## Requirements

- Consumer tooling must resolve package CSS imports.
- Chrome 123, Safari 17.5, or Firefox 120 and newer. Color tokens are declared
  with `light-dark()` and selected by `color-scheme`.
- Tailwind CSS 4 or newer is required only for `/tw` source entrypoints.
- The package has no JavaScript runtime. Apps must provide semantic HTML, ARIA,
  keyboard behavior, focus management, validation, and announcements.
- Focused entrypoints compose as documented above; avoid importing overlapping
  entrypoints unless duplicate generated CSS is acceptable in your build.

## Guides and reference

- **Concepts and setup:** this overview explains installation, the three-axis
  model, theming, and entrypoint selection.
- **Reference:** [Tokens](./tokens.md) defines public custom properties, while
  [Classes](./classes.md) lists helper classes, component states, supported axes,
  and composition rules.
- **Guide:** [Accessibility](./accessibility.md) separates CSS hooks from the
  semantics and behavior an application must provide.
