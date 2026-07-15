# @codenhub/styles

Shared Codenhub CSS package with compiled styles, design tokens, theme support, component helper classes, layout helpers, typography utilities, and Tailwind CSS v4 source entrypoints.

This package is CSS-only. It does not ship JavaScript behavior, DOM helpers, React components, or TypeScript APIs.

## Installation

```sh
pnpm add @codenhub/styles
```

Install Tailwind CSS only when importing Tailwind source entrypoints:

```sh
pnpm add @codenhub/styles tailwindcss
```

`tailwindcss` is an optional peer dependency. Compiled CSS imports do not require Tailwind in consumer apps.

## Usage

### Compiled CSS

Use compiled CSS when the app does not process this package through Tailwind.

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

### Tailwind Source CSS

Use Tailwind source CSS when the app already builds Tailwind CSS v4 and needs Codenhub tokens/classes available during that build.

```css
@import "tailwindcss";
@import "@codenhub/styles/tw";

@source "./src";
```

### Theme Classes

Apply `.dark` to any ancestor to switch token values for that subtree.

```html
<html class="dark">
  <body>
    <button class="btn primary">Dark themed button</button>
  </body>
</html>
```

Apps own adding/removing `.dark`. This package only defines styles that respond to it.

## Reference

### Import Paths

Compiled CSS: `@codenhub/styles`, `/theme`, `/components`, and `/native`.

Tailwind CSS v4 source: `/tw`, `/tw/theme`, `/tw/components`, `/tw/surface`, `/tw/button`, `/tw/form`, `/tw/feedback`, `/tw/loader`, `/tw/tooltip`, `/tw/reset`, `/tw/native`, `/tw/typography`, and `/tw/utilities`.

The root entrypoints provide the full stylesheet. `/native` adds classless styling for common native elements. Other subpaths provide the named theme, component, reset, typography, or combined utility surface.

### Detailed Docs

Detailed package reference ships with the package under `docs/`:

- [Overview](./docs/index.md): Package model, entrypoints, and class model.
- [Tokens](./docs/tokens.md): Color and foundation token contracts.
- [Classes](./docs/classes.md): Layout, content, component, and typography helper reference.
- [Accessibility](./docs/accessibility.md): CSS accessibility hooks and non-goals.

## Requirements

| Requirement     | Details                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------ |
| CSS imports     | Consumer tooling must support package CSS imports.                                         |
| Tailwind CSS    | Required only for `@codenhub/styles/tw` entrypoints. Version 4 or newer.                   |
| Browser runtime | Styles target browsers. There is no JavaScript runtime behavior.                           |
| Dark mode       | Consumers apply or remove `.dark`; package CSS reacts to that class.                       |
| Accessibility   | Styles do not provide semantic HTML, labels, ARIA, keyboard behavior, or focus management. |

## Notes

This package publishes CSS as its public runtime surface. It does not expose JavaScript or TypeScript entrypoints.

`--layout-gap` is the shared gap token for `.view`, `.stack`, `.cluster`, and `.auto-grid`. It replaces the removed `--layout-stack-gap` and `--layout-cluster-gap` tokens; no compatibility aliases are provided.

The native entrypoint includes the package reset and maps `table`, `kbd`, `blockquote`, `q`, `code`, `pre`, and `hr` to their corresponding helper styles in addition to headings and form controls.

Lifecycle exception: `@codenhub/styles` intentionally omits `main`, `module`, and `types` from `package.json` because it is a CSS-only package with no JavaScript API. Every supported consumer import path is listed explicitly in `exports`, build output is generated into `dist`, and package checks validate the CSS build contract.

The package intentionally does not expose private files outside the documented import paths. If exports change, this README and the related `docs/` documents must be updated in the same change.

## License

This project is licensed under the [Apache-2.0](LICENSE) license.

It includes SVG icons from [Lucide](https://lucide.dev) which are licensed under the [ISC License](https://github.com/lucide-dev/lucide/blob/main/LICENSE). See the [NOTICE](NOTICE) file for details.
