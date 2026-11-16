---
title: Overview
description: Zero-runtime icon system for the web — icon classes in your markup become CSS mask rules at build time.
---

# Icons through CSS, with no runtime

Getting icons onto a web page usually means one of three chores: copying SVG files by hand, wrapping every glyph in a framework component just to ship an icon, or dragging an entire icon library into your JavaScript bundle — and then spending a Friday afternoon tracking down MIT, ISC, and Apache-2.0 license notices. `@codenhub/icons` exists to skip all three.

Write a class such as `ic-lucide-heart` in your HTML and the build turns it into a CSS mask rule. There is no component layer, no icon library in your bundle, and nothing to import per icon — no JavaScript sitting around just to draw a heart. The package ships 15 generated core icon families totalling over 36,000 icons, each carrying the license notices its artwork requires, plus two opt-in brand families: over 3,000 one-color logos and over 2,000 full-color ones.

## Setup

### Installation

```sh
pnpm add @codenhub/icons
```

### Quick start

Icons reach a project through CSS. The shortest path with no build step is the base rules plus one family stylesheet — zero configuration required, provided you are fine loading the whole family:

```css
@import "@codenhub/icons";
@import "@codenhub/icons/lucide";
```

```html
<!-- standalone -->
<i class="ic-lucide-heart" aria-hidden="true"></i>

<!-- beside a label -->
<button><i class="ic-lucide-check" aria-hidden="true"></i>Submit</button>
```

An icon is an `<i>` carrying an icon class (or `.ic` on any element, in the CSS-based methods). Size and color follow custom properties: set `--ic-size` and `--ic-color` on the icon or any ancestor, or use the `ic-xs`–`ic-xl` size classes. Icons follow the text color, except brand icons, which arrive in their brand color; see [Color](concepts.md#color).

Four delivery methods understand the same classes — plain CSS, Tailwind CSS v4, a Vite plugin, and a PostCSS plugin. The plugins scan your markup and emit only the rules you used; the plain-CSS family stylesheets are complete and large by construction. See [Delivery methods](delivery/index.md) to choose one, and [Frameworks](frameworks/index.md) for framework-specific setup.

## Requirements

| Requirement  | Details                                                                         |
| ------------ | ------------------------------------------------------------------------------- |
| Node.js      | 26 or newer, for the build-time plugins and helpers.                            |
| CSS imports  | Consumer tooling must resolve package CSS imports.                              |
| Browsers     | Must support CSS `mask-image`, which every method uses except inline SVG mode.  |
| Tailwind CSS | Version 4 or newer, and only for the `/tw` and `/tailwind` entry points.        |
| Optional     | `vite` >= 5.0.0 for the Vite plugin, `postcss` >= 8.0.0 for the PostCSS plugin. |

## Reading path

Read these in order the first time. Each page builds on the last and points to the next one:

1. [Concepts](concepts.md): families, finding icon names, name resolution, color, stroke width, size, motion, and accessibility — the shared model every delivery method builds on.
2. [Delivery methods](delivery/index.md): the four ways icons reach your CSS and how to pick the one that fits your build.
3. [Frameworks](frameworks/index.md): setup and framework-specific quirks for Astro, Next.js, and SvelteKit.
4. [JavaScript API](javascript-api.md): the registry, renderers, runtime playback, and the third-party set adapter, for when you step outside a standard CSS build.
5. [Licensing](licensing.md): attribution modes, obligation levels, trademark notes, and what each build owes.
6. [Troubleshooting](troubleshooting.md): an icon that renders as nothing, as a solid square, or at the wrong width.

When you need to look up a specific export or option, the [API reference](reference/index.md) lists every export of `@codenhub/icons`, `/vite`, `/postcss`, and `/play`.
