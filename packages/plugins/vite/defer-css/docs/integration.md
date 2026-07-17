# Defer-CSS integration and API

## Register the plugin

```ts
import { defineConfig } from "vite";
import { deferCssPlugin } from "@codenhub/vite-plugin-defer-css";

export default defineConfig({
  plugins: [deferCssPlugin()],
});
```

The plugin declares both `enforce: "post"` and a post-order `transformIndexHtml` hook. It can appear anywhere in `plugins`; its HTML mutation runs after normal-order HTML hooks. If another post-order plugin rewrites stylesheet links, inspect the final ordering and output.

The hook runs for HTML served by Vite during development and for every HTML entry transformed during a production build. It does not process module imports or `.css` files.

## Public exports

### `deferCssPlugin(options?)`

Creates the Vite plugin. It matches `<link>` tags with an `href` and a `rel` value containing the `stylesheet` token, outside HTML comments and `pre`, `script`, `style`, and `noscript` blocks. Attribute order, single or double quotes, and an unquoted `rel=stylesheet` are supported.

### `DeferCssPluginOptions`

| Property | Type     | Default | Effect                                                                  |
| -------- | -------- | ------- | ----------------------------------------------------------------------- |
| `nonce`  | `string` | none    | Replaces per-link inline handlers with one nonced inline helper script. |

The nonce is a trusted build-time value interpolated into generated HTML without escaping. It must match the deployed `script-src` policy. Do not derive it from request data or other untrusted values.
