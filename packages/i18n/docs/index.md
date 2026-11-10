---
title: Overview
description: What @codenhub/i18n does, the four ideas behind it, a five-minute walkthrough, right-to-left languages, and how the manager behaves when calls overlap.
---

# Translate your app

`@codenhub/i18n` turns keys such as `"home.title"` into text in the reader's language. You write your translations as plain objects or JSON files, one per language, and the package does the rest: it loads the right one, falls back to your main language when a translation is missing, fills in values like names and counts, writes numbers and dates the way the reader expects, and tells TypeScript which keys exist, so a typo fails to compile instead of reaching production.

The core works the same in a browser, a Node.js server, a static site build, or a Web Worker. Two optional extras handle the jobs that differ by environment:

- **`@codenhub/i18n/browser`** picks the visitor's language, remembers their choice, keeps the page's `lang` and `dir` attributes in step, and can translate HTML marked with `data-i18n`. Most of that needs a page, so in a Web Worker, which has none, it takes two extra options; see [In a Web Worker](browser.md#in-a-web-worker).
- **`@codenhub/i18n/routing`** puts the language in the URL, as in `/pt/about`, and can translate the path itself, as in `/pt/sobre` or `/sobre`. It only reads and builds strings, so it works anywhere, a Worker included.

## Four ideas

The whole package fits in four ideas. No fifth one is hiding in a footnote.

**A locale** names a language, and sometimes a region: `en`, `pt`, `pt-BR`, `ar`. You list the locales your app supports, and pick one as the **default locale**: the language your app is written in first, which every other locale falls back to.

**A dictionary** holds every translation for one locale. Keys can be nested to keep related text together:

```json
{
  "home": {
    "title": "Welcome",
    "greeting": "Hello, {name}!"
  }
}
```

Nested keys are joined with dots, so this dictionary has the keys `home.title` and `home.greeting`.

**A loader** is a function you write that returns the dictionary for a locale. It can return an object you imported, read a file, or fetch JSON from your server. The package never decides where translations live; it calls your loader when it needs a locale, and keeps the result.

**A manager** ties these together. You create one with `createI18n()`, tell it which locale to use, and ask it for text with `t()`.

## Walkthrough

### 1. Install

```sh
pnpm add @codenhub/i18n
```

The package is an ES module and needs Node.js 24 or newer, or a current browser. It has no runtime dependencies.

### 2. Write two dictionaries

Start with your default language and one more. Here they are objects in a TypeScript file; [Write your translations](translations.md) shows how to keep them in JSON files instead.

```ts
// src/locales.ts
export const dictionaries = {
  en: {
    home: { title: "Welcome", greeting: "Hello, {name}!" },
    cart: { items: { one: "{count} item", other: "{count} items" } },
  },
  pt: {
    home: { title: "Bem-vindo", greeting: "Olá, {name}!" },
    cart: { items: { one: "{count} item", other: "{count} itens" } },
  },
} as const;
```

The `as const` lets TypeScript see the exact keys, so it can check every `t()` call against them.

### 3. Create the manager

In a browser app, create the manager once in its own module and import it wherever you need text:

```ts
// src/i18n.ts
import { createI18n } from "@codenhub/i18n";
import { dictionaries } from "./locales";

export const i18n = createI18n({
  locales: ["en", "pt"] as const,
  defaultLocale: "en",
  loadLocale: (locale) => dictionaries[locale],
});

export const { t } = i18n;
```

`t` is a short name for `i18n.translate`. Every method on the manager works on its own after you pull it off, like `t` here, so you can import `t` directly.

On a server, one shared manager is the wrong shape; [Render on a server](server-rendering.md#one-manager-per-request) explains why, and what to do instead.

### 4. Start it, then translate

The manager has to load a dictionary before it can translate, so start it once when your app starts and wait for it:

```ts
// src/main.ts
import { i18n, t } from "./i18n";

await i18n.init({ locale: "pt" });

t("home.title"); // "Bem-vindo"
t("home.greeting", { name: "Ana" }); // "Olá, Ana!"
t("cart.items", { count: 3 }); // "3 itens"
t("home.titel"); // compile error: there is no such key
```

`init()` without a locale starts with the default locale. Calling `t()` before `init()` has finished throws an error, because there is nothing to translate with yet.

### 5. Switch languages

```ts
await i18n.setLocale("en");
t("home.title"); // "Welcome"
```

`setLocale()` loads the new dictionary first and only switches once it has loaded, so text never shows half in one language and half in another. To redraw your interface when the language changes, pass a function to `i18n.subscribe()`. It runs after every `init()` and every language switch that actually happens; [Keep track of the manager](#keep-track-of-the-manager) says exactly when that is.

## What happens when a translation is missing

Translations rarely stay complete. A feature ships in English on Tuesday and in Portuguese whenever the translator gets to it. The package handles the gap in two steps:

1. **The key is missing in the current locale but present in the default one**, or in a parent locale, such as `pt` for `pt-BR` (see [Regional variants](translations.md#regional-variants)). You get that text. In the example above, a key only in `en` shows English to Portuguese readers. Nothing is logged, because this is normal while translators catch up; [a key check in your tests](translations.md#find-untranslated-keys) finds these.
2. **The key is missing everywhere.** `t()` returns the key, trimmed, such as `"home.subtitle"`, so the gap is visible on screen and easy to search for.

In the second case, the manager also logs a warning, such as `[I18n] Missing key "home.subtitle" in locale "pt".`. It warns once for each locale and key pair, so a key used on every render doesn't flood the console. It remembers the 1,000 most recent pairs, so a pair that drops off that list can warn again. A manager created with `isSilent: true` never logs it. To send misses to your own logger instead, pass `onMissingKey(key, locale)`: it replaces the warning and runs on every miss, not once per pair.

`t()` always returns a string, so you never need `?? ""` after it.

## Right-to-left languages

Arabic, Hebrew, Persian, and Urdu are written right to left. A page in one of them must say so with `<html dir="rtl">`, or the browser aligns the text to the wrong side and puts punctuation at the wrong end of the sentence. The manager knows the direction of its active locale as `i18n.direction`, which is `"ltr"` or `"rtl"`:

```ts
await i18n.init({ locale: "ar" });
i18n.direction; // "rtl"
```

The browser binding writes it to `<html dir>` for you. On a server, write it into the page yourself, as in [Render on a server](server-rendering.md#one-manager-per-request).

### How the default decides

A locale is `rtl` when the script it is written in runs right to left. The script is the locale's script subtag when it has one, such as `Arab` in `uz-Arab`. Otherwise it is the script the language is most likely written in, which `Intl.Locale`'s `maximize()` works out from the language and the region:

| Locale                 | Direction | Why                                                           |
| ---------------------- | --------- | ------------------------------------------------------------- |
| `ar`, `he`, `fa`, `ur` | `rtl`     | Arabic and Hebrew scripts.                                    |
| `uz-Arab`              | `rtl`     | The script subtag says Arabic.                                |
| `pa`                   | `ltr`     | Punjabi is most likely written in Gurmukhi.                   |
| `pa-PK`                | `rtl`     | In Pakistan, Punjabi is most likely written in Arabic script. |
| `sd-IN`                | `ltr`     | In India, Sindhi is most likely written in Devanagari.        |
| `en`, `pt-BR`          | `ltr`     | Latin script.                                                 |

The region is why a plain list of languages would get this wrong: `pa` and `pa-PK` are the same language in two scripts. For a tag `Intl.Locale` can't read, a fixed list of right-to-left languages, such as `ar` and `he`, decides instead.

The likely-script data comes with the JavaScript engine, and for rare tags it can differ between engine versions. When a tag is ambiguous, the tag is usually the better fix: `sd-Arab-IN` says Arabic script outright, and the default reads it as `rtl`.

### Set the direction yourself

Pass `getLocaleDirection` to decide for every locale. It replaces the default entirely, so it must answer for all of them:

```ts
export const i18n = createI18n({
  locales: ["en", "ar"] as const,
  defaultLocale: "en",
  loadLocale: (locale) => dictionaries[locale],
  getLocaleDirection: (locale) => (locale === "ar" ? "rtl" : "ltr"),
});
```

The manager calls it for the default locale when it is created, and for each locale it starts or switches to. Two ways it can fail:

- **It returns something other than `"ltr"` or `"rtl"`.** That throws `TypeError: [I18n] Invalid direction for locale "ar".`: from `createI18n()` when the answer for the default locale is wrong, or from the `init()` or `setLocale()` that asked, which leaves the manager in its current language. Return exactly one of the two strings.
- **It throws.** Your error is not wrapped or swallowed: it comes out of `createI18n()`, `init()`, or `setLocale()` unchanged, and a failed switch again leaves the current language in place.

## Keep track of the manager

The manager has a few properties you can read at any time:

- `i18n.locale` is the active locale. Before `init()` has finished, it is the default locale.
- `i18n.isReady` is `false` until the first `init()` succeeds, then `true`. While it is `false`, `t()` throws.
- `i18n.direction` is the active locale's direction, as above.
- `i18n.locales`, `i18n.defaultLocale`, and `i18n.isSilent` are what you configured. `locales` is a frozen copy.

### React to changes

`subscribe(listener)` calls `listener`, without arguments, after every applied `init()` and every applied locale change, and returns a function that stops it. "Applied" is doing real work in that sentence: a `setLocale()` to the locale already active changes nothing, and neither does a call that a later one overtook (next section), so neither calls the listener. Calling `init()` again with the same locale does apply, and does call it.

For code that needs to know what changed, the manager is also an `EventTarget` with two events:

- `ready`, after every applied `init()`. `event.detail.locale` is the locale it started with.
- `locale-change`, after every applied locale change. `event.detail.locale` is the new locale and `event.detail.previousLocale` the one before it.

```ts
i18n.addEventListener("locale-change", (event) => {
  console.info(`Language changed from ${event.detail.previousLocale} to ${event.detail.locale}`);
});
```

Listeners run in the order they were added. An exception in a listener or a `subscribe()` function is reported as for any `EventTarget`: in a browser, as an uncaught error that neither stops the other listeners nor undoes the change; in Node.js, it crashes the process, which [Render on a server](server-rendering.md#keep-production-logs-useful) comes back to.

### The latest call wins

Loading takes time, and people click faster than networks answer. When `init()` or `setLocale()` calls overlap, the one started last decides the language. An earlier call that finishes loading after a later one has started resolves without applying anything: no locale change, no event, no `subscribe()` call.

Say a visitor reading in Spanish clicks "Português" in your language picker, then "English" before Portuguese has loaded:

```ts
const portuguese = i18n.setLocale("pt"); // first click
const english = i18n.setLocale("en"); // second click
await Promise.all([portuguese, english]);
i18n.locale; // "en": the Portuguese call resolved, but changed nothing
```

So after `await i18n.setLocale("pt")`, don't assume the locale is `pt`; read `i18n.locale` when the outcome matters. A later `setLocale()` to the locale already active counts as a later call too: it cancels a pending switch, and the visitor stays where they are. A call that fails rejects and leaves the current language as it was.

### Turn outside input into a locale

`init()` and `setLocale()` throw a `RangeError` for a locale that isn't in `locales`. A locale from a cookie, a query string, or a request header is untrusted text, so turn it into a configured locale first. Two methods do that, for two kinds of input.

**`resolveLocale(value)`** is for a value that should already be one of your locales, such as a `?lang=` parameter or a cookie your app wrote. It accepts exact matches only, ignoring letter case and surrounding spaces, and returns your spelling of the locale, or `undefined`:

```ts
const lang = new URL(location.href).searchParams.get("lang") ?? "";
await i18n.init({ locale: i18n.resolveLocale(lang) ?? i18n.defaultLocale });
// ?lang=PT-br starts in "pt-BR"; ?lang=fr, or no lang, starts in the default.
```

**`matchLocale(preferences)`** is for a visitor's language preferences, such as `navigator.languages` or the languages of an `Accept-Language` header, most preferred first. It finds the closest locale you support. Each preference is tried in order, and the first one that matches anything wins:

1. An exact match, ignoring case: `pt-BR` gets `pt-BR`.
2. The longest configured locale the preference starts with, as whole subtags, written in the same script: `pt-BR` gets `pt`.
3. A match through likely subtags: `zh-TW`, Traditional Chinese, gets `zh-Hant`.
4. The same language in the same script: `pt-PT` gets `pt-BR` when that is your only Portuguese.

Norwegian has two codes for Bokmål, `no` and `nb`, and browsers send either, so they count as one language: a site configured with `no` serves a visitor who sends `nb`, and the other way round. Nynorsk, `nn`, is its own written standard and never matches them.

A locale in another script never matches, because a page in a script the visitor doesn't read serves them worse than their next language. With `zh`, which is Simplified Chinese, a `zh-TW` visitor who also lists English gets English, and one who lists nothing else gets `undefined`. A configured locale that `Intl.Locale` rejects, such as one with a private-use subtag over eight characters, has no likely script, so it matches by language, and by the script it names when it names one.

It returns `undefined` when nothing matches, skips blank and malformed entries, and throws a `TypeError` when `preferences` isn't an array.

When several of your locales share a language and script, and none matches a preference exactly or by its likely region, the first one in `locales` wins. So order `locales` by which one should serve everyone else. To serve a visitor from Mexico, `es-MX`, from your Latin American Spanish, list `es-419` before `es-ES`:

```ts
const i18n = createI18n({
  locales: ["en", "es-419", "es-ES"] as const,
  defaultLocale: "en",
  loadLocale: (locale) => dictionaries[locale],
});

i18n.matchLocale(["es-MX"]); // "es-419", because it is listed first
i18n.matchLocale(["es"]); // "es-ES", since Spanish without a region most likely means Spain
```

## What this package does not do

It translates, formats, and picks locales. A few things are deliberately left out:

- **HTML in translations.** `t()` returns plain text, and `data-i18n` sets plain text, so `"<strong>Hi</strong>"` shows its tags rather than bold text. Keep markup in your templates or components, and put only words in the dictionary, with [placeholders](translations.md#put-values-into-text) for values.
- **Number skeletons and currency in messages.** ICU skeletons such as `{price, number, ::currency/EUR}`, and the `currency` style, `{price, number, currency}`, are not supported: a message can't know which currency a price is in. Format the amount in code with `i18n.formatNumber(9.99, { style: "currency", currency: "EUR" })` and pass the string. A message that uses one is invalid syntax and shows as written; see [Format numbers and dates in the text](translations.md#format-numbers-and-dates-in-the-text) for what is supported.
- **Loading translations.** The package calls your loader; where the files live, how they are fetched, cached, or retried, is yours.
- **Routes, redirects, and navigation.** Locale routing reads and builds paths, but your framework or server still registers routes, redirects, and navigates.

## Where to go next

Read these in order to learn the package end to end, or jump to the one you need:

1. [Write your translations](translations.md): dictionaries, JSON files, placeholders, ICU messages, plurals, formatters, typed keys and values, checking for untranslated keys, and size limits.
2. [Translate a browser app](browser.md): detect and remember the visitor's language, keep `lang` and `dir` in step, re-render a framework, and translate HTML with `data-i18n`.
3. [Render on a server or at build time](server-rendering.md): one manager per request, choosing a locale from `Accept-Language`, time zones, quiet logs, and static site builds.
4. [Localized URLs](localized-urls.md): put the locale in the path, translate the path itself, link to other languages, generate every localized page, and detect the language on a static site.
5. [Troubleshooting](troubleshooting.md): what each error and warning means, and how to fix it.

Two more pages are for looking things up rather than reading through: the [API reference](reference/index.md) lists every export, option, and type, and the [changelog](changelog/index.md) says what changed in each version and how to upgrade.
