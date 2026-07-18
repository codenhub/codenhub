---
title: Overview
---

# Add an initial page loader

`@codenhub/vite-plugin-add-loader` injects a full-screen loading overlay into
each HTML entry processed by Vite, then removes it after `window.load` or a
timeout. It covers initial document loading, not route changes or application
data requests.

## Setup

### Installation

```sh
pnpm add -D @codenhub/vite-plugin-add-loader
```

### Quick start

```ts
import { defineConfig } from "vite";
import { addLoaderPlugin } from "@codenhub/vite-plugin-add-loader";

export default defineConfig({
  plugins: [addLoaderPlugin()],
});
```

The plugin injects a fixed `page-loader` overlay, inline styles, and an inline
script. It removes the overlay after the page loads or after the default
five-second timeout.

### Configuration

Configure colors, the fallback timeout, and an optional trusted CSP nonce:

```ts
addLoaderPlugin({
  backgroundColor: "var(--app-background, #fff)",
  color: "var(--app-accent, #2563eb)",
  nonce: "build-provided-nonce",
  timeout: 8_000,
});
```

These values are inserted into generated HTML, CSS, or JavaScript without
escaping or runtime validation. Do not derive them from untrusted data.

## Requirements

- Vite `^8.0.0`.
- Browser HTML with JavaScript enabled for timed removal. A generated
  `noscript` rule hides the overlay when JavaScript is disabled.
- HTML entries with both `</head>` and an opening `<body>`; otherwise the input
  is returned unchanged.
- A CSP that permits the generated inline output. Nonce mode does not nonce the
  spinner's inner style, so test strict policies against the emitted document.
- An application-level reduced-motion treatment when required; the generated
  animation has no `prefers-reduced-motion` override.
- The plugin may appear anywhere in `plugins`; it enforces post-order HTML
  transformation. Inspect ordering when another post plugin changes the same
  boundaries.

## Next steps

- [Integration and API](integration.md): Configure colors, timeout, nonce
  handling, plugin order, and public exports.
- [Generated output and constraints](output-and-constraints.md): Review exact
  output, CSP, accessibility, markup requirements, and failure behavior.
