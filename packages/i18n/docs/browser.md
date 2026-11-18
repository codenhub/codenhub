---
title: Translate a browser app
description: Detect and remember the visitor's language, keep lang and dir in step, re-render a framework, translate HTML, and run in a Web Worker.
order: 2
---

# Translate a browser app

In a browser, the manager from the [overview](index.md) still does the translating. `@codenhub/i18n/browser` adds the parts only a browser has: the visitor's language settings, a place to remember their choice, and the page itself.

This page sets those up for the tea shop's `en` and `pt` app from the overview. By the end, the shop greets each visitor in their language, remembers it, has a language picker, and keeps the cart badge in step when the language changes.

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

It returns a binding. Keep it if your language picker has a "System" entry, as [Offer a "System" choice](#offer-a-system-choice) shows. Its `disconnect()` method is only needed when you tear the app down, as in tests or micro-frontends.

### How the locale is chosen

The first of these that gives a supported locale wins:

1. The `locale` option, when you pass one. It counts as your app's choice, so it is also saved, unless `persistLocale` is `false`.
2. The visitor's saved choice from an earlier visit. A saved locale you no longer configure, such as `pt-PT` after you keep only `pt-BR`, is matched like a browser preference, and the saved value stays as it was.
3. The browser's language settings, `navigator.languages`, matched to your locales with [`matchLocale()`](index.md#turn-outside-input-into-a-locale). A visitor whose browser asks for `pt-BR` gets your `pt`.
4. Your default locale.

Pass `locale` when the page already knows its language, such as from the URL in [a localized site](localized-urls.md#read-the-locale-on-the-client). It then overrides everything else, so the browser can't disagree with the server about which language the page is in.

On a localized site, that means every page view saves the language in its URL. Usually that is what you want: the saved language is the one the visitor last read, which is what [the static-site redirect](localized-urls.md#detect-the-language-on-a-static-site) relies on.

It also means a visitor who follows one shared Portuguese link to a tea has Portuguese saved from then on, until they read a page in another language, even if their browser asks for English. One link from a Brazilian friend, and the shop speaks Portuguese to them.

If you would rather save only what the visitor picks in your language picker, turn saving off with `persistLocale: false` and store the picker's choice yourself. That option also stops the binding from reading the saved choice, so read your own back and pass it as `locale`. If your picker also has [a "System" entry](#offer-a-system-choice), delete your stored choice when the visitor picks it, and start without `locale` while nothing is stored, so the binding detects again.

#### When a loader fails during start

If your loader fails for a saved locale, the binding warns and tries the locale it detects from the browser, then the default locale, so the visitor still gets a language they read instead of a broken app. A detected locale that fails falls back to the default the same way. The saved choice is kept for next time.

Two failures still reject:

- A loader failure for a locale you passed explicitly, or for the default locale, since there is nothing sensible to fall back to.
- A dictionary that loads but [breaks the rules](troubleshooting.md#a-dictionary-is-rejected), whatever the locale. That is a bug to fix, not a network hiccup to ride out.

## Let visitors switch languages

Call `setLocale()` from your language picker. The binding reacts to every change that is applied: it saves the choice and updates `lang` and `dir`.

```ts
const picker = document.querySelector<HTMLSelectElement>("#language")!;

picker.value = i18n.locale;
picker.addEventListener("change", async () => {
  await i18n.setLocale(picker.value as (typeof i18n.locales)[number]);
});
```

A visitor who changes their mind quickly is handled for you. When two switches overlap, the later one wins, and the earlier one resolves without changing anything, as [The latest call wins](index.md#the-latest-call-wins) explains. So read `i18n.locale` after the `await` rather than assuming the picker's value.

Only choices your app makes are saved: the `locale` option, and every applied `setLocale()` or `init()` after the binding has started. These are not saved:

- A language detected from the browser settings.
- The default locale the binding fell back to.

A visitor who never picked one keeps following their browser settings, including when you add their language later.

The choice is stored in `localStorage` as `{"locale":"pt"}` under the key `"i18n"`. Change the key with `storageKey`, or turn saving off with `persistLocale: false`. If storage is unavailable, as in some private browsing modes, the binding warns and carries on without it.

### Offer a "System" choice

Once a visitor picks a language, it sticks, which is the point. A "System" entry in the picker lets them undo that and go back to following their browser. Keep the binding that `initializeBrowserI18n()` returns; this replaces the start and the picker above:

```ts
const binding = await initializeBrowserI18n({ i18n });
const picker = document.querySelector<HTMLSelectElement>("#language")!;

picker.value = binding.followsSystem ? "system" : i18n.locale;
picker.addEventListener("change", async () => {
  try {
    if (picker.value === "system") {
      await binding.followSystem();
    } else {
      await i18n.setLocale(picker.value as (typeof i18n.locales)[number]);
    }
  } finally {
    // Show the visitor's choice, even when the switch failed or a later one overtook it.
    picker.value = binding.followsSystem ? "system" : i18n.locale;
  }
});
```

`followSystem()` forgets the saved choice and switches to the language the binding detects right now, from the browser settings, then the default locale. That language is not saved, so the next visit detects again. If storage can't be cleared, the binding warns, and the next visit still finds the old choice.

`followsSystem` says which entry to show selected. It is `true` when the binding started with nothing chosen, and after `followSystem()`. It turns `false` when your app applies a locale with `setLocale()` or `init()`, including the one already showing: a visitor who picks English while English was detected has chosen it.

While `followsSystem` is `true`, the binding also listens for the browser's `languagechange` event, so a visitor who changes their browser's language mid-visit gets the new one without a reload. A language the visitor just picked and that is still loading is kept, not overtaken.

When the detected language fails to load, `followSystem()` rejects with the loader's `I18nError`, and the page keeps its current language; the saved choice is already forgotten. `followsSystem` is `true` all the same, so the picker shows "System" over the old language: that is what the visitor chose, and the next visit or `languagechange` tries the detected language again. A failure after a `languagechange` warns and keeps the current language. Neither falls back to the default the way a start does, because the page already has a language to show.

## Re-render a framework

Frameworks such as React, Vue, Svelte, or Solid render the text themselves by calling `t()`. They need to know when to render again, and `i18n.subscribe()` tells them. It calls your function after every applied `init()` and every applied language change, and returns a function that stops it. A `setLocale()` to the language already showing, or one overtaken by a later call, changes nothing and calls nothing.

In React, `useSyncExternalStore` connects the two. Here it keeps the shop's cart badge in the current language:

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
<input data-i18n-placeholder="search.hint" placeholder="Search teas" />
<button data-i18n-aria-label="menu.open"><svg>…</svg></button>
```

```ts
await initializeBrowserI18n({ i18n, root: document });
```

How each part behaves:

- **`data-i18n` replaces an element's whole content.** The element must contain only text, with no child elements, so a translation can never remove your markup. Elements with children are skipped with a warning.
- **Comments are replaced too.** They are not elements, so they don't count as children. Don't put `data-i18n` on an element a framework renders or hydrates, since frameworks keep comment markers there; translate that text with `t()` instead.
- **`data-i18n-<attribute>` translates one attribute.** Only attributes that hold text for people or screen readers are allowed: `alt`, `title`, `placeholder`, `label`, `aria-label`, `aria-description`, `aria-placeholder`, `aria-roledescription`, and `aria-valuetext`. Others, such as `data-i18n-href` or `data-i18n-onclick`, are ignored, so a translation can never change a link, a style, or an event handler.
- **The text already in the HTML is the last fallback.** A key a language lacks shows the text of the next locale in its fallback chain, as `t()` does: a configured parent such as `pt` for `pt-BR`, then the default locale. The original text comes back only when no dictionary in the chain has the key.
- **Text is set as plain text, never as HTML.** `<script>`, `<style>`, `<noscript>`, and `<template>` are never touched.
- **Placeholders such as `{name}` are not filled here**, because there is nowhere in the HTML to pass a value from. Render text with values from your code with `t()`.
- **The page shows its HTML text until the visitor's dictionary has loaded**, then switches in place, which on a slow connection is visible. There are two ways to avoid that:
  - Render a page per language ahead of time, as in [Build a static site](server-rendering.md#build-a-static-site), and pass its `locale`.
  - Keep the root hidden until the binding's promise settles, whether it resolves or rejects, with a deadline on the loader as in [It never fails, it just hangs](troubleshooting.md#it-never-fails-it-just-hangs), so a stalled request can't leave the page blank.

### Form controls

Two form elements need care, because their text is also what the form sends. The shop's checkout has both:

- **Give every translated `<option>` a `value`.** An option without one submits its text, so `<option data-i18n="shipping.standard">Standard shipping</option>` submits `Envio padrão` once the page is in Portuguese, and your server receives a shipping method it has never heard of. Write `<option value="standard" data-i18n="shipping.standard">Standard shipping</option>`, and the form sends `standard` in every language.
- **Use `<button>` for a translated submit button.** The label of `<input type="submit" value="Place order">` is its `value`, and `value` is not an attribute the binding translates, since it is also data the form sends. `<button type="submit" data-i18n="checkout.submit">Place order</button>` translates like any other text.

### Watch for changes

The page is retranslated on every language change. To also translate elements your code adds later, turn on `observe`:

```ts
await initializeBrowserI18n({ i18n, root: document.querySelector("#app")!, observe: true });
```

With `observe`, adding an element, or changing or removing a `data-i18n` key, is handled as it happens. That includes elements other code adds while the binding is translating, such as a custom element that renders children when its attribute changes.

The binding handles those once per pass. If that code changes a key again in response, as an element that keeps resetting its own `data-i18n-*` attribute would, the second change waits for the next locale change instead of starting an endless loop. Two pieces of code that keep answering each other is a conversation with no end, and the binding politely leaves it.

An element that is added and then moved out of `root` before the binding gets to it is not translated: by then it belongs to another part of the page.

Leave `observe` off when a framework renders the page: the framework already calls `t()`, and watching the page would only duplicate its work.

### Custom elements

The binding does not look inside custom elements, with or without a shadow root, and doesn't warn when it skips one. That covers tags with a dash, such as `<my-widget>`, and built-in elements customized with `is`, such as `<button is="my-button">`.

A component has a life of its own: it can render after the page was translated, and it adds and removes text as people use it, which it has to translate itself anyway. So the component translates its own content: call `i18n.t()` when it renders, and render again from `i18n.subscribe()`. The shop's product card does exactly that:

```ts
class ProductCard extends HTMLElement {
  #unsubscribe?: () => void;

  connectedCallback() {
    // The element can connect before the manager is ready; `subscribe()` also calls back once `init()` applies.
    this.#unsubscribe = i18n.subscribe(() => this.render());
    if (i18n.isReady) {
      this.render();
    }
  }

  disconnectedCallback() {
    this.#unsubscribe?.();
  }

  render() {
    this.querySelector("button")!.textContent = i18n.t("cart.add");
  }
}
```

That includes a custom element used only as a wrapper, whose children you wrote in the page, such as `<site-nav><a data-i18n="nav.home">Home</a></site-nav>`: those links are skipped too. Use a plain element, such as `<nav>`, for a wrapper whose text the page translates.

A component can't have a binding of its own on the same manager, since a manager has one binding.

## In a Web Worker

A Web Worker has no page, so there is no `<html>` to set `lang` on and nothing to translate. Say the shop formats its order history in a worker. The core manager and `@codenhub/i18n/routing` work there as they do anywhere. The browser binding can still pick and save the locale, if you turn off the parts that need a page:

```ts
// worker.ts
await initializeBrowserI18n({ i18n, syncDocument: false });
```

Pass `syncDocument: false` and no `root`. With the default `syncDocument: true` and no `document`, `initializeBrowserI18n()` throws `TypeError: [I18n] Document synchronization requires a page document; pass syncDocument: false without one.` before it starts the manager, so the manager is left not started rather than half bound.

A worker has no `localStorage` either, so saving warns and is skipped. Add `persistLocale: false` to start quietly.

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
- **Let the binding start the manager.** The binding's promise rejects with `Error: [I18n] Browser initialization was superseded before its locale became active.` when, before the binding's locale is active, your code either:
  - calls `i18n.init()`, or
  - calls `i18n.setLocale()` on a manager that was already initialized, even to the locale already showing.

  The manager keeps the later call's result, under [the latest-call rule](index.md#the-latest-call-wins), and the binding is not connected. On a manager that was not initialized yet, `setLocale()` just fails with its own error and the binding carries on. Calling `init()` or `setLocale()` after the binding's promise has resolved is fine.

- **`disconnect()` stops reacting but undoes nothing.** It stops saving, syncing, translating, and following the browser's language, but leaves the current text, attributes, and saved choice as they are. A switch to a detected language still loading is dropped, and `followSystem()` rejects after it. You can then start a new binding.

The [browser reference](reference/browser.md) documents every option and failure, and [Troubleshooting](troubleshooting.md#the-browser-binding-warns-or-rejects) lists each warning the binding logs.

## Next

A browser app that is also rendered on a server, or built ahead of time, has a second half: [Render on a server or at build time](server-rendering.md) covers it, including how to hand the server's locale to the browser. If your app only ever runs in the browser and puts the language in its URLs, go straight to [Localized URLs](localized-urls.md), where the about page becomes `/sobre`.
