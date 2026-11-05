---
title: Astro
description: Loading the stylesheet in an Astro app.
order: 5
---

# Astro

Astro renders components statically by default, but a global stylesheet import still only needs to happen once — from a shared layout, not from individual pages or islands.

## Import the stylesheet

```astro
---
// src/layouts/Layout.astro
import "@codenhub/styles";
---

<html lang="en">
  <body>
    <slot />
  </body>
</html>
```

Every page that uses this layout loads the stylesheet once. Running Tailwind CSS v4? Import `@codenhub/styles/tw` through Astro's Tailwind integration instead — see [Tailwind CSS v4](./tailwind.md), including when an explicit `@source` is actually needed.

## Force a theme

Apply `.dark` or `.light` on `<html>` to force a theme instead of following the system preference; see [Theming → Light and dark](../usage/theming.md#light-and-dark).

## Next

Return to the main path: [Building a screen](../concepts.md) adds the first card and form to the settings page. [Setup → All entrypoints](../setup.md#all-entrypoints) lists every other stylesheet you can import.
