# @codenhub/vite-plugin-defer-css

Vite plugin that converts `<link rel="stylesheet">` tags in HTML entry points to non-render-blocking preloads, then swaps them back to stylesheets once loaded. A `<noscript>` fallback is inserted for browsers with JavaScript disabled.

## Installation

```sh
pnpm add -D @codenhub/vite-plugin-defer-css
```

## Usage

Register the plugin in your Vite configuration. The plugin operates at build time and adds no runtime dependencies to consumer bundles.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { deferCssPlugin } from "@codenhub/vite-plugin-defer-css";

export default defineConfig({
  plugins: [deferCssPlugin()],
});
```

The plugin transforms stylesheet link tags of the form `<link rel="stylesheet" href="...">` into:

```html
<link rel="preload" href="..." as="style" onload="this.onload=null;this.rel='stylesheet'" />
```

And appends a `<noscript>` block containing the original `<link rel="stylesheet">` tags just before `</head>`:

```html
<noscript>
  <link rel="stylesheet" href="..." />
</noscript>
```

## Reference

### `@codenhub/vite-plugin-defer-css`

Primary entrypoint for the plugin.

```ts
import { deferCssPlugin } from "@codenhub/vite-plugin-defer-css";
```

#### `deferCssPlugin()`

Creates a Vite plugin instance that defers stylesheets in the final HTML output.

```ts
function deferCssPlugin(options?: DeferCssPluginOptions): Plugin;
```

Runs with `enforce: "post"` so it acts on the final HTML output after all other transforms. Does not affect CSS imported through JavaScript modules.

Returns a Vite `Plugin` object.

##### `DeferCssPluginOptions`

```ts
interface DeferCssPluginOptions {
  /** Content Security Policy nonce to inject into preload load helper script. */
  nonce?: string;
}
```

## Content Security Policy (CSP)

By default, this plugin uses inline `onload` attributes to swap `<link rel="preload">` back to `rel="stylesheet"`. If your application enforces a strict CSP that blocks inline event handlers, you must provide a `nonce` value to `deferCssPlugin`:

```ts
deferCssPlugin({
  nonce: "your-csp-nonce-value",
});
```

This configuration disables inline `onload` event attributes and instead appends an inline `<script nonce="your-csp-nonce-value">` block to dynamically wire up the stylesheet swap.

## Requirements

- Vite `^8.0.0` is required as a peer dependency.
- TypeScript consumers should use `moduleResolution: "bundler"` or a resolver that supports package `exports`.

## Notes

- The plugin operates at build time only and adds no runtime dependencies to consumer bundles.
- It transforms all `<link rel="stylesheet">` tags found in HTML entry points processed by Vite.

## License

This project is licensed under the [Apache-2.0](LICENSE) license.
