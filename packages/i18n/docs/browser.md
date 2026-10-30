---
title: Translate a browser app
description: Detect and remember the visitor's language, keep lang and dir in step, translate HTML, and re-render a framework.
order: 2
---

# Translate a browser app

In a browser, the manager from the [overview](index.md) still does the translating. `@codenhub/i18n/browser` adds the parts only a browser has: the visitor's language settings, a place to remember their choice, and the page itself.

## Start with `initializeBrowserI18n`

Use `initializeBrowserI18n()` instead of `i18n.init()`. It picks a locale, starts the manager with it, and then keeps the page in step:

```ts
// src/main.ts
import { initializeBrowserI18n } from "@codenhub/i18n/browser";
import { i18n } from "./i18n";

await initializeBrowserI18n({ i18n });
```

With no other options, this:

1. Picks the visitor's locale (see below) and loads it.
2. Sets `<html lang="pt" dir="ltr">` to match, so screen readers pronounce text correctly and right-to-left languages lay out correctly.
3. Saves the visitor's choice whenever your app changes the language with `setLocale()`, and reads it back on their next visit.

It returns a binding with a `disconnect()` method; you only need it when you tear the app down, as in tests or micro-frontends.

### How the locale is chosen

The first of these that gives a supported locale wins:

1. The `locale` option, when you pass one.
2. The visitor's saved choice from an earlier visit.
3. The browser's language settings, `navigator.languages`, matched to your locales. A visitor whose browser asks for `pt-BR` gets your `pt`.
4. Your default locale.

Pass `locale` when the page already knows its language, such as from the URL in [a localized site](localized-urls.md#read-the-locale-on-the-client). It then overrides everything else, so the browser can't disagree with the server about which language the page is in.

If the dictionary for a saved or detected locale fails to load, the visitor gets the default locale and a console warning instead of a broken app, and their saved choice is kept for next time. A failure to load a locale you passed explicitly, or the default locale, still rejects, since there is nothing sensible to fall back to.

## Let visitors switch languages

Call `setLocale()` from your language picker. The binding reacts to every change: it saves the choice and updates `lang` and `dir`.

```ts
const picker = document.querySelector<HTMLSelectElement>("#language")!;

picker.value = i18n.locale;
picker.addEventListener("change", async () => {
  await i18n.setLocale(picker.value as (typeof i18n.locales)[number]);
});
```

Only choices your app makes are saved. A language detected from the browser settings is not, so a visitor who never picked one keeps following their browser settings, including when you add their language later.

The choice is stored in `localStorage` as `{"locale":"pt"}` under the key `"i18n"`. Change the key with `storageKey`, or turn saving off with `persistLocale: false`. If storage is unavailable, as in some private browsing modes, the binding warns and carries on without it.

## Re-render a framework

Frameworks such as React, Vue, Svelte, or Solid render the text themselves by calling `t()`. They need to know when to render again, and `i18n.subscribe()` tells them: it calls your function after every language change and returns a function that stops it.

In React, `useSyncExternalStore` connects the two:

```tsx
import { useSyncExternalStore } from "react";
import { i18n, t } from "./i18n";

export function useLocale() {
  return useSyncExternalStore(i18n.subscribe, () => i18n.locale);
}

export function CartBadge({ count }: { count: number }) {
  useLocale(); // re-renders this component when the language changes
  return <span>{t("cart.items", { count })}</span>;
}
```

Other frameworks follow the same pattern: store `i18n.locale` in a reactive value and update it from `subscribe()`.

## Translate HTML without a framework

For static pages, or HTML your framework doesn't render, the binding can translate the page itself. Mark elements with the key, and pass the part of the page to translate as `root`:

```html
<h1 data-i18n="home.title">Welcome</h1>
<input data-i18n-placeholder="search.hint" placeholder="Search" />
<button data-i18n-aria-label="menu.open"><svg>…</svg></button>
```

```ts
await initializeBrowserI18n({ i18n, root: document });
```

- `data-i18n` replaces an element's text. The element must contain only text, with no child elements, so a translation can never remove your markup. Elements with children are skipped with a warning.
- `data-i18n-<attribute>` translates one attribute. Only attributes that hold text for people or screen readers are allowed: `alt`, `title`, `placeholder`, `label`, `aria-label`, `aria-description`, `aria-placeholder`, `aria-roledescription`, and `aria-valuetext`. Others, such as `data-i18n-href` or `data-i18n-onclick`, are ignored, so a translation can never change a link, a style, or an event handler.
- The text already in the HTML is the fallback. If a later language lacks the key, the original text comes back.
- Text is set as plain text, never as HTML, and `<script>`, `<style>`, `<noscript>`, and `<template>` are never touched.
- Placeholders such as `{name}` are not filled here, because there is nowhere in the HTML to pass a value from. Render text with values from your code with `t()`.

The page is retranslated on every language change. To also translate elements your code adds later, turn on `observe`:

```ts
await initializeBrowserI18n({ i18n, root: document.querySelector("#app")!, observe: true });
```

With `observe`, adding an element, or changing or removing a `data-i18n` key, is handled as it happens. Leave `observe` off when a framework renders the page: the framework already calls `t()`, and watching the page would only duplicate its work.

The binding does not look inside custom elements (tags with a dash, such as `<my-widget>`) from an outer root, since the component owns its content. To translate a component's content, pass the component, or its shadow root, as the `root` of its own binding.

## Options

| Option          | Default    | What it does                                                   |
| --------------- | ---------- | -------------------------------------------------------------- |
| `i18n`          | (required) | The manager to start.                                          |
| `locale`        | none       | A locale that overrides saved and detected ones.               |
| `persistLocale` | `true`     | Read the saved choice, and save choices your app makes.        |
| `storageKey`    | `"i18n"`   | The `localStorage` key for the saved choice.                   |
| `syncDocument`  | `true`     | Keep `<html lang>` and `dir` in step with the locale.          |
| `root`          | none       | The part of the page to translate with `data-i18n` attributes. |
| `observe`       | `false`    | Also translate changes below `root` as they happen.            |

## Rules to know

- **One binding per manager.** A second `initializeBrowserI18n()` call for the same manager rejects until the first is disconnected.
- **Don't mix it with `init()`.** The binding starts the manager. If your code calls `i18n.init()` while the binding is starting, the binding rejects rather than fight over the language. Calling `init()` or `setLocale()` after it has started is fine.
- **`disconnect()` stops reacting but undoes nothing.** It stops saving, syncing, and translating, but leaves the current text, attributes, and saved choice as they are. You can then start a new binding.

The [browser reference](reference/browser.md) documents every option and failure.
