---
title: Localized URLs
description: Put the locale in the path, read it back, link to other languages, and generate every localized page.
order: 4
---

# Localized URLs

Giving each language its own URL, such as `/about` and `/pt/about`, lets people share a link in the language they read, and lets search engines index every language. `@codenhub/i18n/routing` handles the part that is the same in every framework: reading the locale from a path, and building the path for another locale.

## Set up routing

```ts
// src/routing.ts
import { createLocaleRouting } from "@codenhub/i18n/routing";

export const routing = createLocaleRouting({
  locales: ["en", "pt"] as const,
  defaultLocale: "en",
  prefixDefaultLocale: false,
});
```

`prefixDefaultLocale` decides how your default language looks:

| `prefixDefaultLocale` | English about page | Portuguese about page |
| --------------------- | ------------------ | --------------------- |
| `false`               | `/about`           | `/pt/about`           |
| `true`                | `/en/about`        | `/pt/about`           |

`false` keeps your existing URLs when you add a language. `true` makes every URL name its language, so `/about` is not a page, which suits a site that redirects `/` to the visitor's language.

Use the same `locales` and `defaultLocale` as your manager. Routing is separate from the manager, so it also works where no translation happens, such as in a server's redirect logic.

## Read the locale from a path

`parse()` splits a path into its locale and the rest:

```ts
routing.parse("/pt/about"); // { locale: "pt", pathname: "/about" }
routing.parse("/about"); // { locale: "en", pathname: "/about" }
routing.parse("/PT/about"); // { locale: "pt", pathname: "/about" }
```

With `prefixDefaultLocale: true`, a path without a locale returns `undefined`, so you can redirect it:

```ts
const route = routing.parse(url.pathname);
if (route === undefined) {
  const target = new URL(url);
  target.pathname = routing.localize(url.pathname, pickLocale(i18n, request));
  return Response.redirect(target, 302);
}
```

`pickLocale` is the `Accept-Language` helper from [Render on a server](server-rendering.md#choose-a-locale-from-accept-language).

### Read the locale on the client

In the browser, take the locale from the URL and pass it to the browser binding. The URL then wins over the visitor's saved and detected languages, so the page always matches its address:

```ts
import { initializeBrowserI18n } from "@codenhub/i18n/browser";
import { i18n } from "./i18n";
import { routing } from "./routing";

const route = routing.parse(window.location.pathname);
await initializeBrowserI18n({ i18n, locale: route?.locale });
```

## Link to another language

`localize()` builds the path for a locale. It replaces the locale already in the path, if any:

```ts
routing.localize("/about", "pt"); // "/pt/about"
routing.localize("/pt/about", "en"); // "/about"
routing.localize("/pt/about", "pt"); // "/pt/about"
```

On a localized site, switching language is a navigation, not just `setLocale()`: `setLocale()` changes the text but never the URL. Build the new path, keep the query string and fragment, and let your router go there:

```ts
await navigate(routing.localize(window.location.pathname, "pt") + window.location.search + window.location.hash);
```

Use the same call for the `<link rel="alternate" hreflang>` tags that tell search engines about each language:

```ts
const alternates = routing.localizeAll(pathname).map((page) => `<link rel="alternate" hreflang="${escapeHtml(page.locale)}" href="${escapeHtml(new URL(page.pathname, "https://example.com").href)}">`);
```

Escape both values as you would any text in HTML, or let your framework create the tags. A path can contain characters, such as `"` or `&`, that are allowed in a URL but not raw inside an attribute.

## Generate every localized page

`localizeAll()` returns a path for every locale, in the order of `locales`:

```ts
routing.localizeAll("/about");
// [{ locale: "en", pathname: "/about" }, { locale: "pt", pathname: "/pt/about" }]
```

Feed it your page list to get every page a static build needs, then render each one with its own manager, as in [Build a static site](server-rendering.md#build-a-static-site).

## Paths it accepts

Routing works on the path of a URL only. Give it `url.pathname`, not the full URL, and handle the query string and fragment yourself.

To keep a crafted URL from reaching a different page than the one checked, every method throws a `TypeError` for a path that:

- does not start with `/`, or is a full or protocol-relative URL, such as `https://…` or `//host`;
- contains `?`, `#`, `\`, `//`, or a control character;
- contains a `.` or `..` segment, or encodes one, a slash, a backslash, a `%`, or a control character with `%`;
- has a malformed `%` escape, or is longer than 8,192 characters.

Ordinary escapes, such as `%20`, are fine, and a trailing slash is kept: `/pt/about/` localizes to `/about/`.

## What routing leaves to your framework

Routing reads and builds paths. Your framework or server still registers the routes, redirects, navigates, and renders. It also doesn't know about a base path: if your site lives under `/docs`, remove that before calling `parse()` and add it back after `localize()`.

Paths keep the same words in every language: `/pt/about`, not `/pt/sobre`. Translated path segments are planned for a later version.
