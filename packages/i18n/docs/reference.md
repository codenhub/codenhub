---
title: API Reference
description: Complete root, browser, and routing entrypoint contracts and errors.
---

# API reference

The package has three public entrypoints. Locale identifiers use conservative ASCII syntax: alphanumeric subtags joined by single hyphens. They are trimmed when configuration is created and matched case-insensitively; returned state uses the trimmed canonical spelling and order from `locales`.

## `@codenhub/i18n`

The root entrypoint is runtime-neutral. It exports `createI18n`, `I18nError`, and `i18nErrors`, plus the `I18n`, `I18nConfig`, `I18nErrorCode`, `I18nEventMap`, `I18nErrorOptions`, `I18nInitOptions`, `I18nLocaleChangeEventDetail`, `I18nReadyEventDetail`, `LocaleDictionary`, `LocaleDictionaryLimits`, and `LocaleDirection` types.

### Configuration

```ts
interface I18nConfig<TLocale extends string = string> {
  defaultLocale: TLocale;
  locales: readonly TLocale[];
  loadLocale(locale: TLocale): unknown | Promise<unknown>;
  getLocaleDirection(locale: TLocale): "ltr" | "rtl";
  isSilent?: boolean;
  dictionaryLimits?: LocaleDictionaryLimits;
}

interface LocaleDictionaryLimits {
  maxDepth?: number; // default 100
  maxTranslations?: number; // default 10,000
  maxProperties?: number; // default 20,000
  maxValueLength?: number; // default 100,000
  maxTotalLength?: number; // default 5,000,000
}

function createI18n<TLocale extends string>(config: I18nConfig<TLocale>): I18n<TLocale>;
```

The configuration must be a plain object, such as an object literal, and only its own properties are read: a class instance or an object built with `Object.create(defaults)` throws `TypeError`. `locales` must be a non-empty array of conservative ASCII locale identifiers that remain unique case-insensitively after trimming. `defaultLocale` must match one of them. `loadLocale` and `getLocaleDirection` must be functions, and `isSilent`, when provided, must be boolean. Each `dictionaryLimits` entry, when provided, must be a positive safe integer, and an unknown limit name is rejected. Invalid configuration throws `TypeError` during `createI18n()`.

Configuration locale metadata is copied and frozen. Later caller mutations do not alter `defaultLocale`, `locales`, or locale matching. The loading and direction callbacks remain consumer-owned dependencies and are called with the configuration object as `this`, as `config.loadLocale(locale)` would be. Exceptions from `getLocaleDirection` propagate unchanged; the initial call occurs during `createI18n()`, and later calls occur before newly loaded state is applied.

### Initial state and properties

An `I18n<TLocale>` starts with:

- `defaultLocale`: canonical configured default.
- `locales`: frozen canonical locale copy.
- `isSilent`: `config.isSilent ?? false`.
- `locale`: `defaultLocale`.
- `direction`: `getLocaleDirection(defaultLocale)`.
- `isReady`: `false`.

The manager provides EventTarget-compatible `addEventListener()` and `removeEventListener()` methods. Only those listener methods are part of the supported public event API; `dispatchEvent()` and runtime inheritance details are not exposed by `I18n`. `translate()` and `setLocale()` throw `Error` before successful initialization. `loadLocale()` and `resolveLocale()` may be used before initialization.

### `init(options?)`

```ts
interface I18nInitOptions<TLocale extends string = string> {
  locale?: TLocale;
}

init(options?: I18nInitOptions<TLocale>): Promise<boolean>;
```

The explicit locale is trimmed and matched case-insensitively. Only `undefined` means omitted; omission selects `defaultLocale`. Core never inspects browser, route, request, or process state.

Initialization of a non-default locale loads it and the default locale in parallel. State is applied only after both required dictionaries and the locale direction resolve successfully. An applied call returns `true`, sets `isReady`, and emits `ready`; repeated applied calls emit another `ready` event.

Overlapping initialization and locale-change operations use latest-request-wins application. A stale successful initialization returns `false` without applying state or emitting a success event. A failed initial call leaves the manager not ready; a failed reinitialization preserves prior ready state. A stale operation that fails before the application check still rejects with its normal error.

### `loadLocale(locale)`

```ts
loadLocale(locale: TLocale): Promise<LocaleDictionary>;
```

Loads one supported locale without changing active locale, direction, readiness, or emitting events. Successful dictionaries and in-flight requests are cached per manager. Failed loads are removed from the in-flight cache and can be retried by a later call.

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

The normalized `LocaleDictionary` has a null prototype, is frozen, and contains only string values.

Dictionaries are checked against resource limits. By default they allow at most 100 levels of nesting, 10,000 translations, 20,000 traversed properties (translations and nested groups together), 100,000 characters per translation value, and 5,000,000 aggregate translation characters. `dictionaryLimits` raises or lowers any of these per manager; unset limits keep their defaults. Raising `maxTranslations` for a nested dictionary may also require raising `maxProperties`. Flattened keys are limited to 1,000 characters; that limit is fixed because `translate()` and DOM keys share it.

A payload throws `TypeError` when it:

- Is null, an array, a primitive, or another non-plain object.
- Contains a non-string leaf, array, function, non-plain object such as a `Date` or `Map`, symbol key, accessor, cycle, or shared object reference. A plain object is one whose prototype is null or an `Object.prototype` from any realm; other objects are rejected rather than treated as empty groups, which would silently drop their translations.
- Contains an empty dot-separated segment, an ASCII control character, a `__proto__` segment, or a flat/nested key collision. `prototype` and `constructor` are ordinary keys.
- Exceeds a dictionary depth, translation count, property count, flattened-key length, translation-value length, or aggregate translation-character limit.

A dictionary may be empty or hold only empty groups. A locale added before it is translated then initializes, and every key falls back to the default dictionary. Empty dictionaries used to be rejected; that was dropped because it made `init()` reject for such a locale, which in a browser stops the application from starting.

Validation failures are not wrapped and are retryable on the next load.

Normalized dictionaries are shared across managers by payload identity: when a loader returns the same object again, even to another manager, the normalized dictionary is reused after it is checked against that manager's limits. A payload is therefore treated as immutable once loaded; mutating it afterwards does not change translations. A loader that returns a new object each time, such as one that parses JSON per call, gets no sharing.

### `setLocale(locale)`

```ts
setLocale(locale: TLocale): Promise<void>;
```

Loads the selected and, when needed, default dictionary before atomically applying locale, direction, and fallback state. Failure preserves current state. Setting the active locale resolves without loading or emitting. A stale successful completion resolves without applying or emitting.

The method does not persist state, update a document, translate DOM, redirect, or navigate. An active browser binding reacts to successful changes and applies its configured effects.

### `resolveLocale(value)`

```ts
resolveLocale(value: string): TLocale | undefined;
```

Trims an untrusted string and returns the canonical case-insensitive exact configured match. It returns `undefined` for blank, unsupported, and runtime non-string values. It does not perform language-subtag matching.

### `translate(key)`

```ts
translate(key: string): string | undefined;
```

Trims a non-empty key, checks the active dictionary, then the default dictionary. A key found only in the default dictionary returns the default text without a warning; compare dictionaries from `loadLocale()` in a test to find untranslated keys, as in the key-parity example. A key missing from both returns `undefined`. Unless `isSilent` is true, the manager warns once for each of the 1,000 most recently missing active-locale/key pairs; an evicted pair can warn again. Blank, runtime non-string, longer than 1,000 characters, or ASCII-control-containing keys throw `TypeError`.

The API does not provide interpolation, plural selection, rich messages, number/date formatting, or HTML rendering.

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
- `loadLocale()`, same-locale changes, stale completions, and failed operations emit no lifecycle event.

Events are `CustomEvent` compatible even where the runtime lacks a global `CustomEvent` constructor. EventTarget-compatible listener overloads remain available, but consumers cannot dispatch manager lifecycle events through the public `I18n` type.

### Errors

Native errors identify programmer or payload failures:

| Failure                                                                     | Error        |
| --------------------------------------------------------------------------- | ------------ |
| Invalid configuration or dictionary                                         | `TypeError`  |
| Unsupported locale or runtime non-string locale in locale operations        | `RangeError` |
| `translate()` or `setLocale()` before successful initialization             | `Error`      |
| Blank, oversized, control-containing, or runtime non-string translation key | `TypeError`  |

A rejected injected loader is wrapped:

```ts
type I18nErrorCode = "i18n.locale_load_failed";

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

Its name is `"I18nError"`, message is `Failed to load translations for locale "<locale>".`, `locale` identifies the load, and `cause` preserves the rejection. Constructing it without a locale uses the message `Failed to load translations.`. `isSilent` does not suppress errors.

`i18nErrors` is a plain safe-feedback mapping for optional registration with `@codenhub/error`:

```ts
{
  "i18n.locale_load_failed": {
    message: "Translations could not be loaded.",
    messageKey: "error.i18n.loader.localeLoadFailed",
    source: "i18n.loader",
  },
}
```

## `@codenhub/i18n/browser`

The browser entrypoint exports `initializeBrowserI18n` and the `BrowserI18nOptions` and `BrowserI18nBinding` types.

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

function initializeBrowserI18n<TLocale extends string>(options: BrowserI18nOptions<TLocale>): Promise<BrowserI18nBinding>;
```

### Locale selection and defaults

The helper selects the initial locale in this order:

1. Explicit `locale`.
2. Valid JSON `{ "locale": "..." }` from `localStorage`, when persistence is enabled.
3. `navigator.languages`, or `navigator.language` when that list is empty.
4. The configured default locale.

An explicit locale is authoritative. Each browser preference, in order, tests an exact case-insensitive match first, then the longest configured locale that the preference starts with as whole subtags and that has the same likely script, such as `zh-Hant` for `zh-Hant-TW` or `pt` for `pt-BR`. The script condition keeps `zh`, whose likely script is Simplified, from taking `zh-TW` when `zh-Hant` is configured. It then adds likely subtags with `Intl.Locale.prototype.maximize()` to the preference and to each configured locale, and takes the first configured locale whose maximized form is equal, then the first with the same language and script, such as `zh-Hant` for `zh-TW` or `zh-HK`, `zh-TW` for `zh-HK` among `zh-CN` and `zh-TW`, or `sr-Cyrl` for `sr`. Last, it takes the first configured locale with the same language subtag.

Defaults are `storageKey: "i18n"`, `persistLocale: true`, `syncDocument: true`, and `observe: false`. DOM translation is disabled unless `root` is provided. `observe: true` without a root rejects with `TypeError` before core initialization.

### Effects and cleanup

After core initialization succeeds, the binding:

- Persists `{ locale: i18n.locale }` as JSON when enabled and the initial locale was explicit. A locale chosen from storage or navigator preferences, or the default, is not written, so a later visit selects again from current preferences; persisting it made the first fallback permanent, so returning users never received a locale added later or a changed browser language.
- Persists the active locale after every later successful `ready` or `locale-change`, when enabled, since those are changes the application made.
- Sets `document.documentElement.lang` and `dir` when enabled.
- Translates eligible `data-i18n` leaves and `data-i18n-<attribute>` attributes under `root`, when supplied.
- Reapplies the other enabled effects after successful `ready` and `locale-change` events.
- Observes additions and changes to `data-i18n` and `data-i18n-<attribute>` keys under `root` only when requested.

Mutation observation translates only affected elements and added subtrees; locale changes still retranslate the complete configured root.

Only one initializing or active browser binding may own a manager. A duplicate call rejects with `TypeError`. Failed setup releases listeners, observation, and ownership so initialization may be retried.

If a concurrent direct core initialization supersedes the browser helper before its selected locale becomes active, the helper rejects with `Error` and releases its ownership. A later browser initialization may then retry.

`disconnect()` is idempotent. It removes binding listeners, disconnects its observer, releases its root and manager ownership, and allows a new binding. It does not reset core readiness or locale, clear storage, revert DOM text, or revert document attributes.

Storage read, parse, and write failures are recoverable: they warn unless the manager is silent and initialization continues.

When the loader rejects for a locale chosen from storage or navigator preferences, the helper warns unless silent and initializes the default locale instead. The default is not persisted and a stored preference is kept, so a later visit tries the preference again. A stored or detected locale is a preference the default can still serve; rejecting made a temporary failure of one dictionary stop the application from starting, and the only recovery, passing the default explicitly, persisted it and kept that user on the default for good.

An explicit locale whose loader rejects, a rejected default locale, invalid dictionaries, explicit invalid locales, and observer setup failures still reject. Runtime non-string explicit locales reject with `RangeError` without falling through to storage or navigator input.

### DOM translation boundary

Only elements carrying a valid, non-empty `data-i18n` key and no child elements are translated. `style`, `script`, `noscript`, and `template` elements are always skipped because their text can activate or hide content. Blank, longer than 1,000 characters, or ASCII-control-containing DOM keys are skipped. Skips warn without including key content unless the manager is silent, and one invalid element does not interrupt other initial or observed translations. Original text is retained as fallback and restored when a later locale lacks the key. Elements containing markup are skipped and warn unless silent.

`data-i18n-<attribute>` translates one attribute of an element, including an element that contains markup, such as `<input data-i18n-placeholder="search.hint">` or `<button data-i18n-aria-label="menu.open"><svg></svg></button>`. Only text read by people or assistive technology is allowed: `alt`, `title`, `placeholder`, `label`, `aria-label`, `aria-description`, `aria-placeholder`, `aria-roledescription`, and `aria-valuetext`. Other names, such as `data-i18n-href`, `data-i18n-style`, or `data-i18n-onclick`, are ignored, so a translation can never set a URL, a style, or an event handler. One data attribute per translated attribute was chosen over a single list attribute, such as `data-i18n-attrs="placeholder:search.hint"`, because it needs no parsing and the observer can watch exactly those names. Attribute keys follow the same key-validity and warning rules as text keys. They are skipped on `style`, `script`, `noscript`, and `template` elements and inside custom elements, like text keys, but unlike text keys they do not require a leaf element. The original value is retained as fallback and restored when a later locale lacks the key; an attribute that was absent is removed again. A value the application sets after translation becomes the new fallback.

With `observe: true`, removing a `data-i18n` or `data-i18n-<attribute>` key restores that text or attribute fallback, unless the application changed the value since translation; an attribute that was absent is removed. Text is not restored when the element has gained child elements, since setting its text would remove them. Without observation, a removed key is not noticed: the element keeps its translated value, and later locale changes no longer update it.

Traversal does not enter a custom element from an outer root; pass that custom element or its shadow root explicitly when it owns translation.

## `@codenhub/i18n/routing`

The routing entrypoint exports `createLocaleRouting` and the `LocaleRouting`, `LocaleRoutingConfig`, `LocalizedPath`, and `ParsedLocalePath` types.

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

`createLocaleRouting(config)` trims and snapshots locale configuration. The configuration must be a plain object, such as an object literal, and only its own properties are read: a class instance or an object built with `Object.create(defaults)` throws `TypeError`. `locales` must be non-empty, contain conservative ASCII locale identifiers that are case-insensitively unique, and contain `defaultLocale`; `prefixDefaultLocale` must be boolean. Invalid configuration throws `TypeError`.

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

`parse()` recognizes a complete first path segment case-insensitively. With `prefixDefaultLocale: true`, an unprefixed path returns `undefined`; with `false`, it resolves to the default locale. A recognized prefix is removed and the root normalizes to `/`.

`localize()` replaces a recognized locale prefix. It leaves an unsupported leading segment as application path content, emits canonical locale spelling, and omits the default prefix when configured. An unsupported or runtime non-string locale throws `RangeError`. `localizeAll()` returns one result per configured locale in configuration order.

All three methods accept only an absolute application pathname beginning with `/` and no longer than 8,192 characters. They reject `TypeError` for an empty, oversized, or relative path, full or protocol-relative URL, repeated slash, query, fragment, backslash, encoded slash or backslash, encoded percent sign, ASCII control character, encoded ASCII control character, malformed percent escape, and literal or encoded dot segment. Rejecting encoded percent signs prevents later decoding from exposing recursively encoded separators, controls, or dot segments. Non-root trailing slashes are preserved.

Routing never reads globals, negotiates headers, registers routes, handles base paths, redirects, navigates, renders HTML, or emits static pages.
