---
status: IMPLEMENTED
last_updated: 2026-11-10
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

**The script comes from likely subtags (2026-11-08).** The fixed lists did not weigh locales that imply a right-to-left script through a region or dialect instead of a script subtag: `pa-PK`, `az-IR`, `uz-AF`, `ku-IQ`, `kk-CN`, `ha-SD`, and dialect codes such as `arz` or `prs` all defaulted to `ltr`. A language list cannot fix that, because `pa` is Gurmukhi but `pa-PK` is Arabic. The script now comes from the explicit script subtag, else from `Intl.Locale.prototype.maximize()`, which every supported engine provides and which fallback and matching already use, checked against a fixed list of right-to-left scripts that includes the historic ones. The language list remains for tags `Intl.Locale` rejects. Measured against `getTextInfo()` on Node 24, every 2- and 3-letter language with likely-subtag data and every right-to-left script now agree, where 268 languages and 26 scripts disagreed before. `sd-IN` follows its likely script, Devanagari, and is `ltr`. Rejected: a language list that grows with each dialect, and `getTextInfo()` where available, which answers differently by runtime.

### Empty dictionaries are allowed

Empty dictionaries used to be rejected. That made `init()` reject for a locale added before it was translated, which in a browser stops the application from starting. An empty dictionary now falls back to the default dictionary for every key.

### `matchLocale` lives in core and takes a list

Matching used to live only in the browser entry point, so a server resolving `Accept-Language: pt-BR` with `resolveLocale()` rendered the default locale for a visitor the browser would have served in `pt`. It takes a parsed list rather than a header string, because header parsing, quality sorting, and size limits belong to the server that receives the header.

**Order breaks ties between regions (2026-11-08).** Among configured locales that share a preference's language and script, with no exact or likely-region match, the first in `locales` wins, and the docs say so: list `es-419` before `es-ES` to serve `es-MX` from `es-419`. Choosing by region containment was rejected because it needs CLDR region data that `Intl` does not expose, and ordering already gives the right result.

**A locale in another script never matches (2026-11-10).** The last step matched any configured locale of the same language, so with `["en", "zh"]`, `zh-TW` got Simplified `zh` even when English came next in the visitor's list, and with `["en", "zh-Hant"]`, `zh` got Traditional. That did not weigh the reason fallback chains skip a parent in another script: a page in a script the visitor doesn't read serves them worse than their next language. The step now requires the same likely script, as every earlier step does, and a locale `Intl.Locale` rejects still matches by language subtag. Rejected: keeping RFC 4647 lookup, which defends the old result but disagrees with the fallback chains on the same pair of locales.

**`no` and `nb` match each other (2026-11-10).** Matching compared languages as `Intl.Locale` gives them, so a site configured with `no` served the default locale to a browser that sends `nb`, and the other way round. Both are Norwegian Bokmål in practice: `no` is the macrolanguage, browsers and content use either code for Bokmål, and CLDR treats them as one. They are now compared as one language at every step after the exact match, so a site listing both still serves each its own. Nynorsk, `nn`, is a separate written standard and stays apart. The guide's static-site redirect script maps `no` to `nb` the same way, so it keeps agreeing with `matchLocale()`. Rejected: a general table of macrolanguages, which no other language has needed; and matching `nn` to `no` too, which would serve Bokmål to a Nynorsk reader as an exact language.

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
- **Formatter options are copied by name (2026-11-08).** Formatters are cached per process. The key was `JSON.stringify(options)`, which sees only own properties while `Intl` also reads inherited ones, so `formatNumber(x, Object.create({ style: "percent" }))` turned every later call, in every manager, into a percentage. The options `Intl` reads are now copied by name, inherited ones included, and that copy is both the cache key and what `Intl` receives, so the two cannot disagree. Values that are not primitives are never cached, so `Intl` validates them on every call. Trade-off: an `Intl` option newer than ES2025 is ignored until it is added to the list.
- **`#` is the number only in a plural's own forms (2026-11-10)**, as ICU's `MessagePattern` defines it: a `select` nested in a form shows `#` as written, and an apostrophe before `#` quotes only in a plural. It used to print the number there too, as `messageformat` does, which disagreed with ICU and `intl-messageformat`.
- **Exact plural values compare as numbers (2026-11-08)**, as in ICU, so `=1.0` and `=01` select 1, and two spellings of one value are a repeated option. They used to compare as text and silently never matched. `offset` still matches the raw value.

### Values are typed from literal messages (0.2.0)

`t(key, values)` requires the arguments of the message at `key` when the loader's type has the text as a literal, as an `as const` dictionary does, and takes the type each format needs. The message is read at the type level, so it needs no build step.

- **No generator.** TypeScript types JSON string values as `string`, so a JSON default dictionary checks keys only. A `.d.ts` generator, as a CLI or bundler plugin, would cover it, but needs a watch step in every app. Deferred, not rejected: it can be added later without changing these types, since it would only produce a literal dictionary type.
- **Loose where the type can't know**: a key union, a `string` message, a message the types can't read, and an `I18n` typed without its third type argument accept any values, as before.
- **Every typed dictionary that has the key contributes**, so a translation that uses another argument requires it too. Extra values are allowed.
- **Reading gives up rather than failing the build (2026-11-08).** A message over 900 type-level steps, about 900 apostrophes, 450 arguments, or 900 spaces inside one argument, accepts any values. Before, it failed every `t()` call that used it with TS2589. Argument names must be ASCII letters, digits, or `_`, as at runtime, and `''` inside quoted text is an apostrophe, so the types no longer require a value the runtime prints as written.

### Optional options accept `undefined` (2026-11-10)

Every optional option of `createI18n`, `init`, `dictionaryLimits`, `I18nError`, and `initializeBrowserI18n` is typed `?: T | undefined`, as the routing options already were, and the package compiles with `exactOptionalPropertyTypes`. Without it, a consumer who enables that flag could not compile the guide's `initializeBrowserI18n({ i18n, locale: route?.locale })`, although the runtime has always read an explicit `undefined` as an omitted option. `getLocaleDirection` and `onMissingKey` became function-typed properties, since a method can't be `| undefined`, so their parameters are now checked contravariantly: a callback whose `locale` parameter is narrower than the configured locales, which the runtime would call with a locale it doesn't accept, no longer compiles. Rejected: documenting a spread such as `...(route && { locale: route.locale })`, which every strict consumer would have to find and repeat.

### `timeZone` is a manager option (0.2.0)

Dates in messages used the runtime's time zone, with no way to change it, so a server rendered `{d, date}` on its own calendar day: 01:00 UTC on 2 November was "November 2" for a reader in São Paulo, where it is still 1 November, and the text changed when the browser took over. `formatDate` could take `options.timeZone`, but nothing reached a message.

- **On the manager, not per call.** A server already creates one manager per request, so the reader's zone fits there, and a message has nowhere to name a zone. `formatDate` uses it as its default, and its own `options.timeZone` wins.
- **Checked at creation**, with `Intl.DateTimeFormat`, so a bad zone fails where it is configured rather than at the first date.
- **No default other than the runtime's**, which is right in a browser.

Rejected: only documenting "format dates in code and pass the string", because it gives up `{d, date}` on every server.

### `has(key)` (0.2.0)

An application that builds keys at runtime, such as ``t(`errors.${code}`)``, needs to fall back when a key is absent. Comparing `t(key)` with the key worked, but each expected miss called `onMissingKey`, which tests set up to throw, and warned. `has()` looks through the same fallback chain silently, counts a plural group as a key, and is a type guard, so it replaces the cast to `TranslationKey` that typed keys otherwise need for such keys.

Rejected: documenting the `t(key) === key` comparison, because of the reported miss, and because a key with surrounding whitespace is returned trimmed.

**A string no dictionary can hold is a miss (0.2.1).** `has()` first threw a `TypeError` for an invalid key, as `t()` does. That was not weighed against its own example, ``has(`errors.${code}`)``: a `code` from a response or a query string with a line break, or over 1,000 characters, threw from the very check meant to guard it. Such a key can't be in a dictionary, so `has()` returns `false`, silently. It still throws for a non-string, which is a mistake in the calling code, and `t()` still throws for an invalid key, since a call that passes one has skipped the check. Rejected: keeping the throw and documenting it, which leaves every caller to validate the code before checking it.

**A typed key is not narrowed (2026-11-10).** `has(key: string): key is TKey` narrowed a key that was already a `TKey` to `never` when `has()` returned `false`, although a typed key can still be missing, such as one only another locale has. An overload, `has(key: TKey): boolean`, now comes first, so only a key that isn't typed yet is narrowed. Rejected: documenting the narrowing, which leaves every such branch unusable.

**A group counts only with an `other` form (2026-11-08).** `has()` picked a plural form for count 0, so `{ one, two }` was a key in Portuguese and French, where 0 is `one`, but not in English, while `t()` showed the raw key in every locale. It now counts a group only when it has an `other` form, the definition plural groups and typed keys already use. Rejected: keeping count-based selection, because the answer for one dictionary must not change with the active locale.

## Browser

### Detected locales are not persisted

The binding persists an explicit locale and every later applied change, but not a locale it read from storage, detected from `navigator.languages`, or defaulted to. Persisting it made the first fallback permanent, so returning visitors never received a locale added later or a changed browser language.

### A failing preference falls back to the default

When the loader rejects for a stored or detected locale, the binding warns and starts with the default locale, keeping the stored preference. Rejecting made a temporary failure of one dictionary stop the application from starting, and the only recovery, passing the default explicitly, persisted it and kept that visitor on the default for good. An explicit locale or the default locale still rejects, since nothing can serve in its place.

**The detected locale comes before the default (2026-11-10).** The decision above compared rejecting with using the default, and did not weigh the browser's languages as the next choice: a visitor with a saved `fr` whose dictionary fails to load, and a `pt-BR` browser, got English although Portuguese was available. A failing saved locale now falls back to the detected locale, then the default, each warned about, and none persisted. Rejected: trying every locale in `navigator.languages`, which can stack one failed load per preference before the page shows text.

### One data attribute per translated attribute

`data-i18n-<attribute>` was chosen over a single list attribute, such as `data-i18n-attrs="placeholder:search.hint"`, because it needs no parsing and a `MutationObserver` can watch exactly those names. Attributes are limited to text read by people or assistive technology, so a translation can never set a URL, a style, or an event handler.

### Custom elements translate themselves

The binding skips every element inside a custom element, a tag with a dash, from an outer root. A component has its own life cycle: it may render after the page's pass, and it adds and removes text as people use it, such as a card that changes with interaction, so it has to call `t()` for that text anyway. Re-running the page's pass for each component's change was rejected as costlier than the component translating itself with `t()` and `subscribe()`.

**Wrappers are skipped too (2026-11-10).** An audit asked whether a light-DOM wrapper, such as `<site-nav>` around links the page wrote, should be read. It stays skipped: the binding can't tell a wrapper from a component that renders its children, and reading into one would translate, and then fight, text the component owns. The guide says to use a plain element for a wrapper. The guide used to suggest a component binding of its own, which a manager's one binding rules out; it now shows `t()` and `subscribe()`. Rejected: a warning per skipped element with keys, which would fire for every component that translates its own content.

### A missing document fails before initialization (2026-11-08)

In a Web Worker, `initializeBrowserI18n()` initialized the manager and then rejected with a `ReferenceError` from document synchronization, which left the manager ready but unbound. It now throws a `TypeError` naming the requirement before touching the manager, but only when `syncDocument` is on. With `syncDocument: false` and no `root`, initialization already worked without a document, so it keeps working. Rejected: requiring a document for the whole `./browser` entry, which breaks a combination that works, and adding an option, which nothing needs.

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

### `trailingSlash` builds a locale's root with a slash (2026-11-10)

`localize("/", "pt")` was always `/pt`, while `localize("/about/", "pt")` kept its slash, because the canonical root `/` can't say whether a slash is wanted. That did not weigh static hosts that serve `pt/index.html` at `/pt/` and redirect `/pt` there, such as GitHub Pages: every link and `hreflang` to a locale's home page went through a redirect, and the guide's canonical redirect sent `/pt/` back to `/pt`. An optional `trailingSlash` now picks `"preserve"`, the old behavior and the default, `"always"`, or `"never"` for every path `localize` builds.

- **Optional, unlike `localePrefix`.** Its default is the behavior 0.2 shipped, so no existing URL changes.
- **`parse` is unchanged**: it accepts both spellings and keeps the request's in `pathname`, so the canonical redirect turns the other spelling into the built one. Normalizing `pathname` too was rejected, because it changes what an application routes on for a setting about links.
- **Three values, not a boolean**, so a site that drops slashes can collapse both spellings into one address too.

Rejected: documenting a one-line wrapper that appends `/`, which every trailing-slash site would have to find and repeat.

### `parse` returns only paths that have a canonical URL (2026-11-02)

`parse` used to return a result for any path it could read, including paths no link leads to: `/pt/en/sobre` read as `/en/sobre` in Portuguese, which `localize` then read as a prefixed URL, and, with `"when-ambiguous"`, `/en/sobre` read as an English `/sobre`, whose unprefixed URL is the Portuguese about page. `localize(route.pathname, route.locale)`, the guide's canonical redirect and the advice in `localize`'s own error, then threw a `RangeError`, so a typed URL answered 500. `parse` now returns `undefined` for such a path, and for one whose canonical URL would be longer than 8,192 characters, so every result has a canonical URL that `localize` builds and the path answers 404.

With `"always"`, `undefined` already meant a missing prefix. The guide's redirect tells the two apart by parsing the path with the chosen locale's prefix added: a path that is no page in that locale either is a 404.

Rejected:

- Catching the `RangeError` in the guide's examples, because every application would have to remember it, and a forgotten catch is a 500 on any typed URL.
- Reading such a path as the nearest page, such as `/pt/en/sobre` as the about page, because it gives one page more addresses and hides broken links.
- A `hasLocalePrefix` helper to tell the two `undefined` cases apart under `"always"`, because the guide's second `parse` does it without new API.

### `parse` returns `undefined` for a request path routing refuses (0.2.1)

`parse` threw a `TypeError` for any path routing refuses, including ones a request carries: `new URL("https://example.com//wp-login.php").pathname` is `//wp-login.php`, and scanners send such paths all day. The guide's handlers call `parse(url.pathname)` without a catch, so each answered 500. The decision above rejected catching in the guide because a forgotten catch is a 500 on any typed URL; it weighed only the `RangeError`, and the same reasoning holds for this `TypeError`.

- **`undefined` for what a request can carry**: `//`, `\`, control characters, dot segments, encoded slashes, backslashes, `%` and controls, malformed escapes, and paths over 8,192 characters. Every caller already answers `undefined` with a 404, so code written for 0.2.0 keeps working.
- **Still a `TypeError` for what `url.pathname` never is**: a non-string, a value not starting with `/`, such as a full URL, or one with `?` or `#`, such as Node's `request.url` with its query. Returning `undefined` there would turn a mistake in the calling code into a 404 on every URL with a query string.
- **`localize` and `localizeAll` still throw** for every refused path, since they build links from the application's own paths.

Rejected:

- Adding a catch that answers 400 to every guide example, for the reason above.
- Returning `undefined` for every invalid value, including a full URL, for the `request.url` case.

### `parse` checks the canonical path's length too (2026-11-08)

`parse` returns `undefined` when the canonical path, not only its URL, would be longer than 8,192 characters. The URL check did not weigh that a short translated URL can read back to a longer canonical path, such as `/pt/b/…` for `/aaaa…/:id`, and `localize` refuses an input that long, so such a request answered 500 through the guide's redirect. Rejected: raising the limit for canonical paths, which would let `localize` accept what no request can carry.

### A listed page comes back in one spelling (2026-11-08)

A listed page's fixed segments come back from `parse` the way a URL writes the table's words, the same in every locale, so `/%61/x` and `/pt/%61/x` both give `/a/x`. Before, a request matched through its canonical words kept the request's spelling, in a prefixed locale and also in the default locale when the table gives it its own form, so two requests for one page gave two `pathname`s. The length limit applies to the path `parse` returns, after this re-spelling. Parameters and unlisted segments are still returned as written.
