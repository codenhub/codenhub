---
title: Next.js
description: Next.js has no Vite pipeline, so use Tailwind v4, the PostCSS plugin, or plain-CSS family imports.
---

# Next.js

Next.js builds with webpack or Turbopack, not Vite, so `@codenhub/icons/vite` does not apply. Three methods do. All of them produce plain CSS, so the App Router, React Server Components, and streaming are unaffected.

## Tailwind CSS v4

If the project uses Tailwind v4 through `@tailwindcss/postcss`, add one import to your global stylesheet:

```css
/* app/globals.css */
@import "tailwindcss";
@import "@codenhub/icons/tw";
```

Only the icons your markup uses are emitted. See [Tailwind CSS](../delivery/tailwind.md).

## PostCSS plugin

Add the plugin to `postcss.config.mjs` and give it globs for wherever icon classes are written — it scans the stylesheet text and `content` only, with no view of the module graph:

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

The simplest option, at the cost of stylesheet size:

```css
/* app/globals.css */
@import "@codenhub/icons";
@import "@codenhub/icons/lucide";
```

See [Plain CSS](../delivery/plain-css.md).

## See also

- [Delivery methods](../delivery/index.md) — how the methods compare.
- [Concepts](../concepts.md) — name resolution and the markup forms.
