---
title: Overview
description: Runtime-neutral translations with optional browser and locale-path integrations.
---

# Use translations in any runtime

`@codenhub/i18n` provides an isolated translation manager whose locale data
source is injected by the consumer. The same core API works in browsers, SSR,
SSG, Node.js, and workers. Optional entrypoints add browser effects and pure
locale-prefixed pathname operations without coupling core state to either.

The package is experimental. Version `0.1.0` intentionally breaks the old
browser-coupled `0.0.1` contract; existing consumers should follow the
[migration guide](migrating-from-0.0.1.md).

## Choose an entrypoint

| Import path              | Purpose                                                                    |
| ------------------------ | -------------------------------------------------------------------------- |
| `@codenhub/i18n`         | Runtime-neutral loading, validation, fallback, translation, state, events. |
| `@codenhub/i18n/browser` | Browser locale selection, persistence, document and optional DOM effects.  |
| `@codenhub/i18n/routing` | Pure parsing and generation of locale-prefixed application pathnames.      |

Only these three package paths are public. Do not import `src`, `dist`, or
package internals.

## Start with core

```ts
import { createI18n } from "@codenhub/i18n";

const dictionaries = {
  en: { page: { title: "Welcome", description: "Learn more" } },
  pt: { page: { title: "Bem-vindo" } },
} as const;

const i18n = createI18n({
  defaultLocale: "en",
  locales: ["en", "pt"] as const,
  loadLocale: (locale) => dictionaries[locale],
  getLocaleDirection: () => "ltr",
});

await i18n.init({ locale: "pt" });

i18n.translate("page.title"); // "Bem-vindo"
i18n.translate("page.description"); // "Learn more" from the default locale
```

Core performs no locale detection. Omitting `init({ locale })` selects the
configured default. Selecting another locale loads both its dictionary and the
default dictionary before applying state, so fallback is deterministic.

## Failure model

Required work fails explicitly:

- Invalid configuration or dictionaries throw `TypeError`.
- Unsupported locales throw `RangeError`.
- `translate()` or `setLocale()` before successful initialization throw `Error`.
- A rejected injected loader becomes `I18nError` with code
  `"locale_load_failed"`, the failed locale, and the original `cause`.

Failed initialization does not make a new manager ready. Failed reinitialization
or locale changes preserve previously applied state. `isSilent` suppresses only
optional warnings; it never suppresses these failures.

## Next steps

- [Usage across runtimes](examples.md): Browser, routed hydration, SSR, SSG, and
  loader examples.
- [API reference](reference.md): Complete entrypoint exports, contracts,
  defaults, events, and observable errors.
- [Migration from 0.0.1](migrating-from-0.0.1.md): Breaking API and behavior
  changes.
