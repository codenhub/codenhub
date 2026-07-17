# @codenhub/vite-plugin-icons

`@codenhub/vite-plugin-icons` replaces static icon markers with inline SVG while
Vite transforms HTML, JavaScript, TypeScript, JSX, and TSX. It is useful when
templates should stay compact while icons are resolved at development and build
time. The package includes a Lucide-derived registry and accepts trusted custom
SVG.

> [!WARNING]
> Experimental: marker matching, the built-in icon set, generated SVG, and plugin API may change before a stable release.

Register `iconsPlugin()` in Vite, then use an empty marker with a static class:

```html
<i class="ic-success size-4" aria-hidden="true"></i>
```

The known `ic-success` marker becomes an `<svg>`. Other classes and attributes
move to its root, while unknown icons remain unchanged. Dynamic JSX class
expressions are not matched.

Custom SVG is inserted without sanitization, so configure only controlled
markup. The plugin also leaves accessible naming to the application: hide
decorative icons and name meaningful icons or their controls.

## Continue

- [Set up markers and icon definitions](integration.md) for Vite registration,
  supported syntax, custom registries, plugin order, and the public API.
- [Understand generated SVG and constraints](output-and-constraints.md) for
  attribute merging, security, accessibility, failures, and Lucide attribution.

Vite `^8.0.16` and an ESM-capable Node.js environment are supported.
