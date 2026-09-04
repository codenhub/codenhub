# @codenhub/styles

CSS-only Codenhub design tokens, base styles, and composable UI helper classes.

## Installation

```sh
pnpm add @codenhub/styles
```

## Usage

Import the compiled stylesheet for the complete token, reset, utility, and component-class surface:

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

For the Tailwind CSS v4 entrypoint, theme selection, the intent/presentation axes, and opt-in aesthetics, see [Setup](./docs/setup.md), [Concepts](./docs/concepts.md), and [Usage](./docs/usage/index.md).

## Documentation

- [Documentation overview](./docs/index.md): What the package is, what it does and does not do, and where to go next.
- [Setup](./docs/setup.md): Installation, entrypoints, and configuration.
- [Concepts](./docs/concepts.md): The three-axis model and the token system.
- [Usage](./docs/usage/index.md): Composing, theming, customizing, aesthetics, and each component family.
- [Integrating](./docs/integrating/index.md): Wiring the stylesheet into Next.js, Vue, Svelte, Astro, or a Tailwind CSS v4 build.
- [Accessibility](./docs/accessibility.md): CSS accessibility hooks and non-goals.

## Requirements

| Requirement   | Details                                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------------------- |
| CSS imports   | Consumer tooling must resolve package CSS imports.                                                             |
| Browsers      | Chrome 123, Safari 17.5, or Firefox 121 and newer (`light-dark()` theming; `:has()` for `.input-group` state). |
| Tailwind CSS  | Version 4 or newer is required only for `/tw` source entrypoints.                                              |
| Accessibility | Consumers provide semantic HTML, ARIA, keyboard behavior, and focus management.                                |

## Notes

This package has no JavaScript behavior. `--layout-gap` replaces the removed `--layout-stack-gap` and `--layout-cluster-gap` tokens, and `--color-text-subtle` is removed because nothing read it; no compatibility aliases are provided.

## License

Licensed under Apache-2.0. Embedded SVG icons derived from [Lucide](https://lucide.dev) are ISC-licensed, and loaders derived from [svg-spinners](https://github.com/n3r4zzurr0/svg-spinners) are MIT-licensed. See [NOTICE](NOTICE) for the required notices.
