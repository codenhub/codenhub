---
title: Integration
---

# Integration and API

## Register the plugin

```ts
import { defineConfig } from "vite";
import { iconsPlugin } from "@codenhub/vite-plugin-icons";

export default defineConfig({
  plugins: [iconsPlugin()],
});
```

The plugin declares `enforce: "pre"` for module transforms and a pre-order `transformIndexHtml` hook so markers are replaced before normal framework and HTML transforms. It can appear anywhere in `plugins`; inspect ordering if another pre plugin generates or consumes the same markers.

Use an empty marker with a static quoted class:

```tsx
const SaveLabel = () => (
  <span>
    <i className="ic-save size-4" aria-hidden="true" /> Save
  </span>
);
```

HTML accepts `class`; JS, TS, JSX, and TSX accept static `class` or `className`. Expression-bound classes such as `className={iconClass}` and template expressions are not matched. HTML comments, `pre`, and `noscript` blocks are protected, while marker text inside HTML `script` and `style` blocks can be transformed.

## Public exports

### `iconsPlugin(options?)`

Creates the Vite plugin. During development and production builds it transforms HTML entries plus `.js`, `.ts`, `.jsx`, and `.tsx` module IDs, including IDs with query strings. Unknown icons remain unchanged.

### `IconsPluginOptions`

| Property      | Type                             | Default | Effect                                                       |
| ------------- | -------------------------------- | ------- | ------------------------------------------------------------ |
| `shouldClear` | `boolean`                        | `false` | Excludes all built-in icons when `true`.                     |
| `icons`       | `Record<string, IconDefinition>` | `{}`    | Adds custom names and aliases; custom entries win conflicts. |

Primary names and `alternativeNames` share one lookup registry. A later custom entry or alias can replace an earlier built-in or custom mapping.

### `IconDefinition`

`string | IconOptions`. A string is raw inline SVG markup. The plugin does not parse, validate, or sanitize it.

### `IconOptions`

| Property           | Type                | Required | Effect                                            |
| ------------------ | ------------------- | -------- | ------------------------------------------------- |
| `markup`           | `string`            | yes      | Raw SVG markup inserted in place of a marker.     |
| `alternativeNames` | `readonly string[]` | no       | Additional marker names resolving to this markup. |

Custom markup is trusted build input. Keep it as a complete `<svg>...</svg>` string from a controlled source.
