---
title: API Reference
description: Complete root, browser, and routing entrypoint contracts and errors.
---

# API reference

The package has three public entrypoints. Locale identifiers use conservative
ASCII syntax: alphanumeric subtags joined by single hyphens. They are trimmed
when configuration is created and matched case-insensitively; returned state
uses the trimmed canonical spelling and order from `locales`.

## `@codenhub/i18n`

The root entrypoint is runtime-neutral. It exports `createI18n`, `I18nError`, and
`i18nErrors`, plus the `I18n`, `I18nConfig`, `I18nErrorCode`, `I18nEventMap`,
`I18nErrorOptions`, `I18nInitOptions`, `I18nLocaleChangeEventDetail`,
`I18nReadyEventDetail`, `LocaleDictionary`, and `LocaleDirection` types.

### Configuration

```ts
interface I18nConfig<TLocale extends string = string> {
  defaultLocale: TLocale;
  locales: readonly TLocale[];
  loadLocale(locale: TLocale): unknown | Promise<unknown>;
  getLocaleDirection(locale: TLocale): "ltr" | "rtl";
  isSilent?: boolean;
}

function createI18n<TLocale extends string>(config: I18nConfig<TLocale>): I18n<TLocale>;
```

`locales` must be a non-empty array of conservative ASCII locale identifiers
that remain unique case-insensitively after trimming. `defaultLocale` must match one of them.
`loadLocale` and `getLocaleDirection` must be functions, and `isSilent`, when
provided, must be boolean. Invalid configuration throws `TypeError` during
`createI18n()`.

Configuration locale metadata is copied and frozen. Later caller mutations do
not alter `defaultLocale`, `locales`, or locale matching. The loading and
direction callbacks remain consumer-owned dependencies. Exceptions from
`getLocaleDirection` propagate unchanged; the initial call occurs during
`createI18n()`, and later calls occur before newly loaded state is applied.

### Initial state and properties

An `I18n<TLocale>` starts with:

- `defaultLocale`: canonical configured default.
- `locales`: frozen canonical locale copy.
- `isSilent`: `config.isSilent ?? false`.
- `locale`: `defaultLocale`.
- `direction`: `getLocaleDirection(defaultLocale)`.
- `isReady`: `false`.

The manager provides EventTarget-compatible `addEventListener()` and
`removeEventListener()` methods. Only those listener methods are part of the
supported public event API; `dispatchEvent()` and runtime inheritance details
are not exposed by `I18n`. `translate()` and `setLocale()` throw `Error` before
successful initialization. `loadLocale()` and `resolveLocale()` may be used
before initialization.

### `init(options?)`

```ts
interface I18nInitOptions<TLocale extends string = string> {
  locale?: TLocale;
}

init(options?: I18nInitOptions<TLocale>): Promise<void>;
```

The explicit locale is trimmed and matched case-insensitively. Only `undefined`
means omitted; omission selects `defaultLocale`. Core never inspects browser,
route, request, or process state.

Initialization of a non-default locale loads it and the default locale in
parallel. State is applied only after both required dictionaries and the locale
direction resolve successfully. A successful call sets `isReady` and emits
`ready`; repeated successful calls emit another `ready` event.

Overlapping initialization and locale-change operations use latest-request-wins
application. A stale successful completion resolves without applying state or
emitting a success event. A failed initial call leaves the manager not ready; a
failed reinitialization preserves prior ready state. A stale operation that
fails before the application check still rejects with its normal error.

### `loadLocale(locale)`

```ts
loadLocale(locale: TLocale): Promise<LocaleDictionary>;
```

Loads one supported locale without changing active locale, direction, readiness,
or emitting events. Successful dictionaries and in-flight requests are cached
per manager. Failed loads are removed from the in-flight cache and can be
retried by a later call.

### Dictionary contract

`loadLocale` may resolve to a flat or nested object. Nested keys are flattened:

```ts
const payload = {
  page: {
    title: "Welcome",
  },
};
// becomes { "page.title": "Welcome" }
```

The normalized `LocaleDictionary` has a null prototype, is frozen, and contains
only string values. Dictionaries allow at most 100 levels of nesting, 10,000
translations, and 1,000 characters per flattened key. A payload throws
`TypeError` when it:

- Is null, an array, a primitive, or empty.
- Contains a non-string leaf, array, function, symbol key, accessor, or cycle.
- Contains an empty dot-separated segment, a `__proto__`, `prototype`, or
  `constructor` segment, or a flat/nested key collision.
- Exceeds a dictionary depth, translation count, or flattened-key limit.

Validation failures are not wrapped and are retryable on the next load.

### `setLocale(locale)`

```ts
setLocale(locale: TLocale): Promise<void>;
```

Loads the selected and, when needed, default dictionary before atomically
applying locale, direction, and fallback state. Failure preserves current state.
Setting the active locale resolves without loading or emitting. A stale
successful completion resolves without applying or emitting.

The method does not persist state, update a document, translate DOM, redirect,
or navigate. An active browser binding reacts to successful changes and applies
its configured effects.

### `resolveLocale(value)`

```ts
resolveLocale(value: string): TLocale | undefined;
```

Trims an untrusted string and returns the canonical case-insensitive exact
configured match. It returns `undefined` for blank, unsupported, and runtime
non-string values. It does not perform language-subtag matching.

### `translate(key)`

```ts
translate(key: string): string | undefined;
```

Trims a non-empty key, checks the active dictionary, then the default
dictionary. A key missing from both returns `undefined`. Unless `isSilent` is
true, the manager warns once for each of the 1,000 most recently missing
active-locale/key pairs; an evicted pair can warn again. Blank or runtime non-string keys throw `TypeError`.

The API does not provide interpolation, plural selection, rich messages,
number/date formatting, or HTML rendering.

### Events

Typed `addEventListener` and `removeEventListener` overloads cover:

```ts
interface I18nReadyEventDetail<TLocale extends string = string> {
  locale: TLocale;
}

interface I18nLocaleChangeEventDetail<TLocale extends string = string> {
  locale: TLocale;
  previousLocale: TLocale;
}
```

- `ready` emits after every successfully applied `init()`.
- `locale-change` emits after a successful applied change to a different locale.
- `loadLocale()`, same-locale changes, stale completions, and failed operations
  emit no lifecycle event.

Events are `CustomEvent` compatible even where the runtime lacks a global
`CustomEvent` constructor. EventTarget-compatible listener overloads remain
available, but consumers cannot dispatch manager lifecycle events through the
public `I18n` type.

### Errors

Native errors identify programmer or payload failures:

| Failure                                                              | Error        |
| -------------------------------------------------------------------- | ------------ |
| Invalid configuration or dictionary                                  | `TypeError`  |
| Unsupported locale or runtime non-string locale in locale operations | `RangeError` |
| `translate()` or `setLocale()` before successful initialization      | `Error`      |
| Blank or runtime non-string translation key                          | `TypeError`  |

A rejected injected loader is wrapped:

```ts
type I18nErrorCode = "locale_load_failed";

interface I18nErrorOptions {
  readonly locale?: string;
  readonly cause?: unknown;
}

class I18nError extends Error {
  readonly code: I18nErrorCode;
  readonly locale?: string;
  override readonly cause?: unknown;

  constructor(options: I18nErrorOptions);
}
```

Its name is `"I18nError"`, message is
`Failed to load translations for locale "<locale>".`, `locale` identifies the
load, and `cause` preserves the rejection. Constructing it without a locale uses
the message `Failed to load translations.`. `isSilent` does not suppress errors.

`i18nErrors` is a plain safe-feedback mapping for optional registration with
`@codenhub/error`:

```ts
{
  locale_load_failed: {
    message: "Translations could not be loaded.",
    messageKey: "error.i18n.loader.localeLoadFailed",
    source: "i18n.loader",
  },
}
```

## `@codenhub/i18n/browser`

The browser entrypoint exports `initializeBrowserI18n` and the
`BrowserI18nOptions` and `BrowserI18nBinding` types.

```ts
interface BrowserI18nOptions<TLocale extends string> {
  i18n: I18n<TLocale>;
  locale?: TLocale;
  storageKey?: string;
  persistLocale?: boolean;
  syncDocument?: boolean;
  root?: ParentNode;
  observe?: boolean;
}

interface BrowserI18nBinding {
  disconnect(): void;
}

function initializeBrowserI18n<TLocale extends string>(
  options: BrowserI18nOptions<TLocale>,
): Promise<BrowserI18nBinding>;
```

### Locale selection and defaults

The helper selects the initial locale in this order:

1. Explicit `locale`.
2. Valid JSON `{ "locale": "..." }` from `localStorage`, when persistence is
   enabled.
3. `navigator.languages`, or `navigator.language` when that list is empty.
4. The configured default locale.

An explicit locale is authoritative. Browser preferences test an exact
case-insensitive match first, then match the language subtag to the first
configured locale with that language.

Defaults are `storageKey: "i18n"`, `persistLocale: true`,
`syncDocument: true`, and `observe: false`. DOM translation is disabled unless
`root` is provided. `observe: true` without a root rejects with `TypeError`
before core initialization.

### Effects and cleanup

After core initialization succeeds, the binding:

- Persists `{ locale: i18n.locale }` as JSON when enabled.
- Sets `document.documentElement.lang` and `dir` when enabled.
- Translates eligible `data-i18n` leaves under `root`, when supplied.
- Reapplies enabled effects after successful `ready` and `locale-change` events.
- Observes additions and `data-i18n` changes under `root` only when requested.

Mutation observation translates only affected elements and added subtrees;
locale changes still retranslate the complete configured root.

Only one initializing or active browser binding may own a manager. A duplicate
call rejects with `TypeError`. Failed setup releases listeners, observation, and
ownership so initialization may be retried.

If a concurrent direct core initialization supersedes the browser helper before
its selected locale becomes active, the helper rejects with `Error` and releases
its ownership. A later browser initialization may then retry.

`disconnect()` is idempotent. It removes binding listeners, disconnects its
observer, releases its root and manager ownership, and allows a new binding. It
does not reset core readiness or locale, clear storage, revert DOM text, or
revert document attributes.

Storage read, parse, and write failures are recoverable: they warn unless the
manager is silent and initialization continues. Explicit invalid locales,
required loader rejection, invalid dictionaries, and observer setup failures
still reject. Runtime non-string explicit locales reject with `RangeError`
without falling through to storage or navigator input.

### DOM translation boundary

Only elements carrying a non-empty `data-i18n` key and no child elements are
translated. Original text is retained as fallback and restored when a later
locale lacks the key. Elements containing markup are skipped and warn unless
silent. Traversal does not enter a custom element from an outer root; pass that
custom element or its shadow root explicitly when it owns translation.

## `@codenhub/i18n/routing`

The routing entrypoint exports `createLocaleRouting` and the `LocaleRouting`,
`LocaleRoutingConfig`, `LocalizedPath`, and `ParsedLocalePath` types.

```ts
interface LocaleRoutingConfig<TLocale extends string> {
  defaultLocale: TLocale;
  locales: readonly TLocale[];
  prefixDefaultLocale: boolean;
}

interface ParsedLocalePath<TLocale extends string> {
  locale: TLocale;
  pathname: string;
}

interface LocalizedPath<TLocale extends string> {
  locale: TLocale;
  pathname: string;
}

interface LocaleRouting<TLocale extends string> {
  parse(pathname: string): ParsedLocalePath<TLocale> | undefined;
  localize(pathname: string, locale: TLocale): string;
  localizeAll(pathname: string): readonly LocalizedPath<TLocale>[];
}
```

`createLocaleRouting(config)` trims and snapshots locale configuration.
`locales` must be non-empty, contain conservative ASCII locale identifiers that
are case-insensitively unique, and contain `defaultLocale`;
`prefixDefaultLocale` must be boolean. Invalid configuration throws `TypeError`.

```ts
import { createLocaleRouting } from "@codenhub/i18n/routing";

const routing = createLocaleRouting({
  defaultLocale: "en",
  locales: ["en", "pt"] as const,
  prefixDefaultLocale: false,
});

routing.parse("/pt/about");
// { locale: "pt", pathname: "/about" }

routing.localize("/about", "pt");
// "/pt/about"

routing.localizeAll("/about");
// [{ locale: "en", pathname: "/about" },
//  { locale: "pt", pathname: "/pt/about" }]
```

`parse()` recognizes a complete first path segment case-insensitively. With
`prefixDefaultLocale: true`, an unprefixed path returns `undefined`; with
`false`, it resolves to the default locale. A recognized prefix is removed and
the root normalizes to `/`.

`localize()` replaces a recognized locale prefix. It leaves an unsupported
leading segment as application path content, emits canonical locale spelling,
and omits the default prefix when configured. An unsupported or runtime
non-string locale throws `RangeError`. `localizeAll()` returns one result per
configured locale in configuration order.

All three methods accept only an absolute application pathname beginning with
`/`. They reject `TypeError` for an empty or relative path, full or protocol
relative URL, repeated slash, query, fragment, backslash, encoded slash or
backslash, ASCII control character, encoded ASCII control character, malformed
percent escape, and literal or encoded dot segment. Non-root trailing slashes
are preserved.

Routing never reads globals, negotiates headers, registers routes, handles base
paths, redirects, navigates, renders HTML, or emits static pages.
