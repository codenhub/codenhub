# @codenhub/example-package

Short description of what the package does and when to use it.

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

## API Reference

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

## Limitations

- Does not persist state.
- Does not validate remote data.
- Does not provide framework-specific adapters.
