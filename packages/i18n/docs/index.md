---
title: Overview
description: What @codenhub/i18n does, the four ideas behind it, and a five-minute walkthrough.
---

# Translate your app

`@codenhub/i18n` turns keys such as `"home.title"` into text in the reader's language. You write your translations as plain objects or JSON files, one per language, and the package handles the rest: it loads the right one, falls back to your main language when a translation is missing, fills in values like names and counts, and tells TypeScript which keys exist, so a typo fails to compile.

It works the same in a browser, a Web Worker, a Node.js server, or a static site build. Two optional extras handle the jobs that differ by environment:

- **`@codenhub/i18n/browser`** picks the visitor's language, remembers their choice, and keeps the page's `lang` and `dir` attributes in step.
- **`@codenhub/i18n/routing`** puts the language in the URL, as in `/pt/about`.

## Four ideas

You only need four ideas to use this package.

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

`setLocale()` loads the new dictionary first and only switches once it has loaded, so text never shows half in one language and half in another. To redraw your interface when the language changes, pass a function to `i18n.subscribe()`; it runs after every switch.

## What happens when a translation is missing

Translations rarely stay complete. A new feature adds keys in English first, and the other languages catch up later. The package handles this in two steps:

1. **The key is missing in the current locale but present in the default one.** You get the default text. In the example above, a key only in `en` shows English to Portuguese readers. Nothing is logged, because this is normal while translators catch up; [a key check in your tests](translations.md#find-untranslated-keys) finds these.
2. **The key is missing everywhere.** `t()` returns the key itself, such as `"home.subtitle"`, so the gap is visible on screen and easy to search for, and the manager logs a warning once. You can send these to your own logger with the `onMissingKey` option.

`t()` always returns a string, so you never need `?? ""` after it.

## Where to go next

- [Write your translations](translations.md): dictionaries, JSON files, placeholders, plurals, typed keys, and checking for untranslated keys.
- [Translate a browser app](browser.md): detect and remember the visitor's language, translate HTML with `data-i18n`, and re-render a framework.
- [Render on a server or at build time](server-rendering.md): one manager per request, choosing a locale from `Accept-Language`, and static site builds.
- [Localized URLs](localized-urls.md): put the locale in the path, build links to other languages, and generate every localized page.
- [Troubleshooting](troubleshooting.md): what each error means and how to fix it.
- [API reference](reference/index.md): every export, option, and type.
- [Changelog](changelog/index.md): what changed in each version, and how to upgrade.

## What this package does not do

It translates and picks locales. It does not format numbers or dates (use the built-in `Intl.NumberFormat` and `Intl.DateTimeFormat` with `i18n.locale`), render HTML from translations, or support the full ICU message format. Locale routing reads and builds paths, but your framework or server still registers routes, redirects, and navigates.
