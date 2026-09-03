---
title: Overview
description: Which delivery method to pick per framework, and the framework-specific caveats that come with it.
group: Frameworks
order: 3
---

# Framework setup

Every framework consumes `@codenhub/icons` through one of the [delivery methods](../delivery/index.md). This section covers the frameworks whose setup has a wrinkle worth spelling out; the rest follow their bundler.

| Framework                           | Recommended method                              | Notes                                                                                           |
| ----------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [Astro](astro.md)                   | Plain CSS or Tailwind v4; Vite plugin with care | `.astro` is not auto-scanned by the Vite plugin — pass `content`.                               |
| [Next.js](nextjs.md)                | Tailwind v4 or PostCSS plugin                   | No Vite pipeline, so the Vite plugin does not apply.                                            |
| [SvelteKit](sveltekit.md)           | Vite plugin                                     | `.svelte` is auto-scanned; the cleanest plugin story.                                           |
| Vue, SolidStart, Nuxt, Remix (Vite) | Vite plugin                                     | Follow [SvelteKit](sveltekit.md); `.vue` is auto-scanned like `.svelte`.                        |
| Any framework                       | Plain CSS                                       | [Plain-CSS](../delivery/plain-css.md) family imports work everywhere that resolves package CSS. |

If your framework is not listed and it builds with Vite, follow the [SvelteKit](sveltekit.md) guide. If it builds with webpack or another PostCSS host, follow [Next.js](nextjs.md). If in doubt, [plain CSS](../delivery/plain-css.md) works anywhere at the cost of larger stylesheets.
