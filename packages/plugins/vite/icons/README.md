# @codenhub/vite-plugin-icons

Vite plugin that replaces `<i class="ic-<name>">` marker elements with inline SVG at build time, in both HTML and JS/TS/JSX/TSX files.

## Installation

```sh
pnpm add -D @codenhub/vite-plugin-icons
```

## Usage

Register the plugin in your `vite.config.ts` configuration:

```ts
import { defineConfig } from "vite";
import { iconsPlugin } from "@codenhub/vite-plugin-icons";

export default defineConfig({
  plugins: [iconsPlugin()],
});
```

Write marker elements in your HTML template or scripts:

```html
<i class="ic-success size-4 text-green-500"></i>
```

Which transforms into the inlined SVG at build time:

```html
<svg class="size-4 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" ...>...</svg>
```

### With Custom Icons

You can override or extend the built-in icon registry:

```ts
import { iconsPlugin } from "@codenhub/vite-plugin-icons";

export default {
  plugins: [
    iconsPlugin({
      icons: {
        star: `<svg viewBox="0 0 24 24"><path d="M12 2l3 7h7z"/></svg>`,
        close: {
          markup: `<svg viewBox="0 0 24 24">...</svg>`,
          alternativeNames: ["dismiss", "x"],
        },
      },
    }),
  ],
};
```

> [!WARNING]
> Custom icon SVG markup must not include root `class` or `className` attributes. Doing so will result in duplicate `class` attributes on the generated element.

## Limitations

### JSX/TSX Dynamic Expressions

Only static string literal class attributes are supported for replacement. For example:

```tsx
// Supported
const el = <i className="ic-success text-green-500" />;
```

Dynamic class binding syntax (curly braces) is **not** matched and will be ignored:

```tsx
// Unsupported
const el = <i className={"ic-success"} />;
const el = <i className={`ic-success ${active ? "active" : ""}`} />;
```

## Reference

### `@codenhub/vite-plugin-icons`

Exported from the package.

#### `iconsPlugin()`

Creates the Vite plugin.

```ts
function iconsPlugin(options?: IconsPluginOptions): Plugin;
```

##### `IconsPluginOptions`

```ts
interface IconsPluginOptions {
  /**
   * If true, clears the built-in icon registry.
   * Only custom icons supplied in the `icons` option will be registered.
   */
  shouldClear?: boolean;
  /**
   * Additional icons merged on top of the built-in registry.
   * When a name exists in both, the consumer entry takes precedence.
   */
  icons?: Record<string, IconDefinition>;
}
```

##### `IconDefinition`

```ts
type IconDefinition = string | IconOptions;
```

##### `IconOptions`

```ts
interface IconOptions {
  /** Raw inline SVG string rendered in place of the icon marker element. */
  markup: string;
  /** Additional names that resolve to this icon, in addition to the primary key. */
  alternativeNames?: readonly string[];
}
```

## Requirements

- **Plugin Order:** Can be registered anywhere in the Vite `plugins` array. The plugin automatically runs with `enforce: "pre"` so the icon replacement occurs before standard framework compilers/transformers.
- **Failure Behavior:** If an icon tag uses an unknown icon name not present in the registry, it is left unmodified in the output. If the input code contains no matching icon tags or doesn't match the prefix `ic-`, the plugin returns `null` from the transform hook to let Vite skip the file.
- Vite version `^8.0.16` or compatible.
- Node.js environment supporting ESM.

## License

This project is licensed under the [Apache-2.0](LICENSE) license.

It includes SVG icons from [Lucide](https://lucide.dev) which are licensed under the [ISC License](https://github.com/lucide-dev/lucide/blob/main/LICENSE). See the [NOTICE](./NOTICE) file for details.
