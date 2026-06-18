# @codenhub/vite-plugins

Vite plugins for icon inlining, CSS deferral, and async page-loader injection.
Each plugin is independent — import only what the app needs.

## Installation

```sh
pnpm add -D @codenhub/vite-plugins
```

## Usage

Register one or more plugins in your Vite config. Plugins have no required order relative to each
other, but plugin-specific order constraints are noted in the Reference section below.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { addLoaderPlugin, deferCssPlugin, iconsPlugin } from "@codenhub/vite-plugins";

export default defineConfig({
  plugins: [iconsPlugin(), deferCssPlugin(), addLoaderPlugin()],
});
```

## Reference

### `@codenhub/vite-plugins`

Primary entrypoint for all plugins and public types.

```ts
import {
  addLoaderPlugin,
  deferCssPlugin,
  iconsPlugin,
  type IconDefinition,
  type IconOptions,
  type IconsPluginOptions,
} from "@codenhub/vite-plugins";
```

---

#### `iconsPlugin()`

Replaces `<i class="ic-<name>">` marker elements with inline SVG at build time. Works in HTML,
JS, TS, JSX, and TSX files. Icon markers that do not match a known name are left unchanged.

```ts
function iconsPlugin(options?: IconsPluginOptions): Plugin;
```

The plugin runs with `enforce: "pre"` so icon replacement happens before framework transforms.

```ts
import { iconsPlugin } from "@codenhub/vite-plugins";

export default { plugins: [iconsPlugin()] };
```

**Built-in icons**

| Name      | Aliases              |
| --------- | -------------------- |
| `close`   | `dismiss`, `x`       |
| `error`   | —                    |
| `info`    | —                    |
| `loader`  | `spinner`, `loading` |
| `moon`    | —                    |
| `success` | —                    |
| `sun`     | —                    |
| `warning` | —                    |

Use `ic-<name>` as a class on an `<i>` element. Any other classes on the marker element are
forwarded to the rendered `<svg>`. Other attributes (e.g. `id`, `aria-*`) are also forwarded.

```html
<i class="ic-close size-4 text-red-500" aria-hidden="true"></i>
<!-- renders as -->
<svg class="size-4 text-red-500" aria-hidden="true">…</svg>
```

---

#### `IconsPluginOptions`

Options accepted by `iconsPlugin()`.

```ts
interface IconsPluginOptions {
  icons?: Record<string, IconDefinition>;
}
```

| Property | Type                             | Default | Description                                                                                      |
| -------- | -------------------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| `icons`  | `Record<string, IconDefinition>` | `{}`    | Additional icons merged on top of the built-in registry. Consumer entries win on name conflicts. |

---

#### `IconDefinition`

An icon entry in the registry. Either a raw inline SVG string or an `IconOptions` object.

```ts
type IconDefinition = string | IconOptions;
```

---

#### `IconOptions`

Extended icon definition with SVG markup and optional lookup aliases.

```ts
interface IconOptions {
  markup: string;
  alternativeNames?: readonly string[];
}
```

| Property           | Type                | Description                                                                 |
| ------------------ | ------------------- | --------------------------------------------------------------------------- |
| `markup`           | `string`            | Raw inline SVG string rendered in place of the icon marker element.         |
| `alternativeNames` | `readonly string[]` | Additional names that resolve to this icon, in addition to the primary key. |

---

#### `deferCssPlugin()`

Use this to improve perceived load performance. Browsers normally block rendering until all
stylesheets are downloaded. This plugin converts `<link rel="stylesheet">` tags in HTML entry
points to non-render-blocking preloads, then swaps them back to stylesheets once loaded — so the
page can paint before CSS finishes downloading. A `<noscript>` fallback restores the original
`<link>` tags for browsers with JavaScript disabled.

Runs with `enforce: "post"`. Does not affect CSS imported through JavaScript modules.

```ts
function deferCssPlugin(): Plugin;
```

```ts
import { deferCssPlugin } from "@codenhub/vite-plugins";

export default { plugins: [deferCssPlugin()] };
```

---

#### `addLoaderPlugin()`

Use this to mask the blank screen that appears while JavaScript and assets are loading on first
visit. The plugin injects a full-screen overlay into every HTML entry point. The overlay fades out
and removes itself once the `load` event fires, so users see a spinner instead of an empty page.
A `<noscript>` rule hides the loader entirely when JavaScript is unavailable.

Runs with `enforce: "post"`.

```ts
function addLoaderPlugin(): Plugin;
```

```ts
import { addLoaderPlugin } from "@codenhub/vite-plugins";

export default { plugins: [addLoaderPlugin()] };
```

The loader element uses `id="page-loader"` and reads CSS custom properties for theming:

| Property             | Fallback  |
| -------------------- | --------- |
| `--color-background` | `#fafafa` |
| `--color-border`     | `#d4d4d4` |
| `--color-primary`    | `#0a0a0a` |

## Examples

### Extending the icon registry

Add custom icons or override built-ins by passing an `icons` map. Consumer entries take precedence
over built-in icons when names conflict. Each entry is either a raw SVG string or an `IconOptions`
object that also declares `alternativeNames`.

```ts
import { iconsPlugin } from "@codenhub/vite-plugins";
import type { IconDefinition } from "@codenhub/vite-plugins";

const customIcons: Record<string, IconDefinition> = {
  star: {
    markup: `<svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l3 7h7l-6 5 2 7-6-4-6 4 2-7-6-5h7z"/>
    </svg>`,
    alternativeNames: ["favourite", "bookmark"],
  },
};

export default { plugins: [iconsPlugin({ icons: customIcons })] };
```

### Combining plugins

```ts
import { defineConfig } from "vite";
import { addLoaderPlugin, deferCssPlugin, iconsPlugin } from "@codenhub/vite-plugins";

export default defineConfig({
  plugins: [iconsPlugin(), deferCssPlugin(), addLoaderPlugin()],
});
```

## Requirements

- Vite `^8.0.16` is required as a peer dependency.
- TypeScript consumers should use `moduleResolution: "bundler"` or a resolver that supports
  package `exports`.

## Notes

- All plugins operate at build time only and add no runtime dependencies to consumer bundles.
- `iconsPlugin` leaves unknown `ic-*` class names unchanged, so partial adoption is safe.
- `deferCssPlugin` targets `<link rel="stylesheet">` in the final HTML. It does not affect CSS
  imported through JavaScript modules.
- `addLoaderPlugin` injects into every HTML entry point processed by Vite. Projects with multiple
  HTML entry points will receive the loader in each.
