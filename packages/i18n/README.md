# @codenhub/i18n

Runtime-neutral translations with consumer-provided locale loading, immutable dictionaries, deterministic fallback, and optional browser and locale-path integrations.

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

`init()` resolves `true` when its state is applied and `false` when a newer operation supersedes it. It rejects when a required loader rejects or returns an invalid dictionary. Await applied initialization before calling `translate()` or `setLocale()`.

## Documentation

- [Documentation overview](docs/index.md)
- [Usage across runtimes](docs/examples.md)
- [API reference](docs/reference.md)

## Requirements

- ESM-aware package resolution.
- Node.js 24.14.1 or newer, or a current Chromium, Firefox, WebKit, or browser Web Worker runtime with the required standard globals.
- Core requires standard `Event` and `EventTarget` globals and has no runtime dependencies.
- Browser features require `navigator`, `document`, `localStorage`, or `MutationObserver` only when their related behavior is enabled.
- Do not overlap `initializeBrowserI18n()` with direct `init()` calls on the same manager; a superseded browser initialization rejects and releases its binding.
- Concurrent SSR requests and SSG renders must use separate manager instances.

## Notes

- Dictionaries may be flat or nested, but every leaf must be a string. Valid dictionaries are flattened, frozen, and cached per manager. Repeated object references and payloads exceeding the documented resource limits are rejected.
- Locale identifiers use conservative ASCII syntax: alphanumeric subtags joined by single hyphens.
- Missing active-locale keys fall back to the default dictionary. A key missing from both returns `undefined`; diagnostics deduplicate the 1,000 most recent locale/key pairs unless silent.
- Translation lookup and locale routing intentionally omit interpolation, plural selection, ICU messages, rich messages, HTML rendering, number/date formatting, navigation, and redirects.
- Browser DOM translation skips `style`, `script`, `noscript`, and `template` elements. Invalid `data-i18n` keys are skipped without interrupting other translations.
- Locale routing rejects encoded percent signs so later decoding cannot expose separators, controls, or dot segments.
- The package does not own fetch policy, request negotiation, route registration, redirects, navigation, rendering, or static page generation.

## License

Licensed under Apache-2.0.
