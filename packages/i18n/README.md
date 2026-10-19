# @codenhub/i18n

Runtime-neutral translations with consumer-provided locale loading, immutable dictionaries, deterministic fallback, and optional browser and locale-path integrations.

## Installation

```sh
pnpm add @codenhub/i18n
```

## Usage

In a browser application, or any runtime with one active locale at a time, create the manager once in a module and import it, or its `t`, wherever text is needed:

```ts
// src/i18n.ts
import { createI18n } from "@codenhub/i18n";

const dictionaries = {
  en: { home: { title: "Welcome" } },
  pt: { home: { title: "Bem-vindo" } },
} as const;

export const i18n = createI18n({
  defaultLocale: "en",
  locales: ["en", "pt"] as const,
  loadLocale: (locale) => dictionaries[locale],
  getLocaleDirection: () => "ltr",
});

export const { t } = i18n;
```

```ts
// src/main.ts
import { i18n, t } from "./i18n";

await i18n.init({ locale: "pt" });
console.log(t("home.title")); // "Bem-vindo"
```

`t` is a bound alias of `translate()`, and every manager method stays bound when destructured. Keys are typed from the loader's return type, so `t("home.titel")` fails to compile; a loader typed `unknown` or `any`, such as one returning `response.json()`, accepts any string key. `t` checks readiness when called, not when exported, so it works anywhere once `init()` has applied.

`init()` resolves `true` when its state is applied and `false` when a newer operation supersedes it. It rejects when a required loader rejects or returns an invalid dictionary. Await applied initialization before calling `t()` or `setLocale()`.

On a server, create one manager per request instead of a shared module, as the [SSR example](docs/examples.md#ssr) shows.

## Documentation

- [Documentation overview](docs/index.md)
- [Usage across runtimes](docs/examples.md)
- [API reference](docs/reference.md)

## Requirements

- ESM-aware package resolution.
- Node.js 24 or newer, or a current Chromium, Firefox, WebKit, or browser Web Worker runtime with the required standard globals.
- Core requires standard `Event` and `EventTarget` globals and has no runtime dependencies.
- Browser features require `navigator`, `document`, `localStorage`, or `MutationObserver` only when their related behavior is enabled.
- Do not overlap `initializeBrowserI18n()` with direct `init()` calls on the same manager; a superseded browser initialization rejects and releases its binding.
- Concurrent SSR requests and SSG renders must use separate manager instances.

## Notes

- Dictionaries may be flat or nested, but every leaf must be a string and every group a plain object. Valid dictionaries are flattened, frozen, cached per manager, and shared across managers that load the same payload object. Repeated object references and payloads exceeding the documented resource limits are rejected. `dictionaryLimits` raises or lowers the depth, translation, property, value-length, and aggregate-length limits; the 1,000-character flattened-key limit is fixed.
- Locale identifiers use conservative ASCII syntax: alphanumeric subtags joined by single hyphens.
- Missing active-locale keys fall back to the default dictionary without a warning; a key-parity check in tests finds them (see the examples). A key missing from both returns `undefined`; diagnostics deduplicate the 1,000 most recent locale/key pairs unless silent.
- Translation lookup and locale routing intentionally omit interpolation, plural selection, ICU messages, rich messages, HTML rendering, number/date formatting, navigation, and redirects.
- Browser DOM translation sets text with `data-i18n` and allowlisted text attributes, such as `placeholder` or `aria-label`, with `data-i18n-<attribute>`. It skips `style`, `script`, `noscript`, and `template` elements. Invalid keys are skipped without interrupting other translations.
- Locale routing rejects encoded percent signs so later decoding cannot expose separators, controls, or dot segments.
- The package does not own fetch policy, request negotiation, route registration, redirects, navigation, rendering, or static page generation.

## License

Licensed under Apache-2.0.
