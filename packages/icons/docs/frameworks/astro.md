---
title: Astro
description: Plain CSS and Tailwind v4 work with no configuration; the Vite plugin works but must be told about .astro files.
---

# Astro

Astro builds on Vite, so all four [delivery methods](../delivery/index.md) are available. Two of them need no Astro-specific setup.

## Plain CSS (no configuration)

Import the base rules and a family stylesheet from a layout or a global stylesheet:

```css
/* src/styles/icons.css */
@import "@codenhub/icons";
@import "@codenhub/icons/lucide";
```

```astro
---
import "../styles/icons.css";
---
<i class="ic-lucide-heart" aria-hidden="true"></i>
```

Astro resolves the package's CSS exports directly. This is the least-effort path; its cost is stylesheet size and no stroke-width modifier. See [Plain CSS](../delivery/plain-css.md).

## Tailwind CSS v4 (no configuration)

With `@tailwindcss/vite` configured, add one import to your Tailwind entry:

```css
@import "tailwindcss";
@import "@codenhub/icons/tw";
```

Only the icons your markup uses are emitted. See [Tailwind CSS](../delivery/tailwind.md).

## Vite plugin

Add the plugin in `astro.config.mjs`:

```js
import lucide from "@codenhub/icons/data/lucide";
import icons from "@codenhub/icons/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  vite: {
    plugins: [
      icons({
        families: [lucide],
        defaultPrefix: "lucide",
        content: ["./src/**/*.{astro,md,mdx,html}"],
      }),
    ],
  },
});
```

The `content` entry is required, not optional. The plugin auto-scans the files Vite transforms for `.html`, `.js(x)`, `.ts(x)`, `.vue`, `.svelte`, and stylesheets — `.astro` is not in that set, so classes written in `.astro`, `.md`, or `.mdx` templates are only discovered through `content`. List those globs and keep `@import "@codenhub/icons";` in a stylesheet for the base rules.

`mode: "svg"` rewrites `<i class="ic-...">` tags only in the auto-scanned file types, so it does not transform `.astro` templates. Use CSS mode (the default) with Astro.

## See also

- [Vite plugin](../delivery/vite.md) — full option reference and the scanning model.
- [Delivery methods](../delivery/index.md) — how the methods compare.
