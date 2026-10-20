---
title: Overview
description: Runtime-neutral translations with optional browser and locale-path integrations.
---

# Translate applications across runtimes

`@codenhub/i18n` provides isolated translation managers with consumer-owned locale loading. Use the core API in browser main threads, browser Web Workers, servers, and static builds, then add browser effects or locale-prefixed paths when needed.

## Setup

### Installation

```sh
pnpm add @codenhub/i18n
```

### Quick start

In a browser application, or any runtime with one active locale at a time, create the manager once in an application module and export it with its bound `t`:

```ts
// src/i18n.ts
import { createI18n } from "@codenhub/i18n";

const dictionaries = {
  en: { page: { title: "Welcome", description: "Learn more", greeting: "Hello, {name}!" } },
  pt: { page: { title: "Bem-vindo", greeting: "Olá, {name}!" } },
} as const;

export const i18n = createI18n({
  defaultLocale: "en",
  locales: ["en", "pt"] as const,
  loadLocale: (locale) => dictionaries[locale],
});

export const { t } = i18n;
```

Initialize it once at startup, then import `t` wherever text is needed:

```ts
import { i18n, t } from "./i18n";

await i18n.init({ locale: "pt" });

t("page.title"); // "Bem-vindo"
t("page.description"); // "Learn more" from the default locale
t("page.greeting", { name: "Ana" }); // "Olá, Ana!"
t("page.titel"); // compile error: keys are typed from the dictionaries
```

Core never reads browser, request, or process state: pass the locale, or pick one from preferences with `i18n.matchLocale(["pt-BR"])`, which returns `"pt"` here. Omitting `init({ locale })` selects the configured default. Selecting another locale loads both its dictionary and the default dictionary before applying state, so fallback is deterministic.

`t` always returns a string: a key missing from both dictionaries returns the key and is reported to `onMissingKey`, or warned once by default. Every manager method is bound, so destructured methods keep working, and `t` checks readiness when called rather than when exported. `i18n.subscribe(listener)` calls `listener` after every applied initialization and locale change, for re-rendering a framework. Servers and static builds that render concurrently create one manager per request or page instead of sharing a module.

### Configuration

Configure supported locales, a default locale, and a dictionary loader. Text direction defaults from each locale, such as `rtl` for `ar` or `he`, and `getLocaleDirection` overrides it. The loader may use imports, HTTP, files, or another runtime-specific source.

Use `@codenhub/i18n/browser` for browser locale selection, persistence, document attributes, and optional DOM translation. Use `@codenhub/i18n/routing` for pure locale-prefixed pathname parsing and generation.

## Requirements

- ESM-aware package resolution.
- Node.js 24 or newer, or a current Chromium, Firefox, WebKit, or browser Web Worker runtime with the required standard globals.
- Core requires standard `Event` and `EventTarget` globals.
- Browser features require only the browser APIs they enable.
- Browser initialization must not overlap direct core initialization on the same manager; a superseded browser call rejects and releases ownership.
- Concurrent SSR requests and SSG renders require separate manager instances.

The package intentionally focuses on deterministic string lookup and locale paths. Interpolation fills `{name}` placeholders only; it does not provide plural selection, ICU or rich messages, HTML rendering, number/date formatting, navigation, or redirects.

## Next steps

- [Usage across runtimes](examples.md) covers browser setup, routed hydration, SSR, SSG, and loader patterns.
- [API reference](reference.md) documents configuration, dictionaries, browser behavior, routing, events, and failures.
