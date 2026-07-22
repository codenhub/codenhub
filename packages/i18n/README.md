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

- ESM-aware package resolution.
- Core requires standard `Event` and `EventTarget` globals and has no runtime dependencies.
- Browser features require `navigator`, `document`, `localStorage`, or
  `MutationObserver` only when their related behavior is enabled.
- Do not overlap `initializeBrowserI18n()` with direct `init()` calls on the same
  manager; a superseded browser initialization rejects and releases its binding.
- Concurrent SSR requests and SSG renders must use separate manager instances.

## Notes

- Dictionaries may be flat or nested, but every leaf must be a string. Valid
  dictionaries are flattened, frozen, and cached per manager.
- Locale identifiers use conservative ASCII syntax: alphanumeric subtags joined
  by single hyphens.
- Missing active-locale keys fall back to the default dictionary. A key missing
  from both returns `undefined`; diagnostics deduplicate the 1,000 most recent
  locale/key pairs unless silent.
- The package does not own fetch policy, request negotiation, route
  registration, redirects, navigation, rendering, or static page generation.

## License

Licensed under Apache-2.0.
