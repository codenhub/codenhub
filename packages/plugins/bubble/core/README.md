# bubble-plugin

Core types and build scripts for developing Bubble.io plugins with TypeScript.

## Installation

```sh
npm install --save-dev bubble-plugin
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

### Folder Structure

Your project should follow this file structure:

```text
my-bubble-plugin/
├── bubble.json
├── package.json
├── tsconfig.json
└── src/
    ├── actions/
    │   └── my-action.ts       # Server-side or client-side action
    └── elements/
        └── my-element/
            ├── initialize.ts  # Element initializer hook
            ├── update.ts      # Element update hook
            └── preview.ts     # Element preview hook
```

## Reference

This package exports a single entrypoint `bubble-plugin` containing TypeScript typings, and a CLI command `bbp`.

### CLI

- `bbp build` - Scans `src/actions/` and `src/elements/`, compiles TypeScript code, resolves imports, bundles dependencies, strips ESM exports, and appends execution/lifecycle triggers.

### Exports

#### `BubbleProperties` (Interface)

Type definition representing the key-value dictionary of properties configured in the Bubble plugin dashboard.

```typescript
export interface BubbleProperties {
  [key: string]: unknown;
}
```

#### `BubbleContext` (Interface)

The context object provided by Bubble to action and element lifecycles.

Properties:

- `keys: Record<string, string>` - Key-value map of private API keys configured for the plugin.
- `request?: (options: unknown) => unknown` - Executes a server-side HTTP request (server-side actions only).
- `timezone?: string` - The current timezone of the app user.
- `async?: <T>(fn: (cb: (err: unknown, res: T) => void) => void) => T` - Utility method to run callback-based asynchronous functions synchronously in server-side actions.

#### `BubbleElementInstance` (Interface)

The visual element state container provided by Bubble to custom element lifecycles.

Properties:

- `canvas: { [index: number]: HTMLElement; length: number } & Record<string, unknown>` - The jQuery selection wrapping the element's DOM node. Use `instance.canvas[0]` to access the raw `HTMLElement`.
- `data: Record<string, unknown>` - Key-value store to persist state and references across lifecycles.
- `triggerEvent: (eventName: string) => void` - Triggers a custom event defined in the plugin.
- `publishState: (stateName: string, value: unknown) => void` - Publishes a value to a custom state.

## Examples

### Server-Side Action

An example server-side action in `src/actions/fetch-data-server.ts`:

```typescript
import type { BubbleContext, BubbleProperties } from "bubble-plugin";

interface FetchProperties extends BubbleProperties {
  url: string;
}

export async function action(properties: FetchProperties, context: BubbleContext) {
  const url = properties.url;
  // Code gets bundled and ESM exports are automatically stripped during build
  console.log("Fetching from:", url);
}
```

### Visual Element Update Hook

An example element update hook in `src/elements/my-element/update.ts`:

```typescript
import type { BubbleContext, BubbleElementInstance, BubbleProperties } from "bubble-plugin";

interface ElementProperties extends BubbleProperties {
  bg_color: string;
}

export function update(instance: BubbleElementInstance, properties: ElementProperties, context: BubbleContext): void {
  const container = instance.canvas[0];
  container.style.backgroundColor = properties.bg_color;
}
```

## Requirements

- Node.js v22+
- TypeScript v5+ or v6+
- `tsdown` (workspace catalog)

## Notes

### Limitations & Non-Goals

- **ESM Imports**: While the bundler supports importing helper functions from sibling files within your plugin workspace, it does not support importing external ESM libraries that rely on Node.js or browser APIs not available in the Bubble plugin runtime environment.
- **No DOM in Server-side Actions**: Actions ending with `-server.ts` or declaring an `async` function are treated as server-side actions and executed in a Node.js-like sandbox. Avoid accessing browser APIs like `window`, `document`, or jQuery in these files.

## License

Apache-2.0
