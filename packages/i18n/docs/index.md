---
title: Overview
description: Runtime-neutral translations with optional browser and locale-path integrations.
---

# Translate applications across runtimes

`@codenhub/i18n` provides isolated translation managers with consumer-owned
locale loading. Use the core API in browsers, servers, workers, and static
builds, then add browser effects or locale-prefixed paths when needed.

## Setup

### Installation

```sh
pnpm add @codenhub/i18n
```

### Quick start

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

### Configuration

Configure supported locales, a default locale, a dictionary loader, and text
direction resolution. The loader may use imports, HTTP, files, or another
runtime-specific source.

Use `@codenhub/i18n/browser` for browser locale selection, persistence, document
attributes, and optional DOM translation. Use `@codenhub/i18n/routing` for pure
locale-prefixed pathname parsing and generation.

## Requirements

- ESM-aware package resolution.
- Core requires standard `Event` and `EventTarget` globals.
- Browser features require only the browser APIs they enable.
- Concurrent SSR requests and SSG renders require separate manager instances.

## Next steps

- [Usage across runtimes](examples.md) covers browser setup, routed hydration,
  SSR, SSG, and loader patterns.
- [API reference](reference.md) documents configuration, dictionaries, browser
  behavior, routing, events, and failures.
