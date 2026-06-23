# bubble-plugin

Core types and build scripts for developing Bubble.io plugins with TypeScript.

## Installation

```sh
pnpm add -D bubble-plugin
```

## Usage

Extend `bubble-plugin` in your Bubble plugin package to compile your TypeScript source code into plain JavaScript that is safe to copy-paste into the Bubble plugin editor.

Add a build script to your plugin's `package.json`:

```json
{
  "scripts": {
    "build": "bbp build"
  }
}
```

## Reference

This package exports TypeScript interfaces and a CLI command:

### Interfaces

- `BubbleProperties` - Generic key-value dictionary representing configuration parameters.
- `BubbleContext` - The context object provided by Bubble (contains keys, request, timezone).
- `BubbleElementInstance` - Visual element state container (contains canvas jQuery selection, custom data store, and update methods).

### CLI Binaries

- `bbp build` - Scans `src/actions/` and `src/elements/` to compile code, bundle imports, strip module export statements, and append runtime execution triggers.

## Requirements

- Node.js v20+
- `tsdown` (workspace catalog)

## License

Apache-2.0
