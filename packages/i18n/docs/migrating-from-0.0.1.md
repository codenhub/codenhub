---
title: Migrating from 0.0.1
description: Breaking migration steps from the browser-coupled 0.0.1 API to 0.1.0.
---

# Migrate from 0.0.1

Version `0.1.0` replaces the browser-coupled `0.0.1` API with a runtime-neutral
core and explicit browser and routing entrypoints. Treat the upgrade as breaking.

## Replace URL configuration with a loader

Remove `getLocaleFile` and optional `isLocale`. Provide `loadLocale`, which may
return a payload or promise. Core no longer fetches, retries, or applies a
timeout.

```ts
// 0.0.1
const i18n = createI18n({
  defaultLocale: "en",
  locales: ["en", "pt"] as const,
  getLocaleFile: (locale) => `/locales/${locale}.json`,
  getLocaleDirection: () => "ltr",
});

// 0.1.0
const i18n = createI18n({
  defaultLocale: "en",
  locales: ["en", "pt"] as const,
  async loadLocale(locale) {
    const response = await fetch(`/locales/${locale}.json`);
    if (!response.ok) throw new Error(`Could not load ${locale}`);
    return response.json();
  },
  getLocaleDirection: () => "ltr",
});
```

## Choose core or browser initialization

Core `init()` now accepts only an optional explicit locale and performs no
storage, navigator, document, or DOM work:

```ts
await i18n.init({ locale: "pt" });
```

For the old browser behavior, import the separate helper. Move `storageKey`,
`root`, and `observe` to it. Config-level `isSilent` replaces the old
per-initialization override.

```ts
import { initializeBrowserI18n } from "@codenhub/i18n/browser";

const binding = await initializeBrowserI18n({
  i18n,
  storageKey: "i18n",
  root: document,
  observe: true,
});

binding.disconnect();
```

DOM translation is no longer enabled by a default `document` root. Pass `root`
explicitly. `disconnect()` belongs to the returned browser binding and leaves
core state, existing text, attributes, and persisted data unchanged.

## Handle failures instead of boolean results

`setLocale()` now accepts the configured locale type and resolves `void` on
success. Unsupported locales reject with `RangeError`; loader and dictionary
failures reject and preserve active state.

```ts
try {
  await i18n.setLocale("pt");
} catch (error) {
  // Handle unsupported input, invalid dictionaries, or locale loading failure.
}
```

Initialization also rejects if either the selected or required default
dictionary cannot load. It no longer resolves ready with an empty dictionary or
falls back after a failed requested locale load. Non-string dictionary leaves
now throw `TypeError` instead of being coerced.

`translate()` now throws before successful initialization and throws `TypeError`
for blank or non-string keys. Missing valid keys still return `undefined` and
warn unless silent.

## Remove global and DOM manager methods

The following root APIs were removed:

- `setI18nInstance()` and `getI18nInstance()`; own and inject instances instead.
- `translateDocument()`; pass a browser `root` when leaf translation is needed.
- Manager `disconnect()`; disconnect the `BrowserI18nBinding` instead.
- Public `dispatchEvent()` typing; only `addEventListener()` and
  `removeEventListener()` remain supported for manager lifecycle events. Remove
  consumer-dispatched manager events and drive changes through `init()` or
  `setLocale()`.

The manager now exposes `defaultLocale`, frozen `locales`, `isSilent`,
`direction`, `loadLocale()`, and `resolveLocale()` for runtime-neutral
integration.

## Update events

The `ready` detail is now only `{ locale }`; remove reads of
`hasTranslationsAvailable`. Successful initialization is the availability
signal. `locale-change` remains `{ locale, previousLocale }` but emits only after
a successful applied change. Failed and stale operations emit no success event.

## Add routing explicitly

Locale-prefixed path support is new and lives at `@codenhub/i18n/routing`. It is
pure pathname parsing and generation; applications and frameworks still own
route registration, redirects, navigation, rendering, and static generation.

See [usage across runtimes](examples.md) and the [API reference](reference.md)
for complete current behavior.
