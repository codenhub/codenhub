# @codenhub/styles

CSS-only Codenhub design tokens, base styles, and composable UI helper classes.

> **Experimental:** Public tokens, class names, and import-path composition may
> change while the styling system is stabilized.

## Installation

```sh
pnpm add @codenhub/styles
```

## Usage

Import the compiled stylesheet for the complete token, reset, utility, and
component-class surface:

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

Apps using Tailwind CSS v4 can instead process the source entrypoint:

```css
@import "tailwindcss";
@import "@codenhub/styles/tw";

@source "./src";
```

The root follows the system color-scheme preference. Apply `.light` or `.dark`
to force a theme for the root or a subtree.

```html
<html class="dark">
  <body>
    <button class="btn primary">Dark themed button</button>
  </body>
</html>
```

The aliases `.theme-light`, `.theme-dark`, and `data-theme="light|dark"` are
also supported. See [Tokens](./docs/tokens.md) for precedence details.

## Documentation

- [Documentation overview](./docs/index.md): Complete public documentation and
  all supported import paths.
- [Tokens](./docs/tokens.md): Color and foundation token contracts.
- [Classes](./docs/classes.md): Layout, content, component, and typography helper reference.
- [Accessibility](./docs/accessibility.md): CSS accessibility hooks and non-goals.

## Requirements

| Requirement   | Details                                                                         |
| ------------- | ------------------------------------------------------------------------------- |
| CSS imports   | Consumer tooling must resolve package CSS imports.                              |
| Tailwind CSS  | Version 4 or newer is required only for `/tw` source entrypoints.               |
| Accessibility | Consumers provide semantic HTML, ARIA, keyboard behavior, and focus management. |

## Notes

This package has no JavaScript behavior. `--layout-gap` replaces the removed
`--layout-stack-gap` and `--layout-cluster-gap` tokens; no compatibility aliases
are provided.

## License

Licensed under Apache-2.0. Embedded SVG icons derived from
[Lucide](https://lucide.dev) are ISC-licensed, and loaders derived from
[svg-spinners](https://github.com/n3r4zzurr0/svg-spinners) are MIT-licensed.
See [NOTICE](NOTICE) for the required notices.
