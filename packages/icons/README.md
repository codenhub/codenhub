# @codenhub/icons

High-performance, zero-runtime icon system for Codenhub. `@codenhub/icons` provides a flexible `IconRegistry`, SVG mask generator, static class scanner, PostCSS plugin, and Vite plugin to generate optimized CSS mask rules for icons across web applications.

> [!WARNING]
> This package is experimental. API signatures and export structures may change prior to 1.0 release.

## Installation

```sh
pnpm add @codenhub/icons
npm install @codenhub/icons
yarn add @codenhub/icons
bun add @codenhub/icons
```

## Usage

### Vite Plugin

In `vite.config.ts`, import `viteIcons` and register it in your plugins array:

```ts
import viteIcons from "@codenhub/icons/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    viteIcons({
      content: ["./src/**/*.{html,js,ts,jsx,tsx,vue,svelte}"],
      prefix: "ic",
      mode: "css", // "css" (default) generates CSS mask rules; "svg" embeds inline SVG elements directly
    }),
  ],
});
```

Then in your CSS or HTML entrypoint, import `virtual:icons.css` or use `@import "@codenhub/icons";`:

```css
@import "@codenhub/icons";
```

In your markup, use icon classes directly on `<i>` tags or container elements (`<button>`, `<a>`):

```html
<!-- Standalone element (no .ic base class required) -->
<i class="ic-search" aria-hidden="true"></i>

<!-- Tag with automatic ::before pseudo-element icon -->
<button class="btn ic-check">Submit</button>

<!-- Tag with automatic ::after pseudo-element icon -->
<button class="btn ic-arrow-right ic-after">Next</button>
```

### Static & Programmatic CSS Generation

Generate static CSS string or CSS custom properties programmatically without bundlers:

```ts
import { generateBaseCss, generateIconCss, getIconCssProps, getIconMaskUrl, registry } from "@codenhub/icons";

// 1. Base styles
const baseCss = generateBaseCss({ prefix: "ic" });

// 2. Resolve icon and generate mask rule
const closeIcon = registry.resolve("close");
if (closeIcon) {
  const iconCss = generateIconCss(".ic-close", closeIcon.svg);
  console.log(baseCss + "\n" + iconCss);
}

// 3. Dynamic JS helpers for inline styles / CSS-in-JS
const maskUrl = getIconMaskUrl("check", registry);
// => 'url("data:image/svg+xml,...")'

const cssProps = getIconCssProps("check", registry);
// => { "--ic-uri": 'url(...)', "--ic-mask": "var(--ic-uri)" }
```

### JavaScript API & Registry

Register custom icons or provider datasets dynamically:

```ts
import { IconRegistry, lucideProvider, svgToDataUri } from "@codenhub/icons";

const customRegistry = new IconRegistry();

// Register built-in provider
customRegistry.registerProvider(lucideProvider);

// Register custom icon definition with aliases
customRegistry.registerIcon("custom-star", {
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polygon points="12 2 15 8 22 9 17 14 18 21 12 17 6 21 7 14 2 9 9 8 12 2"/></svg>',
  alt: ["star-filled", "favorite"],
});

// Resolve icon by primary name or alias
const resolved = customRegistry.resolve("favorite");
console.log(resolved?.name); // "lucide:custom-star"
console.log(svgToDataUri(resolved!.svg));
```

### Alias System

`@codenhub/icons` includes built-in semantic aliases so you can use familiar icon names interchangeably:

- `x` -> `close`, `cancel`, `times`
- `check` -> `tick`, `success`
- `search` -> `find`, `magnifier`
- `user` -> `account`, `profile`
- `trash` -> `delete`, `remove`
- `arrow-right` -> `next`, `forward`
- `chevron-down` -> `expand`, `dropdown`
- `edit` -> `pencil`, `modify`
- `settings` -> `cog`, `gear`, `options`

## Documentation

- [Documentation overview](docs/index.md): Complete package documentation and API references.

## Requirements

- Node.js >= 18.0.0
- Peer dependencies (optional):
  - `postcss`: `>=8.0.0` (when using PostCSS plugin)
  - `vite`: `>=5.0.0` (when using Vite plugin)

## Notes

- Icons are rendered using CSS `-webkit-mask-image` and `mask-image` with `background-color: currentColor`.
- Mask rules are deduplicated automatically: multiple aliases or classes sharing the exact same SVG produce a single grouped CSS selector rule.

## License

This package is licensed under the [Apache-2.0](LICENSE) license.

SVG icon assets derived from Lucide are licensed under the ISC License. See the [NOTICE](NOTICE) file for third-party copyright notices.
