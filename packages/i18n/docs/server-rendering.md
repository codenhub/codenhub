---
title: Render on a server or at build time
description: One manager per request, choosing a locale from Accept-Language, static site builds, and keeping production logs quiet.
order: 3
---

# Render on a server or at build time

A browser has one visitor, so one manager for the whole app is right. A server renders pages for many visitors at once, often in different languages, and a static site build renders every language in one run. Both need a different shape: **one manager per page you render**.

## One manager per request

A manager has one current language. If two requests shared one, a Portuguese request calling `setLocale("pt")` would change the language of an English page still rendering. So create the manager inside the request:

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

Pass the manager, or `t`, down to whatever renders the page, rather than importing a shared one.

`t()` returns plain text. Escape it before putting it into HTML, as you would any other text, or let your template engine do it.

## Choose a locale from `Accept-Language`

Browsers send the visitor's languages in the `Accept-Language` header, such as `pt-BR,pt;q=0.9,en;q=0.8`. Turn it into a list, most preferred first, and let `matchLocale()` pick the best locale you support:

```ts
import type { I18n } from "@codenhub/i18n";

function pickLocale<TLocale extends string>(i18n: I18n<TLocale>, request: Request): TLocale {
  const preferences = (request.headers.get("accept-language") ?? "")
    .split(",")
    .map((entry) => {
      const [tag = "", ...parameters] = entry.split(";");
      const quality = parameters.map((parameter) => parameter.trim()).find((parameter) => /^q=/i.test(parameter));
      return { tag: tag.trim(), quality: quality === undefined ? 1 : Number(quality.slice(2)) };
    })
    // Drops refused languages (q=0) and malformed weights.
    .filter(({ quality }) => quality > 0 && quality <= 1)
    .sort((left, right) => right.quality - left.quality)
    .map(({ tag }) => tag);

  return i18n.matchLocale(preferences) ?? i18n.defaultLocale;
}
```

A visitor whose languages all fail to match, including one who refuses your default with `en;q=0`, still gets the default locale, since the page has to be in some language. This helper does not implement the rest of `Accept-Language`, such as `*`; use your server framework's parser if you need it, and pass its result to `matchLocale()`.

`matchLocale()` takes a list rather than the header because parsing the header, and limiting its size, belongs to your server. It matches the same way the browser binding does, so a visitor gets the same language from the server as from the browser: `pt-BR` gets your `pt`, and `zh-TW` gets your `zh-Hant`. Malformed tags are skipped, and `undefined` means nothing matched.

When the URL carries the language, as on [a localized site](localized-urls.md), read it from the URL instead and use `Accept-Language` only to choose where to redirect a visitor who arrives at `/`.

## Keep production logs useful

A missing key logs a warning once per manager. With a manager per request, that is once per request, which floods the logs. In production, send misses to your logger, or turn the warnings off:

```ts
createI18n({
  // ...
  onMissingKey(key, locale) {
    logger.warn({ key, locale }, "missing translation");
  },
});
```

`isSilent: true` turns off warnings only. Errors, such as a failed load, still throw.

In Node.js, an exception thrown from a function passed to `subscribe()`, or from a `ready` or `locale-change` listener, crashes the process, as with any `EventTarget`. Servers rarely need these, but if you use them, keep them from throwing.

## Build a static site

A static build renders every page in every language ahead of time. It follows the same rule: one manager per page. List your localized pages with [locale routing](localized-urls.md#generate-every-localized-page), then render each one:

```ts
import { createLocaleRouting } from "@codenhub/i18n/routing";
import { createAppI18n } from "./i18n";

const routing = createLocaleRouting({
  locales: ["en", "pt"] as const,
  defaultLocale: "en",
  prefixDefaultLocale: false,
});

// Your pages, keyed by their path without a locale.
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

A dictionary that fails to load or check makes `init()` reject, so the build fails instead of publishing pages without text. A key that only your default language has does not fail the build; it renders in the default language. Add [the untranslated-keys test](translations.md#find-untranslated-keys) to catch those, and make `onMissingKey` throw during the build to fail on keys missing from every language.

## Hand the locale to the browser

When the browser takes over a server-rendered page, it must start in the language the server used, or the text changes as the page loads. Pass that locale explicitly; it overrides saved and detected ones:

```ts
await initializeBrowserI18n({ i18n, locale: document.documentElement.lang as "en" | "pt" });
```

On a localized site, read it from the URL with `routing.parse()` instead, as [Localized URLs](localized-urls.md#read-the-locale-on-the-client) shows.
