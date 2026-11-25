---
status: IMPLEMENTED
last_updated: 2026-11-23
scope: Why `@codenhub/i18n` behaves as it does, with the alternatives each decision rejected, for whoever changes it next.
---

# Decisions

The public docs describe current behavior only. This page keeps the reasons and the rejected alternatives, so a later change can tell whether it reopens a settled question. Direction is in [roadmap.md](roadmap.md).

## Core

### A miss returns the key

A key missing from both dictionaries returns the trimmed key. The key renders a visible, searchable placeholder. Rejected: returning `undefined`, which types every result `string | undefined`, so each call outside JSX needs `?? ""`, and a template literal renders `"undefined"`; and an empty string, which hides the miss on screen.

### An empty translation is a translation (0.5.0)

`""` is returned as written: it is not a miss, calls no `onMissingKey`, and does not fall back to a parent or the default locale. A language sometimes needs no text where another does, such as a button that reads "+ Add" in English with no tooltip, but "+" with an "Adicionar" tooltip in Portuguese. Rejected: treating `""` as missing, which leaves no way to say "nothing here" in one locale, and shows the default locale's text, or the key, in its place.

### A throwing `onMissingKey` fails the lookup (0.5.0)

An exception from `onMissingKey` propagates from `t()`, so a test or a strict build fails on the first missing key. The browser binding translates the rest of the page first, then rejects with the first such error, so a strict handler also fails the binding's start. Rejected: catching it in the binding, which would make a strict handler silently lenient in the code that renders the page.

### `init()` returns `void`

Rejected: resolving `true` or `false` for whether it applied, because `setLocale()` reports the same case, a stale request, with no value, and a caller that needs the outcome reads `locale` and `isReady`.

### A stale request resolves even when its loading fails

A call to `init()` or `setLocale()` that a later call has overtaken resolves when its loading fails, as it does when its loading succeeds, and only the latest call's failure rejects. The failure no longer describes the manager's state, which follows the latest call, so a picker clicked twice would otherwise show an error for a locale the visitor already left. Rejected: rejecting every failure, which makes each caller tell a stale failure from a current one by comparing `locale` afterwards.

### Direction has a default

`getLocaleDirection` is optional. Rejected: requiring it, which makes nearly every configuration repeat `() => "ltr"`, and an application that later adds Arabic keeps that wrong answer. The default reads fixed lists of right-to-left scripts and languages rather than `Intl.Locale.prototype.getTextInfo()`, because not every supported engine provides it and direction must be the same in every runtime.

**The script comes from likely subtags.** Fixed lists alone miss locales that imply a right-to-left script through a region or dialect instead of a script subtag, such as `pa-PK`, `az-IR`, `uz-AF`, `ku-IQ`, `kk-CN`, `ha-SD`, and dialect codes such as `arz` or `prs`. A language list cannot fix that, because `pa` is Gurmukhi but `pa-PK` is Arabic. The script comes from the explicit script subtag, else from `Intl.Locale.prototype.maximize()`, which every supported engine provides and which fallback and matching already use, checked against a fixed list of right-to-left scripts that includes the historic ones. The language list remains for tags `Intl.Locale` rejects. `sd-IN` follows its likely script, Devanagari, and is `ltr`. The list also holds the variants of a right-to-left script, `Aran` (Arabic Nastaliq), `Syre`, `Syrj`, and `Syrn` (Syriac), and `Phlv` (Book Pahlavi), which ICU's data gives as left to right, so `ur-Aran` is `rtl`. Likely subtags never produce them, so only an explicit script subtag reaches them. Rejected: a language list that grows with each dialect, and `getTextInfo()` where available, which answers differently by runtime.

### Empty dictionaries are allowed

An empty dictionary falls back to the default dictionary for every key. Rejected: refusing empty dictionaries, which makes `init()` reject for a locale added before it is translated, which in a browser stops the application from starting.

### A configured locale is a language tag (0.5.0)

`createI18n` and `createLocaleRouting` reject a locale that `Intl.getCanonicalLocales` rejects, such as `en-US-US`, `abcdefghi`, or the irregular `en-GB-oed`, with `Must be a language tag Intl accepts`, except a private-use tag, `x-` and subtags of 1 to 8 letters or digits, such as `x-pirate`, which `Intl` rejects but an app may use for a locale of its own. The ASCII check comes first, so `../admin` gets the message for a character outside a tag. A typo otherwise becomes a locale `Intl` cannot format or maximize, so it formats as no language and matches only by its first subtag, and `createLocaleRouting` turns it into a URL prefix, so the site serves `/en-US-US/…` without an error. A private-use locale has no likely subtags, so it matches only exactly and falls back only to the default.

Rejected: accepting any alphanumeric, hyphen-separated string, the rule through 0.4.0, because a typo becomes a silent route; and rejecting private-use tags too, which leaves an app with a locale of its own, such as a pseudo-locale for testing layouts, no code to give it.

### `matchLocale` lives in core and takes a list

Rejected: matching only in the browser entry point, so a server resolving `Accept-Language: pt-BR` with `resolveLocale()` renders the default locale for a visitor the browser would serve in `pt`. It takes a parsed list rather than a header string, because header parsing, quality sorting, and size limits belong to the server that receives the header.

**Order breaks ties between regions.** Among configured locales that share a preference's language and script, with no exact or likely-region match, the first in `locales` wins, and the docs say so: list `es-419` before `es-ES` to serve `es-MX` from `es-419`. Choosing by region containment was rejected because it needs CLDR region data that `Intl` does not expose, and ordering already gives the right result.

**A locale in another script never matches.** The last step requires the same likely script, as every earlier step does. The reason is the one fallback chains skip a parent in another script for: a page in a script the visitor doesn't read serves them worse than their next language. Rejected: a last step that matches any configured locale of the same language, so with `["en", "zh"]`, `zh-TW` gets Simplified `zh` even when English comes next in the visitor's list, and with `["en", "zh-Hant"]`, `zh` gets Traditional. Rejected too: RFC 4647 lookup, which gives that result and disagrees with the fallback chains on the same pair of locales. A private-use locale, the only kind `Intl.Locale` rejects that a configuration accepts, has no likely script and matches only exactly.

**`und` is no preference.** `und`, the undetermined language, names no language, but likely subtags turn it into `en-Latn-US`, so a browser or header that sends it would get English ahead of the visitor's real next language. It is skipped, with any subtags, unless a configured locale is that exact tag. Rejected: matching its script or region, such as `und-Arab`, which guesses a language the visitor never named.

**Extensions don't change the match.** Likely subtags are compared without a tag's extensions, so `es-u-hc-h23`, which a browser may send for a 24-hour clock, matches `es-ES` as `es` does, and a language with no likely script, such as `nah` for `nah-MX`, compares by language alone rather than taking its region for a script.

**A preference over 255 characters is skipped**, as is one that isn't a string. `Intl.Locale` reads a run of variants in quadratic time, so one long `Accept-Language` entry, which Node.js accepts as a header up to 16 KB, costs milliseconds a match, and a header of many such entries keeps a server busy. No real tag comes near 255 characters. Rejected: a limit on the number of preferences, which belongs to the server that parses the header, as the rest of header parsing does.

**An underscore reads as a hyphen.** Platform and POSIX locales are written `pt_BR` and `zh_Hant_TW`, and an app passes them on from an OS, a database, or a cookie it set. `Intl.Locale` rejects them, so they would match nothing. Rejected: leaving it to the caller, who has no reason to expect the difference.

**`no` and `nb` match each other.** Compared as `Intl.Locale` gives them, a site configured with `no` would serve the default locale to a browser that sends `nb`, and the other way round. Both are Norwegian Bokmål in practice: `no` is the macrolanguage, browsers and content use either code for Bokmål, and CLDR treats them as one. They are compared as one language at every step after the exact match, so a site listing both still serves each its own. Nynorsk, `nn`, is a separate written standard and stays apart. The guide's static-site redirect script maps `no` to `nb` the same way, so it keeps agreeing with `matchLocale()`. Rejected: a general table of macrolanguages, which no other language has needed; and matching `nn` to `no` too, which would serve Bokmål to a Nynorsk reader as an exact language.

### Interpolation uses ICU syntax

Without interpolation, a sentence with a value has to be concatenated from fragments, which fixes English word order into every translation. `{name}` is the ICU argument syntax, so ICU messages extend it without changing existing translations.

### `subscribe()`

Framework stores, such as React's `useSyncExternalStore`, need a subscribe function that returns an unsubscribe function. The typed `ready` and `locale-change` events remain for code that needs the event detail.

**It is typed as a function property, not a method** (0.5.0), as is `binding.subscribe`. Both are bound at runtime, so `useSyncExternalStore(binding.subscribe, …)`, as the guides pass it, works, but a method type makes `@typescript-eslint/unbound-method` flag that call under its recommended type-checked rules, and checks a listener's type bivariantly. Rejected: an arrow wrapper in the guides, which documents a workaround for a call that already works. `t()` and the other methods stay methods, though the guides destructure `t` as well; whether to type them as properties is open.

### A re-`init()` that changes the locale fires `locale-change` (0.5.0)

Every path that switches the active locale dispatches `locale-change` once, with `previousLocale`: `setLocale()`, and an `init()` on a manager that is already ready, which includes the browser binding's start and its re-initialization. The re-init dispatches `ready` first, as every applied `init()` does, then `locale-change`. `subscribe()` listens to both but is called once per applied call, so a re-init that switches the language does not render twice. The first `init()` dispatches only `ready`: before it the manager has no active language, only the default that `locale` reports, so there is nothing to change from. A call that keeps the locale, or that a later call overtook, dispatches no `locale-change`.

Rejected: dispatching only `ready` from `init()`, as 0.4.0 does, because a listener that follows the language, such as one that logs a switch, updates a `lang` attribute outside the binding, or refetches localized data, has to listen to both events and compare locales itself, and one written for `locale-change`, as the docs show, misses a re-init's switch. Also rejected: `locale-change` from the first `init()`, whose `previousLocale` would name a locale that was never active.

### `defaultLocale` does not drive locale inference (0.2.0)

`defaultLocale` is typed `NoInfer<TLocale>` in `I18nConfig` and `LocaleRoutingConfig`, as is the locale parameter of `loadLocale`, `getLocaleDirection`, and `onMissingKey`, so a callback annotated `(locale: string)` cannot widen it either. Otherwise a configuration in a separate variable without `as const` would infer `TLocale` as `string` from `defaultLocale`, so `setLocale("fr")` would compile for an app that supports only `en` and `pt`, and fail at runtime. That configuration is a compile error at `createI18n(config)`, fixed with `as const`. Inline configurations are unaffected, since `defaultLocale` is checked against the literal union inferred from `locales`.

Rejected: letting `defaultLocale` drive inference, because the widening is silent and loses the main benefit of typed locales.

### Plurals (0.2.0)

A key whose value is a group with an `other` form is a plural group. `t(key, { count })` with a numeric `count` picks a form with `Intl.PluralRules`, then falls back to `other`.

- **Forms are nested keys, not a new syntax.** `{ one, other }` under the key keeps dictionaries plain JSON that translation tools already edit, needs no parser, and keeps every form addressable as an ordinary key, such as `cart.items.one`. ICU `{count, plural, …}` is also read; see [ICU messages](#icu-messages-and-formatters-020).
- **Rules come from the dictionary's locale.** When the current dictionary lacks the group, the default dictionary's group is used with the default locale's rules, since that text is in the default language. Using the active locale's rules would pick a Portuguese category for English forms.
- **Only a numeric `count` selects.** A string such as `"5"` does not, so a group used without a number is reported as a missing key instead of silently picking `other`. Converting strings was rejected because `"1,5"` and `"1.5"` parse differently by locale.
- **An exact key wins within a dictionary.** A string under the key is returned as it is without `count`, so adding `count` to an existing call never changes its text. Dictionaries are still checked in order, current then default, so a plural group in the current dictionary wins over a string that only the default dictionary has.
- **A locale `Intl.PluralRules` rejects**, such as a private-use tag, always uses `other`, rather than failing a lookup.
- **Typed keys** include the group key for any group with an `other` form, and still include each form.

DOM translation passes no `count`, since HTML has nowhere to supply one.

### Regional locales fall back to their parents (0.2.0)

Each locale reads, in order, itself, each configured locale made by dropping its last subtags, then the default. The chains are computed once, at creation, and every locale in the active chain loads with it. Rejected: reading the active dictionary, then the default one, so with `en`, `pt`, and `pt-BR`, a key missing from `pt-BR` shows English although `pt` has it.

- **No option.** The parent of `pt-BR` is `pt` in every application that configures both. An explicit `fallbackLocales` map is deferred, not rejected: it serves chains that subtags can't express, such as `es-MX` to `es-419`, and can be added later without changing this default.
- **A parent with another likely script is skipped**, by the same likely-script comparison `matchLocale` uses, so `zh-Hant` never falls back to `zh`, which is Simplified Chinese, and `sr-Latn` never to Cyrillic `sr`. Mixing scripts on one page reads worse than the default language.
- **Plural rules still come from the dictionary's locale**, as for the default; see [Plurals](#plurals-020).
- **The likely language and script come after the parents** (0.5.0), when that locale is configured and not already in the chain, so `zh-HK` reads `zh-Hant` and `sr-ME` reads `sr-Latn`, rather than the default. Dropping subtags alone never reaches them, since `zh-HK` has no script subtag to keep. It comes after the parents because a parent the visitor's tag names, such as `pt` for `pt-BR`, is closer than one inferred from likely subtags.
- **Parents are found by each locale's canonical form** (0.5.0), as `Intl.getCanonicalLocales` writes it, with `no` read as `nb` as in matching, so `he-IL` falls back to a configured `iw`, `iw-IL` to `he`, and `nb-NO` to `no`. `matchLocale` reads `iw-IL` as `he` through `Intl.Locale`, so a visitor matched to one code would otherwise fall back to the default rather than to the same language under the other. The aliases come from the runtime's `Intl`, which knows `iw`, `in`, `tl`, `mo`, `ji`, `jw`, and the rest of CLDR's deprecated codes; only `no` and `nb`, which `Intl` keeps apart, are named here. Rejected: dropping the subtags of the tag as written, as 0.4.0 does, for that mismatch with matching; and a table of aliases in the package, which would drift from the runtime that also does the matching.
- **A failing parent fails the request**, as the default always has, rather than being skipped, so a page never silently loses half its text.

### ICU messages and formatters (0.2.0)

Every text is read as an ICU message: `{name}`, `number` (`integer`, `percent`), `date` and `time` (`short` to `full`), `plural` and `selectordinal` (`=N`, `offset:N`, `#`), and `select`, with ICU apostrophe quoting. `formatNumber`, `formatDate`, `formatRelativeTime`, and `formatList` wrap `Intl` for the active locale.

- **Our own parser, not `intl-messageformat`.** That library is several times the size of the core with its parser, and the package has no runtime dependencies. The subset covers what UI text uses; skeletons (`::currency/EUR`) and `{n, number, currency}` are left out, because currency needs a code the message can't know, and `formatNumber` covers it in code.
- **Format in the dictionary's locale**, as plural groups choose rules, so English fallback text is never written with Portuguese separators.
- **Invalid syntax warns and falls back to `{name}` filling**, rather than failing `init()`. Checking every message at load would parse all of them up front and make one translator's typo stop the application from starting. Parsed messages are cached.
- **The parse cache is bounded by what it keeps, not by characters**: 10,000 messages, and a budget of 5,000,000, the default `maxTotalLength`, that each message spends as its length plus a fixed cost per parsed node, option map, and option, least recently used first. Every manager in the process shares it, so a server that loads changing dictionaries, such as from a CMS, would otherwise keep up to 10,000 texts of 100,000 characters each. Invalid syntax is cached as its reason, not its `Error`, whose stack would stay alive with it. Rejected: a bound of characters alone, as through 0.4.0, because a message of repeated `#` in a plural, `x{a}`, or `{a,select,other{}}` makes each character a node, so 50 such messages hold hundreds of megabytes; skipping messages above a density threshold, which leaves those just under it uncounted; and measuring the heap, which no engine exposes portably. Trade-off: a message that costs more than the whole budget is parsed on every call. The per-node costs are measured in `message-format.ts` and its tests.
- **`{name}` stays compatible**: a text without `{` or `'` is returned as is, and an argument without a usable value is left as written, as placeholders were. The one difference is that `'` before a brace and `''` quote, which a plain placeholder text rarely contains.
- **One call fills at most 100 arguments**, counted across nested plural and select forms, each `#` counted as one (0.5.0), and leaves the rest as written, a `#` as `#`. A message is fetched data in many applications, and a 100,000-character text of repeated `{a}` would otherwise run one formatter call per argument on every render, the `{name}` fallback for invalid syntax included. 100 is far above what a UI sentence uses. `#` counts because a form that repeats it copies the number once per `#`, so a form of 99,970 `#` with `1e308` would return 41 million characters from one `t()`, although the number is formatted once. Rejected: limiting arguments per message at parse time, because the fallback for invalid syntax fills placeholders without parsing; counting `#` once per form, which leaves that output unbounded; and a separate limit for `#`, a second number for the same risk.
- **A string or number in `{name}` is inserted as JavaScript writes it**, and a `Date` is formatted as `{name, date}`, so a plain `{when}` shows a readable date rather than `Date.prototype.toString()`. A count that should read with the locale's separators is written `{count, number}`. Rejected: formatting a number as `{name, number}`, as ICU MessageFormat and `intl-messageformat` do, because it changes the text every existing message shows for a number, and groups the digits of order numbers and years that apps pass as numbers, such as "Order 1,042".
- **A boolean selects** (0.5.0). `{isAdmin, select, true {Admin} other {Member}}` picks the option `String(value)` names, as `intl-messageformat` does, so a flag needs no conversion. With a JSON dictionary, whose values the types don't check, a select that leaves a boolean as written puts the message's source on screen without a warning. Booleans are taken by `select` only: a plain `{v}`, `number`, `plural`, and dates leave one as written, since "true" is rarely text a reader should see, and text left as written shows the mistake. Rejected: leaving a boolean select as written, as 0.4.0 does, which leaves the common pattern silently broken; and `String(value)` in every format, which prints "true" in a sentence.
- **Plural groups stay**: they keep each form an ordinary key, which some translation tools need.
- **Formatter options are copied by name.** Formatters are cached per process. A key of `JSON.stringify(options)` would see only own properties while `Intl` also reads inherited ones, so `formatNumber(x, Object.create({ style: "percent" }))` would turn every later call, in every manager, into a percentage. The options `Intl` reads are copied by name, inherited ones included, and that copy is both the cache key and what `Intl` receives, so the two cannot disagree. Values that are not primitives are never cached, so `Intl` validates them on every call. `formatRelativeTime` and `formatList` are cached the same way. Trade-off: an `Intl` option newer than ES2025 is ignored until it is added to the list.
- **`#` is the number only in a plural's own forms**, as ICU's `MessagePattern` defines it: a `select` nested in a form shows `#` as written, and an apostrophe before `#` quotes only in a plural. Rejected: printing the number there too, as `messageformat` does, which disagrees with ICU and `intl-messageformat`.
- **Exact plural values compare as numbers**, as in ICU, so `=1.0` and `=01` select 1, and two spellings of one value are a repeated option. Compared as text, they would silently never match. `offset` still matches the raw value.

### Names are letters and digits in any script (0.5.0)

An argument's name, a select key, and a `{name}` placeholder of invalid syntax are each letters, combining marks, and decimal digits in any script, and `_`, read by code point; a select key also takes `-`. Messages are written by translators, and a select over a value such as `{g, select, niño {…} niña {…} other {…}}` or an argument named in the translator's language is ordinary in non-English projects. ICU and FormatJS take any character outside their syntax as a name. One rule for arguments and placeholders keeps a name valid in one place valid in the other, so invalid syntax fills the same placeholders valid syntax does. Combining marks are included because Devanagari, Bengali, and Thai write vowels with them, so `{नाम}` is one name.

- Rejected: ASCII-only names, as 0.4.0 reads them, because a non-English option or argument name fails as invalid syntax, and a translator's `{año}` shows as written.
- Rejected: any character outside the syntax, as ICU reads it, because `{price€}` or `{a😀}` is more likely a typo than a name, and a narrower rule can be widened later without breaking a message.
- **The types read only ASCII names.** A message with a name outside ASCII accepts any values. Template literal types can't test a Unicode property, so a type that took every character outside ASCII would ask for a value for `{a€}`, which the runtime refuses. Keywords stay ASCII: a type such as `plural`, a style such as `short`, and the plural forms are fixed words, not names.

### Values are typed from literal messages (0.2.0)

`t(key, values)` requires the arguments of the message at `key` when the loader's type has the text as a literal, as an `as const` dictionary does, and takes the type each format needs. The message is read at the type level, so it needs no build step.

- **No generator.** TypeScript types JSON string values as `string`, so a JSON default dictionary checks keys only. A `.d.ts` generator, as a CLI or bundler plugin, would cover it, but needs a watch step in every app. Deferred, not rejected: it can be added later without changing these types, since it would only produce a literal dictionary type.
- **Loose where the type can't know**: a key union, a `string` message, a message the types can't read, and an `I18n` typed without its third type argument accept any values.
- **A plural group still needs a numeric `count` when its forms are `string`** (0.5.0), as from a JSON import. Its shape is visible when its texts aren't, and `t()` without a number `count` misses the group and shows its key, so without this `t("cart.items")` with a JSON dictionary would compile and then show `cart.items`. Other values stay loose.
- **The values' own type is inferred** (0.5.0), as a second type parameter of `t()`, so a value typed by an interface or a class is accepted. Rejected: an index-signature parameter, as in 0.4.0, which rejects such a value because interfaces have no implicit index signature. A wrong type, a missing value, and a misspelled name of a value the message uses still fail; [only those values are checked](#t-checks-only-the-values-a-message-uses-050).
- **A key a dictionary type makes optional is still checked** (0.5.0): `undefined` is removed from each dictionary's value before reading it, so a loader typed `Partial<typeof en>`, or as a union with one, checks the messages it has rather than accepting any values.
- **An argument used in two formats takes the values both read** (0.5.0), each kind of value tested on its own, so a select and a date on one argument take a number. Rejected: an intersection of the two kept types, such as `true & Date`, which no value is.
- **Every typed dictionary that has the key contributes**, so a translation that uses another argument requires it too. Extra values are allowed, of any type.
- **Reading gives up rather than failing the build.** A message over 900 type-level steps, about 900 apostrophes, 450 arguments, or 900 spaces inside one argument, accepts any values, rather than failing every `t()` call that uses it with TS2589. Argument names must be ASCII letters, digits, or `_`, as at runtime, and `''` inside quoted text is an apostrophe.
- **A message the runtime refuses accepts any values** where the types can see it (0.5.0): an unknown style, such as `{n, number, currency}`, a `plural` or `select` without options or without `other`, and an apostrophe before `#` whose quoted run holds a brace, which quotes it only inside a plural, a context the types don't track. The runtime prints such a message as written, so requiring its values would fail a build over text no value changes. Not covered: a repeated option, an unknown plural form such as `{n, plural, lots {…} other {…}}`, and nesting past 10 levels, which would need the types to track each option set, and which the runtime reports with a warning.

### `t()` checks only the values a message uses (0.5.0)

`t(key, values)` type-checks the values the message at `key` uses, and takes any other value of any type, so `t("greeting", user)` compiles for an `interface User { name: string; isAdmin: boolean }`, and so does an object literal `{ name, isAdmin: true }`. An application passes the object it already has, and a `User` almost always carries fields no message prints. The runtime reads only the arguments a message has, so a value nothing reads can't show up wrong. A message the types can't read, such as a `string` from JSON, uses no value they know of, so its values are not checked either, except a plural group's `count`.

Rejected: checking every value passed against the types a message takes, because an interface-typed value with any field of another type, such as a boolean, a nested object, or an optional `Date | undefined`, fails with TS2379 or TS2322 for a message that never reads that field, which rejects the calls the inferred values parameter is there for.

### Optional options accept `undefined`

Every optional option of `createI18n`, `init`, `dictionaryLimits`, `I18nError`, and `initializeBrowserI18n` is typed `?: T | undefined`, as the routing options are, and the package compiles with `exactOptionalPropertyTypes`. Without it, a consumer who enables that flag could not compile the guide's `initializeBrowserI18n({ i18n, locale: route?.locale })`, although the runtime reads an explicit `undefined` as an omitted option. `getLocaleDirection` and `onMissingKey` are function-typed properties, since a method can't be `| undefined`, so their parameters are checked contravariantly: a callback whose `locale` parameter is narrower than the configured locales, which the runtime would call with a locale it doesn't accept, does not compile. Rejected: documenting a spread such as `...(route && { locale: route.locale })`, which every strict consumer would have to find and repeat.

`initializeBrowserI18n`'s `locale` is `NoInfer<TLocale>` (0.5.0), as `loadLocale`'s parameter is. Without it, `initializeBrowserI18n({ i18n, locale: "fr" })` on a manager without `fr` widens the locale type to include it and compiles, since `I18n`'s methods make it covariant, and rejects at runtime.

`loadLocale` is a function-typed property too (0.5.0). As a method its parameter is bivariant, so a loader typed `(locale: keyof typeof dictionaries)` would compile after a locale was added to `locales` without a dictionary, and `init()` would reject at runtime.

### Errors quote what they name (0.5.0)

Every error and warning that embeds text from input, such as a dictionary key, a locale, a configuration property name, or a name in a message, quotes it with `quoteKey`, with line breaks and other controls escaped, and cuts it after 100 characters. Dictionaries are fetched data in many applications, and apps log `init()` rejections, so a key holding U+2028 or NEL could forge a log line. Rejected: escaping only the messages an audit finds, which misses the ones it doesn't.

**A query or a fragment is never quoted.** A pathname or a locale is calling code's, and `parse(request.url)` passes a query that can hold a token, so a value with `?` or `#` is quoted up to the first of them. A pathname that doesn't start with `/`, often a full URL whose user info can hold a credential, isn't quoted at all. Rejected: reading each value as the URL parser does, to find user info in shapes such as `/\user:secret@host`, because those reach an error only through `localize()` or a locale, which carry the app's own values: `parse()` returns `undefined` for `//`, `\`, and controls without an error.

### `t()` rejects values that are not an object (0.5.0)

`t(key, values)` throws an `[I18n]` `TypeError` when `values` is neither `undefined` nor an object, a mistake in the calling code, as `has()` throws for a key that isn't a string. Rejected: failing inside `Object.hasOwn` with a native message for `null`, and ignoring a string, as 0.4.0 does, which hides the mistake; and reading `null` as no values, which hides a call that meant to pass some.

### The key limit applies once trimmed (0.5.0)

The 1,000-character key limit applies to the trimmed key, which lookup uses, in `t()`, `has()`, and DOM translation alike, which share one rule. A string over 10,000 characters is refused before it is trimmed or scanned, so the cost stays bounded.

### Likely subtags are cached per process (0.5.0)

`Intl.Locale.prototype.maximize()` results are cached by tag and shared by fallback chains, matching, and every manager, so creating a manager and matching a request don't maximize every configured locale each time, which with many locales costs more per request than "creating a manager is cheap" allows. The cache holds 1,000 tags of up to 64 characters, least recently used first, because `matchLocale` receives tags from `Accept-Language`. `Intl.getCanonicalLocales` results, which fallback chains compare, are cached the same way. Rejected: caching per configured list only, which leaves the request's tags uncached.

**Each locale's forms are computed once per manager**: its lowercased and aliased prefixes, likely subtags, likely script, and canonical form, kept with the manager's frozen `locales` in a `WeakMap`, shared by its fallback chains and every `matchLocale()` call. The per-process cache alone leaves each call rebuilding those forms for every configured locale, a cost that grows with the number of locales on every request. Rejected: computing the forms on the first `matchLocale()` only, which saves nothing for the fallback chains every manager builds.

### Missing-key warnings are remembered per process (0.5.0)

The default warning's record of the most recent locale/key pairs is shared by every manager in the process, as the parse cache is. So is the record of the most recent invalid messages, which warn once per locale, key, and text. A server creates a manager per request, so a record per manager warns once per request, and one missing word on a home page logs a line for every visitor. Rejected: a record per manager, as 0.4.0 keeps; a test that wants each manager to warn passes `onMissingKey`, which runs on every miss.

Each record is bounded by what it keeps, 100,000 characters, as the parse cache is bounded by its cost, not by a count: about 1,000 typical keys, or 94 of the longest. An invalid message is remembered by its locale, its trimmed key, and a 53-bit hash of its text, so the record never holds the text and an edited text warns again. Rejected: a count of 1,000 entries keyed by the text itself, which holds up to 100 million characters of dictionary text for the life of a server, and warns once for a text shared by two keys; and the key without the text, which stays quiet after a translator fixes one error and makes another. A hash collision silences one warning, which costs less than the text it replaces.

The process-wide formatter cache is bounded the same way: it holds 500 formatters and skips a key over 1,000 characters. `Intl` reads a number option or `hour12` from a string of any length, so `{ minimumFractionDigits: " ".repeat(1e6) + "2" }` is valid and would otherwise be kept 500 times. Every number option set at once keys 687 characters. The likely-subtags cache takes tags of at most 64 characters, the parse cache counts each message's cost, and every other record is a `WeakMap` or `WeakSet` that goes with its manager or element.

### `resolveLocale` reads `_` as `-` (0.5.0)

`resolveLocale("pt_BR")` returns a configured `pt-BR`, as `matchLocale` does, because POSIX, Java, Android, and many back ends write a locale with an underscore, and a cookie or a query string often carries that spelling. A configured locale cannot contain `_`, so the reading matches nothing else. Rejected: exact spelling only, which makes `resolveLocale` stricter than `matchLocale` for no reason a caller could see.

### `timeZone` is a manager option (0.2.0)

With only the runtime's time zone, a server renders `{d, date}` on its own calendar day: 01:00 UTC on 2 November is "November 2" for a reader in São Paulo, where it is still 1 November, and the text changes when the browser takes over. `formatDate` takes `options.timeZone`, but that reaches no message.

- **On the manager, not per call.** A server already creates one manager per request, so the reader's zone fits there, and a message has nowhere to name a zone. `formatDate` uses it as its default, and its own `options.timeZone` wins.
- **Checked at creation**, with `Intl.DateTimeFormat`, so a bad zone fails where it is configured rather than at the first date.
- **No default other than the runtime's**, which is right in a browser.

Rejected: only documenting "format dates in code and pass the string", because it gives up `{d, date}` on every server.

### `has(key)` (0.2.0)

An application that builds keys at runtime, such as ``t(`errors.${code}`)``, needs to fall back when a key is absent. Comparing `t(key)` with the key works, but each expected miss calls `onMissingKey`, which tests set up to throw, and warns. `has()` looks through the same fallback chain silently, counts a plural group as a key, and is a type guard, so it replaces the cast to `TranslationKey` that typed keys otherwise need for such keys.

Rejected: documenting the `t(key) === key` comparison, because of the reported miss, and because a key with surrounding whitespace is returned trimmed.

**A string no dictionary can hold is a miss.** Such a key can't be in a dictionary, so `has()` returns `false`, silently. Throwing a `TypeError` for it, as `t()` does, fails `has()`'s own example, ``has(`errors.${code}`)``: a `code` from a response or a query string with a line break, or over 1,000 characters, would throw from the very check meant to guard it. It still throws for a non-string, which is a mistake in the calling code, and `t()` still throws for an invalid key, since a call that passes one has skipped the check. Rejected: keeping the throw and documenting it, which leaves every caller to validate the code before checking it.

**A typed key is not narrowed.** `has(key: string): key is TKey` alone would narrow a key that is already a `TKey` to `never` when `has()` returns `false`, although a typed key can still be missing, such as one only another locale has. An overload, `has(key: TKey): boolean`, comes first, so only a key that isn't typed yet is narrowed. Rejected: documenting the narrowing, which leaves every such branch unusable.

**A group counts only with an `other` form**, the definition plural groups and typed keys already use. Rejected: picking a plural form for count 0, so `{ one, two }` is a key in Portuguese and French, where 0 is `one`, but not in English, while `t()` shows the raw key in every locale; the answer for one dictionary must not change with the active locale.

## Browser

### Detected locales are not persisted

The binding persists an explicit locale and every later applied change, but not a locale it read from storage, detected from `navigator.languages`, or defaulted to. Persisting it would make the first fallback permanent, so returning visitors would never receive a locale added later or a changed browser language.

### A failing preference falls back to the default

When the loader rejects for a stored or detected locale, the binding warns and starts with the default locale, keeping the stored preference. Rejected: rejecting, which makes a temporary failure of one dictionary stop the application from starting, and whose only recovery, passing the default explicitly, persists it and keeps that visitor on the default for good. An explicit locale or the default locale still rejects, since nothing can serve in its place.

**The detected locale comes before the default.** A failing saved locale falls back to the detected locale, then the default, each warned about, and none persisted, since the browser's languages are the next choice: a visitor with a saved `fr` whose dictionary fails to load, and a `pt-BR` browser, would otherwise get English although Portuguese is available. Rejected: trying every locale in `navigator.languages`, which can stack one failed load per preference before the page shows text.

### A stored locale is matched

A stored locale the application no longer configures exactly, such as `pt-PT` after only `pt-BR` remains, goes through `matchLocale()` like a browser preference, and the stored value is left as it is. It still names the visitor's choice, which serves them better than their browser's languages. Rejected: discarding it, which sends a visitor who chose Portuguese back to detection, and rewriting it to the match, which would lose the choice if the application adds `pt-PT` back.

### The binding can follow the system again

`switchToSystemLocale()` removes the saved locale and switches to the locale detected now, without saving it, and `isUsingSystemLocale` tells a picker whether to show a "System" entry as selected. While it is `true`, a `languagechange` event switches to the newly detected locale. Requested in #588, so an application with a "System" entry need not keep its own copy of the choice beside the binding's storage.

**A flag, not the saved locale.** `isUsingSystemLocale` is `false` after any locale the application applies, whether or not `persistLocale` saves it. Rejected: exposing the saved locale, as #588 proposed, which is always `undefined` with `persistLocale: false`, so a picker would show "System" for an explicit `locale` the application chose.

**Choosing the active locale is a choice.** `setLocale()` for the locale already active dispatches no event, so the binding learns of every applied request through an internal hook in core, and saves it. Otherwise a visitor who picks English while English was detected would save nothing and still see "System" selected.

**A failed switch keeps the current locale.** `switchToSystemLocale()` rejects with the loader's error, and a failure after `languagechange` warns. Neither falls back to the default as a start does: the page already shows a language, and the start falls back only because it has none. The saved locale is forgotten before loading, so a visitor who asked for the system gets it at the next start even when this load failed, unless storage refused the removal, which warns.

**The binding's own switches end with it.** `disconnect()` supersedes a detected locale still loading, so it does not apply to a manager nobody binds; an application request still loading is left to apply. A browser language change during the start's loading, before the listener exists, is caught by comparing the detected locale once the start ends.

**A visitor's pick is not overtaken.** A `languagechange` while an application request is still loading is ignored, so the pick applies and is saved; the latest-call rule would otherwise let the binding's detection replace it. Core tells the binding whether the latest request is loading, rather than the binding remembering which request last applied, so a pick that failed does not stop the binding from following later changes.

**The binding reports what a picker shows.** `binding.subscribe()` calls its listeners once after each change to the active locale or to `isUsingSystemLocale`. `i18n.subscribe()` can't serve a picker: a pick of the locale already showing, or a `switchToSystemLocale()` that keeps the locale, changes the selection but not the manager, so a framework picker rendered from the manager would keep the old entry. Changes made together, such as a pick that changes the locale and ends following the system, are reported once, from a microtask, so a listener never runs inside the manager's request handling. Listeners are dispatched through an `EventTarget`, so one that throws is reported as `i18n.subscribe()` listeners are, and the others still run. Rejected: making `i18n.subscribe()` fire for a request that changes nothing, which re-renders every subscriber for a selection only the picker shows; and documenting a re-read after each `await`, which a framework's store can't do.

**The manager stays runtime-neutral.** Rejected: `setLocale("system")` or `setLocale(undefined)` on the manager, which knows nothing of the browser or of storage.

### Tabs do not follow each other's choice (0.5.0)

A pick saved in one tab is not applied to the others: the binding listens for `languagechange`, not for the `storage` event, and each tab reads the saved locale at its start. A tab's text changing under a visitor who is reading it, because they picked a language in another tab, is a surprise; the next load, or the next tab, uses the choice. `languagechange` is different: it reports a change to what the visitor asked for everywhere, and applies only while a tab follows the system. Rejected: applying `storage` events, which also reports the writes of any other script that uses the same key, and an option for it, which no application has asked for. An application that wants it can listen for `storage` itself and call `i18n.setLocale()`.

### The default `storageKey` is `"i18n"`

The saved locale lives under `localStorage["i18n"]` unless `storageKey` says otherwise. The name is short and could collide with another library's, but every visitor's saved choice lives under it since 0.1.0, so a new default would send each of them back to detection once, with no way for the application to tell. An application that shares its origin with other code that uses the key sets `storageKey`. Rejected: a namespaced default, such as `"codenhub-i18n"`, which costs every existing visitor their choice to avoid a collision no one has reported, and migrating the old key, which reads storage the application may have given to someone else.

### The choice can be saved elsewhere (0.5.0)

`storage` takes `get()`, `set(locale)`, and `remove()`, which the binding calls exactly where it uses `localStorage`, so a choice kept in a cookie that a server also reads is matched, falls back when its dictionary fails to load, sets `isUsingSystemLocale`, and is forgotten by `switchToSystemLocale()`, as a saved choice is. Passing the cookie's value as `locale` instead counts as required, so one failed dictionary download stops the start, where the same choice in `localStorage` falls back with a warning. The store deals in plain locale strings; the default keeps its `{"locale":…}` format under `storageKey`. A value that isn't a string or a configured locale counts as nothing saved, since it came from outside the application, and a method that throws warns, as an unavailable `localStorage` does. The methods are synchronous, since the start reads the choice before choosing a locale, and cookies and `localStorage` are synchronous too. Passing it with `storageKey`, or with `persistLocale: false`, rejects before touching the manager, since each says something else about where the choice lives, and so does a value without the three methods.

Rejected:

- Passing the cookie's value as `locale`, as the 0.4.0 server-rendering guide does, for the failed-download case above.
- A `preferredLocale` option with a stored locale's fallback, which reads a choice but neither writes nor forgets it, so `switchToSystemLocale()` and every pick would still need application code beside the binding.
- A `try`/`catch` in the guide around a start with the cookie as `locale`, which every app would have to copy, and which saves the server's guess as the visitor's choice.
- Writing the cookie from `binding.subscribe()`, which has to tell a pick from a detected locale by re-reading `isUsingSystemLocale`.
- An asynchronous interface, which would delay every start for stores that don't need it.

### One data attribute per translated attribute

`data-i18n-<attribute>` is used rather than a single list attribute, such as `data-i18n-attrs="placeholder:search.hint"`, because it needs no parsing and a `MutationObserver` can watch exactly those names. Attributes are limited to text read by people or assistive technology, so a translation can never set a URL, a style, or an event handler.

### Custom elements translate themselves

The binding skips every element inside a custom element, from an outer root: a tag with a dash, or a customized built-in element marked with `is`, such as `<button is="x-button">`, which owns its content the same way. A component has its own life cycle: it may render after the page's pass, and it adds and removes text as people use it, such as a card that changes with interaction, so it has to call `t()` for that text anyway. Re-running the page's pass for each component's change was rejected as costlier than the component translating itself with `t()` and `subscribe()`. Rejected too: asking `customElements.getName()` about every element, to find a customized built-in that script created without an `is` attribute, which WebKit doesn't implement and no page has needed.

**Wrappers are skipped too.** A light-DOM wrapper, such as `<site-nav>` around links the page wrote, is not read: the binding can't tell a wrapper from a component that renders its children, and reading into one would translate, and then fight, text the component owns. The guide says to use a plain element for a wrapper, and shows `t()` and `subscribe()` for a component, rather than a component binding of its own, which a manager's one binding rules out. Rejected: a warning per skipped element with keys, which would fire for every component that translates its own content.

**No shadow root is entered.** The binding reads only the light tree of its `root`, so the content of any shadow root is skipped, a custom element's or a plain `<div>`'s. A shadow root can be the `root` itself.

### Elements that can run, hide, or reparse text are never translated

The text of `script`, `style`, `template`, `noscript`, `iframe`, `noembed`, `noframes`, `xmp`, and `plaintext` is skipped with a warning. It is not read as text: the HTML serializer writes the children of `xmp`, `iframe`, `noembed`, `noframes`, and `plaintext` without escaping, as it does for `script` and `style`, so a translation containing `</xmp><img onerror=…>` would become markup when the page is serialized, as a server-rendering or prerendering step does. Rejected: escaping the text, which these elements would show literally.

**Their own attributes are translated** (0.5.0). A blocked element's `data-i18n-<attribute>` keys are translated like any other element's, since the allowlist holds no URL, style, or handler, and the serializer escapes attribute values. An `<iframe>`'s `title` is its accessible name, which an embedded video or map needs in the reader's language. Rejected: skipping the whole element, which leaves that name in the page's original language.

**An element inside one of them is translated like any other.** Only script can put an element there, and no browser renders it. Rejected: skipping such an element, and one inside a `textarea` or `title`, because its translated attribute becomes markup only when a serializer that leaves `<` raw in attribute values writes the page and a parser reads it again, with a hostile translation, which no reader's page combines.

### A message that needs values keeps the HTML text (0.5.0)

`data-i18n` names a message the binding can only show without values. When the message has a placeholder, a plural, or a select, the binding leaves the element's text as the HTML wrote it and warns once per key, rather than writing `Hello {name}` or a whole plural's syntax into the page. The HTML's text is the author's fallback, written for that element, and a visitor reads it rather than a template. Rejected: showing the message as written, as 0.4.0 does, which puts `{name}` on screen with no warning; and filling values from data attributes, which would add a second way to pass values that `t()` already covers.

### An invalid key shows the HTML text (0.5.0)

A `data-i18n` or `data-i18n-<attribute>` key that no dictionary could hold, such as a blank one, one over the length limit, or one with an ASCII control, is read as a miss, with a warning: the element shows its HTML value. Rejected: skipping such a key and keeping whatever the element shows, as 0.4.0 does, because a key changed from a valid one to an invalid one then leaves the earlier key's translation in the page, whether a later binding, an observed change, a language change, or moving the element back in reads it, which reads as a translation of a key the element no longer names.

**So does a key whose `onMissingKey` throws.** The element shows its HTML value and the error is still reported, rather than keeping the translation of its earlier key or locale, for the reason above.

### Text in another locale is marked with `lang` (0.5.0)

When every key an element shows comes from one locale, and that locale is not the language the element has without the binding's mark, the binding sets `lang` to that locale, so a screen reader pronounces it, and a browser hyphenates and spellchecks it, in its own language. That language is the element's own `lang`, or else its nearest ancestor's, crossing shadow hosts, or else the active locale. Tags are compared case-insensitively, and an empty `lang` counts as none. With `syncDocument` on and no `lang` in between, this is the active locale. With `syncDocument: false`, a French text in a widget under `<html lang="en">` is marked `fr`. A `lang` the element carries without the binding having written it, such as one a clone copied from a marked element, counts as its own, so the clone is re-marked by the text it shows. An element with content of its own, text or children, is marked only by its `data-i18n` text, since its attributes say nothing about that content's language, and an element whose keys come from different locales, or include a miss that leaves a value showing, is left alone; a missed attribute the HTML doesn't have shows nothing and doesn't count. A key whose missing-key handling throws counts as a miss. The binding restores the element's own `lang` when the text returns to the active locale or the key is removed, unless other code changed `lang` since, and once other code has, the binding leaves `lang` to it. Text the HTML wrote, kept for a miss, is not marked, since the binding can't know its language. Rejected: a public way to ask which locale a key came from, which no other consumer needed; comparing with the active locale, which mislabels every page that doesn't sync `<html lang>`; and tracking clones, which `cloneNode()` gives no hook for.

### Text the binding writes over is not a fallback (0.5.0)

With `observe`, a keyed leaf whose content other code replaced, such as by setting `textContent`, has the translation written back at once, and its fallback stays the text from before. Otherwise "Placing order…", overwritten at once, would come back for a language without the key or when the key is removed. Text set without `observe`, or a text-node edit, which isn't watched, still becomes the fallback at the next pass, since nothing wrote over it in between. Rejected: never updating the fallback, which loses an application's deliberate rewrite of a page it doesn't observe.

### A binding is started once per manager

A manager has one binding, and a second `initializeBrowserI18n()` rejects until the first is disconnected. The guide says to start the binding at module scope, outside a component, so React's StrictMode, which runs effects twice in development, starts it once. Rejected: an abort `signal` for an initialization still in progress, which would add an option for one framework's development mode when starting outside the component already avoids it.

### A re-`init()` translates the page once (0.5.0)

A re-`init()` that switches the locale dispatches `ready` and then `locale-change`, so a binding that handled each would run two passes, and `onMissingKey` twice per missing key. The binding runs one pass per applied request, driven by core's applied-request hook, so a `ready` event that other code dispatches doesn't start a pass. Rejected: dispatching only one of the events, which [the re-`init()` decision](#a-re-init-that-changes-the-locale-fires-locale-change-050) settles.

### Bindings must not overlap

Each binding is given its own part of the page. Two bindings observing one element would each rewrite its text when the other did, forever; the binding skips text it wrote itself, which ends the loop, and the guide says to give each binding roots that don't overlap. Rejected: detecting overlap between roots, which can be added to after start, and still couldn't say which binding should own an element.

### The browser binding needs a global event target (0.5.0)

`initializeBrowserI18n()` throws a `TypeError` before touching the manager when `globalThis.addEventListener` is not a function, as in some test environments and embedded runtimes, rather than initializing the manager and then rejecting when it listens for `languagechange`. Rejected: skipping that listener there, which would leave a binding that silently ignores a change to the browser's language.

### A missing document fails before initialization

Without a document, such as in a Web Worker, `initializeBrowserI18n()` throws a `TypeError` naming the requirement before touching the manager, but only when `syncDocument` is on, rather than initializing the manager and then rejecting with a `ReferenceError` from document synchronization, which would leave the manager ready but unbound. With `syncDocument: false` and no `root`, initialization works without a document. Rejected: requiring a document for the whole `./browser` entry, which breaks a combination that works, and adding an option, which nothing needs.

## Routing

### Translated path segments ship in 0.2.0

Paths such as `/sobre` for `/about` ship with 0.2.0, before 1.0, as `docs/specs/packages-lifecycle.md`, "Versioning", asks of planned features. Rejected: deferring to 0.3.0 because the feature is additive and needs its own design, which is true, but does not make deferring the only plausible option.

- **A table keyed by canonical path**, the path the app routes on, with each locale's form. A locale or path the table doesn't list keeps the canonical words. `parse` returns the canonical path, so the result shape is the same as without a table.
- **Fixed segments and `:name` parameters**, as in `@codenhub/router`, so a route pattern translates with `localizeAll` and can be registered once per locale. Forms use the canonical path's parameters in any order, because word order differs between languages.
- **Fixed segments match case-sensitively**, like router routes and URL paths. Only the locale prefix ignores case. Unicode entries match their percent-encoding. The locale prefix is read the same way (0.5.0), so `/%70t/sobre` is the `/pt/sobre` a server that decodes the path serves, and `/pt/%65n/about` is refused like `/pt/en/about`.
- **A fixed segment wins over a parameter** at the first segment where two patterns differ. Rejected: first match in table order, as `@codenhub/router` does, because the order of an object's keys is easy to change without noticing.
- **Mistakes are rejected at creation**: invalid paths, unconfigured locales, a path starting with a locale, parameters that differ between forms, and two pages with the same path in one locale.
- **`localize` reads an unprefixed path as canonical, and a prefixed one as that locale's URL**, so `localize("/pt/sobre", "en")` is `/about`. Reading every input as a URL first, which would let `localize(location.pathname, …)` switch language from `/sobre`, was rejected: it can't tell the canonical English page `/sobre` from the Portuguese URL `/sobre`, so the clash check below could never fire. Switching language goes through `parse` instead, as the guide shows. Rejected too: reading every path as canonical and throwing on a prefixed one, for a canonical page whose first word is a locale code, such as `/my/orders` with Burmese configured. No URL leads to such a page, since `parse` reads its prefix as a locale, and the table refuses such a path where it lists one, while the throw breaks every app that passes a prefixed path, as the guide shows.
- **`localize` throws a `RangeError` when its result would be parsed as another page or locale.** This is the net for pages the table doesn't list. A static build that localizes its page list finds every clash at build time.

### Catch-all parameters

A table without them can't translate a tree of pages, such as documentation or CMS pages under `/docs/…`, without listing every page. A last segment written `:name*` matches one or more segments and copies them across.

- **`:name*`**, the `path-to-regexp` spelling, rather than a bare `*`: it names the value like every other parameter, so the check that forms use the canonical path's parameters covers it. `*` is a literal segment everywhere else.
- **Last only, one or more segments.** A catch-all in the middle would need backtracking, and zero segments would make `/docs/:path*` and `/docs` the same page in two entries. `/docs` is listed separately.
- **A parameter beats a catch-all**, extending the rule that a fixed segment beats a parameter, at the first segment where two patterns differ.
- **The prefix decision stays per route**: under `"when-ambiguous"`, a catch-all form keeps the prefix for all its URLs when any other locale's path overlaps any of them.
- **A pattern passed to `localize` whose last segment is `:name*` matches only a catch-all** (0.5.0). Matched by a parameter, `/help/:path*` would become the one-segment `/ajuda/artigo/:path*`, a pattern for another page. A request path ending in a literal `:name*` segment is read the same way, which no real URL has.

`@codenhub/router` has no catch-all, so `localizeAll` output with one is for frameworks that have their own syntax for it.

### The locale prefix is dropped only where a path is unambiguous

A path shared by two languages, such as `/` or a brand name, can't tell which language it is in. That rules out removing the prefix everywhere, not removing it only from paths that belong to one locale. `/sobre` is only Portuguese, so it needs no prefix, while `/pt` and `/pt/blog` keep it. So an opt-in mode serves a translated path without a prefix when no other locale's path overlaps it, and keeps the prefix otherwise. A form made only of parameters, such as `/:tag`, always keeps it: it overlaps every path of its length, including the default locale's pages the table doesn't list.

The remaining risk is a route the routing table doesn't list, such as a CMS slug `/sobre` in the default language: routing assumes an unlisted path belongs to the default locale and can't see the clash. The mode is opt-in and the guide warns about this.

Rejected:

- Prefix always, because it rules out `example.com/sobre` for no reason on paths that are unambiguous.
- Never prefix, because `/` and every path with the same words in each language would carry no locale.
- Comparing only with the forms read without a prefix, so a Spanish `/:tag`, which always keeps `/es`, doesn't keep the prefix on the Portuguese `/sobre`. It drops a few more prefixes, but moves the indexed URLs of every site the rule touches, which then needs redirects, while a prefix kept where it isn't strictly needed costs nothing.

### One `localePrefix` option, not `prefixDefaultLocale`

The prefix policy has three values: `"always"`, `"except-default"`, and `"when-ambiguous"`. That makes it one option rather than `prefixDefaultLocale: boolean` plus a second flag whose combinations overlap. It breaks the API, and is made in 0.2.0 because before 1.0 is the cheapest time. Rejected: keeping `prefixDefaultLocale` and adding a flag later, which avoids the break but leaves two settings that interact.

### `trailingSlash` builds a locale's root with a slash

The canonical root `/` can't say whether a slash is wanted, so by default `localize("/", "pt")` is `/pt`, while `localize("/about/", "pt")` keeps its slash. On static hosts that serve `pt/index.html` at `/pt/` and redirect `/pt` there, such as GitHub Pages, every link and `hreflang` to a locale's home page would go through a redirect, and the guide's canonical redirect would send `/pt/` back to `/pt`. An optional `trailingSlash` picks `"preserve"`, the default, `"always"`, or `"never"` for every path `localize` builds.

- **Optional, unlike `localePrefix`.** Its default is the behavior without the option, so no existing URL changes.
- **`parse` is unchanged**: it accepts both spellings and keeps the request's in `pathname`, so the canonical redirect turns the other spelling into the built one. Normalizing `pathname` too was rejected, because it changes what an application routes on for a setting about links.
- **Three values, not a boolean**, so a site that drops slashes can collapse both spellings into one address too.

Rejected: documenting a one-line wrapper that appends `/`, which every trailing-slash site would have to find and repeat.

### `parse` returns only paths that have a canonical URL

A result for any path `parse` can read would include paths no link leads to: `/pt/en/sobre` reads as `/en/sobre` in Portuguese, which `localize` then reads as a prefixed URL, and, with `"when-ambiguous"`, `/en/sobre` reads as an English `/sobre`, whose unprefixed URL is the Portuguese about page. `localize(route.pathname, route.locale)`, the guide's canonical redirect and the advice in `localize`'s own error, then throws a `RangeError`, so a typed URL answers 500. `parse` returns `undefined` for such a path, and for one whose canonical URL would be longer than 8,192 characters, so every result has a canonical URL that `localize` builds and the path answers 404.

With `"always"`, `undefined` also means a missing prefix. The guide's redirect tells the two apart by parsing the path with the chosen locale's prefix added: a path that is no page in that locale either is a 404.

Rejected:

- Catching the `RangeError` in the guide's examples, because every application would have to remember it, and a forgotten catch is a 500 on any typed URL.
- Reading such a path as the nearest page, such as `/pt/en/sobre` as the about page, because it gives one page more addresses and hides broken links.
- A `hasLocalePrefix` helper to tell the two `undefined` cases apart under `"always"`, because the guide's second `parse` does it without new API.

### `parse` lists the page in every locale that has a URL (0.5.0)

A path `parse` accepts can have no URL in another locale: with `/products/:id` and `/products/new` translated as `/produtos/:id` and `/produtos/novo`, the English product `novo` is `/products/novo`, and its Portuguese URL would open the "new" page. A switcher or `hreflang` tags built with `localize` throw a `RangeError` for that locale, so the page answers 500. `parse` returns `alternates`, the page's URL in each locale that has one, in `locales` order, the parsed locale always included, leaving out each locale where `localize` would throw. Every alternate is exactly what `localize` returns, since both go through one check. `localize` and `localizeAll` stay strict, the net a static build that localizes its page list relies on.

Rejected:

- `localizeAll` leaving clashing locales out, which silently drops the static build's net.
- `parse` refusing a path with no URL in every locale, which 404s a real English product.
- Catching in the guide, for the reason the decisions above give: a forgotten catch is a 500.
- A lazy getter for `alternates`, which saves one `localize` per locale for callers that don't read it, but makes the result more than plain data, which frameworks serialize.

**The clash error names the URL and the page it opens.** It names the URL `localize` would build and the page that URL opens, gives advice for both causes, a URL passed as a canonical path and a canonical path whose URL belongs to another page, and points request-time links to `alternates`. It keeps its `… would be read as "X" in "Y"; …` start. Rejected: only saying "pass a canonical path, such as parse().pathname", which misleads a caller who already passed one.

### `hreflang` tags are built from the app's own constants (0.5.0)

The `x-default` tag needs the default locale, which a `LocaleRouting` does not expose. Routing exposes nothing new for it: the guide's routing module exports the `locales` and `defaultLocale` it passes in, and the manager and the `hreflang` tags import those, so no second copy, such as `const defaultLocale = "en"` beside the tags, drifts from the configuration when the default changes. An app always has the values, since it wrote the configuration. Rejected: exposing `locales` and `defaultLocale` on `LocaleRouting`, or a helper that builds the tags, because each adds a published contract, kept for every later version, for values the caller already holds, and a tag helper would also choose the markup, the origin, and the escaping that belong to the app's framework.

### `parse` builds every locale's URL from one lookup (0.5.0)

`parse` splits and normalizes the path once and finds its table route once; each locale's URL is built from that and read back on its segments. Those segments are already normalized, which normalizing leaves unchanged, and already valid except for length, so the read-back only checks length. Building `alternates` otherwise reads the whole path again in every locale, a cost that grows with locales times segments on every request. Only `localize`'s clash message runs the full read-back. Rejected: caching by input, which an attacker controls.

### Overlap is found by segment shape (0.5.0)

Under `"when-ambiguous"`, routing groups patterns by the kinds of their segments and compares each pair of groups once, through a map of the fixed words they share. Two patterns overlap exactly when their words agree wherever both have a fixed segment and their lengths allow it, catch-alls included. Rejected: comparing each form with every branch a parameter could take, whose cost grows with every form that starts with a parameter, so a table of thousands takes seconds to create; and a reversed trie, which catch-alls misalign and a middle parameter still fans out. Remaining cost: thousands of different parameter layouts of one length still cost one comparison per pair of groups. Evidence: `pathnames.test.ts` checks the result against the definition over 400 random tables.

### `parse` returns `undefined` for a request path routing refuses (0.2.1)

Routing refuses some paths a request carries: `new URL("https://example.com//wp-login.php").pathname` is `//wp-login.php`, and scanners send such paths all day. The guide's handlers call `parse(url.pathname)` without a catch, so a `TypeError` for each would answer 500. The decision above rejects catching in the guide because a forgotten catch is a 500 on any typed URL, and the same reasoning holds for a `TypeError` as for the `RangeError`.

- **`undefined` for what a request can carry**: `//`, `\`, control characters, dot segments, encoded slashes, backslashes, `%` and controls, malformed escapes, and paths over 8,192 characters or 100 segments. Every caller already answers `undefined` with a 404.
- **Still a `TypeError` for what `url.pathname` never is**: a non-string, a value not starting with `/`, such as a full URL, or one with `?` or `#`, such as Node's `request.url` with its query. Returning `undefined` there would turn a mistake in the calling code into a 404 on every URL with a query string.
- **`localize` and `localizeAll` still throw** for every refused path, since they build links from the application's own paths.

Rejected:

- Adding a catch that answers 400 to every guide example, for the reason above.
- Returning `undefined` for every invalid value, including a full URL, for the `request.url` case.

### `parse` checks the canonical path's length too

`parse` returns `undefined` when the canonical path, not only its URL, would be longer than 8,192 characters. A short translated URL can read back to a longer canonical path, such as `/pt/b/…` for `/aaaa…/:id`, and `localize` refuses an input that long, so checking the URL alone lets such a request answer 500 through the guide's redirect. Rejected: raising the limit for canonical paths, which would let `localize` accept what no request can carry.

### Paths have at most 100 segments (0.5.0)

Every limit on a path's length also caps its segments at 100: a request over it is `undefined` from `parse`, an input over it is a `TypeError` from `localize`, and a URL or canonical path that would pass it is treated as one over 8,192 characters. Reading a path costs work per segment in every locale, and `parse` reads each locale's URL back to build `alternates`, so a path of thousands of one-letter segments within 8,192 characters, which anyone can send, costs over a hundred times what a short path does, and a few dozen requests a second keep a core busy. No page is 100 folders deep; a catch-all for documentation trees stays far within it.

Rejected: only cutting the repeated work per locale, which leaves the cost growing with segments times locales; and building `alternates` lazily, rejected before for making the result more than plain data.

### A page comes back in one spelling

Every segment comes back from `parse` normalized as RFC 3986 says, the same in every locale, so `/%61/x` and `/pt/%61/x` both give `/a/x`, and `/pt/produtos/café` gives `/products/caf%C3%A9`. `localize` writes every segment it builds the same way, listed or not. The length limit applies to the path `parse` returns, after this re-spelling. `/café` and `/caf%C3%A9` are one URL to a browser but two pages to a cache or an equality check, and a raw `é` written by `localize` would land in an `href` or a `Location` header. Normalizing costs one stable redirect hop for a hand-typed spelling. Rejected: keeping the request's spelling for parameters and unlisted segments, as 0.4.0 does, which gives two requests for one page two `pathname`s.

**Normalized as RFC 3986 says, not decoded.** An escape of an unreserved character (`A-Z a-z 0-9 - . _ ~`) is decoded, every other escape is written in upper case, and every other character a URL encodes is encoded; a lone surrogate, which is not text, is written as U+FFFD's `%EF%BF%BD`, as the URL parser writes it. Rejected: decoding every escape and encoding the result again, which turns `c%2B%2B` into `c++` and `a%3Bb` into `a;b`, characters a server or a framework may read differently from their escapes, so two pages could share one `pathname`.
