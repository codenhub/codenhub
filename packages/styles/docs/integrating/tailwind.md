---
title: Tailwind CSS v4
description: Using the /tw source entrypoints in a Tailwind CSS v4 project.
order: 1
---

# Tailwind CSS v4

A project that already runs Tailwind CSS v4 can process this package's source instead of its compiled output, so both sets of classes compile through the same Tailwind build.

## Why source instead of compiled

`/tw` entrypoints publish copied, uncompiled source from `dist/tw`; your own Tailwind build compiles it alongside your app, so its `@theme`, `@utility`, and `@apply` directives resolve together with yours. The compiled entrypoints (`@codenhub/styles`) still work in a Tailwind project, but then two separate CSS pipelines run side by side instead of one — use `/tw` unless a specific reason rules it out.

## Import the source entrypoint

```css
@import "tailwindcss";
@import "@codenhub/styles/tw";

@source "./src";
```

Tailwind CSS v4 scans your project automatically — most projects need nothing beyond the two imports above. `@source` paths resolve relative to the CSS file that declares them, not your project root, so `./src` here means "the `src/` next to this stylesheet"; adjust it to match where your own global stylesheet actually lives. Add `@source` only for markup Tailwind's automatic scan won't reach on its own: a path excluded by default (`.gitignore`d, or inside `node_modules` — an external component library, for instance) or, in a monorepo, one outside this file's own directory tree. Point it at your app's markup, not at this package — `/tw` already ships every class definition it publishes, so scanning it too only slows the build without adding classes.

## Add aesthetics

Add an aesthetic from the source entrypoint the same way as the compiled one, after the base import:

```css
@import "tailwindcss";
@import "@codenhub/styles/tw";
@import "@codenhub/styles/tw/aesthetics";

@source "./src";
```

## Using a focused entrypoint

Import a focused `/tw/*` entrypoint instead of the combined one — such as `/tw/button` or `/tw/form` — when a build only needs one component family; see the full [import path table](../setup.md#import-paths) for what each one composes.

## Troubleshooting

**Classes resolve to no styling**

- **What happened:** components use documented classes like `.btn.primary`, but no styling appears even though `@import "@codenhub/styles/tw"` is in the stylesheet.
- **Why:** this is rarely `@source` itself — Tailwind already scans your project automatically. The more common cause is markup living somewhere that automatic scan excludes by default: a `.gitignore`d path, or a component pulled from `node_modules`. Tailwind may not see a class used only there and skips generating a rule for it.
- **Fix:** add an explicit `@source` pointing at that directory, resolved relative to this stylesheet — matching the [example above](#import-the-source-entrypoint).

**Duplicate token and reset rules**

- **What happened:** the built stylesheet is larger than expected, and browser devtools show the same custom properties or reset rules defined twice.
- **Why:** importing both a compiled entrypoint (`@codenhub/styles`) and a `/tw` entrypoint (`@codenhub/styles/tw`) in the same build compiles the same tokens and reset from two independent sources; Tailwind's build has no way to know they describe the same package.
- **Fix:** pick one path per project — `/tw` entrypoints for a project running Tailwind CSS v4, compiled entrypoints everywhere else.

Tailwind CSS 4 or newer is required for every `/tw` entrypoint.
