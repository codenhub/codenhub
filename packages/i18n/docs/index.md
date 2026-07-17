# @codenhub/i18n

`@codenhub/i18n` loads locale dictionaries, resolves and persists a browser
locale, translates keys, synchronizes `lang` and `dir`, and can translate DOM
leaves marked with `data-i18n`.

It fits browser applications that want a small translation manager without a
framework integration. You can translate keys directly, opt into translating
marked DOM leaves, or use both approaches.

> [!WARNING]
> This package is experimental. Its API, browser behavior, and support level may
> change before a stable release.

## Quick Start

```ts
import { createI18n } from "@codenhub/i18n";

const i18n = createI18n({
  defaultLocale: "en",
  locales: ["en", "pt"] as const,
  getLocaleFile: (locale) => `/locales/${locale}.json`,
  getLocaleDirection: () => "ltr",
});

await i18n.init();
console.log(i18n.translate("home.title"));
```

Locale files are loaded with browser `fetch`, and locale preference is stored
in `localStorage`. Call `disconnect()` when the manager's owner is torn down,
especially if you initialize it with DOM observation enabled. SSR initialization
does not fetch translations or modify the DOM.

## Continue

- [API and browser behavior](reference.md): Complete exports, loading,
  persistence, DOM translation boundaries, SSR behavior, events, fallback
  behavior, and cleanup.
