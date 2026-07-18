---
title: Internationalization
description: Configure locale loading, persistence, events, and DOM translation.
---

# Internationalization

`I18n` loads flat JSON dictionaries, resolves an initial locale, persists
successful locale choices, translates marked leaf elements, and emits readiness
and locale-change events.

```ts
import { I18n, setI18nInstance, type I18nConfig } from "@codenhub/ui-kit";

const LOCALES = ["en-US", "pt-BR"] as const;
type Locale = (typeof LOCALES)[number];

const config: I18nConfig<Locale> = {
  defaultLocale: "en-US",
  locales: LOCALES,
  getLocaleFile: (locale) => `/locales/${locale}.json`,
  getLocaleDirection: () => "ltr",
  isLocale: (value): value is Locale => LOCALES.includes(value as Locale),
};

const i18n = new I18n(config);
setI18nInstance(i18n);
await i18n.init({ storageKey: "app-locale" });
```

Locale files must be JSON objects whose every value is a string:

```json
{
  "navigation.home": "Home",
  "actions.save": "Save"
}
```

## Locale selection and loading

Initialization first accepts a persisted locale when `config.isLocale()` accepts
its stored string; the package does not independently require exact membership
or casing at this boundary. Otherwise it checks browser languages
case-insensitively, preferring any exact configured match before language-subtag
matches, and finally uses `defaultLocale`. Persistence uses the `storageKey`
option or `"i18n"` by default.
Local storage is optional: initialization and locale changes continue when it is
unavailable, but locale preferences are not restored or persisted.

Locale requests time out after 10 seconds. Network failures, HTTP 408/429, and
5xx responses receive three retries after the initial attempt with exponential
300, 600, and 1200 millisecond delays. Other HTTP failures, malformed JSON, and
invalid dictionary shapes fail without retries. A failed non-default locale
falls back to the default dictionary without overwriting the stored preference.
If the default also fails, initialization still becomes ready with no
translations.

`setLocale(value)` returns `false` before initialization, for invalid input, for
a failed requested locale, or when a newer overlapping request wins. Matching is
case-insensitive but does not use language subtags. An explicit call retries a
previously failed or empty active locale. Only non-empty successfully loaded
dictionaries are cached for the lifetime of the `I18n` instance; an empty
dictionary is fetched again when that locale is explicitly selected.

## DOM translation

Mark leaf elements with `data-i18n` and retain fallback text in the HTML:

```html
<button data-i18n="actions.save">Save</button>
```

`init()` translates the supplied `root`, or the whole document by default. It
also sets `document.documentElement.lang` and `dir`. Only leaf elements are
translated; elements with child elements are preserved and produce a warning.
Translation uses `textContent`, so dictionary values are never interpreted as
HTML.

Automatic translation does not cross custom-element boundaries. A root that is
a custom element or is inside one is skipped. Components should own translation
inside their boundary. Missing or blank keys preserve the element's original
fallback text, and each missing key warns once per active locale and instance.

## Manual translation and events

```ts
const label = i18n.translate("actions.save");

i18n.addEventListener("ready", (event) => {
  const detail = (event as CustomEvent).detail;
  console.log(detail.locale, detail.translationsAvailable);
});

i18n.addEventListener("locale-change", (event) => {
  const detail = (event as CustomEvent).detail;
  console.log(detail.previousLocale, detail.locale);
});
```

`translate()` trims keys and returns `undefined` before initialization, for blank
keys, or when no translation exists. `ready` fires after each completed latest
initialization. `locale-change` fires only after a requested locale loads and
changes the active locale.

## Active instance and cleanup

`setI18nInstance(i18n)` configures the process-wide instance used by feedback.
`getI18nInstance()` throws when none is configured. Use
`setI18nInstance(null)` during teardown if the owner is removed, and remove any
event listeners you added. `I18n` has no `destroy()` method and repeat `init()`
does not remove consumer event listeners.

The DOM portions tolerate a missing `document`, and unavailable local storage
only disables persistence. However, `init()` is not a portable SSR abstraction:
it still needs Fetch, AbortController, timers, `structuredClone`, `EventTarget`,
and `CustomEvent` in the host. Prefer initializing in the browser unless the
server runtime intentionally provides all of those APIs.
