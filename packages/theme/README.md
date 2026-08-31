# @codenhub/theme

Zero-dependency browser theme preference, persistence, DOM, and token manager.

## Installation

```sh
pnpm add @codenhub/theme
```

## Usage

```ts
import { createTheme, getPrePaintScript } from "@codenhub/theme";

const theme = createTheme().init();
theme.set("dark");

// Get inline IIFE script string for <head> to prevent FOUC:
const script = theme.getPrePaintScript(); // or standalone getPrePaintScript()

// Remove media-query/storage listeners and subscribers on teardown.
theme.destroy({ revertDom: true });
```

## Documentation

- [Documentation overview](docs/index.md)
- [API, persistence, DOM, and SSR behavior](docs/reference.md)

## Requirements

- Browser integration uses `document.documentElement`, `localStorage`, `matchMedia`, `storage` events, and `CustomEvent`.
- SSR is supported by skipping unavailable browser work and using the configured default theme.
- Consumers provide CSS selectors, variables, visual tokens, and any pre-paint script needed to prevent a theme flash.

## Notes

Construction validates theme names, mappings, attributes, classes, and token schemas and throws on invalid configuration. Storage failures are reported to the console and treated as unavailable storage.

## License

Licensed under Apache-2.0.
