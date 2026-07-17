# @codenhub/theme

Zero-dependency browser theme preference, persistence, DOM, and token manager.

> [!WARNING]
> This package is experimental. Its API, DOM behavior, and support level may
> change before a stable release.

## Installation

```sh
pnpm add @codenhub/theme
```

## Usage

```ts
import { createTheme } from "@codenhub/theme";

const theme = createTheme().init();
theme.set("dark");

// Remove media-query/storage listeners and subscribers on teardown.
theme.destroy();
```

## Documentation

- [Documentation overview](docs/index.md)
- [API, persistence, DOM, and SSR behavior](docs/reference.md)

## Requirements

- Browser integration uses `document.documentElement`, `localStorage`,
  `matchMedia`, `storage` events, and `CustomEvent`.
- SSR is supported by skipping unavailable browser work and using the configured
  default theme.
- Consumers provide CSS selectors, variables, visual tokens, and any pre-paint
  script needed to prevent a theme flash.

## Notes

Construction validates theme names, mappings, attributes, classes, and token
schemas and throws on invalid configuration. Storage failures are reported to
the console and treated as unavailable storage.

## License

Licensed under Apache-2.0.
