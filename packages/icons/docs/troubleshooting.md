---
title: Troubleshooting
description: Why an icon renders as nothing, as a solid square, at the wrong width, or without its license notice, and how to fix each.
order: 6
---

# Troubleshooting

Most failures here are silent: the build stays green and the page is where the gap shows. Work through the section that matches what you see.

## The icon renders as nothing

No base rule matched the element, so it has no size.

- **No base import.** Every delivery method needs `@import "@codenhub/icons";` in a stylesheet, or `@import "@codenhub/icons/tw";` with Tailwind. Plugins add per-icon rules next to it, never in place of it.
- **The element is not an `<i>` and has no `.ic`.** The base rules match `<i class="ic-…">`, or any element that also carries `.ic`. A `<span class="ic-lucide-heart">` matches neither.

## The icon renders as a solid square

The base rules sized and colored the element, but no rule gave it a mask, so the whole box paints in the icon color.

- **The name does not exist in the family.** Names are upstream names: Material Symbols writes `check_circle`, Lucide writes `circle-check`, and Lucide has no `close` (it is `x`). See [Finding an icon's name](concepts.md#finding-an-icons-name).
- **An unqualified name with no default family.** `ic-heart` resolves only where you set a default: `defaultPrefix` in the Vite and PostCSS plugins, `default:` in the Tailwind plugin, or the last family stylesheet imported in plain CSS. Write the qualified `ic-lucide-heart`, or set a default. See [Names](concepts.md#names).
- **The family is not loaded.** The Vite and PostCSS plugins resolve only the families in `families`.
- **A brand icon through `@codenhub/icons/tw`.** `/tw` never resolves `simple-icons`. Declare the plugin with `families` naming it. See [Tailwind CSS](delivery/tailwind.md#configuring-the-plugin).
- **The class is assembled at runtime.** A plugin finds a class only when it is written out in full: `` `ic-${name}` `` is invisible at build time. Write each class literally, or load the icon as a [module](delivery/vite.md#one-module-per-icon).
- **The class is in a file the plugin does not scan.** The Vite plugin scans the modules Vite transforms; `.astro`, `.md`, and `.mdx` need `content` globs. The PostCSS plugin scans only the stylesheet and `content`. See [Vite § Scanning](delivery/vite.md#scanning) and [PostCSS § Scanning](delivery/postcss.md#scanning).
- **Astro, production build only.** Import `virtual:icons.css` from a layout. See [Astro § Vite plugin](frameworks/astro.md#vite-plugin).
- **Production only, with a Content Security Policy.** Versions up to 0.2.1 inlined the built stylesheet as a `<style>` tag, which a policy without `'unsafe-inline'` blocks. Later versions link a file instead. See [Vite § Scanning](delivery/vite.md#scanning).
- **Inline SVG mode, on an element it does not rewrite.** `mode: "svg"` replaces `<i class="ic-…">` tags and emits no mask rules, so `.ic` on any other element has nothing behind it. The build warns, naming the class and the file. Under Astro, `.md` and `.mdx` are not rewritten, and nothing warns. See [Vite § Inline SVG mode](delivery/vite.md#inline-svg-mode) and [Astro § Inline SVG mode](frameworks/astro.md#inline-svg-mode).

## The stroke width does not change

- **Plain CSS.** Family stylesheets carry each icon at its authored width; `ic-lucide-heart/1.5` needs Tailwind, Vite, or PostCSS. See [Stroke width](concepts.md#stroke-width).
- **A family drawn with fills.** Only `lucide` is stroke-based. Every other bundled family ignores the modifier.

## The color does not change

Set `--ic-color` on the icon or an ancestor, or set `color`: an icon with no `--ic-color` paints in `currentColor`. A `background-color` you set on the icon element itself replaces its color, because the mask paints with the background.

## The license notice is missing from the output

A minifier configured with `legalComments: "none"` strips `/*! … */` comments. Use `attribution: "file"` with Vite, or keep legal comments. See [Licensing](licensing.md).
