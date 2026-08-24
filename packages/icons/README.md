# @codenhub/icons

Zero-runtime icon system for the web. Write `ic-heart` in your markup and the build emits exactly the CSS masks that markup needs — no imports, no components, no icon library in the bundle.

`@codenhub/icons` ships 13 generated icon families totalling over 34,000 icons, each with the license notices its artwork requires, so a project can adopt icons without auditing licenses itself.

> [!WARNING]
> This package is experimental. Its data schema, exports, and plugin options may change before 1.0. The registry API described here replaced the provider-based one and is not backward compatible.

## Installation

```sh
pnpm add @codenhub/icons
npm install @codenhub/icons
yarn add @codenhub/icons
bun add @codenhub/icons
```

## Usage

Declare the families you want, then write icon classes:

```ts
// vite.config.ts
import lucide from "@codenhub/icons/data/lucide";
import phosphorFill from "@codenhub/icons/data/phosphor-fill";
import viteIcons from "@codenhub/icons/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    viteIcons({
      content: ["./src/**/*.{html,ts,tsx,vue,svelte}"],
      families: [lucide, phosphorFill],
      defaultPrefix: "lucide",
    }),
  ],
});
```

```css
@import "@codenhub/icons";
```

```html
<!-- standalone element -->
<i class="ic-heart" aria-hidden="true"></i>

<!-- leading icon through ::before -->
<button class="btn ic-check">Submit</button>

<!-- trailing icon through ::after -->
<button class="btn ic-arrow-right ic-after">Next</button>

<!-- an icon from another family -->
<i class="ic-phosphor-fill-heart" aria-hidden="true"></i>
```

Nothing is bundled by default: a build only carries the families it was given and only the icons its markup used.

## Documentation

- [Documentation overview](docs/index.md): families, resolution, plugins, JavaScript helpers, and licensing.

## Requirements

- Node.js >= 18.0.0
- Optional peer dependencies: `vite` >= 5.0.0 for the Vite plugin, `postcss` >= 8.0.0 for the PostCSS plugin.
- Browsers must support CSS `mask-image`; icons render through masks tinted with `currentColor`.

## Notes

- Icon names resolve as `prefix:name`, written `ic-prefix-name` in a class. Unprefixed names resolve through the curated semantic map, then through `defaultPrefix`.
- `stroke`, `after`, and `bg` are reserved: `ic-stroke-1.5`, `ic-after`, and `ic-bg` are modifiers, so no family may use them as a prefix.
- Stroke width is configurable only for families drawn with strokes, such as Lucide. Families drawn as filled paths ignore it.
- Icon data is generated from upstream packages and committed; `pnpm generate icons` rebuilds it and CI fails on drift.

## License

This package is licensed under the [Apache-2.0](LICENSE) license.

Its icon artwork comes from third parties, under ISC, MIT, and Apache-2.0 terms. See [NOTICE](NOTICE) for the full list. By default a build emits the notices required by the families it used, so a consumer carries no separate obligation; see the documentation for the `attribution` option that controls it.
