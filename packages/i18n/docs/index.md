---
title: Overview
---

# Add browser translations

The `@codenhub/i18n` package loads locale dictionaries, resolves and persists a
browser locale, translates keys, synchronizes `lang` and `dir`, and can
translate DOM leaves marked with `data-i18n`.

It fits browser applications that want a small translation manager without a
framework integration. You can translate keys directly, opt into translating
marked DOM leaves, or use both approaches.

## Setup

### Installation

```sh
pnpm add @codenhub/i18n
```

### Quick start

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

### Configuration

`createI18n` requires a default locale, supported locales, a locale-file URL
resolver, and a text-direction resolver. Initialization can select a storage
key and DOM root, suppress warnings, and enable mutation observation. See
[API and browser behavior](reference.md#configuration-and-setup) for locale
resolution and all initialization options.

## Requirements

- Locale loading requires browser `fetch`; persistence uses `localStorage`.
- DOM translation requires `document`; observation requires `MutationObserver`.
- SSR initialization performs no fetching or DOM translation. Avoid the global
  instance helpers in concurrent SSR requests.

Locale loading failures resolve through documented fallback behavior rather
than rejecting. Missing keys return `undefined`. Call `disconnect()` when the
manager's owner is torn down, especially when observation is enabled.

## Next steps

- [API and browser behavior](reference.md): Complete exports, loading,
  persistence, DOM translation boundaries, SSR behavior, events, fallback
  behavior, and cleanup.
