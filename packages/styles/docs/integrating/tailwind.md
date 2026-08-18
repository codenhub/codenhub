---
title: Tailwind CSS v4
description: Using the /tw source entrypoints in a Tailwind CSS v4 project.
---

# Tailwind CSS v4

A project that already runs Tailwind CSS v4 can process this package's
source instead of its compiled output. `/tw` entrypoints publish copied,
uncompiled source from `dist/tw`; your own Tailwind build compiles it
alongside your app, so its `@theme`, `@utility`, and `@apply` directives
resolve together with yours.

```css
@import "tailwindcss";
@import "@codenhub/styles/tw";

@source "./src";
```

`@source` tells Tailwind's build where to scan for the utility and component
class names actually used in your markup, so it can generate only what is
referenced. Point it at your app's source, not at this package — `/tw`
already ships every class definition it publishes.

Add aesthetics from the source entrypoint the same way as the compiled one,
after the base import:

```css
@import "tailwindcss";
@import "@codenhub/styles/tw";
@import "@codenhub/styles/tw/aesthetics";

@source "./src";
```

Import a focused `/tw/*` entrypoint instead of the combined one — such as
`/tw/button` or `/tw/form` — when a build only needs one component family;
see the full [import path table](../setup.md#import-paths) for what each one
composes. Tailwind CSS 4 or newer is required for every `/tw` entrypoint.
