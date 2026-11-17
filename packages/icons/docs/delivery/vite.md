---
title: Vite plugin
description: Scans the markup Vite transforms, plus any globs you list, and serves only the mask rules it needs.
order: 3
---

# Vite plugin

When your build runs on Vite without Tailwind, the Vite plugin scans your files and serves only the CSS mask rules your markup uses — or rewrites `<i class="ic-...">` tags straight into inline SVGs if you prefer no stylesheet per icon at all.

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

`content` accepts literal paths and glob patterns such as `src/**/*.{html,tsx}`, expanded when the scan runs. Relative paths resolve from Vite's [`root`](https://vite.dev/config/shared-options.html#root), matching how Vite resolves its own paths, so the same config works no matter which directory you launch the build from. `content` is additive: the plugin also scans every source file Vite transforms, so you only need `content` for files the bundler never sees — and for clean first paints in dev.

The transform-time scan reads every module Vite transforms, whatever its extension. A file Vite never transforms is seen only through `content`, and so is a class in a module transformed after the stylesheet was generated, which can happen where a framework imports the stylesheet itself, as Astro and SvelteKit do. See [Frameworks](../frameworks/index.md). Note that this applies only to stylesheet generation; [inline SVG mode](#inline-svg-mode) rewrites a separate set of file types.

In dev, Vite serves the HTML shell before transforming a single JavaScript module, so an icon class written only inside a component module is still a mystery when the page first loads. To avoid leaving it blank, dev serves the stylesheet as a module rather than inlining it, and the plugin invalidates that module whenever a transform reveals a new class — the icon arrives without a page reload. Listing your sources in `content` skips that catch-up round trip altogether because the files are read from disk up front.

In `css` mode, a production build with HTML entries writes the stylesheet as a CSS asset named after its content hash, `assets/codenhub-icons-[hash].css` by default, and links it from every HTML entry. Because a build transforms all modules before emitting HTML, that file already holds every class the build saw. A build without HTML entries, such as a library build, emits no stylesheet, and neither does [inline SVG mode](#inline-svg-mode). A linked stylesheet asset needs no nonce or hash in a Content Security Policy: `style-src 'self'` allows it when served from the page's origin. With a `base` on another origin, such as a CDN, the policy must allow that origin, as it already must for Vite's own CSS. Two alternatives were rejected:

- **An inline `<style>`**. A policy without `'unsafe-inline'`, a nonce, or a hash refuses it, so every icon would render blank in production while dev, which uses a same-origin module script, still works.
- **A `nonce` option on the plugin.** Vite's own [`html.cspNonce`](https://vite.dev/config/shared-options#html-cspnonce) already stamps a nonce on the tags in the built HTML, and a nonce needs a server that sends a fresh one per response, which a static host cannot do.

## Inline SVG mode

`mode: "svg"` skips stylesheet generation completely and rewrites `<i class="ic-...">` tags into inline `<svg>` elements at build time. It rewrites `<i>` tags and nothing else: an icon class on another element — or `.ic` on a `<span>` — renders nothing in this mode because there is no stylesheet to supply its mask. The plugin warns at build time when it finds an icon class on an element it will not rewrite, naming the class and the file.

Animated SVG artwork keeps its SMIL animation in this mode, including when reduced motion is requested: CSS cannot stop SMIL. The static Line MD fallback, and `ic-on-hover` holding artwork at rest, apply only in CSS mode; glyph motion classes work in both. The optional `@codenhub/icons/play` helper restarts an inline SVG with `setCurrentTime(0)`; it skips restarts under reduced motion but does not stop existing SMIL animation. See [Animated families](../concepts.md#animated-families) for timing and browser limits.

Switching an existing project from CSS mode takes more than flipping a config flag, because the element reaching the browser changes from `<i>` to `<svg>`. Check two details your old `<i>` handled quietly:

- **Size.** The rendered `<svg>` carries a `1em` box as a presentation attribute, so an icon renders at text size with no stylesheet at all. CSS still wins over that: keep `@import "@codenhub/icons"` in a stylesheet and the base rules size the inlined `<svg>` from `--ic-size` exactly as they size an `<i>`, so setting `--ic-size` on an ancestor and the `ic-xs`–`ic-xl` classes both work. Without that import an icon is fixed at `1em`.
- **`hidden`.** `[hidden] { display: none }` is a user-agent rule for HTML elements, and an inlined icon is in the SVG namespace, so the attribute no longer hides it. Script that toggles an icon needs an explicit `[hidden] { display: none }` rule, and a guard written as `instanceof HTMLElement` stops matching — an SVG element is not one.

One limitation is new to logos. About 400 `logos` icons draw with gradients, masks, or clip paths, which they reach by `id`. Each logo's ids are prefixed with its name, so two different logos never collide, but two copies of the same logo share them, and the browser draws both copies from the first. If that first copy is inside an element hidden with `display: none`, as in a collapsed mobile menu, every later copy renders blank (seen in Chromium). Keep a visible copy ahead of the hidden one, hide with `visibility: hidden` instead, or use CSS mode for a logo that appears more than once, since each mask image there is a document of its own. The same applies to `renderSvg` and [one module per icon](#one-module-per-icon).

Rewriting covers `.html`, `.js`, `.jsx`, `.ts`, `.tsx`, `.vue`, `.svelte`, and `.astro`. An `.astro` file is rewritten in both halves, its frontmatter escaped as JavaScript and its template left as markup; `.vue` and `.svelte` files split the same way, with the template read as markup and `<script>` as JavaScript. An icon written as a JSX element receives React's attribute names, such as `strokeWidth`, and a `style` object when the project uses `@vitejs/plugin-react` or `@vitejs/plugin-react-swc`; Solid, Preact, and Vue JSX receive the HTML names, which they pass straight to the DOM. `content` plays no part in `svg` mode because it feeds stylesheet generation, which this mode skips.

Write every icon class out in full as a literal string so the plugin can spot it: a class assembled at runtime, such as `` `ic-${name}` ``, is invisible at build time. In CSS mode that element simply misses a rule; in `svg` mode there is no stylesheet at all to fall back on, so the element renders nothing. Whenever the icon name comes from state or data at runtime, use [one module per icon](#one-module-per-icon) — it is the supported pattern and works in both modes.

## One module per icon

When an icon is chosen dynamically at runtime, import a virtual module for that icon instead of shipping a whole family:

```ts
const { svg } = await import("virtual:@codenhub/icons/lucide/heart");
element.innerHTML = svg;
```

The module exports the rendered markup as both `svg` and its default export, alongside the resolved icon object as `icon`. The `<svg>` carries the icon's qualified class (such as `ic-lucide-heart` under the configured `prefix`) just like inline SVG mode, so the base rules size and color it via `--ic-size`, `--ic-color`, and the `ic-xs`–`ic-xl` classes. It carries no `aria-hidden` attribute: add it yourself for a decorative icon, or give a meaningful icon `role="img"` and a label. Each import becomes its own module, letting the bundler code-split and tree-shake down to single icons. An unqualified path such as `virtual:@codenhub/icons/close` resolves through your configured default prefix like any other bare name, and an unknown icon fails the build loudly rather than shipping a blank element.

## See also

- [Delivery methods](index.md) — how the methods compare.
- [PostCSS plugin](postcss.md) — the next delivery method, for non-Vite PostCSS builds.
- [Frameworks](../frameworks/index.md) — Astro and SvelteKit build on this plugin.
- [JavaScript API](../javascript-api.md) — preparing a `registry` by hand.
