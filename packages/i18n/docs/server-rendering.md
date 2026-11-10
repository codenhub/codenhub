---
title: Render on a server or at build time
description: One manager per request, choosing a locale from Accept-Language, static site builds, and keeping production logs quiet.
order: 3
---

# Render on a server or at build time

A browser has one visitor, so one manager is right. A server has many visitors at once, in different languages, and a manager speaks one language at a time. So: **one manager per page you render**. A static site build renders every language in one run and follows the same rule. This page shows that shape with the `en` and `pt` dictionaries from the [overview](index.md#walkthrough), then picks each visitor's language, gets their dates right, and keeps the logs readable.

## One manager per request

A manager has one current language. If two requests shared one, a Portuguese request calling `setLocale("pt")` would change the language of an English page still rendering, and the English visitor would get a page that switches language halfway down. It works fine in development, where you are the only visitor. So create the manager inside the request:

```ts
// src/i18n.ts
import { createI18n } from "@codenhub/i18n";
import { dictionaries } from "./locales";

export const createAppI18n = () =>
  createI18n({
    locales: ["en", "pt"] as const,
    defaultLocale: "en",
    loadLocale: (locale) => dictionaries[locale],
  });
```

```ts
// src/render.ts
import { createAppI18n } from "./i18n";

export async function renderPage(request: Request) {
  const i18n = createAppI18n();
  await i18n.init({ locale: pickLocale(i18n, request) });
  const { t } = i18n;

  return `<!doctype html>
<html lang="${i18n.locale}" dir="${i18n.direction}">
  <title>${escapeHtml(t("home.title"))}</title>
</html>`;
}
```

Creating a manager is cheap, and the work that isn't is shared. When your loader returns the same object on every call, as an imported module does, every manager reuses the one checked copy of that dictionary instead of checking it again. A loader that reads and parses a file on every call loses that, so read each file once and keep the result.

`i18n.direction` is `"rtl"` for a right-to-left locale such as Arabic, and `"ltr"` otherwise; [Right-to-left languages](index.md#right-to-left-languages) explains how it is decided and how to override it. Put it in `<html dir>`, as above, and the browser lays the page out the right way round from the first byte.

Pass the manager, or `t`, down to whatever renders the page, rather than importing a shared one.

`t()` returns plain text. Escape it before putting it into HTML, as you would any other text, or let your template engine do it.

## Choose a locale from `Accept-Language`

Browsers send the visitor's languages in the `Accept-Language` header, such as `pt-BR,pt;q=0.9,en;q=0.8`. Turn it into a list, most preferred first, and let `matchLocale()` pick the best locale you support:

```ts
import type { I18n } from "@codenhub/i18n";

// Real browsers send a handful of languages, and a header can list thousands.
const MAX_PREFERENCES = 10;

function pickLocale<TLocale extends string>(i18n: I18n<TLocale>, request: Request): TLocale {
  const preferences = (request.headers.get("accept-language") ?? "")
    .split(",")
    .map((entry) => {
      const [tag = "", ...parameters] = entry.split(";");
      const weight = parameters.map((parameter) => parameter.trim()).find((parameter) => /^q=/i.test(parameter));
      // A weight is 0 to 1 with up to three decimals; anything else, such as `q=0x1`, is malformed.
      const quality = weight === undefined ? 1 : /^q=(0(\.\d{0,3})?|1(\.0{0,3})?)$/i.test(weight) ? Number(weight.slice(2)) : 0;
      return { tag: tag.trim(), quality };
    })
    // Drops refused languages (q=0) and malformed weights.
    .filter(({ quality }) => quality > 0)
    .sort((left, right) => right.quality - left.quality)
    .slice(0, MAX_PREFERENCES)
    .map(({ tag }) => tag);

  return i18n.matchLocale(preferences) ?? i18n.defaultLocale;
}
```

A visitor whose languages all fail to match, including one who refuses your default with `en;q=0`, still gets the default locale, since the page has to be in some language. This helper does not implement the rest of `Accept-Language`, such as `*`; use your server framework's parser if you need it, and pass its result to `matchLocale()`.

`matchLocale()` takes a list rather than the header because parsing the header, and limiting its size, belongs to your server. Keep the limit: `matchLocale()` tries preferences in order until one matches, so a request whose 16 KB header lists thousands of languages you don't support would otherwise hold your server's event loop for tens of milliseconds, about 60 ms on Node 24. It matches the same way the browser binding does, so a visitor gets the same language from the server as from the browser: `pt-BR` gets your `pt`, and `zh-TW` gets your `zh-Hant`. Malformed tags are skipped, and `undefined` means nothing matched. [Turn outside input into a locale](index.md#turn-outside-input-into-a-locale) has the full matching order, including which of two regional locales wins, and `resolveLocale()` for a locale from a cookie or a query string.

When the URL carries the language, as on [a localized site](localized-urls.md), read it from the URL instead and use `Accept-Language` only to choose where to redirect a visitor who arrives at `/`. A static site has no server to see the header; see [Detect the language on a static site](localized-urls.md#detect-the-language-on-a-static-site).

## Show dates in the reader's time zone

A server formats dates in its own time zone, which is rarely the reader's. Text such as "Shipped on {date, date, long}" can then show another day than the reader's calendar, and change when the browser takes over. Give each request's manager the reader's zone, such as one your app stores per account or the browser reports in a cookie:

```ts
export const createAppI18n = (timeZone?: string) =>
  createI18n({
    locales: ["en", "pt"] as const,
    defaultLocale: "en",
    loadLocale: (locale) => dictionaries[locale],
    timeZone,
  });
```

`Intl.DateTimeFormat().resolvedOptions().timeZone` reads the zone in the browser. A zone `Intl` doesn't know throws a `TypeError`, so check a value from a cookie before using it, or fall back to a fixed zone such as `"UTC"`.

## Keep production logs useful

A missing key logs a warning once for each locale and key in each manager. With a manager per request, that is once per request, so one missing key on the home page becomes a log line for every visitor. In production, send misses to your logger, where you can count them instead of scrolling past them, or turn the warnings off:

```ts
createI18n({
  // ...
  onMissingKey(key, locale) {
    logger.warn({ key, locale }, "missing translation");
  },
});
```

`onMissingKey` replaces the warning and runs on every miss. `isSilent: true` turns off warnings only, including the one for a message with invalid syntax. Errors, such as a failed load, still throw.

In Node.js, an exception thrown from a function passed to `subscribe()`, or from a `ready` or `locale-change` listener, crashes the process, as with any `EventTarget`. Servers rarely need these, but if you use them, wrap their body in `try`/`catch` so they can't throw.

## Build a static site

A static build renders every page in every language ahead of time. It follows the same rule: one manager per page. List your localized pages with [locale routing](localized-urls.md#generate-every-localized-page), then render each one:

```ts
import { createLocaleRouting } from "@codenhub/i18n/routing";
import { createAppI18n } from "./i18n";

const routing = createLocaleRouting({
  locales: ["en", "pt"] as const,
  defaultLocale: "en",
  localePrefix: "except-default",
});

// Your pages, keyed by their canonical path: the path without a locale, in the words your code routes on.
const pages = { "/": renderHome, "/about": renderAbout };

const builds = Object.entries(pages).flatMap(([page, render]) => routing.localizeAll(page).map(({ locale, pathname }) => ({ locale, pathname, render })));
// [{ locale: "en", pathname: "/", render: renderHome }, { locale: "pt", pathname: "/pt", render: renderHome }, ...]

await Promise.all(
  builds.map(async ({ locale, pathname, render }) => {
    const i18n = createAppI18n();
    await i18n.init({ locale });
    await writePage(pathname, render(i18n.t));
  }),
);
```

`pathname` is a URL path, percent-encoded where the table has words such as `/serviços`. Hosts decode a request before looking for its file, so name the file after `decodeURI(pathname)`, such as `servicos/index.html` for `/servicos` and `serviços/index.html` for `/servi%C3%A7os`.

A dictionary that fails to load or check makes `init()` reject, so the build fails instead of publishing pages without text. A key that only your default language has does not fail the build; it renders in the default language. Add [the untranslated-keys test](translations.md#find-untranslated-keys) to catch those, and make `onMissingKey` throw during the build to fail on keys missing from every language.

## Hand the locale to the browser

When the browser takes over a server-rendered page, it must start in the language the server used, or the text changes as the page loads. Pass that locale explicitly; it overrides saved and detected ones, and the binding saves it as the visitor's choice, as [How the locale is chosen](browser.md#how-the-locale-is-chosen) explains:

```ts
await initializeBrowserI18n({ i18n, locale: document.documentElement.lang as "en" | "pt" });
```

On a localized site, read it from the URL with `routing.parse()` instead, as [Localized URLs](localized-urls.md#read-the-locale-on-the-client) shows.

## Next

If the language of each page lives in its URL, as it does on most server-rendered and static sites, continue with [Localized URLs](localized-urls.md): it reads the locale from the path, builds links to other languages, and lists every page a static build needs.
