# @codenhub/example-package

Short description of what the package does and when to use it.

<!-- Start from behavior, then keep only public surfaces that consumers actually use in normal package usage. -->
<!-- This template shows several possible public surfaces. Keep only the sections that apply to the package. -->

## Installation

```sh
pnpm add @codenhub/example-package
```

## Usage

```ts
import { createExample } from "@codenhub/example-package";

const example = createExample({ id: "main" });

example.start();
```

## Reference

### `createExample()`

Creates an example instance.

```ts
function createExample(options: ExampleOptions): Example;
```

Import from `@codenhub/example-package`.

| Parameter | Type             | Description             |
| --------- | ---------------- | ----------------------- |
| `options` | `ExampleOptions` | Required configuration. |

Returns `Example`.

Throws `TypeError` when `options.id` is empty.

### `Example`

Instance returned by `createExample()`.

```ts
interface Example {
  start(): void;
  stop(): void;
}
```

#### `start()`

Starts the example.

```ts
function start(): void;
```

#### `stop()`

Stops the example and removes active listeners.

```ts
function stop(): void;
```

### `ExampleOptions`

```ts
interface ExampleOptions {
  id: string;
  debug?: boolean;
}
```

| Property | Type      | Default | Description                |
| -------- | --------- | ------- | -------------------------- |
| `id`     | `string`  | None    | Stable example identifier. |
| `debug`  | `boolean` | `false` | Enables debug logging.     |

### `EXAMPLE_DEFAULTS`

Default option values.

```ts
const EXAMPLE_DEFAULTS: Pick<ExampleOptions, "debug">;
```

### Events

#### `example:start`

Emitted when an example starts.

```ts
interface ExampleStartEvent {
  id: string;
}
```

### CSS: `@codenhub/example-package/styles.css`

Default styles for the example package.

```ts
import "@codenhub/example-package/styles.css";
```

Use when consumers want the package-provided default visual treatment. Omit when using custom styles.

### Plugin: `createExamplePlugin()`

Creates a build-tool plugin.

```ts
function createExamplePlugin(options?: ExamplePluginOptions): ExamplePlugin;
```

Import from `@codenhub/example-package/plugin`.

Place after framework plugins that create source files the example plugin reads.

### Type-Only Entrypoint

Types exported for consumers that only need compile-time definitions.

```ts
import type { ExampleOptions } from "@codenhub/example-package/types";
```

This entrypoint has no runtime behavior.

### Assets Or Tokens

Public token values for consumers that need package-defined constants.

```ts
import { exampleTokens } from "@codenhub/example-package/tokens";
```

Token names are stable within the current major version.

## Examples

### Stop During Cleanup

```ts
const example = createExample({ id: "sidebar" });

example.start();
example.stop();
```

## Requirements

- Requires a modern browser with `EventTarget`.
- Safe to import during SSR.
- Requires `@codenhub/example-package/styles.css` only when using default styles.

## Notes

- Does not persist state.
- Does not validate remote data.
- Does not provide framework-specific adapters.
