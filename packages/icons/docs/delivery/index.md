---
title: Comparison
description: The five ways icon classes become CSS mask rules, the package entry points behind them, and how to choose.
group: Delivery methods
order: 2
---

# How icons reach your CSS

Every delivery method understands the exact same icon classes, and every CSS method produces the same mask rules for them. The one exception is the Vite plugin's [inline SVG mode](vite.md#inline-svg-mode), which rewrites `<i>` tags into `<svg>` elements and emits no mask rules at all. Among the CSS methods, what changes between them is where those per-icon rules come from: either a prebuilt stylesheet containing every icon in a family, or a plugin or command that scans your markup and generates only the icons you wrote. This page compares all five options so you can pick the one that fits your build.

## Entry points

| Entry                      | For                         | What it delivers                                                                                                                                   |
| -------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@codenhub/icons`          | Every method                | The base `.ic` rules, about 2 KB. Never rewritten by a plugin.                                                                                     |
| `@codenhub/icons/tw`       | Tailwind CSS v4             | Base rules plus the plugin. Every non-brand family resolvable, only used icons emitted. Brand families need `@plugin` with `families` naming them. |
| `@codenhub/icons/tailwind` | Tailwind CSS v4, configured | The plugin on its own, so `@plugin` can carry options.                                                                                             |
| `@codenhub/icons/<family>` | Plain CSS, no build step    | One complete family, every icon written out.                                                                                                       |
| `@codenhub/icons/vite`     | Vite                        | Scans your markup and generates only the rules it needs.                                                                                           |
| `@codenhub/icons/postcss`  | PostCSS                     | The same, for a PostCSS pipeline.                                                                                                                  |
| `chi build`                | A build with none of these  | A command that reads your files and writes a stylesheet of the base rules and only the icons they use.                                             |

`@import "@codenhub/icons"` means one thing everywhere: the base rules that icon classes build on. No plugin rewrites it, and no plugin strips it out. The only moving part is which mechanism generates the per-icon mask rules beside it.

## Choosing one

| If your project…                                           | Use                          |
| ---------------------------------------------------------- | ---------------------------- |
| Already uses Tailwind CSS v4                               | [Tailwind](tailwind.md)      |
| Builds with Vite (or a Vite-based framework)               | [Vite plugin](vite.md)       |
| Runs a PostCSS pipeline but not Vite (Next.js, others)     | [PostCSS plugin](postcss.md) |
| Runs none of these, but can run a command before deploying | [Build command](cli.md)      |
| Has no build step, or you want the simplest possible setup | [Plain CSS](plain-css.md)    |

The plugins and the build command keep CSS output small with no manual pruning: a project using three icons ships about 10 KB of CSS. Plain-CSS family stylesheets take the opposite trade — zero build setup in exchange for shipping every icon in the family, where Lucide alone is about 1.3 MB and all 17 families together reach about 39 MB.

One capability also depends on a build step: the `ic-lucide-heart/1.5` stroke-width modifier needs Tailwind, Vite, PostCSS, or the build command, because plain CSS stylesheets render stroke families at their authored width. See [Concepts](../concepts.md) for the shared model.

## Next

Read the guide for the method you picked — starting with [Plain CSS](plain-css.md) if you want zero setup — or jump straight to [Frameworks](../frameworks/index.md) for Astro, Next.js, and SvelteKit wiring.
