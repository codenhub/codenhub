# @codenhub/vite-plugin-add-loader

Vite plugin that injects a full-screen loading overlay into each transformed HTML entry. It removes the overlay after `window.load` or a timeout.

> [!WARNING]
> Experimental: the plugin API, injected HTML/CSS/JavaScript, and browser support may change before a stable release.

## Installation

```sh
pnpm add -D @codenhub/vite-plugin-add-loader
```

## Usage

```ts
import { defineConfig } from "vite";
import { addLoaderPlugin } from "@codenhub/vite-plugin-add-loader";

export default defineConfig({
  plugins: [addLoaderPlugin()],
});
```

The defaults use `var(--color-background, #fafafa)` and `var(--color-primary, #0a0a0a)`. HTML without both `</head>` and an opening `<body>` is returned unchanged.

## Documentation

- [Documentation overview](docs/index.md)
- [Integration and API](docs/integration.md)
- [Generated output and constraints](docs/output-and-constraints.md)

## Requirements

- Vite `^8.0.0`.
- Browser HTML with JavaScript enabled for timed removal; a `noscript` rule hides the overlay otherwise.
- Register anywhere in `plugins`; the plugin enforces post-order HTML transformation.

## Notes

- The transform runs during Vite development and production builds and injects inline CSS and JavaScript.
- Review the CSP, reduced-motion, and `page-loader` ID constraints before adoption.

## License

Licensed under Apache-2.0.
