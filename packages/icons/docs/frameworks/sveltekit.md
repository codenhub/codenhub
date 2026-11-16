---
title: SvelteKit
description: SvelteKit builds on Vite and .svelte files are auto-scanned, so the Vite plugin needs almost no configuration.
order: 3
---

# SvelteKit

SvelteKit builds on Vite, and the Vite plugin scans every `.svelte` module Vite transforms. The one extra step is the same one Astro needs: SvelteKit renders pages itself rather than as Vite HTML entries, so the generated stylesheet has to be imported by hand.

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

Then import both stylesheets from the root layout, so every page loads them:

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import "../app.css";
  import "virtual:icons.css";

  let { children } = $props();
</script>

{@render children()}
```

The plugin injects its stylesheet through Vite's `transformIndexHtml` hook, which SvelteKit never runs on its pages, so the `virtual:icons.css` import is what puts the mask rules on the page. Without it, the base rules still apply and every icon renders as a solid square in its color.

Keep the `content` entry. The stylesheet is generated when the layout imports it, and a build can reach that import before Vite has transformed every component, so `content` is what guarantees each class is in it. It also keeps the first paint right in dev. `mode: "svg"` also works directly on `.svelte` files.

## Other methods

[Tailwind CSS v4](../delivery/tailwind.md) and [plain CSS](../delivery/plain-css.md) work in SvelteKit the same way they do everywhere else. A Vite single-page app with an `index.html`, such as one built with Vue or Solid, gets the stylesheet injected and needs no layout import; a framework that renders its own HTML, such as Nuxt or SolidStart, needs the import as SvelteKit does.

## See also

- [Vite plugin](../delivery/vite.md) — full option reference and the scanning model.
- [Delivery methods](../delivery/index.md) — how the methods compare.
- [JavaScript API](../javascript-api.md) — next on the reading path, for programmatic CSS or SVG generation.
