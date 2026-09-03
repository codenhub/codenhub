---
title: Overview
description: Zero-runtime icon system for the web — icon classes in your markup become CSS mask rules at build time.
---

# Icons through CSS, with no runtime

`@codenhub/icons` turns an icon class such as `ic-lucide-heart` into a CSS mask rule. There is no component layer, no icon library in your bundle, and nothing to import per icon. The package ships 13 generated icon families totalling over 34,000 icons, each carrying the license notices its artwork requires.

This package is experimental: its data schema, exports, and plugin options may change before 1.0.

## Setup

### Installation

```sh
pnpm add @codenhub/icons
```

### Quick start

Icons reach a project through CSS. The shortest path with no build step is the base rules plus one family stylesheet:

```css
@import "@codenhub/icons";
@import "@codenhub/icons/lucide";
```

```html
<i class="ic-lucide-heart" aria-hidden="true"></i> <button class="btn ic-lucide-check">Submit</button>
```

Size and color follow custom properties: set `--ic-size` and `--ic-color` on any ancestor.

Four delivery methods understand the same classes — plain CSS, Tailwind CSS v4, a Vite plugin, and a PostCSS plugin. The plugins scan your markup and emit only the rules you used; the plain-CSS family stylesheets are complete and large by construction. See [Delivery methods](delivery/index.md) to choose one, and [Frameworks](frameworks/index.md) for framework-specific setup.

## Requirements

| Requirement  | Details                                                                               |
| ------------ | ------------------------------------------------------------------------------------- |
| Node.js      | 22.0.0 or newer, for the build-time plugins and helpers.                              |
| CSS imports  | Consumer tooling must resolve package CSS imports.                                    |
| Browsers     | Must support CSS `mask-image`; icons render through masks tinted with `currentColor`. |
| Tailwind CSS | Version 4 or newer, and only for the `/tw` and `/tailwind` entry points.              |
| Optional     | `vite` >= 5.0.0 for the Vite plugin, `postcss` >= 8.0.0 for the PostCSS plugin.       |

## Next steps

- [Concepts](concepts.md): families, name resolution, reserved names, stroke width, and the markup forms.
- [Delivery methods](delivery/index.md): the four ways icons reach your CSS and how to choose.
- [Frameworks](frameworks/index.md): setup for Astro, Next.js, and SvelteKit.
- [JavaScript API](javascript-api.md): the registry, renderers, and third-party set adapter.
- [Licensing](licensing.md): attribution modes and what each build owes.
