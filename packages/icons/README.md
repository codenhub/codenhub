# @codenhub/icons

Zero-runtime icon system for the web. Write `ic-lucide-heart` in your markup and the icon arrives as a CSS mask — no imports, no components, no icon library in the bundle.

`@codenhub/icons` ships 13 generated icon families totalling over 34,000 icons, each with the license notices its artwork requires, so a project can adopt icons without auditing licenses itself.

> [!WARNING] This package is experimental. Its data schema, exports, and plugin options may change before 1.0. Version 0.2.0 removed the semantic alias map and replaced the `ic-stroke-*` class with the `ic-heart/1.5` modifier; see [Notes](#notes).

## Installation

```sh
pnpm add @codenhub/icons
npm install @codenhub/icons
yarn add @codenhub/icons
bun add @codenhub/icons
```

## Usage

Icons reach a project through CSS. Pick the entry point that matches your pipeline; all three understand the same classes.

### Tailwind CSS v4

One line. Every family is resolvable, and Tailwind emits only the icons your markup used.

```css
@import "tailwindcss";
@import "@codenhub/icons/tw";
```

### Plain CSS, no build step

Import the base rules, then a stylesheet per family. Each family is complete, so nothing has to scan your markup.

```css
@import "@codenhub/icons";
@import "@codenhub/icons/lucide";
```

### Vite or PostCSS

The plugins scan your markup and generate only the rules it needs, which keeps the output small without Tailwind.

```ts
// vite.config.ts
import lucide from "@codenhub/icons/data/lucide";
import viteIcons from "@codenhub/icons/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [viteIcons({ content: ["./src/**/*.{html,ts,tsx}"], defaultPrefix: "lucide", families: [lucide] })],
});
```

```css
@import "@codenhub/icons";
```

### The markup

```html
<!-- standalone element -->
<i class="ic-lucide-heart" aria-hidden="true"></i>

<!-- leading icon through ::before -->
<button class="btn ic-lucide-check">Submit</button>

<!-- trailing icon through ::after -->
<button class="btn ic-lucide-arrow-right ic-after">Next</button>

<!-- form controls take a background-image -->
<input class="ic-lucide-search" />

<!-- stroke width, for stroke-based families -->
<i class="ic-lucide-heart/1.5" aria-hidden="true"></i>
```

Size and color follow custom properties: set `--ic-size` and `--ic-color` on any ancestor.

## Documentation

- [Documentation overview](docs/index.md): entry points, families, resolution, plugins, JavaScript helpers, and licensing.

## Requirements

| Requirement  | Details                                                                               |
| ------------ | ------------------------------------------------------------------------------------- |
| Node.js      | 18.0.0 or newer, for the build-time plugins and helpers.                              |
| CSS imports  | Consumer tooling must resolve package CSS imports.                                    |
| Browsers     | Must support CSS `mask-image`; icons render through masks tinted with `currentColor`. |
| Tailwind CSS | Version 4 or newer, and only for the `/tw` and `/tailwind` entry points.              |
| Optional     | `vite` >= 5.0.0 for the Vite plugin, `postcss` >= 8.0.0 for the PostCSS plugin.       |

## Notes

- An icon is named `prefix:name`, written `ic-prefix-name` in a class, as in `ic-material-symbols-rounded-home`.
- The package names no default family. An unqualified `ic-heart` resolves only where you said what it means: through `defaultPrefix` in the Vite and PostCSS plugins, through `default:` in the Tailwind plugin, or, in the plugin-free path, through whichever family stylesheet you imported last.
- Stroke width is a modifier on the icon class, `ic-lucide-heart/1.5`, and applies only to families drawn with strokes. It needs one of the plugins: a plugin-free stylesheet has no way to know which widths you want, so families there render at their authored width.
- `after` and `bg` are reserved: `ic-after` and `ic-bg` are modifiers, so no family may use them as a prefix.
- The `/lucide` and other family stylesheets are large by construction — a whole family, because nothing is narrowing it. `dist/css` totals about 22 MB across all 13. Import the families you use, or use Tailwind or a plugin, which emit only what your markup asked for.
- `mode: "svg"` in the Vite plugin rewrites `<i class="ic-...">` tags into inline SVG and nothing else. Icons on other elements need CSS mode; the plugin warns when it finds one.
- Icon data is generated from upstream packages and committed; `pnpm generate icons` rebuilds it and CI fails on drift.

## License

This package is licensed under the [Apache-2.0](LICENSE) license.

Its bundled, generated icon artwork comes from third parties, under ISC, MIT, and Apache-2.0 terms. See [NOTICE](NOTICE) for the full list. Each family stylesheet opens with its own notice, and the plugins emit the notices of the families a build actually used, so a consumer carries no separate obligation for them; see the documentation for the `attribution` options that control it. A third-party set adopted through `adoptIconifySet` is not covered — a consumer remains responsible for its license terms and attribution material.
