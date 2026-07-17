# @codenhub/vite-plugin-defer-css

Vite plugin that converts stylesheet links in HTML entries to preloads and restores `rel="stylesheet"` after loading. It also emits a `noscript` fallback when `</head>` is available.

> [!WARNING]
> Experimental: the matching rules, generated HTML/JavaScript, and loading behavior may change before a stable release.

## Installation

```sh
pnpm add -D @codenhub/vite-plugin-defer-css
```

## Usage

```ts
import { defineConfig } from "vite";
import { deferCssPlugin } from "@codenhub/vite-plugin-defer-css";

export default defineConfig({
  plugins: [deferCssPlugin()],
});
```

By default, generated preload links use inline `onload`. Pass a trusted build-time `nonce` to use one nonced helper script instead. If loading fails, deferred CSS may remain unapplied.

## Documentation

- [Documentation overview](docs/index.md)
- [Integration and API](docs/integration.md)
- [Transformed output and constraints](docs/output-and-constraints.md)

## Requirements

- Vite `^8.0.0`.
- JavaScript is required for the deferred path; the fallback serves users with JavaScript disabled.
- Register anywhere in `plugins`; the plugin enforces post-order HTML transformation.

## Notes

- The transform runs during Vite development and production builds, but does not affect CSS imported through JavaScript modules.
- Deferring critical CSS can cause unstyled content and layout shifts. Validate CSP and rendering behavior in the deployed application.

## License

Licensed under Apache-2.0.
