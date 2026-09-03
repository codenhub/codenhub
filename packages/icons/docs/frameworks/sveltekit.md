---
title: SvelteKit
description: SvelteKit builds on Vite and .svelte files are auto-scanned, so the Vite plugin needs almost no configuration.
order: 3
---

# SvelteKit

SvelteKit builds on Vite, and `.svelte` is one of the file types the Vite plugin auto-scans, so this is the cleanest plugin setup of any framework.

## Vite plugin

Add the plugin in `vite.config.ts` alongside `sveltekit()`:

```ts
import { sveltekit } from "@sveltejs/kit/vite";
import lucide from "@codenhub/icons/data/lucide";
import icons from "@codenhub/icons/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    sveltekit(),
    icons({
      families: [lucide],
      defaultPrefix: "lucide",
      content: ["./src/**/*.{svelte,html}"],
    }),
  ],
});
```

```css
/* src/app.css */
@import "@codenhub/icons";
```

Classes in `.svelte` components are picked up by the transform-time scan with no `content` entry at all. Listing `src/**/*.{svelte,html}` anyway makes the first paint correct in dev, before Vite has transformed those modules. `mode: "svg"` also works on `.svelte` files.

## Other methods

[Tailwind CSS v4](../delivery/tailwind.md) and [plain CSS](../delivery/plain-css.md) work in SvelteKit exactly as they do anywhere else. Vue, SolidStart, and other Vite-based frameworks follow this same setup — `.vue` is auto-scanned like `.svelte`.

## See also

- [Vite plugin](../delivery/vite.md) — full option reference and the scanning model.
- [Delivery methods](../delivery/index.md) — how the methods compare.
