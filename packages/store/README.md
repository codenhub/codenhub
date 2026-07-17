# @codenhub/store

Typed object stores with synchronous and asynchronous drivers for browsers,
Node.js, and Cloudflare Workers.

> **Experimental:** Store APIs, driver contracts, and persistence behavior may
> change before a stable release.

## Installation

```sh
pnpm add @codenhub/store
```

## Usage

`createStore()` uses browser `localStorage` by default and falls back to the
initial state when storage is empty or unavailable.

```ts
import { createStore } from "@codenhub/store";

const preferences = createStore({
  storageKey: "app:preferences",
  initialState: { theme: "light" as "light" | "dark" },
  onError: (error) => console.warn(error.code, error.cause),
});

preferences.patch({ theme: "dark" });
```

Recoverable driver, parsing, and validation failures use the initial state or
return `false` and are reported through `onError` when provided.

## Documentation

- [Documentation overview](docs/index.md)
- [Core stores](docs/core-stores.md)
- [Storage drivers](docs/storage-drivers.md)

## Requirements

- `structuredClone` is required.
- The default driver requires browser `localStorage`; other runtimes must choose
  an appropriate driver.
- Stored values must be structured-cloneable and driver-compatible.

## Notes

- Store instances do not synchronize browser tabs.
- Do not share one driver instance between stores with different keys.
- Avoid unencrypted credentials or sensitive personal data in storage.

## License

Licensed under Apache-2.0.
