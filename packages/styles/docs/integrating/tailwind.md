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

`@source` tells Tailwind's build where to scan for the utility and component class names actually used in your markup, so it generates only what's referenced. Point it at your app's source, not at this package — `/tw` already ships every class definition it publishes, so scanning it too only slows the build without adding classes.

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
- **Why:** Tailwind CSS v4 statically scans the files listed by `@source` and only generates the utility and component rules it finds referenced there. If `@source` is missing or points at the wrong directory, Tailwind never sees `class="btn primary"` in your markup and skips generating rules for it.
- **Fix:** point `@source` at every directory containing markup that uses these classes — typically your app's `src/` — matching the [example above](#import-the-source-entrypoint).

**Duplicate token and reset rules**

- **What happened:** the built stylesheet is larger than expected, and browser devtools show the same custom properties or reset rules defined twice.
- **Why:** importing both a compiled entrypoint (`@codenhub/styles`) and a `/tw` entrypoint (`@codenhub/styles/tw`) in the same build compiles the same tokens and reset from two independent sources; Tailwind's build has no way to know they describe the same package.
- **Fix:** pick one path per project — `/tw` entrypoints for a project running Tailwind CSS v4, compiled entrypoints everywhere else.

Tailwind CSS 4 or newer is required for every `/tw` entrypoint.
