---
title: Delivery methods
description: The four ways icon classes become CSS mask rules, the package entry points behind them, and how to choose.
---

# How icons reach your CSS

`@codenhub/icons` produces CSS mask rules. What differs between the delivery methods is only where those per-icon rules come from: a complete stylesheet you import, or a plugin that scans your markup and emits just what you used.

## Entry points

| Entry                      | For                         | What it delivers                                                              |
| -------------------------- | --------------------------- | ----------------------------------------------------------------------------- |
| `@codenhub/icons`          | Every method                | The base `.ic` rules, about 2 KB. Never rewritten by a plugin.                |
| `@codenhub/icons/tw`       | Tailwind CSS v4             | Base rules plus the plugin. Every family resolvable, only used icons emitted. |
| `@codenhub/icons/tailwind` | Tailwind CSS v4, configured | The plugin on its own, so `@plugin` can carry options.                        |
| `@codenhub/icons/<family>` | Plain CSS, no build step    | One complete family, every icon written out.                                  |
| `@codenhub/icons/vite`     | Vite                        | Scans your markup and generates only the rules it needs.                      |
| `@codenhub/icons/postcss`  | PostCSS                     | The same, for a PostCSS pipeline.                                             |

`@import "@codenhub/icons"` means exactly one thing everywhere: the base rules the icon classes build on. No plugin rewrites it, no plugin deletes it. What differs between the methods is only where the per-icon mask rules come from.

## Choosing one

| If your project…                                           | Use                          |
| ---------------------------------------------------------- | ---------------------------- |
| Already uses Tailwind CSS v4                               | [Tailwind](tailwind.md)      |
| Builds with Vite (or a Vite-based framework)               | [Vite plugin](vite.md)       |
| Runs a PostCSS pipeline but not Vite (Next.js, others)     | [PostCSS plugin](postcss.md) |
| Has no build step, or you want the simplest possible setup | [Plain CSS](plain-css.md)    |

The plugin methods keep output small without any manual curation: a project using three icons ships about 10 KB of CSS. The plain-CSS family stylesheets are complete by construction — Lucide is about 1 MB, all 13 families about 22 MB — so that method trades size for having no build integration at all.

The `ic-lucide-heart/1.5` stroke-width modifier needs one of the plugin methods; plain CSS renders stroke families at their authored width. See [Concepts](../concepts.md) for the shared model and [Frameworks](../frameworks/index.md) for framework-specific setup.
