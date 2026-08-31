---
title: Astro
description: Loading the stylesheet in an Astro app.
---

# Astro

Import the package from a shared layout's frontmatter so every page that uses that layout loads it once:

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

Apply `.dark` or `.light` on `<html>` to force a theme instead of following the system preference; see [Setup → Configuration](../setup.md#configuration).

A project running Tailwind CSS v4 imports `@codenhub/styles/tw` through Astro's Tailwind integration instead; see [Tailwind CSS v4](./tailwind.md) for the `@source` directive Astro needs to scan `src/`.
