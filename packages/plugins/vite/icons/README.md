# @codenhub/vite-plugin-icons

Vite plugin that replaces `<i class="ic-<name>">` marker elements with inline SVG during Vite HTML and JS/TS/JSX/TSX transforms.

> [!WARNING]
> Experimental: marker matching, the built-in icon set, generated SVG, and plugin API may change before a stable release.

## Installation

```sh
pnpm add -D @codenhub/vite-plugin-icons
```

## Usage

```ts
import { defineConfig } from "vite";
import { iconsPlugin } from "@codenhub/vite-plugin-icons";

export default defineConfig({
  plugins: [iconsPlugin()],
});
```

```html
<i class="ic-success size-4" aria-hidden="true"></i>
```

The plugin replaces the marker during Vite development and builds, preserves non-icon classes and other attributes, and removes the resolved `ic-` class:

```html
<svg class="size-4" aria-hidden="true" viewBox="0 0 24 24" ...>...</svg>
```

Custom SVG can extend or override the built-in registry, but it must be trusted:

```ts
iconsPlugin({
  icons: {
    brand: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16" /></svg>`,
  },
});
```

## Documentation

- [Documentation overview](docs/index.md)
- [Integration and API](docs/integration.md)
- [Generated SVG and constraints](docs/output-and-constraints.md)

## Requirements

- Vite `^8.0.16` and an ESM-capable Node.js environment.
- Static `class` or `className` string attributes; expression-bound JSX classes are not matched.
- Register anywhere in `plugins`; the plugin enforces pre-order transforms.

## License

Licensed under Apache-2.0.

The built-in SVGs are derived from [Lucide](https://lucide.dev) under the ISC License. Redistributions must preserve the [NOTICE](NOTICE), which contains the Lucide copyright and license text.
