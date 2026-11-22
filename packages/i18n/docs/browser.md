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

It returns a binding. Keep it for your language picker, which renders from its `subscribe()`, as [Let visitors switch languages](#let-visitors-switch-languages) shows. Its `disconnect()` method is only needed when you tear the app down, as in tests or micro-frontends.

### How the locale is chosen

The first of these that gives a supported locale wins:

1. The `locale` option, when you pass one. It counts as your app's choice, so it is also saved, unless `persistLocale` is `false`.
2. The visitor's saved choice from an earlier visit. A saved locale you no longer configure, such as `pt-PT` after you keep only `pt-BR`, is matched like a browser preference, and the saved value stays as it was.
3. The browser's language settings, `navigator.languages`, matched to your locales with [`matchLocale()`](index.md#turn-outside-input-into-a-locale). A visitor whose browser asks for `pt-BR` gets your `pt`.
4. Your default locale.

Pass `locale` when the page already knows its language, such as from the URL in [a localized site](localized-urls.md#read-the-locale-on-the-client). It then overrides everything else, so the browser can't disagree with the server about which language the page is in.

On a localized site, that means every page view saves the language in its URL. Usually that is what you want: the saved language is the one the visitor last read, which is what [the static-site redirect](localized-urls.md#detect-the-language-on-a-static-site) relies on.

It also means a visitor who follows one shared Portuguese link to a tea has Portuguese saved from then on, until they read a page in another language, even if their browser asks for English. One link from a Brazilian friend, and the shop speaks Portuguese to them.

If you would rather save only what the visitor picks in your language picker, turn saving off with `persistLocale: false`, and have the picker save its choice where your redirect reads it, deleting it when the visitor picks [a "System" entry](#offer-a-system-choice). Don't read that choice back and pass it as `locale`: the URL decides the page's language.

To keep the choice somewhere other than `localStorage`, such as a cookie your server reads too, pass `storage` rather than reading the choice yourself and passing it as `locale`. The binding then reads, saves, and forgets the choice through it just as it does in `localStorage`: a saved choice whose dictionary fails to load falls back as the next section describes, where an explicit `locale` would reject, and a "System" entry works unchanged. [Hand the locale to the browser](server-rendering.md#hand-the-locale-to-the-browser) keeps it in a cookie.

#### When a loader fails during start

If your loader fails for a saved locale, whether saved in `localStorage` or in your `storage`, the binding warns and tries the locale it detects from the browser, then the default locale, so the visitor still gets a language they read instead of a broken app. A detected locale that fails falls back to the default the same way. The saved choice is kept for next time.

Two failures still reject:

- A loader failure for a locale you passed explicitly, or for the default locale, since there is nothing sensible to fall back to. A choice you keep yourself, such as in a cookie, falls back like a saved one when you hand it over as `storage`, and rejects when you pass it as `locale`.
- A dictionary that loads but [breaks the rules](troubleshooting.md#a-dictionary-is-rejected), whatever the locale. That is a bug to fix, not a network hiccup to ride out.

## Let visitors switch languages

Call `setLocale()` from your language picker, and show the language the binding reports. The binding reacts to every change that is applied: it saves the choice and updates `lang` and `dir`.

```ts
const binding = await initializeBrowserI18n({ i18n });
const picker = document.querySelector<HTMLSelectElement>("#language")!;
const showLanguage = () => {
  picker.value = i18n.locale;
};
let latestPick = 0;

showLanguage();
binding.subscribe(showLanguage);
picker.addEventListener("change", async () => {
  const pick = ++latestPick;
  try {
    await i18n.setLocale(picker.value as (typeof i18n.locales)[number]);
  } finally {
    // A failed pick changes nothing, so show the language in use again, unless a later pick is still loading.
    if (pick === latestPick) {
      showLanguage();
    }
  }
});
```

The language can change without the picker: a visitor who never picked one follows their browser's language mid-visit, as [Offer a "System" choice](#offer-a-system-choice) describes. `binding.subscribe()` calls `showLanguage` after every change, so the picker never shows a language the page left.

A visitor who changes their mind quickly is handled for you. When two switches overlap, the later one wins, and the earlier one resolves without changing anything, as [The latest call wins](index.md#the-latest-call-wins) explains. `latestPick` keeps that earlier one from putting the old language back on the picker while the later one is still loading. When a dictionary fails to load, `setLocale()` rejects and the page keeps its language, so the `finally` puts the picker back on it rather than leaving the language that failed selected.

Only choices your app makes are saved: the `locale` option, and every applied `setLocale()` or `init()` after the binding has started. These are not saved:

- A language detected from the browser settings.
- The default locale the binding fell back to.

A visitor who never picked one keeps following their browser settings, including when you add their language later.

The choice is stored in `localStorage` as `{"locale":"pt"}` under the key `"i18n"`. Change the key with `storageKey`, keep the choice elsewhere with `storage`, or turn saving off with `persistLocale: false`. If storage is unavailable, as in some private browsing modes, or your `storage` throws, the binding warns and carries on without it.

### Offer a "System" choice

Once a visitor picks a language, it sticks, which is the point. A "System" entry in the picker lets them undo that and go back to following their browser. This replaces the picker above:

```ts
const binding = await initializeBrowserI18n({ i18n });
const picker = document.querySelector<HTMLSelectElement>("#language")!;
const showChoice = () => {
  picker.value = binding.isUsingSystemLocale ? "system" : i18n.locale;
};
let latestPick = 0;

showChoice();
binding.subscribe(showChoice);
picker.addEventListener("change", async () => {
  const pick = ++latestPick;
  try {
    if (picker.value === "system") {
      await binding.switchToSystemLocale();
    } else {
      await i18n.setLocale(picker.value as (typeof i18n.locales)[number]);
    }
  } finally {
    // Show the visitor's choice again after a failed switch, unless a later pick is still loading.
    if (pick === latestPick) {
      showChoice();
    }
  }
});
```

`switchToSystemLocale()` forgets the saved choice and switches to the language the binding detects right now, from the browser settings, then the default locale. That language is not saved, so the next visit detects again. If storage can't be cleared, the binding warns, and the next visit still finds the old choice.

`isUsingSystemLocale` says which entry to show selected. It is `true` when the binding started with nothing chosen, and after `switchToSystemLocale()`. It turns `false` when your app applies a locale with `setLocale()` or `init()`, including the one already showing: a visitor who picks English while English was detected has chosen it.

While `isUsingSystemLocale` is `true`, the binding also listens for the browser's `languagechange` event, so a visitor who changes their browser's language mid-visit gets the new one without a reload. A language the visitor just picked and that is still loading is kept, not overtaken.

Render the picker from `binding.subscribe()` rather than `i18n.subscribe()`, in a framework too. Picking the language already showing, or "System" while the detected language is the one showing, changes the selection without changing the language, so the manager has nothing to report. The binding reports both, and every language change. `binding.subscribe` works detached from the binding, so it can be passed on as it is. In React:

```tsx
import { useState, useSyncExternalStore } from "react";
import type { BrowserI18nBinding } from "@codenhub/i18n/browser";
import { i18n } from "./i18n";

export function LanguagePicker({ binding }: { binding: BrowserI18nBinding }) {
  const selected = useSyncExternalStore(binding.subscribe, () => (binding.isUsingSystemLocale ? "system" : i18n.locale));
  // The visitor's pick, shown while its language loads, so the select doesn't jump back to the old one.
  const [pending, setPending] = useState<string>();

  return (
    <select
      value={pending ?? selected}
      onChange={(event) => {
        const value = event.target.value;
        setPending(value);
        const switching = value === "system" ? binding.switchToSystemLocale() : i18n.setLocale(value as (typeof i18n.locales)[number]);
        // Then the selection comes from the binding again, even when the switch failed or a later one overtook it.
        switching.catch((error: unknown) => console.error(error)).finally(() => setPending((current) => (current === value ? undefined : current)));
      }}
    >
      <option value="system">System</option>
      {i18n.locales.map((locale) => (
        <option key={locale} value={locale}>
          {locale}
        </option>
      ))}
    </select>
  );
}
```

When the detected language fails to load, `switchToSystemLocale()` rejects with the loader's `I18nError`, and the page keeps its current language; the saved choice is already forgotten. `isUsingSystemLocale` is `true` all the same, so the picker shows "System" over the old language: that is what the visitor chose, and the next visit or `languagechange` tries the detected language again. A failure after a `languagechange` warns and keeps the current language. Neither falls back to the default the way a start does, because the page already has a language to show.

"System" belongs to a site where the binding chooses the language. On a site with the language in its URLs, the URL chooses it: each page passes its locale to `initializeBrowserI18n()`, as [Localized URLs](localized-urls.md) does, which saves it and ends following the system, so a "System" pick lasts only until the next page. There, make "System" navigate instead, to the current page's URL in the language `i18n.matchLocale(navigator.languages)` finds, or leave the entry out.

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
- **`data-i18n-<attribute>` translates one attribute.** Only attributes that hold text for people or screen readers are allowed: `alt`, `title`, `placeholder`, `label`, `aria-label`, `aria-description`, `aria-placeholder`, `aria-roledescription`, and `aria-valuetext`. Others, such as `data-i18n-href` or `data-i18n-onclick`, are ignored, so a translation can never change a link, a style, or an event handler. The `title` of a `<style>`, or of a `<link rel="stylesheet">`, is skipped with a warning, since there it names a set of style sheets, and renaming it could switch the page's styles off.
- **The text already in the HTML is the last fallback.** A key a language lacks shows the text of the next locale in its fallback chain, as `t()` does: a configured parent such as `pt` for `pt-BR`, then the default locale. The original text comes back only when no dictionary in the chain has the key. An element showing text in another language than the one it already has, from its own `lang` or else its nearest ancestor's, gets that locale's `lang`, such as `<p lang="en">` on a Portuguese page, so a screen reader pronounces it in the right language. With `syncDocument: false`, that is the language your page declares rather than the active locale, and the active locale only where no `lang` is set. The binding restores the element's own `lang` once the text is in that language again, and once your code changes that `lang`, the binding leaves it to your code. An element with content of its own, such as text or children, is marked only by its `data-i18n` text, since `lang` would cover that content too, and an element whose keys show text from different locales, or the HTML's own text after a miss, is not marked.
- **Text is set as plain text, never as HTML.** The text of `<script>`, `<style>`, `<noscript>`, `<template>`, `<iframe>`, `<noembed>`, `<noframes>`, `<xmp>`, and `<plaintext>` is never touched, since it runs as code, decides what shows, or is written back unescaped when the page is saved as HTML. Their attributes are translated like any other, so `<iframe data-i18n-title="video.title">` gets a translated accessible name. An element inside one of them, or inside a `<textarea>` or `<title>`, which only your code can put there, is skipped whole, text and attributes, with a warning: when the page is saved as HTML and read again, a translated attribute could close the element around it and become markup. An element your code moves into one of them after the binding translated it gets back the text, attributes, and `lang` it had in the HTML at the next language change, or at once with `observe`. The text and attributes of a `<textarea>` or `<title>` itself are translated.
- **A message that needs values keeps the HTML text**, with a warning once per key, because there is nowhere in the HTML to pass a value from. That covers `{name}` and any other argument, such as a whole plural, which would otherwise show its ICU syntax to visitors. Render text with values from your code with `t()`.
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

An element's text belongs to its `data-i18n` key, so with `observe` the binding writes the translation back over text your code sets by replacing the element's content, as `textContent` does: a button whose label your code turns into "Placing order…" reads "Place order" again at once, and "Placing order…" never becomes its fallback: a language without the key, or removing the key, shows the HTML text. An edit to an existing text node, such as `button.firstChild.data`, isn't watched, and stays until the next language change. Remove the key before setting the text, which restores the HTML text first, or put the changing text in an element without one.

The binding handles those once per pass. If that code changes a key again in response, as an element that keeps resetting its own `data-i18n-*` attribute would, the second change waits for the next locale change instead of starting an endless loop. Two pieces of code that keep answering each other is a conversation with no end, and the binding politely leaves it.

An element that is added and then moved out of `root` before the binding gets to it is not translated: by then it belongs to another part of the page.

Leave `observe` off when a framework renders the page: the framework already calls `t()`, and watching the page would only duplicate its work.

### Custom elements

The binding does not look inside custom elements and doesn't warn when it skips one. An element your code moves into one after the binding translated it gets back the text, attributes, and `lang` it had in the HTML, at the next language change, or at once with `observe`, since the component owns it now. That covers tags with a dash, such as `<my-widget>`, and customized built-in elements, whether the HTML marks one with `is`, as in `<button is="my-button">`, or your code creates one with `document.createElement("button", { is: "my-button" })`, which sets no `is` attribute. In a browser without `customElements.getName()`, one your code creates is translated like a plain element.

The binding never crosses into a shadow root either, a custom element's or any other's. A shadow root can itself be the `root` you pass, when that is the part of the page the binding translates.

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

Pass `syncDocument: false` and no `root`. With the default `syncDocument: true` and no `document`, `initializeBrowserI18n()` rejects with `TypeError: [I18n] Document synchronization requires a page document; pass syncDocument: false without one.` before it starts the manager, so the manager is left not started rather than half bound.

A worker has no `localStorage` either, so saving warns and is skipped. Add `persistLocale: false` to start quietly.

## Options

| Option          | Default    | What it does                                                                                                 |
| --------------- | ---------- | ------------------------------------------------------------------------------------------------------------ |
| `i18n`          | (required) | The manager to start.                                                                                        |
| `locale`        | none       | A locale that overrides saved and detected ones. It is saved too while `persistLocale` is on.                |
| `persistLocale` | `true`     | Read the saved choice, and save the `locale` option and every language change your app makes after start.    |
| `storageKey`    | `"i18n"`   | The `localStorage` key for the saved choice.                                                                 |
| `storage`       | none       | Where to keep the saved choice instead of `localStorage`, as `get()`, `set(locale)`, and `remove()`.         |
| `syncDocument`  | `true`     | Keep `<html lang>` and `dir` in step with the locale. Needs a page `document`; pass `false` in a Web Worker. |
| `root`          | none       | The part of the page to translate with `data-i18n` attributes.                                               |
| `observe`       | `false`    | Also translate changes below `root` as they happen. Needs `root`.                                            |

## Rules to know

- **One binding per manager.** A second `initializeBrowserI18n()` call for the same manager rejects until the first is disconnected.
- **Start the binding once, when the app starts**, as a module's top-level `await` or before mounting the app, not in a component's effect. A start still loading can't be cancelled, so a second start, as React's StrictMode makes by running an effect twice, rejects with `TypeError: [I18n] The manager already has a browser binding.`, with no binding yet to `disconnect()`.
- **`storage` replaces `storageKey` and needs saving on.** Passing it with `storageKey`, or with `persistLocale: false`, rejects with a `TypeError` before the manager starts, since both say where the choice lives or that it doesn't. Each method runs synchronously: the binding doesn't wait for a promise one returns.
- **Give each binding its own part of the page.** Two bindings, as in micro-frontends, each with its own manager, need `root`s that don't contain each other. Where they overlap, each translates the shared elements in its own language, and whichever runs last wins. They also share the saved choice and `<html lang>` unless told otherwise: give each extra binding its own `storageKey` or `storage`, so one binding's saved pick doesn't overwrite another's, and `syncDocument: false` to all but the one binding that owns the page.
- **Let the binding start the manager.** The binding's promise rejects with `Error: [I18n] Browser initialization was superseded before its locale became active.` when, before the binding's locale is active, your code either:
  - calls `i18n.init()`, or
  - calls `i18n.setLocale()` on a manager that was already initialized, even to the locale already showing.

  The manager keeps the later call's result, under [the latest-call rule](index.md#the-latest-call-wins), and the binding is not connected. On a manager that was not initialized yet, `setLocale()` just fails with its own error and the binding carries on. Calling `init()` or `setLocale()` after the binding's promise has resolved is fine.

- **`disconnect()` stops reacting but undoes nothing.** It stops saving, syncing, translating, following the browser's language, and calling `binding.subscribe()` listeners, but leaves the current text, attributes, and saved choice as they are. A switch to a detected language still loading is dropped, and `switchToSystemLocale()` rejects after it. You can then start a new binding.

The [browser reference](reference/browser.md) documents every option and failure, and [Troubleshooting](troubleshooting.md#the-browser-binding-warns-or-rejects) lists each warning the binding logs.

## Next

A browser app that is also rendered on a server, or built ahead of time, has a second half: [Render on a server or at build time](server-rendering.md) covers it, including how to hand the server's locale to the browser. If your app only ever runs in the browser and puts the language in its URLs, go straight to [Localized URLs](localized-urls.md), where the about page becomes `/sobre`.
