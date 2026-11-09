---
title: Tailwind CSS v4
description: Using the /tw source entrypoints in a Tailwind CSS v4 project.
order: 1
---

# Tailwind CSS v4

A project that already runs Tailwind CSS v4 can compile this package's source instead of loading its compiled output. Your app's utilities and the package's classes then come out of one build, share one theme, and use one `dark:` variant. This page covers the import, aesthetics, the focused entrypoints, and the build problems you are likely to meet.

## Why source instead of compiled

`/tw` entrypoints publish copied, uncompiled source from the package's `tw/` folder; your own Tailwind build compiles it alongside your app, so its `@theme`, `@utility`, and `@apply` directives resolve together with yours. The compiled entrypoints (`@codenhub/styles`) still work in a Tailwind project, but then two separate CSS pipelines run side by side instead of one — use `/tw` unless a specific reason rules it out.

## Import the source entrypoint

```css
@import "@codenhub/styles/tw";

@source "./src";
```

`/tw` imports Tailwind itself, so it replaces your own `@import "tailwindcss"` rather than joining it: with both, Tailwind's Preflight is emitted twice. Every other `/tw/*` entrypoint expects your import to come first; see [Using a focused entrypoint](#using-a-focused-entrypoint).

Tailwind CSS v4 scans your project automatically — most projects need nothing beyond the import above. `@source` paths resolve relative to the CSS file that declares them, not your project root, so `./src` here means "the `src/` next to this stylesheet"; adjust it to match where your own global stylesheet actually lives. Add `@source` only for markup Tailwind's automatic scan won't reach on its own: a path excluded by default (`.gitignore`d, or inside `node_modules` — an external component library, for instance) or, in a monorepo, one outside this file's own directory tree. Point it at your app's markup, not at this package: the package's source names every class it defines, so scanning it emits all of them whether your pages use them or not.

## Add aesthetics

Add an aesthetic from the source entrypoint the same way as the compiled one, after the base import:

```css
@import "@codenhub/styles/tw";
@import "@codenhub/styles/tw/aesthetics";

@source "./src";
```

## Using a focused entrypoint

Import a focused `/tw/*` entrypoint instead of the combined one — such as `/tw/button` or `/tw/form` — when a build only needs one component family; see the full [entrypoint table](../setup.md#all-entrypoints) for what each one composes.

Unlike `/tw`, the focused entrypoints and `/tw/native` do not import Tailwind, so keep your own import first:

```css
@import "tailwindcss";
@import "@codenhub/styles/tw/button";
```

## Troubleshooting

**Classes resolve to no styling**

- **What happened:** components use documented classes like `.btn.primary`, but no styling appears even though `@import "@codenhub/styles/tw"` is in the stylesheet.
- **Why:** this is rarely `@source` itself — Tailwind already scans your project automatically. The more common cause is markup living somewhere that automatic scan excludes by default: a `.gitignore`d path, or a component pulled from `node_modules`. Tailwind may not see a class used only there and skips generating a rule for it.
- **Fix:** add an explicit `@source` pointing at that directory, resolved relative to this stylesheet — matching the [example above](#import-the-source-entrypoint).

**Duplicate token and reset rules**

- **What happened:** the built stylesheet is larger than expected, and browser devtools show the same custom properties or reset rules defined twice.
- **Why:** one of two things. Importing both a compiled entrypoint (`@codenhub/styles`) and a `/tw` entrypoint (`@codenhub/styles/tw`) in the same build compiles the same tokens and reset from two independent sources; Tailwind's build has no way to know they describe the same package. Or your stylesheet imports `tailwindcss` beside `/tw`, which already imports it, so Preflight is emitted twice.
- **Fix:** pick one path per project — `/tw` entrypoints for a project running Tailwind CSS v4, compiled entrypoints everywhere else — and drop your own `@import "tailwindcss"` when you import `/tw`.

**A class built at runtime has no styling**

- **What happened:** `<button class="btn primary">` is styled, but a button whose class comes from a variable, such as `"btn " + variant`, or from CMS content, is not.
- **Why:** Tailwind emits only the classes it finds written out in the files it scans. That holds for the package's classes too: a `/tw` build emits `.alert` only if `alert` appears somewhere it scans, which keeps the stylesheet to what your pages use. A name assembled at runtime never appears whole in a file, so the scan misses it.
- **Fix:** write each complete class name somewhere Tailwind scans, for example in a lookup object (`{ save: "btn primary", remove: "btn destructive" }`), or list the names your code or content can produce in your stylesheet:

```css
@import "@codenhub/styles/tw";

@source inline("btn primary secondary destructive alert badge");
```

Every `/tw` entrypoint requires Tailwind CSS 4.3.2 or newer, below 5, the version it is tested against.

## The `dark:` variant

The `/tw` entrypoints define their own `dark:` variant, so your utilities switch with the same light and dark selectors the package's tokens use. It has one known difference from the tokens when themes are nested; see [Theming → The dark: variant](../usage/theming.md#the-dark-variant).

## Next

Return to the main path: [Building a screen](../concepts.md) adds the first card and form to the settings page. Everything it shows works the same on `/tw`.
