---
title: Astro
description: Plain CSS and Tailwind v4 work with no configuration; the Vite plugin works but must be told about .astro files.
order: 1
---

# Astro

Astro runs on Vite, so all four [delivery methods](../delivery/index.md) are on the table. Two of them work without any Astro-specific wiring at all; the Vite plugin takes two extra lines because Astro renders production HTML outside Vite's own HTML pipeline.

## Plain CSS (no configuration)

Import the base rules and a family stylesheet from a layout or global stylesheet:

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

Astro resolves the package's CSS exports directly. This is the least-effort path — one CSS import and zero config — at the cost of stylesheet size and no stroke-width modifier. See [Plain CSS](../delivery/plain-css.md).

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

Then import the generated stylesheet once, from a layout every page uses:

```astro
---
import "../styles/global.css";
import "virtual:icons.css";
---
```

Both lines are required, and this second one is Astro-specific. Everywhere else, the Vite plugin injects the generated stylesheet into the HTML through Vite's `transformIndexHtml` hook. A production `astro build` renders pages through Astro's own pipeline rather than as Vite HTML entries, so `transformIndexHtml` never runs on them and this explicit import is what puts the mask rules on the page. Without it, the build succeeds, `@import "@codenhub/icons"` still supplies the base rules, and every icon renders as a solid square in its color.

The `content` entry is required, not optional. The plugin auto-scans the files Vite transforms for `.html`, `.js(x)`, `.ts(x)`, `.vue`, `.svelte`, and stylesheets — `.astro` is not in that set, so classes written in `.astro`, `.md`, or `.mdx` templates are discovered only through `content`. List those globs and keep `@import "@codenhub/icons";` in a stylesheet for the base rules.

Check that every class you write resolves in a family you registered. An icon name the registry cannot find is left without a rule and renders as a solid square. CSS mode reports nothing when that happens — in any host, not only in Astro — so the build stays green and the gap is visible only on the page. Inline SVG mode does warn, naming the class and the file.

## Inline SVG mode

`mode: "svg"` works in Astro and rewrites `<i class="ic-...">` tags inside `.astro` files — in the template, in the frontmatter, and in `<script>` blocks, each escaped for its context. An icon tag written inside a _string_ in a template expression is the one place it is skipped, because `{cond && <i class="ic-x" />}` holds markup rather than a string and telling those apart requires a parser; move that tag to the frontmatter or a component instead. Everything above about delivering the mask stylesheet stops applying here: `svg` mode emits no per-icon rules, so neither `virtual:icons.css` nor `content` does anything, and a class on any element other than an `<i>` tag renders nothing because there is no stylesheet behind it.

Keep `@import "@codenhub/icons"` even so. An inlined `<svg>` renders at `1em` on its own, but that base stylesheet is what lets `--ic-size` and the `ic-xs`–`ic-xl` size classes reach it. See [Vite plugin § Inline SVG mode](../delivery/vite.md#inline-svg-mode).

`.md` and `.mdx` are not rewritten. An icon class written in one of those reaches the page as a bare `<i>` element with no mask rule behind it, so it renders as a solid square with the base rules loaded, or as nothing without them. Nothing reports it, either: the unresolved-class warning only covers the files this mode rewrites, so such a page builds green and ships broken icons.

There are two ways through this:

- **In `.mdx`**, wrap the icon in a component and render that component from your markdown: the component lives in an `.astro`, `.jsx`, or `.tsx` file, all of which are rewritten.
- **In plain `.md`**, which cannot import components, use CSS mode instead so `content` globs cover `.md` and `.mdx` files just like any other template.

## See also

- [Vite plugin](../delivery/vite.md) — full option reference and the scanning model.
- [Delivery methods](../delivery/index.md) — how the methods compare.
- [Next.js](nextjs.md) and [SvelteKit](sveltekit.md) — the other framework guides.
- [JavaScript API](../javascript-api.md) — next on the reading path, for programmatic CSS or SVG generation.
