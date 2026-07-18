---
title: Overview
---

# Replace icon markers at build time

`@codenhub/vite-plugin-icons` replaces static icon markers with inline SVG while
Vite transforms HTML, JavaScript, TypeScript, JSX, and TSX. It includes a
Lucide-derived registry and accepts trusted custom SVG definitions.

## Setup

### Installation

```sh
pnpm add -D @codenhub/vite-plugin-icons
```

### Quick start

Register the plugin in your Vite configuration:

```ts
import { defineConfig } from "vite";
import { iconsPlugin } from "@codenhub/vite-plugin-icons";

export default defineConfig({
  plugins: [iconsPlugin()],
});
```

Then use an empty marker with a static class:

```html
<i class="ic-success size-4" aria-hidden="true"></i>
```

The known `ic-success` marker becomes an `<svg>`. The plugin moves other classes
and attributes to the SVG root and removes the resolved icon class. Unknown
icons remain unchanged.

### Configuration

Pass `icons` to add or override definitions, or set `shouldClear: true` to omit
the built-in registry:

```ts
iconsPlugin({
  icons: {
    brand: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16" /></svg>`,
  },
});
```

Custom SVG is inserted without validation or sanitization. Use only controlled
markup, hide decorative icons, and provide accessible names for meaningful
icons or their controls.

## Requirements

- Vite `^8.0.16` and an ESM-capable Node.js environment.
- Static quoted `class` or `className` values. Dynamic JSX class expressions are
  not matched.
- The plugin may appear anywhere in `plugins`; it enforces pre-order HTML and
  module transforms. Check relative ordering when another pre plugin produces or
  consumes the same markers.

## Next steps

- [Integration and API](integration.md): Review supported marker syntax, custom
  registries, plugin order, and public exports.
- [Generated SVG and constraints](output-and-constraints.md): Understand
  attribute merging, security, accessibility, failures, and Lucide attribution.
