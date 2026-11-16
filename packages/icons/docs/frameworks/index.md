---
title: Overview
description: Which delivery method to pick per framework, and the framework-specific caveats that come with it.
group: Frameworks
order: 3
---

# Framework setup

Every framework consumes `@codenhub/icons` through one of the [delivery methods](../delivery/index.md). Most Vite-based frameworks work out of the box without a dedicated guide, while a few have build pipelines or template extensions with opinions of their own. This section covers the three worth calling out.

| Framework                           | Recommended method                              | Notes                                                                                           |
| ----------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [Astro](astro.md)                   | Plain CSS or Tailwind v4; Vite plugin with care | `.astro` is not auto-scanned by the Vite plugin — pass `content`.                               |
| [Next.js](nextjs.md)                | Tailwind v4 or PostCSS plugin                   | No Vite pipeline, so the Vite plugin does not apply.                                            |
| [SvelteKit](sveltekit.md)           | Vite plugin                                     | `.svelte` is auto-scanned; the cleanest plugin story.                                           |
| Vue, SolidStart, Nuxt, Remix (Vite) | Vite plugin                                     | Follow [SvelteKit](sveltekit.md); `.vue` is auto-scanned like `.svelte`.                        |
| Any framework                       | Plain CSS                                       | [Plain-CSS](../delivery/plain-css.md) family imports work everywhere that resolves package CSS. |

If your framework is missing from the table and builds with Vite, follow the [SvelteKit](sveltekit.md) guide. If it builds with webpack or another PostCSS host, follow [Next.js](nextjs.md). And if you just want icons on screen with zero build plumbing, [plain CSS](../delivery/plain-css.md) works anywhere at the cost of larger stylesheets.

## Next

Pick the framework guide above that matches your stack — starting with [Astro](astro.md) — or continue to the [JavaScript API](../javascript-api.md) when you need programmatic control outside a framework build.
