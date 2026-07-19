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

Apply `.dark` to any ancestor to switch token values for that subtree.

```html
<html class="dark">
  <body>
    <button class="btn primary">Dark themed button</button>
  </body>
</html>
```

Apps own adding and removing `.dark`; the package only responds to the class.

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

Licensed under Apache-2.0.

It includes SVG icons from [Lucide](https://lucide.dev) which are licensed under the [ISC License](https://github.com/lucide-icons/lucide/blob/main/LICENSE). See the [NOTICE](NOTICE) file for details.
