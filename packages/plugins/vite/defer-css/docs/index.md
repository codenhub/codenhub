---
title: Overview
---

# Defer HTML-linked stylesheets

`@codenhub/vite-plugin-defer-css` changes stylesheet links in Vite HTML entries
into preloads, then restores `rel="stylesheet"` after each file loads. Use it
only after measuring that deferred, HTML-linked CSS is appropriate. CSS imported
from JavaScript modules is not processed.

## Setup

### Installation

```sh
pnpm add -D @codenhub/vite-plugin-defer-css
```

### Quick start

```ts
import { defineConfig } from "vite";
import { deferCssPlugin } from "@codenhub/vite-plugin-defer-css";

export default defineConfig({
  plugins: [deferCssPlugin()],
});
```

The plugin turns a stylesheet link into a preload that becomes a stylesheet
after loading. When `</head>` is available, it also emits a `noscript` fallback.

### Configuration

The default output uses an inline `onload` handler. For a strict CSP that blocks
event attributes, pass a trusted build-time nonce to generate one nonced helper
script instead:

```ts
deferCssPlugin({ nonce: "build-provided-nonce" });
```

The application must send a matching CSP header. The plugin does not generate
per-request nonces, and the configured value is inserted without escaping.

## Requirements

- Vite `^8.0.0`.
- JavaScript for the deferred path. The fallback handles disabled JavaScript,
  not scripts that are blocked or fail.
- A closing `</head>` for the `noscript` fallback and nonce helper. Without it,
  links are still converted; in nonce mode they have no generated restoration
  mechanism.
- Testing for unstyled content, layout shifts, focus visibility, hidden labels,
  and other essential accessibility behavior before deferring critical CSS.
- The plugin may appear anywhere in `plugins`; it enforces post-order HTML
  transformation. Inspect ordering when another post plugin rewrites stylesheet
  links.

The transform runs in Vite development and production builds. If a stylesheet
fails to load or generated inline code is blocked, deferred styles may never
apply.

## Next steps

- [Integration and API](integration.md): Review matching rules, nonce mode,
  plugin order, and public exports.
- [Transformed output and constraints](output-and-constraints.md): Inspect exact
  markup, CSP behavior, rendering and accessibility risks, and failures.
