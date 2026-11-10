---
title: Troubleshooting
description: What each error and warning means, and how to fix it.
order: 5
---

# Troubleshooting

Something went sideways. Each section starts from what you see on screen or in the console, then gives the cause and the fix, so you can jump straight to your symptom.

Every message the package writes starts with `[I18n]`, which makes it easy to find in a console full of other people's warnings.

## A key shows on screen instead of text

You see `home.subtitle` where text should be, and the console says `[I18n] Missing key "home.subtitle" in locale "pt".`

Neither the current language nor the default language has that key. Check for a typo in the key or the dictionary, and that the dictionary file you edited is the one your loader returns. A plural group shows its key when `count` is missing or isn't a number: `t("cart.items")` or `t("cart.items", { count: "2" })`. Pass a number.

The warning appears once per locale and key, so a key missing on every render doesn't drown the console, and never when `isSilent` is `true`. An `onMissingKey` callback replaces it and runs on every miss.

If TypeScript didn't catch the typo, your loader's return type is `any` or `unknown`. See [Typed keys](translations.md#typed-keys).

## Text shows in the default language

The current language lacks the key, so the default language's text is shown. This is the intended fallback and logs nothing. [Find untranslated keys](translations.md#find-untranslated-keys) lists every gap.

## `t()` throws "requires successful initialization"

`t()`, `has()`, and `setLocale()` throw an `Error` such as `[I18n] setLocale() requires successful initialization.` until the manager has started, because there is no dictionary to use yet. Wait for `i18n.init()`, or `initializeBrowserI18n()` in a browser, before rendering. In a framework, render a loading state until the promise resolves, or start rendering after it.

## A locale is rejected with `RangeError`

`init()`, `setLocale()`, and `loadLocale()` throw a `RangeError` for a locale that isn't in `locales`. Matching ignores case and surrounding spaces, so `"PT"` finds `pt`, but `pt-BR` does not find `pt`. To find the closest supported locale for a visitor's language, use [`matchLocale()`](index.md#turn-outside-input-into-a-locale), which does map `pt-BR` to `pt`.

## Loading a locale fails with `I18nError`

Your loader threw or rejected, and the manager wrapped the failure in an `I18nError` with the message `Failed to load translations for locale "pt".`:

- `error.code` is `"i18n.locale_load_failed"`.
- `error.locale` is the locale that failed.
- `error.cause` is what your loader threw, such as a network error or a timeout.

The manager keeps its current language, and the next call tries the loader again, so a retry button can just call `setLocale()` again. In a browser, a saved or detected locale that fails falls back to the default; see [How the locale is chosen](browser.md#how-the-locale-is-chosen).

### Show it to the visitor

`I18nError.message` is for your logs, not for people. The package exports `i18nErrors`, a safe message for the code, in the format `@codenhub/error` reads. `@codenhub/error` is a separate package; install it with `pnpm add @codenhub/error`. Register the messages once, when the app starts, then turn whatever you catch into something you can show:

```ts
import { createAppError, getErrorRegistry } from "@codenhub/error";
import { i18nErrors } from "@codenhub/i18n";

getErrorRegistry().codes.addList(Object.entries(i18nErrors));

try {
  await i18n.setLocale("pt");
} catch (caught) {
  const error = createAppError(caught);

  showToast(error.message); // "We couldn't load the text for this language. Try again."
}
```

`error.messageKey` is `"error.i18n.loader.localeLoadFailed"`, if you would rather show the message in the visitor's language from your own dictionary. Just keep that text in a locale that is already loaded: the one that failed is, by definition, not available.

### It never fails, it just hangs

A loader that never settles, such as a `fetch()` to a server that stopped answering, leaves the switch waiting forever. The manager calls the loader once and every later call for that locale waits on the same promise, so retrying doesn't help either. Give the request a deadline, as in [Keep dictionaries in JSON files](translations.md#keep-dictionaries-in-json-files): with `AbortSignal.timeout()`, the timeout rejects, the manager reports an `I18nError`, and the next call tries again.

## A dictionary is rejected

`init()`, `setLocale()`, or `loadLocale()` throws a `TypeError` naming the problem, the key, and the locale when a dictionary doesn't fit the rules. These failures are not wrapped in `I18nError`, because they come from the dictionary's content rather than from loading it, and retrying won't change the content.

A dictionary must be a plain object, such as an object literal or parsed JSON. Anything else, including `null`, an array, or a class instance, gives `[I18n] A locale dictionary must be a non-null object in locale "pt".`. Within it:

- **Every value is a string or a group.** `{ count: 3 }` gives `[I18n] Locale dictionary value at "count" must be a string in locale "pt".`. Numbers, booleans, `null`, arrays, functions, and objects such as `Date` or `Map` are all rejected. Write numbers as text, `"3"`, and put lists under numbered or named keys.
- **No key segment is empty.** `"nav..home"`, `"nav."`, and `".nav"` are rejected, as in `[I18n] Invalid locale dictionary key "nav..home" in locale "pt".`. Remove the extra dot.
- **No segment starts or ends with a space.** `{ " title": "Título" }` gives `[I18n] Invalid locale dictionary key " title" in locale "pt".`, and so does `"nav. home"`. A stray space is almost always a typo that would make the key impossible to find. Spaces inside a segment, as in `"sign in"`, are fine.
- **No control characters.** A key such as `"a\nb"` is rejected. Control characters usually come from a copy and paste; retype the key.
- **No `__proto__` segment.** `"nav.__proto__"` is rejected, since it could be used to tamper with objects. Pick another name.
- **A full key fits in 1,000 characters.** Longer ones give `[I18n] Locale dictionary flattened keys must not exceed 1000 characters in locale "pt".`. Shorten the key.
- **Two spellings never meet.** `{ "nav.home": "A", nav: { home: "B" } }` gives `[I18n] Locale dictionary key collision at "nav.home" in locale "pt".`, because both are `nav.home`. Keep one.
- **Each group appears once.** The same object used under two keys, or containing itself, gives `[I18n] A locale dictionary must not contain repeated objects in locale "pt".`. Copy the object instead.
- **No getters or symbol keys.** Data from JSON never has these; build the dictionary from plain values.
- **It fits the size limits.** A message names the limit it exceeded, such as `must not exceed 100 levels of nesting`. See [Size limits](translations.md#size-limits) to raise them.

An empty dictionary is accepted.

## `createI18n()` throws `TypeError`

The configuration is invalid. Most messages have the form `[I18n] Invalid configuration: <option>: <problem>`, so the option to fix is the first thing after the colon. Check that:

- `locales` is a non-empty list with no duplicates, ignoring case, and each locale is ASCII letters and digits separated by hyphens, such as `pt-BR`.
- `defaultLocale` is one of `locales`.
- `loadLocale` is a function.
- `timeZone`, when set, is one `Intl` knows. A typo gives `timeZone: Must be a time zone Intl supports, such as "America/Sao_Paulo" or "UTC"`.
- `dictionaryLimits` names only known limits, each a positive whole number. `maxKeys` gives `dictionaryLimits.maxKeys: Is not a recognized limit`, and `maxDepth: 0` gives `dictionaryLimits.maxDepth: Must be a positive whole number`. [Size limits](translations.md#size-limits) lists the names.
- `isSilent`, when set, is a boolean. `isSilent: "true"` gives `isSilent: Expected boolean, received string`.
- `getLocaleDirection` and `onMissingKey`, when set, are functions, or the message says `getLocaleDirection: Must be a function` or `onMissingKey: Must be a function`.
- The configuration is a plain object. A class instance, or an object that inherits its options, is rejected so that inherited values can't slip in.

`createI18n()` also asks `getLocaleDirection` for the default locale's direction. If it returns anything but `"ltr"` or `"rtl"`, you get `TypeError: [I18n] Invalid direction for locale "en".`; `init()` and `setLocale()` throw the same for the locale they switch to, and keep the current one. An exception your function throws comes through unchanged. See [Set the direction yourself](index.md#set-the-direction-yourself).

### `createLocaleRouting()` throws `TypeError`

Routing follows the same rules for `locales` and `defaultLocale`, with messages that start `[I18n] Invalid locale routing configuration:`. `localePrefix` is required, and must be `"always"`, `"except-default"`, or `"when-ambiguous"`; leaving it out gives `localePrefix: Expected "always", "except-default", or "when-ambiguous", received undefined`. A problem in `pathnames` names its entry, such as `pathnames["/about"].pt`; [Mistakes it catches](localized-urls.md#mistakes-it-catches) explains each one and its fix.

## TypeScript says `string` is not assignable to the locale type

```text
Type 'string' is not assignable to type '"en" | "pt"'.
```

The default locale lost its exact type, usually because the configuration lives in a separate variable. Mark it `as const`, as in [Typed keys](translations.md#typed-keys). Locales are taken from `locales` only, so a plain `string` default can't widen them.

The same goes for `localePrefix` in a routing configuration kept in a variable, where the message names `"always" | "except-default" | "when-ambiguous"`: write `localePrefix: "except-default" as const`.

## A message shows its raw text

You see `{count, plural, one {# item} other {# items}` or `{first-name}` on screen, and the console warns about an invalid message. The text isn't valid message syntax, so it is shown as written, with only its plain `{name}` placeholders filled, rather than half formatted. The warning appears once per text and locale.

Common causes:

- **A brace is missing or extra.** Count them; every `{` needs its `}`.
- **A placeholder name has other characters.** Names are ASCII letters, digits, and underscores, so `{first-name}` and `{nome_ç}` are shown as written. Use `{firstName}` or `{nome}`.
- **A format this package doesn't support**, such as `{n, number, currency}` or a `::` skeleton. Format the value with `formatNumber()` and pass the result as a plain placeholder.
- **Nesting deeper than 10 levels**, or the same `=1` option twice. Simplify the message.

[Put values into text](translations.md#put-values-into-text) has the syntax.

## A routing method throws `TypeError`

From `parse()`, the value is not a URL's pathname: it doesn't start with `/`, or it contains `?` or `#`. Pass `url.pathname` rather than the full URL or a path with its query string, such as Node's `request.url`. A path that is a pathname but contains something routing refuses, such as `//` or a dot segment, makes `parse()` return `undefined` instead, so a visitor's odd URL becomes a 404 rather than a crash.

From `localize()` or `localizeAll()`, the path is one of those, or contains something routing refuses. [Paths it accepts](localized-urls.md#paths-it-accepts) has the full list, with the fix for each.

## `localize()` throws `RangeError`: "would be read as"

The path `localize()` would build opens a different page, or the same page in another language. There are two usual causes:

- **You passed a URL, not a canonical path.** `localize("/sobre", "en")` takes `/sobre` as the canonical path of an English page. If `/sobre` is the Portuguese about page's URL, read it first: `localize(routing.parse("/sobre").pathname, "en")`.
- **A page the table doesn't list has another page's translated path.** With `"/contact": { es: "/about" }` and no `/about` entry, `localize("/about", "es")` throws `RangeError: [I18n] "/about" in "es" would be read as "/contact" in "es"; …`. With `localePrefix: "when-ambiguous"`, an English page at `/sobre` clashes with a Portuguese `/sobre` the same way. Rename one of them, list the page in `pathnames`, or keep the prefix with `"except-default"`. [The risk you take on](localized-urls.md#the-risk-you-take-on) explains why routing can't catch this sooner.

## `localize()` throws `RangeError`: "would be longer than 8,192 characters"

The path you passed is valid, but the locale prefix or the translated words make the result longer than `parse()` accepts. Shorten the path; a link that long is also likely to be cut off by servers and proxies long before anyone reads it.

## The browser binding warns or rejects

- **"Document synchronization requires a page document"**: `initializeBrowserI18n()` ran without a `document`, as in a Web Worker, and threw `TypeError: [I18n] Document synchronization requires a page document; pass syncDocument: false without one.` before starting the manager. Pass `syncDocument: false` and no `root`; see [In a Web Worker](browser.md#in-a-web-worker).
- **"The manager already has a browser binding"**: you called `initializeBrowserI18n()` twice for the same manager. Call `disconnect()` on the first binding, or keep one.
- **"Browser initialization was superseded before its locale became active"**: your code called `i18n.init()` while the binding was starting the manager, or `i18n.setLocale()` on a manager that was already initialized, even to the locale already showing. The manager keeps your call's result and the binding is not connected. Let the binding start the manager, and switch languages after its promise resolves.
- **"Browser observation requires a root"**: `observe: true` needs a `root` to watch.
- **"Could not read persisted locale" or "Could not persist locale"**: `localStorage` is unavailable, as in some private browsing modes or a Web Worker. The visitor's choice is not saved; everything else works. Pass `persistLocale: false` where there is no storage to start quietly.
- **`Could not load locale "pt"; using the default locale.`**: the loader failed for a saved or detected locale other than the default, so the visitor got the default instead. Fix the loader; the saved choice is kept for next time. If the default locale itself fails to load, there is nothing left to fall back to, and initialization rejects with `Failed to load translations for locale "en".`
- **"Skipping translation on <p> because translated elements must be leaves"**: the element with `data-i18n` has child elements. Put the key on an element that contains only text, or translate it with `t()`.
- **"Skipping translation on <style> because the element can activate or hide translated content"**: a `data-i18n` key is on a `<script>`, `<style>`, `<noscript>`, or `<template>` element, whose text runs as code or decides what shows. Move the key to an ordinary element.
- **"Skipping translation because data-i18n contains an invalid key"**, or the same for a `data-i18n-<attribute>`: the key is blank, longer than 1,000 characters, or contains an ASCII control character, so no dictionary can hold it. The element keeps its current text. Fix the key in the HTML.
- **`data-i18n` text shows `{name}`**: HTML translation can't fill placeholders. Render that text with `t()` and pass the values.
- **A `data-i18n-href` attribute does nothing**: only text attributes can be translated. See [Translate HTML without a framework](browser.md#translate-html-without-a-framework).

The browser warnings are silenced along with the rest when the manager has `isSilent: true`.

## Still stuck

The [reference](reference/index.md) documents every export, option, and the errors each one throws. If the behavior changed after an upgrade, the [changelog](changelog/index.md) says what changed and how to move to it.
