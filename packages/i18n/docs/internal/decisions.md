---
status: IMPLEMENTED
last_updated: 2026-11-02
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

`defaultLocale` is typed `NoInfer<TLocale>` in `I18nConfig` and `LocaleRoutingConfig`, as is the locale parameter of `loadLocale`, `getLocaleDirection`, and `onMissingKey`, so a callback annotated `(locale: string)` cannot widen it either. Before, a configuration in a separate variable without `as const` inferred `TLocale` as `string` from `defaultLocale`, so `setLocale("fr")` compiled for an app that supports only `en` and `pt`, and fails at runtime. Now that configuration is a compile error at `createI18n(config)`, fixed with `as const`. Inline configurations are unaffected, since `defaultLocale` is checked against the literal union inferred from `locales`.

Rejected: leaving it, because the widening is silent and loses the main benefit of typed locales.

### Plurals (0.2.0)

A key whose value is a group with an `other` form is a plural group. `t(key, { count })` with a numeric `count` picks a form with `Intl.PluralRules`, then falls back to `other`.

- **Forms are nested keys, not a new syntax.** `{ one, other }` under the key keeps dictionaries plain JSON that translation tools already edit, needs no parser, and keeps every form addressable as an ordinary key, such as `cart.items.one`. ICU `{count, plural, …}` came later; see [ICU messages](#icu-messages-and-formatters-020).
- **Rules come from the dictionary's locale.** When the current dictionary lacks the group, the default dictionary's group is used with the default locale's rules, since that text is in the default language. Using the active locale's rules would pick a Portuguese category for English forms.
- **Only a numeric `count` selects.** A string such as `"5"` does not, so a group used without a number is reported as a missing key instead of silently picking `other`. Converting strings was rejected because `"1,5"` and `"1.5"` parse differently by locale.
- **An exact key wins within a dictionary.** A string under the key is returned as before, so adding `count` to an existing call never changes its text. Dictionaries are still checked in order, current then default, so a plural group in the current dictionary wins over a string that only the default dictionary has.
- **A locale `Intl.PluralRules` rejects**, such as a private-use tag, always uses `other`, rather than failing a lookup.
- **Typed keys** include the group key for any group with an `other` form, and still include each form.

DOM translation passes no `count`, since HTML has nowhere to supply one.

### Regional locales fall back to their parents (0.2.0)

A key used to be read from the active dictionary, then the default one, so with `en`, `pt`, and `pt-BR`, a key missing from `pt-BR` showed English although `pt` had it. Each locale now reads, in order, itself, each configured locale made by dropping its last subtags, then the default. The chains are computed once, at creation, and every locale in the active chain loads with it.

- **No option.** The parent of `pt-BR` is `pt` in every application that configures both. An explicit `fallbackLocales` map was deferred, not rejected: it serves chains that subtags can't express, such as `es-MX` to `es-419`, and can be added later without changing this default.
- **A parent with another likely script is skipped**, by the same likely-script comparison `matchLocale` uses, so `zh-Hant` never falls back to `zh`, which is Simplified Chinese, and `sr-Latn` never to Cyrillic `sr`. Mixing scripts on one page reads worse than the default language.
- **Plural rules still come from the dictionary's locale**, as for the default; see [Plurals](#plurals-020).
- **A failing parent fails the request**, as the default always has, rather than being skipped, so a page never silently loses half its text.

### ICU messages and formatters (0.2.0)

Every text is read as an ICU message: `{name}`, `number` (`integer`, `percent`), `date` and `time` (`short` to `full`), `plural` and `selectordinal` (`=N`, `offset:N`, `#`), and `select`, with ICU apostrophe quoting. `formatNumber`, `formatDate`, `formatRelativeTime`, and `formatList` wrap `Intl` for the active locale.

- **Our own parser, not `intl-messageformat`.** That library is about 10 KB gzipped plus its parser, against a core of about 4.4 KB, and the package has no runtime dependencies. The subset covers what UI text uses; skeletons (`::currency/EUR`) and `{n, number, currency}` were left out, because currency needs a code the message can't know, and `formatNumber` covers it in code.
- **Format in the dictionary's locale**, as plural groups choose rules, so English fallback text is never written with Portuguese separators.
- **Invalid syntax warns and falls back to `{name}` filling**, rather than failing `init()`. Checking every message at load would parse all of them up front and make one translator's typo stop the application from starting. Parsed messages are cached.
- **`{name}` stays compatible**: a text without `{` or `'` is returned as is, and an argument without a usable value is left as written, as placeholders were. The one change is that `'` before a brace and `''` now quote, which a text written for 0.1.0 rarely contains.
- **A `Date` is a value**, formatted as `{name, date}`, so a plain `{when}` shows a readable date rather than `Date.prototype.toString()`.
- **Plural groups stay**: they keep each form an ordinary key, which some translation tools need.

### Values are typed from literal messages (0.2.0)

`t(key, values)` requires the arguments of the message at `key` when the loader's type has the text as a literal, as an `as const` dictionary does, and takes the type each format needs. The message is read at the type level, so it needs no build step.

- **No generator.** TypeScript types JSON string values as `string`, so a JSON default dictionary checks keys only. A `.d.ts` generator, as a CLI or bundler plugin, would cover it, but needs a watch step in every app. Deferred, not rejected: it can be added later without changing these types, since it would only produce a literal dictionary type.
- **Loose where the type can't know**: a key union, a `string` message, a message the types can't read, and an `I18n` typed without its third type argument accept any values, as before.
- **Every typed dictionary that has the key contributes**, so a translation that uses another argument requires it too. Extra values are allowed.

## Browser

### Detected locales are not persisted

The binding persists an explicit locale and every later applied change, but not a locale it read from storage, detected from `navigator.languages`, or defaulted to. Persisting it made the first fallback permanent, so returning visitors never received a locale added later or a changed browser language.

### A failing preference falls back to the default

When the loader rejects for a stored or detected locale, the binding warns and starts with the default locale, keeping the stored preference. Rejecting made a temporary failure of one dictionary stop the application from starting, and the only recovery, passing the default explicitly, persisted it and kept that visitor on the default for good. An explicit locale or the default locale still rejects, since nothing can serve in its place.

### One data attribute per translated attribute

`data-i18n-<attribute>` was chosen over a single list attribute, such as `data-i18n-attrs="placeholder:search.hint"`, because it needs no parsing and a `MutationObserver` can watch exactly those names. Attributes are limited to text read by people or assistive technology, so a translation can never set a URL, a style, or an event handler.

## Routing

### Translated path segments ship in 0.2.0 (2026-11-02)

Paths such as `/sobre` for `/about` ship with 0.2.0, before 1.0, as `docs/specs/packages-lifecycle.md`, "Versioning", asks of planned features. Rejected: deferring to 0.3.0, as first recorded. That reasoning, that the feature is additive and needs its own design, was true, but nothing made deferring the only plausible option.

- **A table keyed by canonical path**, the path the app routes on, with each locale's form. A locale or path the table doesn't list keeps the canonical words. `parse` returns the canonical path, so the result shape did not change.
- **Fixed segments and `:name` parameters**, as in `@codenhub/router`, so a route pattern translates with `localizeAll` and can be registered once per locale. Forms use the canonical path's parameters in any order, because word order differs between languages.
- **Fixed segments match case-sensitively**, like router routes and URL paths. Only the locale prefix ignores case, as before. Unicode entries match their percent-encoding.
- **A fixed segment wins over a parameter** at the first segment where two patterns differ. Rejected: first match in table order, as `@codenhub/router` does, because the order of an object's keys is easy to change without noticing.
- **Mistakes are rejected at creation**: invalid paths, unconfigured locales, a path starting with a locale, parameters that differ between forms, and two pages with the same path in one locale.
- **`localize` reads an unprefixed path as canonical, and a prefixed one as that locale's URL.** Reading every input as a URL first, which would let `localize(location.pathname, …)` switch language from `/sobre`, was rejected: it can't tell the canonical English page `/sobre` from the Portuguese URL `/sobre`, so the clash check below could never fire. Switching language goes through `parse` instead, as the guide shows.
- **`localize` throws a `RangeError` when its result would be parsed as another page or locale.** This is the net for pages the table doesn't list. A static build that localizes its page list finds every clash at build time.

### Catch-all parameters (2026-11-02)

A table without them can't translate a tree of pages, such as documentation or CMS pages under `/docs/…`, without listing every page. A last segment written `:name*` matches one or more segments and copies them across.

- **`:name*`**, the `path-to-regexp` spelling, rather than a bare `*`: it names the value like every other parameter, so the check that forms use the canonical path's parameters covers it. `*` used to be a literal segment and still is everywhere else.
- **Last only, one or more segments.** A catch-all in the middle would need backtracking, and zero segments would make `/docs/:path*` and `/docs` the same page in two entries. `/docs` is listed separately.
- **A parameter beats a catch-all**, extending the rule that a fixed segment beats a parameter, at the first segment where two patterns differ.
- **The prefix decision stays per route**: under `"when-ambiguous"`, a catch-all form keeps the prefix for all its URLs when any other locale's path overlaps any of them.

`@codenhub/router` has no catch-all, so `localizeAll` output with one is for frameworks that have their own syntax for it.

### The locale prefix is dropped only where a path is unambiguous (2026-11-02)

An earlier sketch kept the locale prefix on every translated path, because a path shared by two languages, such as `/` or a brand name, can't tell which language it is in. That holds for removing the prefix everywhere, but it did not weigh removing it only from paths that belong to one locale. `/sobre` is only Portuguese, so it needs no prefix, while `/pt` and `/pt/blog` keep it. So an opt-in mode serves a translated path without a prefix when no other locale's path overlaps it, and keeps the prefix otherwise. A form made only of parameters, such as `/:tag`, always keeps it: it overlaps every path of its length, including the default locale's pages the table doesn't list.

The remaining risk is a route the routing table doesn't list, such as a CMS slug `/sobre` in the default language: routing assumes an unlisted path belongs to the default locale and can't see the clash. The mode is opt-in and the guide warns about this.

Rejected:

- Prefix always, the earlier sketch, because it rules out `example.com/sobre` for no reason on paths that are unambiguous.
- Never prefix, because `/` and every path with the same words in each language would carry no locale.

### One `localePrefix` option replaces `prefixDefaultLocale` (2026-11-02)

The prefix policy has three values: `"always"`, `"except-default"`, and `"when-ambiguous"`. That makes it one option rather than `prefixDefaultLocale: boolean` plus a second flag whose combinations overlap. The change breaks the API, and it is made in 0.2.0 because before 1.0 is the cheapest time. Rejected: keeping `prefixDefaultLocale` and adding a flag later, which avoids the break but leaves two settings that interact.

### `parse` returns only paths that have a canonical URL (2026-11-02)

`parse` used to return a result for any path it could read, including paths no link leads to: `/pt/en/sobre` read as `/en/sobre` in Portuguese, which `localize` then read as a prefixed URL, and, with `"when-ambiguous"`, `/en/sobre` read as an English `/sobre`, whose unprefixed URL is the Portuguese about page. `localize(route.pathname, route.locale)`, the guide's canonical redirect and the advice in `localize`'s own error, then threw a `RangeError`, so a typed URL answered 500. `parse` now returns `undefined` for such a path, and for one whose canonical URL would be longer than 8,192 characters, so every result has a canonical URL that `localize` builds and the path answers 404.

With `"always"`, `undefined` already meant a missing prefix. The guide's redirect tells the two apart by parsing the path with the chosen locale's prefix added: a path that is no page in that locale either is a 404.

Rejected:

- Catching the `RangeError` in the guide's examples, because every application would have to remember it, and a forgotten catch is a 500 on any typed URL.
- Reading such a path as the nearest page, such as `/pt/en/sobre` as the about page, because it gives one page more addresses and hides broken links.
- A `hasLocalePrefix` helper to tell the two `undefined` cases apart under `"always"`, because the guide's second `parse` does it without new API.
