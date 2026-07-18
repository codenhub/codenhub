# @codenhub/ui-kit

Browser UI utilities for feedback, internationalization, light and dark themes,
toasts, and a compiled global stylesheet.

> [!WARNING]
> This package is experimental. Its API, browser support, generated markup,
> styling output, and integration boundaries may change before a stable release.

## Installation

Version `0.1.0` describes the current repository source but has not been
published to npm. The npm `latest` tag still resolves to incompatible version
`0.0.1`.

Workspace consumers in this repository can install the current package from the
workspace root:

```sh
pnpm --filter=<consumer-package> add @codenhub/ui-kit@workspace:*
```

External consumers should not use an unversioned `pnpm add @codenhub/ui-kit`
until `0.1.0` is published. After publication, install the explicit version with
`pnpm add @codenhub/ui-kit@0.1.0`.

## Usage

Import the global styles once, then use the JavaScript entrypoint:

```ts
import "@codenhub/ui-kit/styles";
import { SemanticToast, initTheme } from "@codenhub/ui-kit";

initTheme();

new SemanticToast({
  type: "success",
  message: "Saved successfully.",
}).show();
```

## Documentation

- [Documentation overview](docs/index.md)
- [Complete public reference](docs/reference.md)
- [Migration from published 0.0.1](docs/migrating-from-0.0.1.md)

## Requirements

- The package is intended for browser applications. Toast display requires the
  DOM, timers, and optionally the Web Animations API. Internationalization also
  uses Fetch, AbortController, `structuredClone`, and DOM event APIs. Local
  storage is optional; preferences are not persisted when it is unavailable.
- `@codenhub/ui-kit/styles` is a full global styling system, not toast-only CSS.
  It includes design tokens, utilities, components, typography, and resets.
- Toast icons are `ic-*` marker elements. A compatible build-time icon processor
  must replace them with SVG; otherwise toasts remain usable but iconless.

## Notes

Import `@codenhub/ui-kit/scripts` when a dedicated JavaScript subpath is useful;
it exports the same values and types as the package root. Feedback, i18n, theme,
and toast facilities have module- or instance-lifetime state. Follow the cleanup
and trusted-content guidance in the full documentation.

## License

No license is currently declared for this package.
