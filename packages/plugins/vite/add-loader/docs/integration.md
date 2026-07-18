---
title: Integration
---

# Integration and API

## Register the plugin

```ts
import { defineConfig } from "vite";
import { addLoaderPlugin } from "@codenhub/vite-plugin-add-loader";

export default defineConfig({
  plugins: [
    addLoaderPlugin({
      backgroundColor: "var(--app-background, #fff)",
      color: "var(--app-accent, #2563eb)",
      timeout: 8_000,
    }),
  ],
});
```

The plugin declares both `enforce: "post"` and a post-order `transformIndexHtml` hook. It can appear anywhere in `plugins`; its HTML mutation runs after normal-order HTML hooks. Another post-order plugin can still affect relative ordering, so inspect output when plugins target the same `<head>` or `<body>` boundary.

The hook runs for HTML served by Vite during development and for every HTML entry transformed during a production build. It does not transform JavaScript modules.

## Public exports

### `addLoaderPlugin(options?)`

Creates the Vite plugin. It injects the overlay into each eligible HTML entry and returns the input unchanged when it cannot find both a closing `</head>` and an opening `<body>` outside protected literal blocks.

### `AddLoaderPluginOptions`

| Property          | Type     | Default                            | Effect                                                |
| ----------------- | -------- | ---------------------------------- | ----------------------------------------------------- |
| `backgroundColor` | `string` | `var(--color-background, #fafafa)` | CSS background value for the overlay.                 |
| `color`           | `string` | `var(--color-primary, #0a0a0a)`    | CSS color inherited by the spinner.                   |
| `nonce`           | `string` | none                               | Adds a nonce attribute to injected script/style tags. |
| `timeout`         | `number` | `5000`                             | Milliseconds before fallback overlay removal begins.  |

Option values come from trusted build configuration and are interpolated into generated HTML, CSS, or JavaScript without escaping or runtime validation. Use a finite, non-negative timeout and do not pass request data or other untrusted values.
