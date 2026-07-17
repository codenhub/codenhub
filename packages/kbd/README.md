# @codenhub/kbd

Page-wide and target-scoped keyboard shortcut registration for browser apps.

> [!WARNING]
> This package is experimental. Its API, matching behavior, and support level
> may change before a stable release.

## Installation

```sh
pnpm add @codenhub/kbd
```

## Usage

```ts
import { KEYS, keyboard } from "@codenhub/kbd";

const registration = keyboard.register(
  KEYS.escape,
  (event) => {
    event.preventDefault();
    closeDialog();
  },
  { ignoreInput: false },
);

// Remove the DOM listener when this owner is torn down.
registration.unregister();
```

## Documentation

- [Documentation overview](docs/index.md)
- [API, matching, and lifecycle](docs/reference.md)

## Requirements

- Registration uses DOM `EventTarget`, `KeyboardEvent`, and `document` by
  default. Pass a target to scope a binding.
- During SSR, registration without a target returns an inactive no-op handle.
- Call `unregister()` for individual bindings or `clear()` for an instance.

## Notes

Shortcut accessibility remains the consumer's responsibility: preserve native
keyboard behavior, provide discoverable alternatives, and avoid capturing text
input unless intentional.

## License

Licensed under Apache-2.0.
