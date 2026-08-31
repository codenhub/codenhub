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

Apps using Tailwind CSS v4 can instead process the source entrypoint:

```css
@import "tailwindcss";
@import "@codenhub/styles/tw";

@source "./src";
```

The root follows the system color-scheme preference. Apply `.light` or `.dark` to force a theme for the root or a subtree.

```html
<html class="dark">
  <body>
    <button class="btn primary">Dark themed button</button>
  </body>
</html>
```

The aliases `.theme-light`, `.theme-dark`, and `data-theme="light|dark"` are also supported. See [Concepts](./docs/concepts.md#theme-selection) for precedence details.

`.solid`, `.soft`, and `.ghost` set how much intent fills a component; `.edged` and `.edgeless` set whether it draws a boundary. Both axes cascade, so a container sets the look below it and any element can still override it. `.solid` also takes the boundary away, because a filled box ringed in another color is what the blend behind `.edged` exists to prevent; `.solid.edged` is the way back to a line.

```html
<div class="soft">
  <button class="btn primary">Soft</button>
  <span class="badge success">Soft</span>
  <button class="btn primary ghost edged">Outlined</button>
</div>
```

Aesthetics decide what a component is made of. They are opt-in, so import the stylesheet after the base one to make `.neobrutalism`, `.glass`, `.pixel`, and `.chunky-tile` available. They cascade to any subtree the same way, and each is also importable on its own from `@codenhub/styles/aesthetics/<name>`.

```css
@import "@codenhub/styles";
@import "@codenhub/styles/aesthetics";
```

```html
<section class="neobrutalism">
  <button class="btn primary">Thick ink and a hard shadow</button>
</section>
```

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

This package has no JavaScript behavior. `--layout-gap` replaces the removed `--layout-stack-gap` and `--layout-cluster-gap` tokens; no compatibility aliases are provided.

## License

Licensed under Apache-2.0. Embedded SVG icons derived from [Lucide](https://lucide.dev) are ISC-licensed, and loaders derived from [svg-spinners](https://github.com/n3r4zzurr0/svg-spinners) are MIT-licensed. See [NOTICE](NOTICE) for the required notices.
