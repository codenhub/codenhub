---
title: Vite plugin
description: Scans the markup Vite transforms, plus any globs you list, and serves only the mask rules it needs.
---

# Vite plugin

```ts
// vite.config.ts
import lucide from "@codenhub/icons/data/lucide";
import viteIcons from "@codenhub/icons/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [viteIcons({ content: ["./src/**/*.{html,ts,tsx}"], defaultPrefix: "lucide", families: [lucide] })],
});
```

```css
@import "@codenhub/icons";
```

| Option          | Purpose                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------- |
| `families`      | Families to resolve against. Nothing is bundled by default.                                 |
| `defaultPrefix` | Family an unqualified name resolves against. There is no default.                           |
| `content`       | Files and globs to scan, beyond what the build transforms.                                  |
| `prefix`        | Class prefix. Defaults to `ic`.                                                             |
| `strokeWidth`   | Default for stroke-based families whose classes carry no modifier.                          |
| `mode`          | `css` serves mask rules; `svg` replaces `<i class="ic-...">` with inline SVG at build time. |
| `attribution`   | `auto`, `file`, or `off`. See [Licensing](../licensing.md).                                 |
| `registry`      | A prepared `IconRegistry`, replacing `families`.                                            |

The generated stylesheet is served as `virtual:icons.css` and injected into every HTML entry point. `@import "@codenhub/icons";` is left alone — it resolves through the package's `style` export condition to the base `.ic` rules and means the same thing whether or not a plugin is in the pipeline. Keep it in your stylesheet; the plugin adds the per-icon rules around it rather than in place of it.

## Scanning

`content` takes literal paths and glob patterns, `src/**/*.{html,tsx}` among them, expanded when the scan runs. It is additive: the plugin also scans every source file the build transforms, so `content` is for what the bundler never reaches, and for making the first paint correct in dev.

The transform-time scan covers `.html`, `.js`, `.jsx`, `.ts`, `.tsx`, `.vue`, `.svelte`, and stylesheet files. Markup in a file type outside that set — a `.astro` or `.md` template — is only seen through `content`, so list those globs explicitly. See [Frameworks](../frameworks/index.md).

In dev, Vite serves the HTML before it transforms a single module, so a class the plugin has only ever seen inside a module is not yet known when the page is first served. The stylesheet is therefore served as a module rather than inlined, and the plugin invalidates it whenever a transform turns up something new, so the icon arrives without a reload. Listing your sources in `content` avoids the round trip entirely, because those files are read from disk up front.

## Inline SVG mode

`mode: "svg"` replaces `<i class="ic-...">` tags with inline SVG at build time and emits no stylesheet at all. It rewrites those tags and nothing else, so the `::before`, `::after`, and form-control forms do not work in this mode: they need mask rules, and there are none. The plugin warns at build time when it finds an icon class on an element it will not rewrite, naming the class and the file.

## One module per icon

For icons chosen at runtime, import a single icon instead of a family:

```ts
const { svg } = await import("virtual:@codenhub/icons/lucide/heart");
element.innerHTML = svg;
```

The module exports the rendered markup as `svg` and its default export, and the resolved icon as `icon`. Each import is its own module, so the bundler splits and tree-shakes at icon granularity. A name with no prefix — `virtual:@codenhub/icons/close` — resolves like any other unqualified name. An unknown icon fails the build rather than resolving to nothing.

## See also

- [Delivery methods](index.md) — how the methods compare.
- [Frameworks](../frameworks/index.md) — Astro and SvelteKit build on this plugin.
- [JavaScript API](../javascript-api.md) — preparing a `registry` by hand.
