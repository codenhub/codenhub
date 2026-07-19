---
status: IMPLEMENTED
last_updated: 2026-07-19
scope: Runtime-neutral architecture and public API refactor for `@codenhub/i18n`.
---

# Runtime-neutral i18n refactor

## Status

This architecture is implemented in version `0.1.0`. The source, package
exports, tests, public documentation, and manually maintained derived LLM
documents describe the runtime-neutral contract specified here. This document
remains maintainer-only and records the design boundaries behind that public
contract.

## Goal

Refactor `@codenhub/i18n` into a small translation primitive that works in
browsers, SSR, SSG, Node.js, and worker runtimes while preserving optional
browser locale detection, persistence, document synchronization, and leaf DOM
translation.

Consumers should be able to keep the same dictionaries, locale configuration,
translation calls, validation, fallback behavior, and localized-path rules when
moving between capable frameworks. Framework-specific code should only connect
the package to request, route, render, build, and navigation lifecycles.

## Design principles

- The core must not read `window`, `document`, `navigator`, `localStorage`, or
  `MutationObserver`.
- Locale data access must be injected by the consumer.
- Explicit locale input must produce deterministic output in every runtime.
- Browser behavior must be optional and separately exported.
- Routing helpers must be pure path transformations, not a router abstraction.
- Invalid input and failed required locale loads must fail fast.
- Locale changes must be atomic and safe under concurrent asynchronous loads.
- Public exports must remain small, intentional, documented, and covered by
  behavior tests.
- Instances must be consumer-owned and request-scoped where concurrent server
  work is possible.

## Public entrypoints

The package exposes three intentional entrypoints:

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./browser": "./dist/browser.js",
    "./routing": "./dist/routing.js"
  }
}
```

The actual conditional export objects must include matching declaration paths
and follow the package lifecycle specification. Internal modules must not be
deep-importable.

### `@codenhub/i18n`

The runtime-neutral translation engine, configuration, errors, dictionaries,
state, and lifecycle event types.

### `@codenhub/i18n/browser`

Browser locale resolution, persistence, document attributes, optional leaf DOM
translation, mutation observation, and cleanup.

### `@codenhub/i18n/routing`

Pure locale-prefixed pathname parsing and generation.

## Core configuration

```ts
export type LocaleDirection = "ltr" | "rtl";

export interface LocaleDictionary {
  readonly [key: string]: string;
}

export interface I18nConfig<TLocale extends string = string> {
  defaultLocale: TLocale;
  locales: readonly TLocale[];
  loadLocale(locale: TLocale): unknown | Promise<unknown>;
  getLocaleDirection(locale: TLocale): LocaleDirection;
  isSilent?: boolean;
}
```

`loadLocale` replaces `getLocaleFile`. The consumer may use dynamic imports,
`fetch`, filesystem reads, a database, a CMS, embedded objects, or another
runtime-appropriate source. The package owns validation, flattening, immutable
normalized dictionaries, caching, in-flight request deduplication, fallback,
and active locale state.

The package must validate configuration when `createI18n` is called:

- `locales` must not be empty.
- Locale identifiers must be non-empty and unique when compared
  case-insensitively.
- `defaultLocale` must match one configured locale.
- Required callbacks must be functions.

No fetch retries, timeout policy, URL construction, or transport assumptions
belong in the core. A loader that uses a fallible external transport owns those
transport policies.

## Dictionary contract

A loader may return a flat or nested object. The package flattens nested objects
to dot-separated keys.

```json
{
  "about": {
    "title": "About us"
  }
}
```

becomes:

```ts
{
  "about.title": "About us"
}
```

A valid dictionary must:

- Be a non-null object and not an array.
- Contain at least one translated leaf.
- Contain only string leaves.
- Not contain arrays, functions, symbols, cyclic values, or prototype-pollution
  keys at any depth.

Invalid dictionaries must be rejected. Values must not be silently coerced to
strings. Normalized dictionaries must not expose inherited properties and must
not be mutable by consumers.

## Core API

```ts
export interface I18nInitOptions<TLocale extends string> {
  locale?: TLocale;
}

export interface I18n<TLocale extends string = string> {
  readonly locale: TLocale;
  readonly direction: LocaleDirection;
  readonly isReady: boolean;

  init(options?: I18nInitOptions<TLocale>): Promise<void>;
  loadLocale(locale: TLocale): Promise<LocaleDictionary>;
  setLocale(locale: TLocale): Promise<void>;
  resolveLocale(value: string): TLocale | undefined;
  translate(key: string): string | undefined;

  addEventListener<K extends keyof I18nEventMap<TLocale>>(
    type: K,
    callback: (this: I18n<TLocale>, event: I18nEventMap<TLocale>[K]) => void,
    options?: AddEventListenerOptions | boolean,
  ): void;

  removeEventListener<K extends keyof I18nEventMap<TLocale>>(
    type: K,
    callback: (this: I18n<TLocale>, event: I18nEventMap<TLocale>[K]) => void,
    options?: EventListenerOptions | boolean,
  ): void;
}

export function createI18n<TLocale extends string>(config: I18nConfig<TLocale>): I18n<TLocale>;
```

The exact event overloads may retain the standard `EventTarget` fallback
signatures required by TypeScript. They must remain runtime-neutral and fully
documented.

### Initial state

Before initialization:

- `locale` is `defaultLocale`.
- `direction` is the direction of `defaultLocale`.
- `isReady` is `false`.
- `translate` and `setLocale` throw `Error` because calling them in this state
  is programmer misuse rather than an operational domain failure.
- `loadLocale` and `resolveLocale` may be used.

### `init`

`init({ locale })` explicitly loads and activates that locale. Omitting `locale`
uses `defaultLocale`; the core performs no environment-based detection.

When a non-default locale is selected, initialization must load both the
selected and default dictionaries so key-level fallback is deterministic. If
either required dictionary fails, initialization rejects and leaves the manager
not ready. It must never report readiness with an unavailable required
dictionary.

Initialization applies state only after all required work succeeds. Repeated
initialization uses the same atomic loading rules and must not expose partial
state.

### `loadLocale`

`loadLocale(locale)` validates the locale, invokes the configured loader,
validates and normalizes its result, and returns the cached normalized
dictionary. It does not change the active locale, readiness, or document state.

Successful dictionaries and in-flight requests are cached per manager instance.
Failed loads are not permanently cached, so a later explicit call may retry.

### `setLocale`

`setLocale(locale)` loads all dictionaries required for the next locale and
then atomically applies it. A failure rejects and preserves the previous locale,
direction, dictionaries, and readiness.

Concurrent calls use latest-request-wins semantics. A stale completion must not
overwrite newer state or emit a locale-change event.

Setting the already active, successfully loaded locale resolves without
emitting a locale-change event.

### `resolveLocale`

`resolveLocale(value)` trims the value and matches configured locales
case-insensitively. It returns the canonical configured locale or `undefined`.
It is the boundary for untrusted route parameters, request values, and browser
language values.

It does not perform language-subtag preference matching. Browser preference
matching belongs to the browser entrypoint.

### `translate`

`translate(key)` trims and validates the key, then checks the active dictionary
and the default dictionary. It returns `undefined` for a missing key and emits a
deduplicated diagnostic unless silent mode is enabled.

The initial refactor does not add parameters, interpolation, plural rules,
number formatting, date formatting, or rich-message parsing.

## Errors

Programmer and configuration errors must throw native errors immediately:

- Invalid configuration and invalid dictionary shapes throw `TypeError`.
- Unsupported locale arguments throw `RangeError`.
- Calling state-dependent methods before initialization throws `Error`.

These failures must not use domain codes or be included in consumer-facing
error mappings. Locale loader failures are operational and use the package error
contract:

```ts
import type { ErrorFeedback } from "@codenhub/error";

export type I18nErrorCode = "locale_load_failed";

export class I18nError extends Error {
  readonly code: I18nErrorCode;
  readonly locale?: string;
  override readonly cause?: unknown;
}

export const i18nErrors = {
  locale_load_failed: {
    message: "Translations could not be loaded.",
    messageKey: "error.i18n.loader.localeLoadFailed",
    source: "i18n.loader",
  },
} satisfies Record<I18nErrorCode, ErrorFeedback>;
```

The exact constructor should use one typed options object rather than three or
more parameters. A rejected locale loader must be wrapped in `I18nError` while
preserving the original failure as `cause`. The stable `code` allows direct
handling and deterministic `@codenhub/error` classification; `messageKey`
allows consumers to translate the safe fallback feedback.

`i18nErrors` is a plain mapping and must not create or mutate an error registry.
`@codenhub/error` is a development dependency used only for the erased
`ErrorFeedback` type import; it must not become a runtime or peer dependency.
Applications opt into classification during initialization:

```ts
import { getErrorRegistry } from "@codenhub/error";
import { i18nErrors } from "@codenhub/i18n";

getErrorRegistry().codes.addList(Object.entries(i18nErrors));
```

The default mapping does not mark locale loading as retryable because the
injected loader may fail for either transient or permanent reasons. Consumers
with more specific knowledge may override the mapping in their registry. Error
normalizers may also inspect `cause` to classify the underlying transport or
platform failure.

`isSilent` suppresses optional diagnostics. It must never suppress thrown
errors, convert failures into empty dictionaries, or make failed initialization
appear successful.

## Events

The core retains the existing event model with locale types propagated through
event details:

```ts
export interface I18nReadyEventDetail<TLocale extends string> {
  locale: TLocale;
}

export interface I18nLocaleChangeEventDetail<TLocale extends string> {
  locale: TLocale;
  previousLocale: TLocale;
}

export interface I18nEventMap<TLocale extends string> {
  ready: CustomEvent<I18nReadyEventDetail<TLocale>>;
  "locale-change": CustomEvent<I18nLocaleChangeEventDetail<TLocale>>;
}
```

- `ready` emits after successful initialization state is applied.
- `locale-change` emits only after a successful active locale change.
- `loadLocale` does not emit lifecycle events.
- Failed and stale operations do not emit success events.

The implementation must not require a browser-only `CustomEvent` constructor in
server runtimes. A standards-compatible internal fallback is acceptable and
must not become a public export.

## Browser entrypoint

```ts
import { initializeBrowserI18n } from "@codenhub/i18n/browser";

export interface BrowserI18nOptions<TLocale extends string> {
  i18n: I18n<TLocale>;
  locale?: TLocale;
  storageKey?: string;
  persistLocale?: boolean;
  syncDocument?: boolean;
  root?: ParentNode;
  observe?: boolean;
}

export interface BrowserI18nBinding {
  disconnect(): void;
}

export function initializeBrowserI18n<TLocale extends string>(
  options: BrowserI18nOptions<TLocale>,
): Promise<BrowserI18nBinding>;
```

### Locale resolution

The browser initializer selects a locale in this order:

1. Explicit `locale`.
2. Valid persisted locale when persistence is enabled.
3. Best supported `navigator.languages` or `navigator.language` match.
4. The configured default locale.

An explicit locale is authoritative for routed and hydrated pages. Browser
state must never override it.

Browser language matching checks each preference in order. It first checks an
exact case-insensitive match, then a language-subtag match such as `pt-PT` to
configured `pt-BR` when no exact `pt-PT` locale exists.

### Defaults

- `storageKey` defaults to `"i18n"`.
- `persistLocale` defaults to `true`.
- `syncDocument` defaults to `true`.
- `observe` defaults to `false`.
- DOM leaf translation is disabled unless `root` is provided.

Passing `observe: true` without `root` is invalid and must reject before
initialization. Framework-rendered applications normally omit both options and
render `translate()` results through their own reactive lifecycle.

### Browser behavior

The initializer:

- Resolves the browser locale and calls core `init({ locale })`.
- Persists successful initial and subsequent active locales when enabled.
- Synchronizes `document.documentElement.lang` and `dir` when enabled.
- Translates eligible `data-i18n` leaves under `root` when provided.
- Retranslates connected DOM leaves after locale changes.
- Creates a `MutationObserver` only when requested.
- Returns a binding that owns browser listeners and observation cleanup.

Storage read and write failures are recoverable browser integration failures.
They warn unless silent mode is enabled and continue without persistence.
Dictionary loading and validation failures still reject.

`disconnect()` removes event listeners, disconnects observation, and releases
the configured root. It does not clear persisted preference, revert translated
text, alter core readiness, or reset document attributes.

The existing leaf-only DOM safety rules remain:

- Translate elements with `data-i18n` and no child elements.
- Preserve fallback text when a key is unavailable.
- Do not traverse into custom elements or shadow roots implicitly.
- Never replace markup-containing element contents.

## Routing entrypoint

```ts
import { createLocaleRouting } from "@codenhub/i18n/routing";

export interface LocaleRoutingConfig<TLocale extends string> {
  defaultLocale: TLocale;
  locales: readonly TLocale[];
  prefixDefaultLocale: boolean;
}

export interface ParsedLocalePath<TLocale extends string> {
  locale: TLocale;
  pathname: string;
}

export interface LocalizedPath<TLocale extends string> {
  locale: TLocale;
  pathname: string;
}

export interface LocaleRouting<TLocale extends string> {
  parse(pathname: string): ParsedLocalePath<TLocale> | undefined;
  localize(pathname: string, locale: TLocale): string;
  localizeAll(pathname: string): readonly LocalizedPath<TLocale>[];
}

export function createLocaleRouting<TLocale extends string>(
  config: LocaleRoutingConfig<TLocale>,
): LocaleRouting<TLocale>;
```

The routing factory applies equivalent locale configuration validation to the
core and snapshots its configuration. Implementation helpers remain private.

### Path behavior

The utility accepts absolute application pathnames beginning with `/`. It does
not accept complete URLs, query strings, or fragments.

```ts
const routing = createLocaleRouting({
  defaultLocale: "en",
  locales: ["en", "pt"] as const,
  prefixDefaultLocale: true,
});

routing.parse("/pt/about");
// { locale: "pt", pathname: "/about" }

routing.localize("/about", "pt");
// "/pt/about"

routing.localizeAll("/about");
// [
//   { locale: "en", pathname: "/en/about" },
//   { locale: "pt", pathname: "/pt/about" },
// ]
```

When `prefixDefaultLocale` is `true`, an unprefixed path does not identify a
locale and `parse` returns `undefined`.

When `prefixDefaultLocale` is `false`, an unprefixed path resolves to the
default locale. Explicit supported prefixes are still parsed so consumers can
detect and redirect non-canonical default-locale URLs through their framework.

Locale prefix matching is case-insensitive and segment-safe. Returned locales
and generated prefixes use configured canonical spelling. Root path generation
uses `/{locale}` for prefixed locales, and non-root trailing slashes are
preserved. Locale order from configuration determines `localizeAll` order.

The routing entrypoint must not:

- Register routes or middleware.
- Read browser or request globals.
- Redirect or navigate.
- Generate pages or HTML.
- Negotiate request headers.
- Handle deployment base paths.
- Implement query-string locale selection.

Frameworks own those policies and receive normalized path information from
this utility.

## Browser usage

```ts
import { createI18n } from "@codenhub/i18n";
import { initializeBrowserI18n } from "@codenhub/i18n/browser";

const i18n = createI18n({
  defaultLocale: "en",
  locales: ["en", "pt"] as const,
  loadLocale: async (locale) => {
    const response = await fetch(`/locales/${locale}.json`);

    if (!response.ok) {
      throw new Error(`Could not load locale ${locale}`);
    }

    return response.json();
  },
  getLocaleDirection: () => "ltr",
});

const browserBinding = await initializeBrowserI18n({
  i18n,
  root: document,
  observe: true,
});

console.log(i18n.translate("about.title"));

browserBinding.disconnect();
```

A framework-rendered browser application normally omits `root` and `observe`.
It listens for locale changes or connects the manager through framework state,
then renders `translate()` results itself.

## Routed browser and hydration usage

```ts
import { createI18n } from "@codenhub/i18n";
import { initializeBrowserI18n } from "@codenhub/i18n/browser";
import { createLocaleRouting } from "@codenhub/i18n/routing";

const route = routing.parse(window.location.pathname);
const i18n = createI18n(config);

const browserBinding = await initializeBrowserI18n({
  i18n,
  locale: route?.locale ?? config.defaultLocale,
});
```

Changing language on a routed site remains a framework navigation operation:

```ts
const nextPath = routing.localize(currentApplicationPath, nextLocale);
await frameworkNavigate(nextPath);
```

`setLocale` may be used for an in-place browser language change, but it never
changes the URL.

## SSR usage

```ts
import { createI18n } from "@codenhub/i18n";

export async function renderPage(requestLocale: string) {
  const i18n = createI18n(config);
  const locale = i18n.resolveLocale(requestLocale) ?? config.defaultLocale;

  await i18n.init({ locale });

  return frameworkRender({
    locale: i18n.locale,
    direction: i18n.direction,
    title: i18n.translate("about.title"),
  });
}
```

Every concurrent request must own an instance. Applications must not store a
mutable server manager in module-global state.

## SSG usage

```ts
import { createI18n } from "@codenhub/i18n";
import { createLocaleRouting } from "@codenhub/i18n/routing";

const pages = ["/", "/about", "/contact"];
const staticPaths = pages.flatMap((page) => routing.localizeAll(page));

for (const route of staticPaths) {
  const i18n = createI18n(config);

  await i18n.init({ locale: route.locale });

  await frameworkGeneratePage({
    pathname: route.pathname,
    locale: route.locale,
    direction: i18n.direction,
    title: i18n.translate("page.title"),
  });
}
```

Capable frameworks may parallelize generation or consume `localizeAll` through
their static-path API. Each concurrently rendered page must have isolated active
state. Module systems may still share immutable imported dictionary data and
their own import cache.

## Loader examples

### Dynamic imports

```ts
const config = {
  defaultLocale: "en",
  locales: ["en", "pt"] as const,
  loadLocale: async (locale: "en" | "pt") => {
    const module = await import(`./locales/${locale}.json`);
    return module.default;
  },
  getLocaleDirection: () => "ltr" as const,
};
```

### Embedded dictionaries

```ts
const dictionaries = {
  en: { greeting: "Hello" },
  pt: { greeting: "Olá" },
} as const;

const config = {
  defaultLocale: "en",
  locales: ["en", "pt"] as const,
  loadLocale: (locale: keyof typeof dictionaries) => dictionaries[locale],
  getLocaleDirection: () => "ltr" as const,
};
```

Framework-specific loaders may differ, but the manager and application usage do
not.

## Removed API and behavior

The refactor intentionally removes or changes:

- `I18nConfig.getLocaleFile`; replace it with `loadLocale`.
- Automatic environment behavior from core `init`; use explicit core locale or
  `initializeBrowserI18n`.
- Core DOM methods and options; use the browser entrypoint.
- Core `disconnect`; cleanup belongs to `BrowserI18nBinding`.
- `setI18nInstance` and `getI18nInstance`; consumers own and inject instances.
- Boolean `setLocale` results; success resolves and failure throws.
- Silent empty-dictionary initialization after load failures.
- Automatic coercion of non-string dictionary leaves.
- Built-in fetch timeout and retry behavior; transport policy belongs to the
  injected loader.

No compatibility layer is required because the package is experimental and the
breaking contract was explicitly approved.

## Internal module boundaries

The implementation keeps focused modules with no browser imports flowing into
core code. Its compact implemented structure is:

```text
src/
  index.ts
  i18n.ts
  dictionary.ts
  errors.ts
  locale-loader.ts
  locale-resolution.ts
  types.ts
  browser.ts
  browser/
    browser-i18n.ts
    dom-translation.ts
  routing.ts
```

The dependency direction may not change:

- Core depends only on core modules.
- Browser depends on core public concepts and browser internals.
- Routing depends only on shared locale validation or runtime-neutral internals.
- Core and routing never depend on browser modules.

Shared implementation helpers must remain private unless consumers need them as
part of the approved contract.

## Verification

### Core unit tests

- Configuration validation and canonical locale matching.
- Flat and nested dictionary validation and flattening.
- Rejection of invalid leaves, arrays, cycles, and dangerous keys.
- Explicit default and non-default initialization.
- Required default-dictionary fallback loading.
- Public non-mutating `loadLocale` behavior.
- Successful and in-flight cache behavior and retry after failure.
- Missing-key fallback and deduplicated diagnostics.
- Atomic failures and latest-request-wins concurrency.
- Native programmer errors, operational error codes and mappings, preserved
  causes, readiness, and event behavior.
- Execution without browser globals.

### Browser unit tests

- Explicit, persisted, browser-preference, and default locale precedence.
- Exact and language-subtag preference matching.
- Storage failure recovery and persistence options.
- Document `lang` and `dir` synchronization.
- Optional root translation and observation.
- Framework-rendered usage with no DOM root.
- Binding cleanup without resetting core state.
- Explicit route locale protection from persisted preference overrides.

### Routing unit tests

- Prefix-all and default-unprefixed behavior.
- Root, nested, and trailing-slash paths.
- Case-insensitive and segment-safe locale matching.
- Canonical locale spelling and configured output order.
- Non-canonical explicit default prefixes.
- Invalid path, locale, and configuration errors.

### Automated integration confidence

- Concurrent SSR requests do not share active state.
- Parallel SSG renders produce deterministic localized output.

### Manual release verification

- Root, browser, and routing imports resolve through built package exports.
- Public examples typecheck against declarations generated from those exports.

Implementation must run the package-filtered checks and the practical workspace
checks required by repository policy. A package-local playground, dev, or debug
scenario should be added only if it immediately improves cross-runtime consumer
confidence beyond automated tests.

## Documentation and release state

The implementation includes:

- Source JSDoc/TSDoc for every public symbol.
- `README.md` with the default consumer path and breaking migration notice.
- Public package overview and reference documentation.
- Public documentation for each root, browser, and routing entrypoint.
- Browser, SSR, SSG, and localized-routing examples.
- `llms.txt` navigation where public documents change.
- Manually maintained `llms-full.txt` derived content.
- `package.json` exports and package description.
- This document's status and the package roadmap.

The breaking contract is versioned as `0.1.0` and called out in consumer-facing
documentation. Pack validation must continue to confirm that all public
entrypoints and declarations are present while `docs/internal/` remains
unpublished.

## Acceptance criteria

The implemented refactor satisfies these ongoing invariants:

- The same core manager API renders translations in browser, SSR, and SSG
  environments.
- Core tests pass with no browser globals installed.
- Browser behavior exists only through the browser entrypoint.
- Locale-prefixed paths can be parsed and generated without a framework
  dependency.
- No API registers routes, redirects, emits pages, or navigates.
- Failed required locale loads cannot produce ready or silently untranslated
  output.
- Concurrent server and build operations remain isolated.
- Current package exports, source documentation, public docs, examples, and LLM
  documentation agree.
- All required format, lint, type, test, build, and pack checks pass.

## References

- [Roadmap](./roadmap.md)
- [Public overview](../index.md)
- [Public reference](../reference.md)
- [Repository code guidelines](../../../../docs/code-guidelines.md)
- [Repository documentation guidelines](../../../../docs/docs-guidelines.md)
- [Package lifecycle spec](../../../../docs/specs/packages-lifecycle.md)
- [Package documentation spec](../../../../docs/specs/packages-documentation.md)
- [Package development spec](../../../../docs/specs/packages-development.md)
- [Testing spec](../../../../docs/specs/tests.md)
