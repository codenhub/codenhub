# @codenhub/i18n

Translate your app's text with typed keys, plurals, and a fallback language, in the browser, on a server, or at build time.

## Installation

```sh
pnpm add @codenhub/i18n
```

## Usage

```ts
// src/i18n.ts
import { createI18n } from "@codenhub/i18n";

const dictionaries = {
  en: { home: { title: "Welcome", greeting: "Hello, {name}!" }, cart: { items: { one: "{count} item", other: "{count} items" } } },
  pt: { home: { title: "Bem-vindo", greeting: "Olá, {name}!" }, cart: { items: { one: "{count} item", other: "{count} itens" } } },
} as const;

export const i18n = createI18n({
  locales: ["en", "pt"] as const,
  defaultLocale: "en",
  loadLocale: (locale) => dictionaries[locale],
});

export const { t } = i18n;
```

```ts
// src/main.ts
import { i18n, t } from "./i18n";

await i18n.init({ locale: "pt" });

t("home.greeting", { name: "Ana" }); // "Olá, Ana!"
t("cart.items", { count: 3 }); // "3 itens"
t("home.titel"); // compile error: there is no such key
```

Two optional entry points cover what differs by environment:

- `@codenhub/i18n/browser` detects the visitor's language, remembers the one they choose, keeps `<html lang>` and `dir` in step, and can translate HTML marked with `data-i18n`.
- `@codenhub/i18n/routing` reads and builds locale-prefixed paths, such as `/pt/about`.

## Documentation

- [Overview](docs/index.md): the ideas behind the package and a walkthrough.
- [Write your translations](docs/translations.md): JSON files, placeholders, plurals, and typed keys.
- [Translate a browser app](docs/browser.md)
- [Render on a server or at build time](docs/server-rendering.md)
- [Localized URLs](docs/localized-urls.md)
- [Troubleshooting](docs/troubleshooting.md)
- [API reference](docs/reference/index.md)
- [Changelog](docs/changelog/index.md)

## Requirements

- An ESM-aware bundler or runtime.
- Node.js 24 or newer, or a current Chromium, Firefox, or WebKit browser or Web Worker.
- No runtime dependencies.

## Notes

- On a server or in a static build, create one manager per request or page, not a shared one.
- The package does not format numbers or dates, render HTML from translations, or support the ICU message format.

## License

Licensed under Apache-2.0.
