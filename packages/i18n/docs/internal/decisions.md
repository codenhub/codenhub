---
status: IMPLEMENTED
last_updated: 2026-10-29
scope: Why `@codenhub/i18n` behaves as it does, with the alternatives each decision rejected, for whoever changes it next.
---

# Decisions

The public docs describe current behavior only. This page keeps the reasons and the rejected alternatives, so a later change can tell whether it reopens a settled question. Direction is in [roadmap.md](roadmap.md).

## Core

### A miss returns the key

A key missing from both dictionaries returns the trimmed key. It used to return `undefined`, which typed every result `string | undefined`, so each call outside JSX needed `?? ""`, and a template literal rendered `"undefined"`. The key renders a visible, searchable placeholder. An empty string was rejected because it hides the miss on screen.

### `init()` returns `void`

`init()` used to resolve `true` or `false` for whether it applied. That was dropped because `setLocale()` reports the same case, a stale request, with no value, and a caller that needs the outcome reads `locale` and `isReady`.

### Direction has a default

`getLocaleDirection` used to be required, which made nearly every configuration repeat `() => "ltr"`, and an application that later added Arabic kept that wrong answer. The default reads fixed lists of right-to-left scripts and languages rather than `Intl.Locale.prototype.getTextInfo()`, because not every supported engine provides it and direction must be the same in every runtime.

### Empty dictionaries are allowed

Empty dictionaries used to be rejected. That made `init()` reject for a locale added before it was translated, which in a browser stops the application from starting. An empty dictionary now falls back to the default dictionary for every key.

### `matchLocale` lives in core and takes a list

Matching used to live only in the browser entry point, so a server resolving `Accept-Language: pt-BR` with `resolveLocale()` rendered the default locale for a visitor the browser would have served in `pt`. It takes a parsed list rather than a header string, because header parsing, quality sorting, and size limits belong to the server that receives the header.

### Interpolation came before ICU, with ICU syntax

Without interpolation, a sentence with a value has to be concatenated from fragments, which fixes English word order into every translation, so `{name}` placeholders shipped first. `{name}` is the ICU argument syntax, so ICU messages can extend it later without changing existing translations.

### `subscribe()`

Framework stores, such as React's `useSyncExternalStore`, need a subscribe function that returns an unsubscribe function. The typed `ready` and `locale-change` events remain for code that needs the event detail.

### `defaultLocale` does not drive locale inference (0.2.0)

`defaultLocale` is typed `NoInfer<TLocale>` in `I18nConfig` and `LocaleRoutingConfig`. Before, a configuration in a separate variable without `as const` inferred `TLocale` as `string` from `defaultLocale`, so `setLocale("fr")` compiled for an app that supports only `en` and `pt`, and fails at runtime. Now that configuration is a compile error at `createI18n(config)`, fixed with `as const`. Inline configurations are unaffected, since `defaultLocale` is checked against the literal union inferred from `locales`.

Rejected: leaving it, because the widening is silent and loses the main benefit of typed locales.

### Plurals (0.2.0)

A key whose value is a group with an `other` form is a plural group. `t(key, { count })` with a numeric `count` picks a form with `Intl.PluralRules`, then falls back to `other`.

- **Forms are nested keys, not a new syntax.** `{ one, other }` under the key keeps dictionaries plain JSON that translation tools already edit, needs no parser, and keeps every form addressable as an ordinary key, such as `cart.items.one`. ICU `{count, plural, …}` was deferred, not rejected; see [roadmap.md](roadmap.md).
- **Rules come from the dictionary's locale.** When the current dictionary lacks the group, the default dictionary's group is used with the default locale's rules, since that text is in the default language. Using the active locale's rules would pick a Portuguese category for English forms.
- **Only a numeric `count` selects.** A string such as `"5"` does not, so a group used without a number is reported as a missing key instead of silently picking `other`. Converting strings was rejected because `"1,5"` and `"1.5"` parse differently by locale.
- **An exact key wins within a dictionary.** A string under the key is returned as before, so adding `count` to an existing call never changes its text. Dictionaries are still checked in order, current then default, so a plural group in the current dictionary wins over a string that only the default dictionary has.
- **A locale `Intl.PluralRules` rejects**, such as a private-use tag, always uses `other`, rather than failing a lookup.
- **Typed keys** include the group key for any group with an `other` form, and still include each form.

DOM translation passes no `count`, since HTML has nowhere to supply one.

## Browser

### Detected locales are not persisted

The binding persists an explicit locale and every later applied change, but not a locale it read from storage, detected from `navigator.languages`, or defaulted to. Persisting it made the first fallback permanent, so returning visitors never received a locale added later or a changed browser language.

### A failing preference falls back to the default

When the loader rejects for a stored or detected locale, the binding warns and starts with the default locale, keeping the stored preference. Rejecting made a temporary failure of one dictionary stop the application from starting, and the only recovery, passing the default explicitly, persisted it and kept that visitor on the default for good. An explicit locale or the default locale still rejects, since nothing can serve in its place.

### One data attribute per translated attribute

`data-i18n-<attribute>` was chosen over a single list attribute, such as `data-i18n-attrs="placeholder:search.hint"`, because it needs no parsing and a `MutationObserver` can watch exactly those names. Attributes are limited to text read by people or assistive technology, so a translation can never set a URL, a style, or an event handler.

## Routing

### Translated path segments wait for 0.3.0

Paths such as `/sobre` for `/about` are feasible and mostly framework-neutral: a table from canonical paths to localized ones, with `:param` segments, is enough to `parse` and `localize`. It was deferred rather than shipped in 0.2.0 because it adds public surface that needs its own design and tests, and it is additive, so nothing in 0.2.0 has to change for it. The sketch is in [roadmap.md](roadmap.md).
