---
title: Localized URLs
description: Put the locale in the path, translate the path itself, read both back, link to other languages, generate every localized page, and send visitors to their own language on a static site.
order: 4
---

# Localized URLs

Giving each language its own URL, such as `/about` and `/pt/about`, lets people share a link in the language they read, and lets search engines index every language. `@codenhub/i18n/routing` handles the part that is the same in every framework: reading the locale from a path, and building the path for another locale. It can also translate the path itself, so the Portuguese about page is `/pt/sobre`, or even just `/sobre`.

The examples continue the tea shop's `en` and `pt` app from the earlier pages. Spanish joins once paths get translated, and the shop's about page, cart, product pages, and help pages each get their own words.

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

`localePrefix` decides which paths start with their locale. It is required and has no default, because each choice gives your site different URLs, and URLs are hard to change once people have bookmarked them. Leaving it out throws `TypeError: [I18n] Invalid locale routing configuration: localePrefix: Expected "always", "except-default", or "when-ambiguous", received undefined`.

| `localePrefix`     | English about page | Portuguese about page                                                             |
| ------------------ | ------------------ | --------------------------------------------------------------------------------- |
| `"except-default"` | `/about`           | `/pt/about`                                                                       |
| `"always"`         | `/en/about`        | `/pt/about`                                                                       |
| `"when-ambiguous"` | `/about`           | `/pt/about`, or `/sobre` once translated; see [Drop the prefix](#drop-the-prefix) |

How to choose:

- `"except-default"` keeps your existing URLs when you add a language.
- `"always"` makes every URL name its language, so `/about` is not a page, which suits a site that redirects `/` to the visitor's language.
- `"when-ambiguous"` drops the prefix from translated paths that can only belong to one language, and is worth reading about before you pick it.

Use the same `locales` and `defaultLocale` as your manager. Routing is separate from the manager, so it also works where no translation happens, such as in a server's redirect logic.

If you keep the configuration in a variable before passing it in, put `as const` after the whole object: `const config = { … } as const`. Without it, TypeScript widens `localePrefix` to `string`, and `createLocaleRouting` rejects it at compile time. `as const` on `localePrefix` alone compiles, but types every locale as `string`, so `localize("/about", "fr")` compiles too.

### Trailing slashes

By default, `localize()` keeps the slash of the path you give it: `/about/` gives `/pt/about/`, and `/about` gives `/pt/about`. A locale's home page has no slash to keep, since `/` says nothing about one, so it is always `/pt`.

Many static hosts serve `pt/index.html` at `/pt/` and redirect `/pt` there, so on a site like that, set `trailingSlash`:

```ts
export const routing = createLocaleRouting({
  locales: ["en", "pt"] as const,
  defaultLocale: "en",
  localePrefix: "except-default",
  trailingSlash: "always",
});

routing.localize("/", "pt"); // "/pt/"
routing.localize("/about", "pt"); // "/pt/about/"
routing.localize("/", "en"); // "/"
```

| `trailingSlash`          | Builds                                                         |
| ------------------------ | -------------------------------------------------------------- |
| `"preserve"`, by default | The given path's slash: `/pt/about/` or `/pt/about`, and `/pt` |
| `"always"`               | A slash on every path: `/pt/about/` and `/pt/`                 |
| `"never"`                | No slash on any path but `/`: `/pt/about` and `/pt`            |

`parse()` accepts both spellings whatever you choose, and its `pathname` keeps the request's slash: `/about` for `/pt/about` and `/about/` for `/pt/about/`. Route both values to the same page, or strip the slash before routing. With `"always"` or `"never"`, [Redirect to the canonical URL](#redirect-to-the-canonical-url) then sends the other spelling to the one `localize()` builds, so each page has one address.

## Read the locale from a path

`parse()` splits a path into its locale and the rest:

```ts
routing.parse("/pt/about"); // { locale: "pt", pathname: "/about", alternates: […] }
routing.parse("/about"); // { locale: "en", pathname: "/about", alternates: […] }
routing.parse("/PT/about"); // { locale: "pt", pathname: "/about", alternates: […] }
```

The `pathname` it returns is the **canonical path**: the path your application routes on, the same in every language. Hold on to that idea; it matters once paths are translated. `alternates` is the page's URL in each language, for [links to other languages](#link-to-another-language).

`parse()` returns `undefined` for a path that is not a page in any locale, such as `/pt/en/about`. Once its prefix is removed it starts with another locale, so no link ever leads there. Answer it with a 404.

With `localePrefix: "always"`, a path without a locale returns `undefined` too, so you can redirect it. Add the chosen locale's prefix and parse that. A path in that locale's words, such as `/sobre`, is then read as one, and a path that is no page in that locale either gets its 404:

```ts
// A file, such as `/favicon.ico`, is not a page; see Redirect to the canonical URL below.
const isFile = /\.[a-z0-9]+$/i.test(url.pathname);
const route = isFile ? undefined : routing.parse(url.pathname);
if (route === undefined && !isFile) {
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

`parse()` is forgiving: `/PT/about` and `/en/about` are read as well as `/pt/about` and `/about`, and so are both spellings of a [trailing slash](#trailing-slashes). That is friendly to someone typing a URL. A search engine that finds one page at several addresses, though, splits its ranking between them, and four addresses for one about page is three too many. Send every other spelling to the one `localize()` builds. Every path `parse()` returns has one, so this never throws.

Run this redirect, and the one for a missing prefix above, only for page routes, after your server has answered requests for static files. `parse()` reads any path as a page:

- With `trailingSlash: "always"`, this redirect sends `/favicon.ico` to `/favicon.ico/`.
- With `localePrefix: "always"`, the one above sends it to `/en/favicon.ico`.

Neither has a file. If the redirects have to run first, skip paths that end in a file extension, as both examples do:

```ts
const isFile = /\.[a-z0-9]+$/i.test(url.pathname);
const route = isFile ? undefined : routing.parse(url.pathname);
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

A canonical path never starts with a locale, so `localize()` throws a `RangeError` for one, such as `/pt/about`. That is a URL; pass `parse("/pt/about").pathname` instead. It throws for a page of your own whose path starts with a locale code, too: with Burmese, `my`, configured, an English page at `/my/orders` has no URL, since `/my/orders` is the Burmese `/orders`. Give such a page another path.

On a localized site, switching language is a navigation, not just `setLocale()`: `setLocale()` changes the text but never the URL. So the shop's language picker reads the current page with `parse()`, takes its path in the new language from `alternates`, keeps the query string and fragment, and lets your router go there:

```ts
const route = routing.parse(window.location.pathname);
const target = route?.alternates.find((alternate) => alternate.locale === "pt");
if (target !== undefined) {
  await navigate(target.pathname + window.location.search + window.location.hash);
}
```

Going through `parse()` matters once paths are translated: `/sobre` is a Portuguese URL, not a canonical path, and only `parse()` knows to read it as `/about`.

`alternates` lists the page in every language that has a URL for it, in the order of `locales`, the current one included. A language can be missing: with `/products/:id` and `/products/new` both translated, an English product called `novo` has no Portuguese URL, because `/pt/produtos/novo` is the new-product page. Build the picker from `alternates`, so it offers only the languages it can go to, or send a missing one to that language's home page. `localize()` throws for such a page instead, as [The risk you take on](#the-risk-you-take-on) explains, so don't call it with a path read from a request.

Use the same list for the `<link rel="alternate" hreflang>` tags that tell search engines about each language. Add an `x-default` tag for readers whose language you don't offer, pointing at the default locale's page, when it has one:

```ts
const defaultLocale = "en"; // the defaultLocale you configured
const link = (hreflang: string, pathname: string) => `<link rel="alternate" hreflang="${escapeHtml(hreflang)}" href="${escapeHtml(new URL(pathname, "https://example.com").href)}">`;

const tags = route.alternates.map((page) => link(page.locale, page.pathname));
const fallback = route.alternates.find((page) => page.locale === defaultLocale);
if (fallback !== undefined) {
  tags.push(link("x-default", fallback.pathname));
}
```

Escape both values as you would any text in HTML, or let your framework create the tags. A path can contain characters, such as `&` or `'`, that are allowed in a URL but not raw inside an attribute.

## Translate paths

`/pt/about` is a Portuguese page with an English address. To give it Portuguese words, list the translated paths in `pathnames`, keyed by canonical path. This is where the shop adds Spanish:

```ts
export const routing = createLocaleRouting({
  locales: ["en", "pt", "es"] as const,
  defaultLocale: "en",
  localePrefix: "except-default",
  pathnames: {
    "/about": { pt: "/sobre", es: "/acerca" },
    "/cart": { pt: "/carrinho", es: "/carrito" },
    "/products/:id": { pt: "/produtos/:id" },
    "/products/:id/reviews/:reviewId": { pt: "/avaliacoes/:reviewId/produto/:id" },
  },
});
```

```ts
routing.localize("/about", "pt"); // "/pt/sobre"
routing.localize("/cart", "es"); // "/es/carrito"
routing.localize("/products/42", "pt"); // "/pt/produtos/42"
routing.parse("/pt/produtos/42"); // { locale: "pt", pathname: "/products/42", alternates: […] }
```

Your application keeps routing on `/products/42`, whatever the language. Only the URL changes.

How the table reads:

- **Parameters** are segments that start with `:`, such as `:id`. They match any one segment, and the value is copied across unchanged. Every form must use the same parameters as the canonical path, but in any order, because languages don't agree on word order: `/products/42/reviews/7` is `/pt/avaliacoes/7/produto/42`.
- **A catch-all** is a last segment written `:name*`, such as `"/help/:path*": { pt: "/ajuda/:path*" }`. It matches one or more segments and copies them across, so `/help/shipping/returns` is `/pt/ajuda/shipping/returns`. It does not match zero segments: list `/help` itself as its own entry.
- **Anything the table doesn't list keeps its words.** `/blog` is `/pt/blog`, and `/products/42` in Spanish is `/es/products/42`, since only Portuguese translates it.
- **Fixed segments match case-sensitively**, as URLs do, so `/pt/Sobre` is not the about page. Only the locale prefix ignores case.
- **Prefer plain letters in paths.** Routing doesn't change your words, so `/servicos` is what you get only if you write `/servicos`. Most sites drop accents from URLs, because an accented path is shown percent-encoded wherever it gets copied as text, such as `/servi%C3%A7os`. Accents work too: `"/serviços"` matches the `/servi%C3%A7os` that browsers send, and `localize()` returns the encoded form, as it does for every segment, such as a product slug, and as `parse()` returns its `pathname`. So a static build that writes a folder for that path has to decode it first, as in [Build a static site](server-rendering.md#build-a-static-site).
- **A page comes back in one spelling.** `parse()` writes every segment, listed or not, as RFC 3986 normalizes a URL: an escaped letter, digit, or `-._~` is decoded, every other escape is written in upper case, and a character a URL encodes, such as `é`, is encoded. So `/%61bout` and `/pt/%73obre`, odd spellings of `/about` and `/pt/sobre`, both give `pathname: "/about"`, and `/products/caf%c3%a9` gives `/products/caf%C3%A9`. An escaped reserved character stays escaped, so `/products/c%2B%2B` and `/products/c++` are two pages, since a server may read `%2B` differently from `+`. So pass the pathname as the URL writes it, such as `new URL(request.url).pathname`, not one your framework decoded: decoded, `/products/c%2B%2B` becomes `/products/c++`, another page.
- **A fixed segment beats a parameter, and a parameter beats a catch-all.** With both `/products/new` and `/products/:id` listed, `/products/new` is the new-product page, whichever order the table lists them in. With `/help/contact` and `/help/:path*`, `/help/contact` is the contact page and every other `/help/…` path goes to the catch-all.
- **The default locale can be translated too.** A Portuguese-first site with English code can use `defaultLocale: "pt"` and `{ "/about": { pt: "/sobre" } }`, so `/sobre` is the Portuguese page and `/en/about` the English one.

### Mistakes it catches

`createLocaleRouting` checks the table when you create it, so a mistake fails at startup instead of on some unlucky click. Each of these throws a `TypeError` that names the entry:

- **Two pages with the same path in one locale.** `{ "/about": { pt: "/sobre" }, "/company": { pt: "/sobre" } }` gives Portuguese two pages at `/pt/sobre`. Give one of them other words. The same goes for a form that takes words another listed page keeps: with `{ "/about": { pt: "/sobre" }, "/contact": { es: "/about" } }`, the about page keeps its English words in Spanish, so `/es/about` would be both pages, and creation throws.
- **Two canonical paths with the same shape.** `/products/:id` and `/products/:slug` match the same paths. Keep one.
- **Parameters that differ from the canonical path's.** `{ "/products/:id": { pt: "/produtos/:slug" } }` loses `:id`. Rename it, or move it, but keep it. A catch-all must stay a catch-all in every form.
- **A catch-all that isn't last**, such as `/help/:path*/edit`.
- **A path that starts with a locale**, such as `/pt/about` as a canonical path. The prefix would be read as the locale. List `/about` instead.
- **A locale that isn't configured**, or one listed twice in different letter case.
- **A path `parse()` would reject**, as listed under [Paths it accepts](#paths-it-accepts).

The check only sees pages the table lists. Without the `/about` entry, `{ "/contact": { es: "/about" } }` is accepted, because routing doesn't know you have an about page. The clash then shows up later, when you build that page's link: `localize("/about", "es")` throws `RangeError: [I18n] "/about" in "es" would be read as "/contact" in "es"; …`. [The risk you take on](#the-risk-you-take-on) explains this net and how to make sure it catches clashes at build time rather than in production.

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

A pattern that ends in `:name*` is translated through the table's catch-all, never through a parameter: with `/help/:id` and `/help/:path*` both listed, `localizeAll("/help/:path*")` gives the Portuguese `/pt/ajuda/:path*`, not the one-segment `/pt/ajuda/artigo/:path*`. `localizeAll()` writes a catch-all as `:name*`. Translate that into your framework's own syntax when you register it, such as `[...path]` in a file-based router. `@codenhub/router` has no catch-all, so with it, route such paths by rewriting to the canonical path instead.

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
routing.parse("/sobre"); // { locale: "pt", pathname: "/about", alternates: […] }
routing.localize("/", "pt"); // "/pt"
routing.localize("/blog", "pt"); // "/pt/blog"
```

The prefix stays wherever the path alone can't say which language it is in:

- **Paths with the same words in two languages.** `/` and `/blog` exist in English too, so Portuguese keeps `/pt` and `/pt/blog`. Two languages translating to the same words, such as `/contato` in both Portuguese and Spanish, keep the prefix as well.
- **Paths a default-language parameter could match.** If English lists `/:slug`, every one-segment path could be an English page, so `/sobre` keeps its prefix.
- **Paths made only of parameters**, such as `/:tag`, which could be anything.

Only paths read without a prefix count. A Spanish `/:tag` keeps its prefix, so it only matches paths that start with `/es`, and the Portuguese `/sobre` still drops its own.

The default locale never has a prefix in this mode. `parse()` still accepts `/pt/sobre`, so redirect it as in [Redirect to the canonical URL](#redirect-to-the-canonical-url).

### The risk you take on

Routing only knows the paths in your table. A path it doesn't list is taken to be the default locale's, so it can't see a clash with a page it was never told about.

Say the shop's English blog has a post at `/sobre`, a slug that came from your CMS. `/sobre` now opens the Portuguese about page, and the post can't be reached.

`localize()` catches this when it builds a path, and throws a `RangeError` rather than link to the wrong page:

```ts
routing.localize("/sobre", "en");
// RangeError: [I18n] "/sobre" in "en" would be read as "/about" in "pt"; …
```

A static build that localizes every page it renders, with `localizeAll()` as in [Generate every localized page](#generate-every-localized-page), finds every clash at build time. A server only finds one when it builds a link to that page with `localize()`. The links it builds from a request's `parse().alternates` leave a clashing language out rather than fail, so nothing tells you there. So if your URLs come from anywhere outside the table, such as a CMS, run new slugs through `localizeAll()` when you publish them, or keep the prefix with `"except-default"`.

The same error tells you when you passed a URL where `localize()` wants a canonical path, such as `localize("/sobre", "en")` when you meant the page at `/sobre`. Pass `parse("/sobre").pathname` instead.

## Generate every localized page

`localizeAll()` returns a path for every locale, in the order of `locales`. With the table from [Translate paths](#translate-paths):

```ts
routing.localizeAll("/about");
// [{ locale: "en", pathname: "/about" }, { locale: "pt", pathname: "/pt/sobre" }, { locale: "es", pathname: "/es/acerca" }]
```

Feed it your page list to get every page a static build needs, then render each one with its own manager, as in [Build a static site](server-rendering.md#build-a-static-site).

## Detect the language on a static site

A server sends a visitor who arrives at `/` to their language from `Accept-Language`, as in [Read the locale from a path](#read-the-locale-from-a-path). A static site with `localePrefix: "except-default"` has no server to see that header: the default locale's pages are the unprefixed ones, and the browser has to do the redirect.

It is a short script with a long list of ways to get it slightly wrong, so here they are first:

- **It runs before first paint.** A deferred script redirects after the page has shown in the default language, so the visitor sees it flash. Put the redirect in an inline script in `<head>`. An inline script cannot `import`, so neither `matchLocale()` nor `routing` is there: compute what it needs at build time and pass it in.
- **The visitor's choice wins.** Check the saved language before `navigator.languages`. Otherwise a Portuguese browser that picks English is sent straight back to Portuguese. The browser binding, set up as in [Read the locale on the client](#read-the-locale-on-the-client), already saves it: it stores `{"locale":"en"}` under the key `"i18n"`, or your `storageKey`, on every page it starts on. Since switching language is a navigation, that is the language of the last page the visitor read, including the one their switch led to.
- **A link on your own site never redirects.** Where storage is blocked, the choice can't be saved, so an arrival from your own site, a same-origin `document.referrer`, keeps the page it asked for. That needs the browser to send the referrer. A link with `rel="noreferrer"`, or a page served with `Referrer-Policy: no-referrer`, sends none, and its visit is redirected like one from elsewhere, so a switch to the default language can be sent straight back. Leave both off your own links, including the language switcher.
- **A prefixed URL never redirects.** Render the script only on the default locale's pages, so a shared `/pt/about` link always opens in Portuguese. Keep `search` and `hash` when redirecting.

At build time, while you [render each page](#generate-every-localized-page), compute two things for the script: this page's path in every other locale, with `localize()`, and a table from each language and its likely script, such as `zh-Hant` for `zh-TW`, to its locale:

```ts
// Build time, for the page at `pathname` in the default locale.
const locales = ["en", "pt", "es"] as const;
const defaultLocale = "en";

const config = {
  storageKey: "i18n", // the browser binding's storageKey
  locales,
  // `zh-TW` is `zh-Hant`: a language and its likely script, as `matchLocale()` compares them, with Norwegian `no` as `nb`.
  languages: Object.fromEntries(
    locales.map((locale) => {
      const { language, script } = new Intl.Locale(locale).maximize();
      return [`${language === "no" ? "nb" : language}-${script}`, locale];
    }),
  ),
  targets: Object.fromEntries(locales.filter((locale) => locale !== defaultLocale).map((locale) => [locale, routing.localize(pathname, locale)])),
};
// Writes `<` as `\u003c`, so no path can close the script element early.
const json = JSON.stringify(config).replaceAll("<", "\\u003c");
```

Then render, on the default locale's pages only:

```html
<script>
  ((config) => {
    try {
      if (document.referrer !== "" && new URL(document.referrer).origin === location.origin) return;
    } catch {
      // An unreadable referrer counts as arriving from elsewhere.
    }

    let saved;
    try {
      // The binding saves `{"locale":"pt"}`.
      saved = JSON.parse(localStorage.getItem(config.storageKey) ?? "null")?.locale;
    } catch {
      // Storage blocked or unreadable: fall back to the browser's languages.
    }

    // A saved locale your site no longer lists, such as `pt-PT`, is matched like the browser's first language.
    let target = config.locales.includes(saved) ? saved : undefined;
    if (target === undefined) {
      const browser = navigator.languages.length > 0 ? navigator.languages : [navigator.language];
      const preferences = typeof saved === "string" ? [saved, ...browser] : browser;
      for (const preference of preferences) {
        let language;
        try {
          const tag = new Intl.Locale(preference);
          if (tag.language === "und") continue; // No language at all, though it would maximize to English.
          // Reads old codes as `matchLocale()` does, such as `iw-IL` as Hebrew, `he`, and adds the likely script.
          const likely = tag.maximize();
          language = `${likely.language === "no" ? "nb" : likely.language}-${likely.script}`;
        } catch {
          continue; // Not a language tag.
        }
        if (Object.hasOwn(config.languages, language)) {
          target = config.languages[language];
          break;
        }
      }
    }

    if (target !== undefined && Object.hasOwn(config.targets, target)) {
      location.replace(config.targets[target] + location.search + location.hash);
    }
  })(/* the build's `json` */);
</script>
```

A saved default locale finds no target, so the visitor stays. `location.replace()` keeps the default-locale page out of history, so Back doesn't land on a page that redirects again.

### How close it gets to `matchLocale()`

Matching by language and script picks what `matchLocale()` would when your site has one locale per language and script, such as `en`, `pt-BR`, `es`, `zh-Hans`, and `zh-Hant`: `pt-PT` gets `pt-BR`, `es-MX` gets `es`, and `zh-TW` gets `zh-Hant`. A language in another script never matches, so with only `zh`, which is Simplified, a `zh-TW` visitor moves on to their next language.

Hold the two together with a test that runs the same matching against `matchLocale()` for a few preference lists.

With more than one locale per language and script, such as `es-419` and `es-ES`, or `no` and `nb`, which count as one language, the table can't choose between them. You have two options:

- Compute a table at build time from the browser tags you expect to see, running each through `matchLocale()`.
- Run the redirect in a deferred script that imports your manager and calls `matchLocale(navigator.languages)`, and accept the flash.

## Paths it accepts

Routing works on the path of a URL only. Give it `url.pathname`, not the full URL, and handle the query string and fragment yourself.

This is the boring part of the page. It is also the part that decides whether a crafted URL can reach a different page than the one your code checked, so routing is strict about it. It refuses each of these paths:

- **Doubled slashes**, as in `//wp-login.php` or `/help//returns`. A path starting with `//` is read by browsers as another host, and an empty segment is a page no link of yours leads to. Write single slashes.
- **Backslashes**, as in `/help\returns`. Some servers treat `\` as `/`, so the same request would reach two different pages. Use `/`.
- **Control characters**, such as a line break or a tab, written raw. No real link contains them.
- **Dot segments**, `.` and `..`, as in `/help/../admin`, and their encoded forms, such as `/help/%2e%2e/admin`. A browser resolves them before sending a request, so a request that still has one was written by hand to climb out of the page it names. Resolve the path first; `new URL(path, "https://example.com").pathname` does it.
- **An encoded slash, backslash, `%`, or control character**: `%2F`, `%5C`, `%25`, or `%00` to `%1F` and `%7F`, as in `/files/a%2Fb`. An encoded slash or backslash makes servers disagree about where segments start and end, one seeing one segment where another sees two. An encoded `%` invites a second round of decoding, so `%252F` turns into `%2F` and then `/`. An encoded control character gets past the check on raw ones. Keep a slash in a value out of the path, such as in the query string.
- **A malformed escape**, a `%` not followed by two hex digits, as in `/50%off`. Write `%25` for a literal `%`… which is also refused, per the previous rule, so take the `%` out of the path.
- **More than 8,192 characters or 100 segments**, or a path whose canonical path would be longer than that, as a short translated path can be when its table entry is long. Servers and proxies cut off URLs around this length anyway, and no page is 100 folders deep; a request of thousands of one-letter segments would otherwise cost work in every locale.

A request can carry any of these, such as a scanner asking for `//wp-login.php`, so `parse()` returns `undefined` for them, and the same 404 answers them as any other path that is no page. `localize()` and `localizeAll()` build links from your own paths rather than read requests, so for the same paths they throw a `TypeError` that quotes the path and names the rule, such as `TypeError: [I18n] pathname "/help/../admin" must not contain a dot segment, . or ..`, and you fix the path in your code. A path that a URL reads as starting another host isn't quoted, as below.

Every method, `parse()` included, throws a `TypeError` for a value that is not a URL's pathname at all:

- One that does not start with `/`, such as a full URL: `TypeError: [I18n] pathname must start with /; pass url.pathname`.
- One that contains `?` or `#`, such as Node's `request.url` with its query string: `TypeError: [I18n] pathname "/search?…" must not contain ?, which starts a query; pass url.pathname`. The error names whichever of the two comes first.
- One that is not a string: `TypeError: [I18n] pathname must be a string, received undefined`.

That is a mistake in the calling code, not a request to answer, so it fails loudly instead of answering 404 to every URL with a query.

No routing error quotes what a URL reads as user info, a query, or a fragment, which can hold a credential. A path with `?` or `#` is quoted only up to it, and one that a URL reads as starting another host isn't quoted at all: one that starts with `//` or `/\`, as a protocol-relative URL does, even with a tab or line break between the two, since a URL reads `\` as `/` and skips tabs and line breaks. Its error reads `TypeError: [I18n] pathname must not start with // or /\, which a URL reads as the start of its host, even with a tab or line break between; pass url.pathname`.

Ordinary escapes, such as `%20` and `%C3%A7`, are fine, and a trailing slash is kept: `/pt/sobre/` parses to `/about/`.

`localize()` throws a `RangeError` instead when the path it builds would be longer than 8,192 characters or 100 segments, as a path just under the limit can be once its prefix or translated words are added.

## What routing leaves to your framework

Routing reads and builds paths. Your framework or server still registers the routes, redirects, navigates, and renders. It also doesn't know about a base path: if your shop lives under `/shop` on a larger site, remove that before calling `parse()` and add it back after `localize()`.

The table covers your application's own routes. Content slugs, such as a blog post's title in its URL, belong to wherever the content lives, such as your CMS, which knows each post's slug in each language.

## Next

That is the whole package: dictionaries, the browser, the server, and URLs. The tea shop is open in every language it planned for. When something goes wrong along the way, [Troubleshooting](troubleshooting.md) starts from the error or warning you see and works back to the fix.
