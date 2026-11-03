---
title: Localized URLs
description: Put the locale in the path, translate the path itself, read both back, link to other languages, and generate every localized page.
order: 4
---

# Localized URLs

Giving each language its own URL, such as `/about` and `/pt/about`, lets people share a link in the language they read, and lets search engines index every language. `@codenhub/i18n/routing` handles the part that is the same in every framework: reading the locale from a path, and building the path for another locale. It can also translate the path itself, so the Portuguese about page is `/pt/sobre`, or even just `/sobre`.

## Set up routing

```ts
// src/routing.ts
import { createLocaleRouting } from "@codenhub/i18n/routing";

export const routing = createLocaleRouting({
  locales: ["en", "pt"] as const,
  defaultLocale: "en",
  localePrefix: "except-default",
});
```

`localePrefix` decides which paths start with their locale:

| `localePrefix`     | English about page | Portuguese about page                                                             |
| ------------------ | ------------------ | --------------------------------------------------------------------------------- |
| `"except-default"` | `/about`           | `/pt/about`                                                                       |
| `"always"`         | `/en/about`        | `/pt/about`                                                                       |
| `"when-ambiguous"` | `/about`           | `/pt/about`, or `/sobre` once translated; see [Drop the prefix](#drop-the-prefix) |

`"except-default"` keeps your existing URLs when you add a language. `"always"` makes every URL name its language, so `/about` is not a page, which suits a site that redirects `/` to the visitor's language.

Use the same `locales` and `defaultLocale` as your manager. Routing is separate from the manager, so it also works where no translation happens, such as in a server's redirect logic.

If you keep the configuration in a variable before passing it in, write `localePrefix: "except-default" as const`. Without `as const`, TypeScript widens the value to `string`, and `createLocaleRouting` rejects it at compile time.

## Read the locale from a path

`parse()` splits a path into its locale and the rest:

```ts
routing.parse("/pt/about"); // { locale: "pt", pathname: "/about" }
routing.parse("/about"); // { locale: "en", pathname: "/about" }
routing.parse("/PT/about"); // { locale: "pt", pathname: "/about" }
```

The `pathname` it returns is the **canonical path**: the path your application routes on, the same in every language. Hold on to that idea; it matters once paths are translated.

`parse()` returns `undefined` for a path that is not a page in any locale, such as `/pt/en/about`: once its prefix is removed it starts with another locale, so no link ever leads there. Answer it with a 404.

With `localePrefix: "always"`, a path without a locale returns `undefined` too, so you can redirect it. Add the chosen locale's prefix and parse that, so a path in that locale's words, such as `/sobre`, is read as one, and a path that is no page in that locale either gets its 404:

```ts
const route = routing.parse(url.pathname);
if (route === undefined) {
  const locale = pickLocale(i18n, request);
  const guess = routing.parse(`/${locale}${url.pathname === "/" ? "" : url.pathname}`);
  if (guess === undefined) {
    return new Response("Not found", { status: 404 });
  }
  const target = new URL(url);
  target.pathname = routing.localize(guess.pathname, guess.locale);
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

### Redirect to the canonical URL

`parse()` is forgiving: `/PT/about` and `/en/about` are read as well as `/pt/about` and `/about`. That is friendly to someone typing a URL, but a search engine that finds one page at several addresses splits its ranking between them. Send every other spelling to the one `localize()` builds. Every path `parse()` returns has one, so this never throws:

```ts
const route = routing.parse(url.pathname);
if (route !== undefined) {
  const canonical = routing.localize(route.pathname, route.locale);
  if (canonical !== url.pathname) {
    const target = new URL(url);
    target.pathname = canonical;
    return Response.redirect(target, 301);
  }
}
```

## Link to another language

`localize()` builds the path of a page in a locale. Give it the canonical path:

```ts
routing.localize("/about", "pt"); // "/pt/about"
routing.localize("/about", "en"); // "/about"
```

A path that already starts with a locale is read as that locale's URL, so the prefix is replaced:

```ts
routing.localize("/pt/about", "en"); // "/about"
```

On a localized site, switching language is a navigation, not just `setLocale()`: `setLocale()` changes the text but never the URL. Read the current page with `parse()`, build its path in the new language, keep the query string and fragment, and let your router go there:

```ts
const route = routing.parse(window.location.pathname);
if (route !== undefined) {
  await navigate(routing.localize(route.pathname, "pt") + window.location.search + window.location.hash);
}
```

Going through `parse()` matters once paths are translated: `/sobre` is a Portuguese URL, not a canonical path, and only `parse()` knows to read it as `/about`.

Use the same call for the `<link rel="alternate" hreflang>` tags that tell search engines about each language, and add an `x-default` tag for readers whose language you don't offer, pointing at the default locale's page:

```ts
const defaultLocale = "en"; // the defaultLocale you configured
const link = (hreflang: string, pathname: string) => `<link rel="alternate" hreflang="${escapeHtml(hreflang)}" href="${escapeHtml(new URL(pathname, "https://example.com").href)}">`;

const alternates = [...routing.localizeAll(route.pathname).map((page) => link(page.locale, page.pathname)), link("x-default", routing.localize(route.pathname, defaultLocale))];
```

Escape both values as you would any text in HTML, or let your framework create the tags. A path can contain characters, such as `"` or `&`, that are allowed in a URL but not raw inside an attribute.

## Translate paths

`/pt/about` is a Portuguese page with an English address. To give it Portuguese words, list the translated paths in `pathnames`, keyed by canonical path:

```ts
export const routing = createLocaleRouting({
  locales: ["en", "pt", "es"] as const,
  defaultLocale: "en",
  localePrefix: "except-default",
  pathnames: {
    "/about": { pt: "/sobre", es: "/acerca" },
    "/products/:id": { pt: "/produtos/:id" },
    "/products/:id/reviews/:reviewId": { pt: "/avaliacoes/:reviewId/produto/:id" },
  },
});
```

```ts
routing.localize("/about", "pt"); // "/pt/sobre"
routing.localize("/products/42", "pt"); // "/pt/produtos/42"
routing.parse("/pt/produtos/42"); // { locale: "pt", pathname: "/products/42" }
```

Your application keeps routing on `/products/42`, whatever the language. Only the URL changes.

How the table reads:

- **Parameters** are segments that start with `:`, such as `:id`. They match any one segment, and the value is copied across unchanged. Every form must use the same parameters as the canonical path, but in any order, because languages don't agree on word order: `/products/42/reviews/7` is `/pt/avaliacoes/7/produto/42`.
- **A catch-all** is a last segment written `:name*`, such as `"/docs/:path*": { pt: "/documentos/:path*" }`. It matches one or more segments and copies them across, so `/docs/guides/setup` is `/pt/documentos/guides/setup`. It does not match zero segments: list `/docs` itself as its own entry.
- **Anything the table doesn't list keeps its words.** `/blog` is `/pt/blog`, and `/products/42` in Spanish is `/es/products/42`, since only Portuguese translates it.
- **Fixed segments match case-sensitively**, as URLs do, so `/pt/Sobre` is not the about page. Only the locale prefix ignores case.
- **Write words as you would read them.** `"/configurações"` matches the `/configura%C3%A7%C3%B5es` that browsers send, and `localize()` returns the encoded form.
- **A fixed segment beats a parameter, and a parameter beats a catch-all.** With both `/products/new` and `/products/:id` listed, `/products/new` is the new-product page, whichever order the table lists them in. With `/docs/intro` and `/docs/:path*`, `/docs/intro` is the intro page and every other `/docs/…` path goes to the catch-all.
- **The default locale can be translated too.** A Portuguese-first site with English code can use `defaultLocale: "pt"` and `{ "/about": { pt: "/sobre" } }`, so `/sobre` is the Portuguese page and `/en/about` the English one.

### Mistakes it catches

`createLocaleRouting` checks the table when you create it, so a mistake fails at startup instead of on some unlucky click. Each of these throws a `TypeError` that names the entry:

- **Two pages with the same path in one locale.** `{ "/about": { pt: "/sobre" }, "/company": { pt: "/sobre" } }` gives Portuguese two pages at `/pt/sobre`. Give one of them other words. The same goes for a form that takes words another page keeps: if `/contact` is `/about` in Spanish, the Spanish `/about` would be two pages.
- **Two canonical paths with the same shape.** `/products/:id` and `/products/:slug` match the same paths. Keep one.
- **Parameters that differ from the canonical path's.** `{ "/products/:id": { pt: "/produtos/:slug" } }` loses `:id`. Rename it, or move it, but keep it. A catch-all must stay a catch-all in every form.
- **A catch-all that isn't last**, such as `/docs/:path*/edit`.
- **A path that starts with a locale**, such as `/pt/about` as a canonical path. The prefix would be read as the locale. List `/about` instead.
- **A locale that isn't configured**, or one listed twice in different letter case.
- **A path `parse()` would reject**, as listed under [Paths it accepts](#paths-it-accepts).

### Register translated routes

Routing reads and builds paths; your framework still has to send `/pt/sobre` to the about page. There are two ways to do that, and both work with any framework.

**Rewrite to the canonical path.** If your framework or server can change the path it routes on, as server middleware and request hooks usually can, register only the canonical routes and route on `parse()`'s result:

```ts
const route = routing.parse(url.pathname);
// Route on `route.pathname`, such as "/about" for "/pt/sobre", and render in `route.locale`.
```

**Register one route per locale.** A route pattern is a path, so `localizeAll()` translates it:

```ts
routing.localizeAll("/products/:id");
// [{ locale: "en", pathname: "/products/:id" }, { locale: "pt", pathname: "/pt/produtos/:id" }, { locale: "es", pathname: "/es/products/:id" }]
```

Register each one with its locale. With `@codenhub/router`, that is:

```ts
for (const { locale, pathname } of routing.localizeAll("/products/:id")) {
  router.on(pathname, ({ params }) => renderProduct(params["id"], locale));
}
```

`@codenhub/router` takes the first route that matches, in the order you register them. When two of a locale's paths can match the same URL, such as `/pt/produtos/novo` and `/pt/produtos/:id`, register the one with fixed words first.

`localizeAll()` writes a catch-all as `:name*`. Translate that into your framework's own syntax when you register it, such as `[...path]` in a file-based router. `@codenhub/router` has no catch-all, so with it, route such paths by rewriting to the canonical path instead.

## Drop the prefix

`/pt/sobre` already says Portuguese twice. With `localePrefix: "when-ambiguous"`, a translated path drops the prefix when its words can only be Portuguese:

```ts
export const routing = createLocaleRouting({
  locales: ["en", "pt"] as const,
  defaultLocale: "en",
  localePrefix: "when-ambiguous",
  pathnames: { "/about": { pt: "/sobre" } },
});

routing.localize("/about", "pt"); // "/sobre"
routing.parse("/sobre"); // { locale: "pt", pathname: "/about" }
routing.localize("/", "pt"); // "/pt"
routing.localize("/blog", "pt"); // "/pt/blog"
```

The prefix stays wherever the path alone can't say which language it is in:

- **Paths with the same words in two languages.** `/` and `/blog` exist in English too, so Portuguese keeps `/pt` and `/pt/blog`. Two languages translating to the same words, such as `/contato` in both Portuguese and Spanish, keep the prefix as well.
- **Paths another language's parameter could match.** If Spanish lists `/:tag`, every one-segment path could be a Spanish tag, so `/sobre` keeps its prefix.
- **Paths made only of parameters**, such as `/:tag`, which could be anything.

The default locale never has a prefix in this mode, and `parse()` still accepts `/pt/sobre`, so redirect it as in [Redirect to the canonical URL](#redirect-to-the-canonical-url).

### The risk you take on

Routing only knows the paths in your table. A path it doesn't list is taken to be the default locale's, so it can't see a clash with a page it was never told about. Say your English blog has a post at `/sobre`, a slug that came from your CMS. `/sobre` now opens the Portuguese about page, and the post can't be reached.

`localize()` catches this when it builds a path, and throws a `RangeError` rather than link to the wrong page:

```ts
routing.localize("/sobre", "en");
// RangeError: [I18n] "/sobre" in "en" would be read as "/about" in "pt"; …
```

A static build that localizes every page it renders finds every clash at build time. A server only finds one when it builds that page's links, so if your URLs come from anywhere outside the table, such as a CMS, check new slugs against `parse()`, or keep the prefix with `"except-default"`.

The same error tells you when you passed a URL where `localize()` wants a canonical path, such as `localize("/sobre", "en")` when you meant the page at `/sobre`. Pass `parse("/sobre").pathname` instead.

## Generate every localized page

`localizeAll()` returns a path for every locale, in the order of `locales`. With the table from [Translate paths](#translate-paths):

```ts
routing.localizeAll("/about");
// [{ locale: "en", pathname: "/about" }, { locale: "pt", pathname: "/pt/sobre" }, { locale: "es", pathname: "/es/acerca" }]
```

Feed it your page list to get every page a static build needs, then render each one with its own manager, as in [Build a static site](server-rendering.md#build-a-static-site).

## Paths it accepts

Routing works on the path of a URL only. Give it `url.pathname`, not the full URL, and handle the query string and fragment yourself.

To keep a crafted URL from reaching a different page than the one checked, every method throws a `TypeError` for a path that:

- does not start with `/`, or is a full or protocol-relative URL, such as `https://…` or `//host`;
- contains `?`, `#`, `\`, `//`, or a control character;
- contains a `.` or `..` segment, or encodes one, a slash, a backslash, a `%`, or a control character with `%`;
- has a malformed `%` escape, or is longer than 8,192 characters.

Ordinary escapes, such as `%20`, are fine, and a trailing slash is kept: `/pt/sobre/` parses to `/about/`.

`localize()` throws a `RangeError` instead when the path it builds would be longer than 8,192 characters, as a path just under the limit can be once its prefix or translated words are added.

## What routing leaves to your framework

Routing reads and builds paths. Your framework or server still registers the routes, redirects, navigates, and renders. It also doesn't know about a base path: if your site lives under `/docs`, remove that before calling `parse()` and add it back after `localize()`.

The table covers your application's own routes. Content slugs, such as a blog post's title in its URL, belong to wherever the content lives, such as your CMS, which knows each post's slug in each language.
