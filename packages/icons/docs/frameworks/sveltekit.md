---
title: SvelteKit
description: SvelteKit builds on Vite and .svelte files are auto-scanned, so the Vite plugin needs almost no configuration.
order: 3
---

# SvelteKit

SvelteKit builds on Vite, and `.svelte` is already on the Vite plugin's transform-time auto-scan list. After Next.js's bundler gymnastics and Astro's extra template hints, SvelteKit is the setup with almost nothing left to explain.

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

Classes in `.svelte` components are picked up by the transform-time scan even without a `content` entry. Listing `src/**/*.{svelte,html}` anyway keeps the first paint right in dev before Vite transforms those component modules. `mode: "svg"` also works directly on `.svelte` files.

## Other methods

[Tailwind CSS v4](../delivery/tailwind.md) and [plain CSS](../delivery/plain-css.md) work in SvelteKit the same way they do everywhere else. Vue, SolidStart, and other Vite-based frameworks follow this exact same setup — `.vue` is auto-scanned just like `.svelte`.

## See also

- [Vite plugin](../delivery/vite.md) — full option reference and the scanning model.
- [Delivery methods](../delivery/index.md) — how the methods compare.
- [JavaScript API](../javascript-api.md) — next on the reading path, for programmatic CSS or SVG generation.
