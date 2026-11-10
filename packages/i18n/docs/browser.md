---
title: Translate a browser app
description: Detect and remember the visitor's language, keep lang and dir in step, re-render a framework, translate HTML, and run in a Web Worker.
order: 2
---

# Translate a browser app

In a browser, the manager from the [overview](index.md) still does the translating. `@codenhub/i18n/browser` adds the parts only a browser has: the visitor's language settings, a place to remember their choice, and the page itself. This page sets those up for the `en` and `pt` app from the overview.

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
2. Sets `<html lang="pt" dir="ltr">` to match, so screen readers pronounce text correctly and [right-to-left languages](index.md#right-to-left-languages) lay out correctly.
3. Saves the language your app chooses, and reads it back on the visitor's next visit.

It returns a binding with a `disconnect()` method; you only need it when you tear the app down, as in tests or micro-frontends.

### How the locale is chosen

The first of these that gives a supported locale wins:

1. The `locale` option, when you pass one. It counts as your app's choice, so it is also saved, unless `persistLocale` is `false`.
2. The visitor's saved choice from an earlier visit.
3. The browser's language settings, `navigator.languages`, matched to your locales with [`matchLocale()`](index.md#turn-outside-input-into-a-locale). A visitor whose browser asks for `pt-BR` gets your `pt`.
4. Your default locale.

Pass `locale` when the page already knows its language, such as from the URL in [a localized site](localized-urls.md#read-the-locale-on-the-client). It then overrides everything else, so the browser can't disagree with the server about which language the page is in.

On a localized site, that means every page view saves the language in its URL. Usually that is what you want: the saved language is the one the visitor last read, which is what [the static-site redirect](localized-urls.md#detect-the-language-on-a-static-site) relies on. It also means a visitor who follows one shared Portuguese link has Portuguese saved from then on, until they read a page in another language, even if their browser asks for English. If you would rather save only what the visitor picks in your language picker, turn saving off with `persistLocale: false` and store the picker's choice yourself. That option also stops the binding from reading the saved choice, so read your own back and pass it as `locale`.

If your loader fails for a saved or detected locale, the visitor gets the default locale and a console warning instead of a broken app, and their saved choice is kept for next time. A loader failure for a locale you passed explicitly, or for the default locale, still rejects, since there is nothing sensible to fall back to. So does a dictionary that loads but [breaks the rules](troubleshooting.md#a-dictionary-is-rejected), whatever the locale: that is a bug to fix, not a network hiccup to ride out.

## Let visitors switch languages

Call `setLocale()` from your language picker. The binding reacts to every change that is applied: it saves the choice and updates `lang` and `dir`.

```ts
const picker = document.querySelector<HTMLSelectElement>("#language")!;

picker.value = i18n.locale;
picker.addEventListener("change", async () => {
  await i18n.setLocale(picker.value as (typeof i18n.locales)[number]);
});
```

A visitor who changes their mind quickly is handled for you: when two switches overlap, the later one wins, and the earlier one resolves without changing anything, as [The latest call wins](index.md#the-latest-call-wins) explains. So read `i18n.locale` after the `await` rather than assuming the picker's value.

Only choices your app makes are saved: the `locale` option, and every applied `setLocale()` or `init()` after the binding has started. A language detected from the browser settings is not, and neither is the default locale the binding fell back to. A visitor who never picked one keeps following their browser settings, including when you add their language later.

The choice is stored in `localStorage` as `{"locale":"pt"}` under the key `"i18n"`. Change the key with `storageKey`, or turn saving off with `persistLocale: false`. If storage is unavailable, as in some private browsing modes, the binding warns and carries on without it.

## Re-render a framework

Frameworks such as React, Vue, Svelte, or Solid render the text themselves by calling `t()`. They need to know when to render again, and `i18n.subscribe()` tells them: it calls your function after every applied `init()` and every applied language change, and returns a function that stops it. A `setLocale()` to the language already showing, or one overtaken by a later call, changes nothing and calls nothing.

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

### Form controls

Two form elements need care, because their text is also what the form sends:

- **Give every translated `<option>` a `value`.** An option without one submits its text, so `<option data-i18n="plan.basic">Basic</option>` submits `Básico` once the page is in Portuguese, and your server receives a word it has never heard of. Write `<option value="basic" data-i18n="plan.basic">Basic</option>`, and the form sends `basic` in every language.
- **Use `<button>` for a translated submit button.** The label of `<input type="submit" value="Send">` is its `value`, and `value` is not an attribute the binding translates, since it is also data the form sends. `<button type="submit" data-i18n="form.send">Send</button>` translates like any other text.

### Watch for changes

The page is retranslated on every language change. To also translate elements your code adds later, turn on `observe`:

```ts
await initializeBrowserI18n({ i18n, root: document.querySelector("#app")!, observe: true });
```

With `observe`, adding an element, or changing or removing a `data-i18n` key, is handled as it happens. That includes elements other code adds while the binding is translating, such as a custom element that renders children when its attribute changes. The binding handles those once per pass: if that code changes a key again in response, as an element that keeps resetting its own `data-i18n-*` attribute would, the second change waits for the next locale change instead of starting an endless loop. An element that is added and then moved out of `root` before the binding gets to it is not translated: by then it belongs to another part of the page.

Leave `observe` off when a framework renders the page: the framework already calls `t()`, and watching the page would only duplicate its work.

The binding does not look inside custom elements (tags with a dash, such as `<my-widget>`), with or without a shadow root, and doesn't warn when it skips one. A component has a life of its own: it can render after the page was translated, and it adds and removes text as people use it, which it has to translate itself anyway. So the component translates its own content: call `i18n.t()` when it renders, and render again from `i18n.subscribe()`:

```ts
class ProductCard extends HTMLElement {
  #unsubscribe?: () => void;

  connectedCallback() {
    this.render();
    this.#unsubscribe = i18n.subscribe(() => this.render());
  }

  disconnectedCallback() {
    this.#unsubscribe?.();
  }

  render() {
    this.querySelector("button")!.textContent = i18n.t("cart.add");
  }
}
```

That includes a custom element used only as a wrapper, whose children you wrote in the page, such as `<site-nav><a data-i18n="nav.home">Home</a></site-nav>`: those links are skipped too. Use a plain element, such as `<nav>`, for a wrapper whose text the page translates. A component can't have a binding of its own on the same manager, since a manager has one binding.

## In a Web Worker

A Web Worker has no page, so there is no `<html>` to set `lang` on and nothing to translate. The core manager and `@codenhub/i18n/routing` work there as they do anywhere. The browser binding can still pick and save the locale, if you turn off the parts that need a page:

```ts
// worker.ts
await initializeBrowserI18n({ i18n, syncDocument: false });
```

Pass `syncDocument: false` and no `root`. With the default `syncDocument: true` and no `document`, `initializeBrowserI18n()` throws `TypeError: [I18n] Document synchronization requires a page document; pass syncDocument: false without one.` before it starts the manager, so the manager is left not started rather than half bound. A worker has no `localStorage` either, so saving warns and is skipped; add `persistLocale: false` to start quietly.

## Options

| Option          | Default    | What it does                                                                                                 |
| --------------- | ---------- | ------------------------------------------------------------------------------------------------------------ |
| `i18n`          | (required) | The manager to start.                                                                                        |
| `locale`        | none       | A locale that overrides saved and detected ones. It is saved too while `persistLocale` is on.                |
| `persistLocale` | `true`     | Read the saved choice, and save the `locale` option and every language change your app makes after start.    |
| `storageKey`    | `"i18n"`   | The `localStorage` key for the saved choice.                                                                 |
| `syncDocument`  | `true`     | Keep `<html lang>` and `dir` in step with the locale. Needs a page `document`; pass `false` in a Web Worker. |
| `root`          | none       | The part of the page to translate with `data-i18n` attributes.                                               |
| `observe`       | `false`    | Also translate changes below `root` as they happen. Needs `root`.                                            |

## Rules to know

- **One binding per manager.** A second `initializeBrowserI18n()` call for the same manager rejects until the first is disconnected.
- **Let the binding start the manager.** If your code calls `i18n.init()` before the binding's locale is active, or calls `i18n.setLocale()` then on a manager that was already initialized, even to the locale already showing, the binding's promise rejects with `Error: [I18n] Browser initialization was superseded before its locale became active.`. The manager keeps the later call's result, under [the latest-call rule](index.md#the-latest-call-wins), and the binding is not connected. On a manager that was not initialized yet, `setLocale()` just fails with its own error and the binding carries on. Calling `init()` or `setLocale()` after the binding's promise has resolved is fine.
- **`disconnect()` stops reacting but undoes nothing.** It stops saving, syncing, and translating, but leaves the current text, attributes, and saved choice as they are. You can then start a new binding.

The [browser reference](reference/browser.md) documents every option and failure, and [Troubleshooting](troubleshooting.md#the-browser-binding-warns-or-rejects) lists each warning the binding logs.

## Next

A browser app that is also rendered on a server, or built ahead of time, has a second half: [Render on a server or at build time](server-rendering.md) covers it, including how to hand the server's locale to the browser. If your app only ever runs in the browser and puts the language in its URLs, go straight to [Localized URLs](localized-urls.md).
