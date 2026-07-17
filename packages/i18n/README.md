# @codenhub/i18n

Browser translation management with locale loading, persistence, events, and
optional DOM synchronization.

> [!WARNING]
> This package is experimental. Its API, browser behavior, and support level may
> change before a stable release.

## Installation

```sh
pnpm add @codenhub/i18n
```

## Usage

```ts
import { createI18n } from "@codenhub/i18n";

const i18n = createI18n({
  defaultLocale: "en",
  locales: ["en", "pt"] as const,
  getLocaleFile: (locale) => `/locales/${locale}.json`,
  getLocaleDirection: () => "ltr",
});

await i18n.init({ observe: true });
console.log(i18n.translate("home.title"));

// Remove the MutationObserver when this owner is torn down.
i18n.disconnect();
```

Elements with `data-i18n="home.title"` are translated during initialization.

## Documentation

- [Documentation overview](docs/index.md)
- [API and browser behavior](docs/reference.md)

## Requirements

- Locale loading requires browser `fetch`; persistence uses `localStorage`.
- DOM translation requires `document`; observation requires `MutationObserver`.
- SSR initialization performs no fetching or DOM translation. Avoid the global
  instance helpers in concurrent SSR requests.

## Notes

Locale loading failures resolve through documented fallback behavior rather
than rejecting. Missing keys return `undefined`. See the reference for warnings,
DOM boundaries, events, and cleanup.

## License

Licensed under Apache-2.0.
