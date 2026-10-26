# @codenhub/theme

Zero-dependency browser theme preference, persistence, DOM, and token manager.

## Installation

```sh
pnpm add @codenhub/theme
```

## Usage

```ts
import { createTheme } from "@codenhub/theme";

// In the browser:
const theme = createTheme().init();

document.querySelector("#theme-toggle")?.addEventListener("click", theme.toggle);
theme.subscribe(({ name }) => console.log(`theme is now ${name}`));

// Remove media-query/storage listeners and subscribers on teardown.
theme.destroy({ revertDom: true });

// On the server or at build time, with the same options: inline this string in a
// blocking <head> script so the theme applies before the first paint.
const script = createTheme().getPrePaintScript();
```

## Documentation

- [Documentation overview](docs/index.md)
- [Tokens, persistence, and cross-tab sync](docs/tokens-and-persistence.md)
- [SSR, pre-paint, and Tailwind](docs/ssr-and-pre-paint.md)
- [API reference](docs/reference/index.md)

## Requirements

- Browser integration uses `document.documentElement`, `localStorage`, `matchMedia`, `storage` events, and `CustomEvent`.
- SSR is supported by skipping unavailable browser work and using the configured default theme.
- Consumers provide CSS selectors, variables, and visual tokens, and inline the script from `getPrePaintScript()` to prevent a theme flash.
- TypeScript 5.4 or newer, for the types, which use `NoInfer`.

## Notes

Construction validates theme names, mappings, attributes, classes, and token schemas and throws on invalid configuration. Storage failures are reported to the console and treated as unavailable storage.

## License

Licensed under Apache-2.0.
