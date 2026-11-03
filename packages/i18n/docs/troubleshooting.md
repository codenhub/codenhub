---
title: Troubleshooting
description: What each error and warning means, and how to fix it.
order: 5
---

# Troubleshooting

Each section starts from what you see, then explains the cause and the fix.

## A key shows on screen instead of text

You see `home.subtitle` where text should be, and the console says the key is missing.

Neither the current language nor the default language has that key. Check for a typo in the key or the dictionary, and that the dictionary file you edited is the one your loader returns. A plural group shows its key when `count` is missing or isn't a number: `t("cart.items")` or `t("cart.items", { count: "2" })`. Pass a number.

If TypeScript didn't catch the typo, your loader's return type is `any` or `unknown`. See [Typed keys](translations.md#typed-keys).

## Text shows in the default language

The current language lacks the key, so the default language's text is shown. This is the intended fallback and logs nothing. [Find untranslated keys](translations.md#find-untranslated-keys) lists every gap.

## `t()` throws "requires successful initialization"

`t()` and `setLocale()` throw an `Error` until the manager has started, because there is no dictionary to use yet. Wait for `i18n.init()`, or `initializeBrowserI18n()` in a browser, before rendering. In a framework, render a loading state until the promise resolves, or start rendering after it.

## A locale is rejected with `RangeError`

`init()`, `setLocale()`, and `loadLocale()` throw a `RangeError` for a locale that isn't in `locales`. Matching ignores case and surrounding spaces, so `"PT"` finds `pt`, but `pt-BR` does not find `pt`. To find the closest supported locale for a visitor's language, use `matchLocale()`, which does map `pt-BR` to `pt`.

## Loading a locale fails with `I18nError`

Your loader threw or rejected, and the manager wrapped the failure in an `I18nError`:

- `error.code` is `"i18n.locale_load_failed"`.
- `error.locale` is the locale that failed.
- `error.cause` is what your loader threw, such as a network error.

The manager keeps its current language, and the next call tries the loader again, so a retry button can just call `setLocale()` again. In a browser, a saved or detected locale that fails falls back to the default; see [How the locale is chosen](browser.md#how-the-locale-is-chosen).

To show these errors with `@codenhub/error`, register `i18nErrors`, which gives the code a safe message for users.

## A dictionary is rejected

`init()`, `setLocale()`, or `loadLocale()` throws a `TypeError` naming the problem when a dictionary doesn't fit the rules. These failures are not wrapped in `I18nError`, because they come from the dictionary's content rather than from loading it.

A dictionary must be a plain object, such as an object literal or parsed JSON, and:

- **Every value is a string or a group.** Numbers, booleans, `null`, arrays, functions, and objects such as `Date` or `Map` are rejected. Write numbers as text, and put lists under numbered or named keys.
- **Keys are well formed.** No empty segment, as in `"nav..home"` or a trailing dot; no control characters; no `__proto__` segment. A full key, with its dots, has at most 1,000 characters.
- **Two spellings never meet.** `{ "nav.home": "A", nav: { home: "B" } }` is rejected, because both are `nav.home`.
- **Each group appears once.** The same object used under two keys, or containing itself, is rejected. Copy it instead.
- **No getters or symbol keys.** Data from JSON never has these.
- **It fits the size limits.** See [Size limits](translations.md#size-limits) to raise them.

An empty dictionary is accepted.

## `createI18n()` throws `TypeError`

The configuration is invalid. Check that:

- `locales` is a non-empty list with no duplicates, ignoring case, and each locale is ASCII letters and digits separated by hyphens, such as `pt-BR`.
- `defaultLocale` is one of `locales`.
- `loadLocale` is a function.
- The configuration is a plain object. A class instance, or an object that inherits its options, is rejected so that inherited values can't slip in.

`createLocaleRouting()` follows the same rules, and `localePrefix` must be `"always"`, `"except-default"`, or `"when-ambiguous"`. A problem in `pathnames` names its entry, such as `pathnames["/about"].pt`; [Mistakes it catches](localized-urls.md#mistakes-it-catches) explains each one and its fix.

## TypeScript says `string` is not assignable to the locale type

```text
Type 'string' is not assignable to type '"en" | "pt"'.
```

The default locale lost its exact type, usually because the configuration lives in a separate variable. Mark it `as const`, as in [Typed keys](translations.md#typed-keys). Locales are taken from `locales` only, so a plain `string` default can't widen them.

The same goes for `localePrefix` in a routing configuration kept in a variable, where the message names `"always" | "except-default" | "when-ambiguous"`: write `localePrefix: "except-default" as const`.

## A routing method throws `TypeError`

The path is not an absolute path or contains something routing refuses, such as `?`, `#`, `//`, or a dot segment. Pass `url.pathname` rather than the full URL. [Paths it accepts](localized-urls.md#paths-it-accepts) has the full list.

## `localize()` throws `RangeError`: "would be read as"

The path `localize()` would build opens a different page, or the same page in another language. There are two usual causes:

- **You passed a URL, not a canonical path.** `localize("/sobre", "en")` takes `/sobre` as the canonical path of an English page. If `/sobre` is the Portuguese about page's URL, read it first: `localize(routing.parse("/sobre").pathname, "en")`.
- **A page the table doesn't list has another page's translated path.** With `localePrefix: "when-ambiguous"`, an English page at `/sobre` clashes with a Portuguese `/sobre`. Rename one of them, list the page in `pathnames`, or keep the prefix with `"except-default"`. [The risk you take on](localized-urls.md#the-risk-you-take-on) explains why routing can't catch this sooner.

## The browser binding warns or rejects

- **"The manager already has a browser binding"**: you called `initializeBrowserI18n()` twice for the same manager. Call `disconnect()` on the first binding, or keep one.
- **"Browser initialization was superseded"**: your code called `i18n.init()` while the binding was starting the manager. Let the binding start the manager.
- **"Browser observation requires a root"**: `observe: true` needs a `root` to watch.
- **Storage warning**: `localStorage` is unavailable, as in some private browsing modes. The visitor's choice is not saved; everything else works.
- **An element with `data-i18n` is skipped**: the element has child elements. Put the key on an element that contains only text, or translate it with `t()`.
- **"Skipping translation on <style> because the element can activate or hide translated content"**: a `data-i18n` key is on a `<script>`, `<style>`, `<noscript>`, or `<template>` element, whose text runs as code or decides what shows. Move the key to an ordinary element.
- **`data-i18n` text shows `{name}`**: HTML translation can't fill placeholders. Render that text with `t()` and pass the values.
- **A `data-i18n-href` attribute does nothing**: only text attributes can be translated. See [Translate HTML without a framework](browser.md#translate-html-without-a-framework).
