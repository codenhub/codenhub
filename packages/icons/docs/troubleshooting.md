---
title: Troubleshooting
description: Why an icon renders as nothing, as a solid square, at the wrong width, or without its license notice, and how to fix each.
order: 6
---

# Troubleshooting

Most icon failures are silent: the build succeeds and the missing or broken icon shows up only in the browser. Jump to the symptom that matches what you see.

## The icon renders as nothing

No base rule matched the element, so it has no size — or, in inline SVG mode, no SVG replaced it or an ID collision hid it.

- **No base rules.** Plain CSS and a declared Tailwind `@plugin` need `@import "@codenhub/icons";` in a stylesheet. `@codenhub/icons/tw`, the Vite plugin's stylesheet, and the PostCSS plugin include the base rules already (for PostCSS, unless `injectBase` is `false`). Inline SVG mode renders without base rules, though adding `@import "@codenhub/icons"` supplies `--ic-size`, the size classes, and `--ic-color` for icons without a color of their own.
- **The element is not an `<i>` and has no `.ic`.** The base rules match `<i class="ic-…">`, or any element that also carries `.ic`. A `<span class="ic-lucide-heart">` without `.ic` matches neither.
- **An inlined logo whose first copy is hidden.** In inline SVG mode, two copies of the same `logos` icon share gradient, mask, and clip-path ids. If the first copy sits inside a `display: none` element, every later copy renders blank (seen in Chromium). Move a visible copy ahead of the hidden one, hide with `visibility: hidden`, or use CSS mode; see [Vite § Inline SVG mode](delivery/vite.md#inline-svg-mode).

## The icon renders as a solid square

The base rules sized and colored the element, so it appears as a box — but no mask rule matched it, leaving the entire box painted in the icon color.

- **The name does not exist in the family.** Names are upstream names: Material Symbols writes `check_circle`, Lucide writes `circle-check`, and Lucide has no `close` (it is `x`). Check the exact name in the family; see [Finding an icon's name](concepts.md#finding-an-icons-name).
- **An unqualified name with no default family.** `ic-heart` resolves only where you set a default: `defaultPrefix` in the Vite and PostCSS plugins, `default:` in the Tailwind plugin, or the last core family stylesheet imported in plain CSS. Write the qualified `ic-lucide-heart`, or configure a default. See [Names](concepts.md#names).
- **The family is not loaded.** The Vite and PostCSS plugins resolve only the families listed in `families`.
- **A brand icon through `@codenhub/icons/tw`.** `/tw` never resolves `simple-icons` or `logos`. Declare the plugin with `families` naming the brand family; see [Tailwind CSS](delivery/tailwind.md#configuring-the-plugin).
- **The class is assembled at runtime.** Build plugins find a class only when it is written out in full: `` `ic-${name}` `` is invisible at build time. Write each class literally, or load the icon as a [module](delivery/vite.md#one-module-per-icon).
- **The class is in a file the plugin does not scan.** The Vite plugin auto-scans only the module types Vite transforms; `.astro`, `.md`, and `.mdx` require `content` globs. The PostCSS plugin scans only the stylesheet itself and `content`. See [Vite § Scanning](delivery/vite.md#scanning) and [PostCSS § Scanning](delivery/postcss.md#scanning).
- **Astro, production build only.** Production `astro build` skips Vite's HTML hook, so import `virtual:icons.css` explicitly from a shared layout. See [Astro § Vite plugin](frameworks/astro.md#vite-plugin).
- **Production only, with a Content Security Policy.** Versions up to 0.2.1 inlined the built stylesheet as a `<style>` tag, which a policy without `'unsafe-inline'` blocks. Upgrade past 0.2.1 so builds link a stylesheet asset instead; see [Vite § Scanning](delivery/vite.md#scanning).
- **Inline SVG mode, on an element it does not rewrite.** `mode: "svg"` replaces `<i class="ic-…">` tags and emits no mask rules, so `.ic` on any other element has no rule behind it. The build warns, naming the class and the file. Under Astro, `.md` and `.mdx` are not rewritten and nothing warns; wrap the icon in a component for `.mdx`, or use CSS mode for `.md`. See [Vite § Inline SVG mode](delivery/vite.md#inline-svg-mode) and [Astro § Inline SVG mode](frameworks/astro.md#inline-svg-mode).

## The stroke width does not change

- **Plain CSS.** Family stylesheets carry each icon at its authored width; `ic-lucide-heart/1.5` needs Tailwind, Vite, or PostCSS. See [Stroke width](concepts.md#stroke-width).
- **A family drawn with fills.** Only `lucide` and `line-md` are stroke-based. Every other bundled family ignores the modifier.

## The color does not change

Set `--ic-color` on the icon or an ancestor, or `--<prefix>-color` under a custom class prefix. Plain `color` reaches only icons without a color of their own: a brand icon keeps its brand color until `--ic-color` overrides it. Setting `background-color` on the icon element itself replaces its paint, because CSS mask icons paint through their `background`. In inline SVG mode under a Content Security Policy that blocks `style` attributes, a brand icon keeps its brand color and ignores `--ic-color`. See [Color](concepts.md#color).

## A brand icon is invisible in dark mode

Its brand color is near-black, as GitHub's, X's, and Vercel's are. Set `--ic-color` to a light color on those classes inside your dark theme. See [Color](concepts.md#color).

## The license notice is missing from the output

A minifier configured with `legalComments: "none"` strips `/*! … */` comments. Use `attribution: "file"` with Vite to emit `icons-attribution.txt`, or configure your minifier to keep legal comments. See [Licensing](licensing.md).

## Next

Return to the [Overview](index.md) for the full reading path, or look up individual exports and options in the [API reference](reference/index.md).
