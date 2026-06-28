# @codenhub/vite-plugin-add-loader

Vite plugin that injects a full-screen page-loader overlay into every HTML entry point. The loader fades out and removes itself after the window `load` event fires, so users see a spinner instead of a blank page during initial asset load.

## Installation

```sh
pnpm add -D @codenhub/vite-plugin-add-loader
```

## Usage

Register the plugin in your Vite configuration. The plugin operates at build time and adds no runtime dependencies to consumer bundles.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { addLoaderPlugin } from "@codenhub/vite-plugin-add-loader";

export default defineConfig({
  plugins: [addLoaderPlugin()],
});
```

The loader element uses `id="page-loader"` and reads CSS custom properties for theming, falling back to neutral values when unset:

| Property             | Fallback  | Description                       |
| -------------------- | --------- | --------------------------------- |
| `--color-background` | `#fafafa` | Loader overlay background color.  |
| `--color-border`     | `#d4d4d4` | Spinner border track color.       |
| `--color-primary`    | `#0a0a0a` | Spinner rotating indicator color. |

## Reference

### `@codenhub/vite-plugin-add-loader`

Primary entrypoint for the plugin.

```ts
import { addLoaderPlugin } from "@codenhub/vite-plugin-add-loader";
```

#### `addLoaderPlugin()`

Creates a Vite plugin instance that injects a loader overlay into the final HTML output.

```ts
function addLoaderPlugin(options?: AddLoaderPluginOptions): Plugin;
```

##### `AddLoaderPluginOptions`

```ts
interface AddLoaderPluginOptions {
  /** Background color for the page-loader overlay. Defaults to `var(--color-background, #fafafa)`. */
  backgroundColor?: string;
  /** Spinner color. Defaults to `currentColor` (falling back to `var(--color-primary, #0a0a0a)`). */
  color?: string;
  /** Content Security Policy nonce to inject into style and script tags. */
  nonce?: string;
  /** Maximum load duration in milliseconds before forcing the loader to fade out. Defaults to `5000` (5 seconds). */
  timeout?: number;
}
```

## Requirements

- Vite `^8.0.0` is required as a peer dependency.
- TypeScript consumers should use `moduleResolution: "bundler"` or a resolver that supports package `exports`.

## Notes

- The plugin operates at build time only and adds no runtime dependencies to consumer bundles.
- It injects into every HTML entry point processed by Vite. Projects with multiple HTML entry points will receive the loader in each.

## License

This project is licensed under the [Apache-2.0](LICENSE) license.
