---
title: Overview
description: Complete documentation for @codenhub/icons icon registry, CSS mask generator, bundler plugins, and JS helpers.
---

# Icons Documentation

`@codenhub/icons` is a high-performance, zero-runtime icon system. It provides a flexible `IconRegistry`, SVG mask generator, static class scanner, PostCSS plugin, Vite plugin, and programmatic JS helpers to generate optimized CSS mask rules for icons across web applications.

---

## Core Concepts & Features

- **Zero-Verbosity Icon Markup**: Place icon classes directly on `<i>` tags (e.g. `<i class="ic-search"></i>`) without requiring a base `.ic` utility class.
- **Automatic Pseudo-Element Masking**: Place icon classes on closed/container tags (`<button class="btn ic-check">` or `<a class="ic-arrow-right ic-after">`) to render icons automatically via `::before` or `::after` pseudo-elements.
- **Native CSS Custom Properties**: Generated CSS uses `--ic-uri` and `--ic-mask` variables, allowing complete CSS flexibility with `mask-image` or `background-image`.
- **Customization Tokens**: Control icon size (`--ic-size`) and color (`--ic-color`) using standard CSS variables on any parent container.
- **Programmatic JS Helpers**: `getIconMaskUrl` and `getIconCssProps` to dynamically resolve SVG Data URIs for inline styles or CSS-in-JS.
- **IconRegistry**: O(1) map-backed registry supporting provider datasets, custom SVG registrations, and semantic alias resolution (`close` -> `x`, `check` -> `tick`).
- **Bundler Integration**: Vite and PostCSS plugins scan source code at build time and automatically generate deduplicated CSS mask rules.

---

## Markup Patterns & Examples

### Standalone Icons

Use `<i>` elements for standalone inline icons:

```html
<!-- Direct element rendering (no base .ic class required) -->
<i class="ic-search" aria-hidden="true"></i>
<i class="ic-check" style="color: green" aria-hidden="true"></i>
<i class="ic-settings" aria-hidden="true"></i>
```

### Leading Pseudo-Element Icons (`::before`)

Apply icon classes directly to buttons, badges, or links. The icon is rendered automatically via `::before`:

```html
<button class="btn primary ic-check">Submit Form</button>
<button class="btn ic-search">Search Docs</button>
<a class="nav-link ic-user">User Profile</a>
```

### Trailing Pseudo-Element Icons (`::after`)

Add `.ic-after` alongside the icon class to render the icon after element text via `::after`:

```html
<button class="btn ic-arrow-right ic-after">Next Step</button>
```

### Custom Sizing & Coloring

Customize icon size and color using `--ic-size` and `--ic-color` CSS variables:

```css
.custom-button {
  --ic-size: 1.5rem;
  --ic-color: var(--color-primary);
}
```

---

## Programmatic JavaScript / TypeScript API

Import core generators and helpers from `@codenhub/icons`:

```ts
import {
  generateBaseCss,
  generateIconCss,
  generateIconSetCss,
  getIconCssProps,
  getIconMaskUrl,
  registry,
} from "@codenhub/icons";
```

### CSS Generators

#### `generateBaseCss(options?: BaseCssOptions): string`

Generates base container, pseudo-element (`::before`/`::after`), and custom property rules.

```ts
const baseCss = generateBaseCss({ prefix: "ic" });
```

#### `generateIconCss(selectors: string | string[], svg: string, options?: GenerateIconCssOptions): string`

Generates `--ic-uri` and `--ic-mask` CSS rules for specific selectors and SVG string.

```ts
const iconCss = generateIconCss(".ic-close", "<svg>...</svg>");
```

#### `generateIconSetCss(classes: Iterable<string>, registry: IconRegistry, options?: GenerateIconSetCssOptions): string`

Scans class names, resolves icons from registry, groups duplicate SVGs, and outputs deduplicated CSS.

---

### JS Mask Helpers

#### `getIconMaskUrl(iconNameOrSvg: string, registry?: IconRegistry, options?: { strokeWidth?: number | string }): string | undefined`

Returns formatted `url("data:image/svg+xml,...")` for an SVG string or registered icon name.

```ts
const maskUrl = getIconMaskUrl("search", registry);
// => 'url("data:image/svg+xml;charset=utf-8,...")'
```

#### `getIconCssProps(iconNameOrSvg: string, registry?: IconRegistry, options?: { prefix?: string; strokeWidth?: number | string }): Record<string, string> | undefined`

Returns an inline style object containing `--ic-uri` and `--ic-mask` custom properties.

```ts
const styleObj = getIconCssProps("check", registry);
// => { "--ic-uri": 'url(...)', "--ic-mask": "var(--ic-uri)" }
```

---

## IconRegistry API

`IconRegistry` manages registered providers and custom icon definitions:

```ts
import { IconRegistry, lucideProvider } from "@codenhub/icons";

const customRegistry = new IconRegistry();

// 1. Register built-in Lucide provider
customRegistry.registerProvider(lucideProvider);

// 2. Register custom icon with aliases
customRegistry.registerIcon("custom-star", {
  svg: '<svg viewBox="0 0 24 24"><polygon points="..."/></svg>',
  alt: ["star-filled", "favorite"],
});

// 3. Resolve icon by name or alias
const resolved = customRegistry.resolve("favorite");
console.log(resolved?.name); // "lucide:custom-star"
```

---

## Bundler Plugins

### Vite Plugin (`@codenhub/icons/vite`)

In `vite.config.ts`:

```ts
import viteIcons from "@codenhub/icons/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    viteIcons({
      content: ["./src/**/*.{html,js,ts,jsx,tsx,vue,svelte}"],
      prefix: "ic",
      mode: "css", // "css" (default) or "svg" (inline SVG replacement)
    }),
  ],
});
```

Import `virtual:icons.css` or `@import "@codenhub/icons";` in your main stylesheet.

### PostCSS Plugin (`@codenhub/icons/postcss`)

In `postcss.config.js`:

```js
import postcssIcons from "@codenhub/icons/postcss";

export default {
  plugins: [
    postcssIcons({
      content: ["./src/**/*.{html,js,ts,jsx,tsx}"],
      prefix: "ic",
    }),
  ],
};
```
