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

Apply `.dark` or `.light` on `<html>` to force a theme instead of following the system preference; see [Setup → Configuration](../setup.md#configuration).

## See also

- [Setup → Import paths](../setup.md#import-paths): every entrypoint this package publishes.
- [Usage](../usage/index.md): component classes to compose once the stylesheet is loaded.
