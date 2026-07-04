# @codenhub/kbd

Page-wide and target-scoped keyboard shortcut event binding registry with robust support for Shadow DOM, case-insensitive key registration, and decoupled error handling.

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
  type KeyboardOptions,
} from "@codenhub/kbd";
```

#### `keyboard`

Shared page-level `Keyboard` instance used by default for global UI shortcuts.

#### `Keyboard`

Class that manages keyboard bindings on one or more event targets.

```ts
class Keyboard {
  constructor(options?: KeyboardOptions);

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

##### `constructor()`

```ts
constructor(options?: KeyboardOptions);
```

| Parameter | Type              | Description                              |
| --------- | ----------------- | ---------------------------------------- |
| `options` | `KeyboardOptions` | Configuration for the Keyboard instance. |

##### `register()`

Registers a keyboard binding. If the event target cannot be resolved (e.g. during SSR), fails silently and returns an inactive registration handle (i.e. `active: false`).

##### `disable()` / `enable()`

Pauses or resumes all bindings on the instance.

##### `clear()`

Removes all bindings and DOM listeners on this instance. **Note:** The instance-level enabled/disabled state is preserved and not reset.

##### `setErrorHandler()`

Registers a global error callback to capture exceptions from key handlers or registration failures.

#### `KeyboardOptions`

```ts
interface KeyboardOptions {
  onError?: (error: unknown, fallback: string) => void;
  isMac?: boolean | (() => boolean);
}
```

| Property  | Type                                         | Default          | Description                                                                                                                                                                    |
| --------- | -------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `onError` | `(error: unknown, fallback: string) => void` | `undefined`      | Callback invoked when handler exceptions or registration issues occur.                                                                                                         |
| `isMac`   | `boolean \| (() => boolean)`                 | Detects platform | Custom flag or checker to override the OS platform mapping for shortcut modifiers. Useful for testing macOS shortcut bindings (`cmdOrCtrl` mapping) in non-macOS test runners. |

#### `KEYS`

Mapping of recognizable key values, including arrows, lock keys, control keys, letters, and punctuation/shifted symbols.

_Note: Single-character letters, numbers, and symbols are normalized to lowercase when registering._

#### `ModifierKey`

Modifiers supported in shortcut bindings. Values: `"ctrl" | "alt" | "shift" | "meta" | "cmdOrCtrl"`.

The `"cmdOrCtrl"` modifier resolves to `"meta"` on macOS/iOS, and `"ctrl"` elsewhere.

#### `KeyboardShortcut`

```ts
interface KeyboardShortcut {
  key: KeyboardKey;
  modifiers: ModifierKey[];
}
```

#### `KeyboardSubscriptionOptions`

| Property          | Type                   | Description                                                                                                                                                                                                                                                                     |
| ----------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `target`          | `EventTarget`          | Event target to listen on. (Default: `document`)                                                                                                                                                                                                                                |
| `event`           | `"keydown" \| "keyup"` | Event type to bind. (Default: `"keydown"`)                                                                                                                                                                                                                                      |
| `stopPropagation` | `boolean`              | If `true`, stops event propagation immediately after handler runs. (Default: `false`)                                                                                                                                                                                           |
| `ignoreInput`     | `boolean`              | If `true`, ignores events originating from form inputs/textareas unless a modifier key (ctrl/alt/meta) is held. (Default: `true`). _Note: Plain shortcuts like `Escape` will be ignored by default when focused inside an input. Register with `ignoreInput: false` to bypass._ |

#### `KeyboardRegistration`

```ts
interface KeyboardRegistration {
  readonly active: boolean;
  unregister(): void;
  enable(): void;
  disable(): void;
}
```

- `active`: Indicates whether this registration is active. Will be `false` in server-side rendering or environments where the target cannot be resolved.
- `unregister()`: Removes the binding permanently and cleans up the DOM listener if it was the last binding.
- `enable()`: Re-enables the binding handler.
- `disable()`: Temporarily silences the binding handler.

#### `KeyboardKey`

Union type representing any valid key value in the standard mapping (e.g., `"Escape"`, `"Enter"`, `"a"`, `"F1"`, etc.).

#### `KeyboardBinding`

Represents a target keyboard combination:

- **String form** (`KeyboardKey`): matches the key pressed with no active modifiers.
- **Object form** (`KeyboardShortcut`): matches the key pressed with exactly the specified modifiers active.

#### `KeyboardEventName`

The event name to listen on. Values: `"keydown" | "keyup"`. (Default: `"keydown"`).

#### `KeyboardHandler`

```ts
type KeyboardHandler = (event: KeyboardEvent) => void;
```

Callback function invoked when a shortcut combination matches the incoming event.

## Examples

### Target-Scoped Bindings

Register a shortcut scoped to a specific element/container rather than the global page:

```ts
import { KEYS, keyboard } from "@codenhub/kbd";

const myContainer = document.getElementById("my-container");

keyboard.register(
  KEYS.enter,
  () => {
    console.log("Enter key pressed inside container");
  },
  { target: myContainer },
);
```

### Unrecognized or Custom Keys

If a key is not part of the standard `KEYS` mapping, it can still be registered with a soft warning. This allows developers to bind arbitrary browser keys while remaining compatible:

```ts
import { keyboard } from "@codenhub/kbd";

// @ts-expect-error - Custom key not in KEYS mapping
keyboard.register("CustomTriggerKey", (event) => {
  console.log("Custom trigger clicked");
});
```

### Testing macOS Bindings

Use the `isMac` option to test how macOS-specific keys resolve on non-macOS platforms:

```ts
import { Keyboard } from "@codenhub/kbd";

// Force macOS key mappings in tests or special containers
const macKeyboard = new Keyboard({ isMac: true });

macKeyboard.register({ key: "k", modifiers: ["cmdOrCtrl"] }, (event) => {
  console.log("Command+K pressed");
});
```

## Requirements

- **Browser Environment**: This package requires DOM APIs (`EventTarget`, `KeyboardEvent`, `document`) to bind listeners.
- **SSR**: In environments where `document` is unavailable (e.g. server-side rendering), registration will fail silently. If an `onError` handler is registered, a registration failure error will be forwarded to it.
- **Cleanup**: It is important to call `unregister()` on returned registrations or `clear()` on the keyboard instance to prevent memory leaks.

## Notes

- **Shadow DOM Support**: The registry resolves the event source target using `event.composedPath()[0]` when available. This allows inputs nested inside web components and shadow DOM roots to be ignored correctly under `ignoreInput: true`.
- **Case Normalization**: Case-insensitive matching is guaranteed by normalizing all single-character keys to lowercase during both registration and event dispatching. Unrecognized custom keys are also normalized to lowercase, allowing them to match case-insensitively.
- **Escape Key inside Inputs**: Because `ignoreInput` is `true` by default, plain keys like `Escape` are ignored inside input fields. Register with `ignoreInput: false` if you want a global escape shortcut to close modal overlays while form elements have focus.

## License

This project is licensed under the [Apache-2.0](LICENSE) license.
