# @codenhub/kbd

Page-wide and target-scoped keyboard shortcut event binding registry.

## Installation

```sh
pnpm add @codenhub/kbd
npm install @codenhub/kbd
yarn add @codenhub/kbd
bun add @codenhub/kbd
```

## Usage

Register a keyboard event handler for the global `Escape` key:

```ts
import { KEYS, keyboard } from "@codenhub/kbd";

const registration = keyboard.register(KEYS.escape, (event) => {
  console.log("Escape pressed");
});

// Later, remove the listener when no longer needed
registration.unregister();
```

### Decoupled Error Handling

To catch errors thrown inside handlers, register an `onError` handler on the keyboard instance:

```ts
import { KEYS, keyboard } from "@codenhub/kbd";

// Configure error reporter
keyboard.setErrorHandler((error, fallbackMessage) => {
  console.error("Keyboard Error:", error, fallbackMessage);
});

keyboard.register(KEYS.k, () => {
  throw new Error("Simulated failure");
});
```

## Reference

### `@codenhub/kbd`

Primary entrypoint for the package's public API.

```ts
import {
  keyboard,
  Keyboard,
  KEYS,
  type KeyboardKey,
  type KeyboardBinding,
  type KeyboardShortcut,
  type KeyboardSubscriptionOptions,
  type KeyboardRegistration,
  type ModifierKey,
  type KeyboardEventName,
  type KeyboardHandler,
} from "@codenhub/kbd";
```

#### `keyboard`

Shared page-level `Keyboard` instance used by default for global UI shortcuts.

#### `Keyboard`

Class that manages keyboard bindings on one or more event targets.

```ts
class Keyboard {
  constructor(options?: { onError?: (error: unknown, fallback: string) => void });

  register(
    binding: KeyboardBinding,
    handler: KeyboardHandler,
    options?: KeyboardSubscriptionOptions,
  ): KeyboardRegistration;

  disable(): void;
  enable(): void;
  clear(): void;
  setErrorHandler(handler: (error: unknown, fallback: string) => void): void;
}
```

#### `KEYS`

Mapping of recognizable key values.

## Requirements

- **Browser Environment**: This package requires DOM APIs (`EventTarget`, `KeyboardEvent`, `document`) to bind listeners.
- **SSR**: In environments where `document` is unavailable (e.g. server-side rendering), registration will fail silently. If an `onError` handler is registered, a registration failure error will be forwarded to it.
- **Cleanup**: It is important to call `unregister()` on returned registrations or `clear()` on the keyboard instance to prevent memory leaks.

## License

This project is licensed under the Apache License 2.0.
