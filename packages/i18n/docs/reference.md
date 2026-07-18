---
title: Reference
---

# API and browser behavior

## Configuration and Setup

`createI18n<TLocale>(config: I18nConfig<TLocale>): I18n<TLocale>` creates an
uninitialized manager. `I18nConfig` requires `defaultLocale`, `locales`,
`getLocaleFile(locale)`, and `getLocaleDirection(locale)`. Optional `isLocale`
validates locale strings and `isSilent` suppresses package warnings.

`I18n.init(options?)` resolves locale preference in this order: valid persisted
locale, browser language match, then `defaultLocale`. `I18nInitOptions` contains:

- `storageKey`: persistence key, default `"i18n"`.
- `root`: translated DOM root, default `document` when available.
- `isSilent`: per-initialization warning override.
- `observe`: attach a `MutationObserver`, default `false`.

Initialization fetches JSON from `getLocaleFile`, flattens nested objects to dot
keys, coerces non-string leaves with a warning, applies the locale to
`document.documentElement.lang` and `dir`, translates the root, then emits
`ready`. Fetches time out and transient failures are retried. A failed requested
locale falls back to the default; if both fail, initialization still resolves
with no available translations.

## Translation and Locale Changes

- `locale` is the currently applied locale and `isReady` reports initialization.
- `translate(key)` returns a string or `undefined`. Before initialization and for
  missing keys it warns unless silent; missing-key warnings are deduplicated per
  locale.
- `setLocale(locale)` is case-insensitive and returns whether the requested
  dictionary loaded. Invalid, stale concurrent, or failed requests return
  `false`; fallback may still update the active locale.
- `translateDocument(root?)` translates the explicit or configured root.
- `disconnect()` cancels pending locale application, disconnects observation,
  clears the root, and marks the manager not ready. It does not remove persisted
  locale data or revert translated DOM and document attributes.

`LocaleDictionary` maps flattened keys to strings. `LocaleDirection` is
`"ltr" | "rtl"`.

## DOM Contract

Only elements with `data-i18n` and no child elements are translated. Leaf text
is preserved as fallback when a key is unavailable. Elements with children are
skipped with a warning to avoid deleting markup. Traversal does not enter custom
elements; pass a custom element or shadow root explicitly, or use a separate
instance for that component.

Observation watches added elements and `data-i18n` attribute changes below the
root. Call `disconnect()` to release its `MutationObserver`.

## Events and Global Instance

`I18n` supports typed `addEventListener`, `removeEventListener`, and
`dispatchEvent` methods through `I18nEventMap`:

- `ready` carries `I18nReadyEventDetail` with `locale` and
  `hasTranslationsAvailable`.
- `locale-change` carries `I18nLocaleChangeEventDetail` with `locale` and
  `previousLocale`; it emits only when the applied locale changes.

`setI18nInstance(instance | null)` registers or clears a module-global manager.
`getI18nInstance()` returns it and throws when none is registered. Do not use
this shared state across concurrent SSR requests; keep instances request-scoped.

## SSR and Browser Requirements

Without `window`, locale loading is skipped and initialization resolves with an
empty dictionary. Without `document`, DOM and document-attribute work is skipped.
Browser use requires `fetch`, `EventTarget`, and `localStorage`; observation also
requires `MutationObserver`. The package does not generate localized server HTML.

## Public Exports

The root entrypoint exports `createI18n`, `setI18nInstance`, and
`getI18nInstance`, plus `I18n`, `I18nConfig`, `I18nInitOptions`,
`I18nLocaleChangeEventDetail`, `I18nReadyEventDetail`, `LocaleDictionary`,
`LocaleDirection`, and `I18nEventMap` types.
