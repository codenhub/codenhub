# @codenhub/i18n

Translate your app's text with typed keys, ICU messages, plurals, and fallback languages, in the browser, on a server, or at build time.

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

That last line is the point of the whole package: the typo fails in your editor, not in front of a Portuguese visitor. Await `init()` before calling `t()`, which throws until the manager has started.

Two optional entry points cover what differs by environment:

- `@codenhub/i18n/browser` detects the visitor's language, remembers the one your app chooses, keeps `<html lang>` and `dir` in step, and can translate HTML marked with `data-i18n`.
- `@codenhub/i18n/routing` reads and builds localized paths, such as `/pt/about` or `/pt/sobre`, and can drop the locale prefix where a path is unambiguous, as in `/sobre`.

## Documentation

- [Overview](docs/index.md): the ideas behind the package and a walkthrough.
- [Write your translations](docs/translations.md): JSON files, ICU messages, plurals, regional variants, and typed keys and values.
- [Translate a browser app](docs/browser.md), including in a Web Worker.
- [Render on a server or at build time](docs/server-rendering.md)
- [Localized URLs](docs/localized-urls.md)
- [Troubleshooting](docs/troubleshooting.md)
- [API reference](docs/reference/index.md)
- [Changelog](docs/changelog/index.md)

## Requirements

- An ESM-aware bundler or runtime.
- Node.js 24 or newer, or a current Chromium, Firefox, or WebKit browser or Web Worker.
- No runtime dependencies.

In a Web Worker, the root entry point and `@codenhub/i18n/routing` work as anywhere else. `@codenhub/i18n/browser` works only with `syncDocument: false` and no `root`, since a worker has no page; with the defaults it throws a `TypeError` before starting the manager. See [In a Web Worker](docs/browser.md#in-a-web-worker).

## Notes

- On a server or in a static build, create one manager per request or page, not a shared one. A shared manager is how one visitor ends up reading another visitor's language.
- The package does not render HTML from translations: text always comes back as text.
- ICU messages cover `number`, `date`, `time`, `plural`, `selectordinal`, and `select`, without number skeletons or styles such as `{n, number, currency}`, which are shown as written with a warning. Format such a value with `formatNumber()` and pass the result in.

## License

Licensed under Apache-2.0.
