# @codenhub/i18n

Runtime-neutral translations with consumer-provided locale loading, immutable
dictionaries, deterministic fallback, and optional browser and locale-path
integrations.

> [!WARNING]
> This package is experimental. Its API, browser integration, routing behavior,
> and support level may change before a stable release.

## Installation

```sh
pnpm add @codenhub/i18n
```

## Usage

```ts
import { createI18n } from "@codenhub/i18n";

const dictionaries = {
  en: { home: { title: "Welcome" } },
  pt: { home: { title: "Bem-vindo" } },
} as const;

const i18n = createI18n({
  defaultLocale: "en",
  locales: ["en", "pt"] as const,
  loadLocale: (locale) => dictionaries[locale],
  getLocaleDirection: () => "ltr",
});

await i18n.init({ locale: "pt" });
console.log(i18n.translate("home.title")); // "Bem-vindo"
```

`init()` rejects when a required loader rejects or returns an invalid
dictionary. Await successful initialization before calling `translate()` or
`setLocale()`.

## Documentation

- [Documentation overview](docs/index.md)
- [Usage across runtimes](docs/examples.md)
- [API reference](docs/reference.md)

## Requirements

- Core requires standard `Event` and `EventTarget` globals and does not read
  browser globals. The consumer-provided loader determines runtime requirements.
- `@codenhub/i18n/browser` requires browser `document`, `navigator`, and, when
  enabled, `localStorage` and `MutationObserver`.
- Concurrent SSR requests and SSG renders must use separate manager instances.

## Notes

- Dictionaries may be flat or nested, but every leaf must be a string. They are
  validated, flattened to dot-separated keys, frozen, and cached per manager.
- Missing active-locale keys fall back to the default dictionary. A key missing
  from both returns `undefined` and warns once per locale/key unless silent.
- The package does not own fetch policy, request negotiation, route
  registration, redirects, navigation, rendering, or static page generation.

## License

Licensed under Apache-2.0.
