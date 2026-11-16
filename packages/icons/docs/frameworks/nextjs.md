---
title: Next.js
description: Next.js has no Vite pipeline, so use Tailwind v4, the PostCSS plugin, or plain-CSS family imports.
order: 2
---

# Next.js

Next.js builds with webpack or Turbopack rather than Vite, so `@codenhub/icons/vite` sits this one out. The other three delivery methods all work as expected — and because all three produce plain CSS, the App Router, React Server Components, and streaming are completely unaffected.

## Tailwind CSS v4

If your Next.js app already runs Tailwind v4 through `@tailwindcss/postcss`, one import in your global stylesheet covers everything:

```css
/* app/globals.css */
@import "tailwindcss";
@import "@codenhub/icons/tw";
```

Only the icons your markup uses are emitted. See [Tailwind CSS](../delivery/tailwind.md).

## PostCSS plugin

Without Tailwind, register the PostCSS plugin in `postcss.config.mjs` and pass `content` globs covering every directory where icon classes live — PostCSS inspects only the stylesheet text and `content`, with no visibility into the module graph:

```js
import lucide from "@codenhub/icons/data/lucide";
import icons from "@codenhub/icons/postcss";

export default {
  plugins: [
    icons({
      families: [lucide],
      defaultPrefix: "lucide",
      content: ["./app/**/*.{tsx,jsx,mdx}", "./components/**/*.{tsx,jsx}"],
    }),
  ],
};
```

Keep `@import "@codenhub/icons";` at the top of `app/globals.css` for the base rules. See [PostCSS plugin](../delivery/postcss.md).

## Plain CSS

Zero config and no PostCSS plugin, trading stylesheet size for simplicity:

```css
/* app/globals.css */
@import "@codenhub/icons";
@import "@codenhub/icons/lucide";
```

See [Plain CSS](../delivery/plain-css.md).

## See also

- [Delivery methods](../delivery/index.md) — how the methods compare.
- [Concepts](../concepts.md) — name resolution and the markup forms.
- [SvelteKit](sveltekit.md) — the Vite-based counterpart, if you want to compare setups.
- [JavaScript API](../javascript-api.md) — next on the reading path, for programmatic CSS or SVG generation.
