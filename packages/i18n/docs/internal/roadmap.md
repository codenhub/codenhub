---
status: DRAFT
last_updated: 2026-10-29
scope: `@codenhub/i18n` direction.
---

# Roadmap

## Purpose

Durable direction for `@codenhub/i18n`. The repo-wide roadmap is `docs/roadmap.md`. Reasons for past choices are in [decisions.md](decisions.md).

## Done

- **Plural selection (0.2.0).** Plural groups with CLDR forms, selected by a numeric `count`. Design in [decisions.md](decisions.md#plurals-020).

## Planned

- **Translated path segments (0.3.0).** Let `/about` be `/sobre` in Portuguese, not only `/pt/about`.
  - A `pathnames` option on `createLocaleRouting`, keyed by canonical path, with `:param` segments as in `@codenhub/router`: `{ "/products/:id": { pt: "/produtos/:id" } }`. Unlisted paths keep their segments.
  - `localize("/products/42", "pt")` returns `"/pt/produtos/42"`; `parse("/pt/produtos/42")` returns `{ locale: "pt", pathname: "/products/42" }`, the canonical path the app routes on. `localizeAll` follows.
  - `createLocaleRouting` rejects a table where two canonical paths localize to the same path in one locale, or whose parameters differ between forms.
  - Keep the locale prefix. Without it, a path shared by two languages, such as `/` or a brand name, can't tell which language it is in.
  - The framework still does the rewrite or registers the routes: Next.js middleware, the SvelteKit `reroute` hook, Astro middleware, or one route per localized path. A guide shows each.
  - Content slugs, such as a blog post's title in the URL, stay with the CMS; the table covers the app's own routes.
- **ICU messages and formatting.** `{count, plural, …}`, `select`, and number and date arguments, extending the `{name}` syntax. Plural groups stay supported.
