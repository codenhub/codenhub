# @codenhub/vite-plugin-add-loader

`@codenhub/vite-plugin-add-loader` places a full-screen loading overlay in every
HTML entry processed by Vite, then removes it after `window.load` or a timeout.
It is useful when the initial document and its assets need a simple loading
treatment. It does not track route changes or application data requests.

> [!WARNING]
> Experimental: the plugin API, injected HTML/CSS/JavaScript, and browser support may change before a stable release.

Register it in your Vite configuration:

```ts
import { defineConfig } from "vite";
import { addLoaderPlugin } from "@codenhub/vite-plugin-add-loader";

export default defineConfig({
  plugins: [addLoaderPlugin()],
});
```

The transform injects inline styles and JavaScript. Before adopting it, check
that your Content Security Policy permits the output and decide how your app
will support reduced motion. The generated overlay uses the fixed
`page-loader` ID.

## Continue

- [Configure and integrate the plugin](integration.md) for colors, timeout,
  nonce handling, plugin order, and the public API.
- [Understand the generated output and constraints](output-and-constraints.md)
  for CSP, accessibility, markup requirements, and failure behavior.

Vite `^8.0.0` is supported. HTML without both `</head>` and an opening `<body>`
is left unchanged.
