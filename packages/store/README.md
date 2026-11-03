# @codenhub/store

Small typed records persisted to key-value backends: one typed object per storage key, with whole-object reads and writes in browsers, Node.js, and Cloudflare Workers.

> **Experimental:** Store APIs, driver contracts, and persistence behavior may change before a stable release.

## Installation

```sh
pnpm add @codenhub/store
```

## Usage

`createStore()` uses browser `localStorage` by default and falls back to the initial state when storage is empty or unavailable.

```ts
import { createStore } from "@codenhub/store";

const preferences = createStore({
  storageKey: "app:preferences",
  initialState: { theme: "light" as "light" | "dark" },
  onError: (error) => console.warn(error.code, error.cause),
});

preferences.patch({ theme: "dark" });
```

Recoverable failures use initial-state fallbacks or return `false` and report through the store's `onError`, including with `localStorageDriver(storageKey?)`. The `storeErrors` dictionary supplies optional user-facing feedback for `@codenhub/error`. A failed driver read skips a read-modify-write operation so it cannot overwrite unrelated fields. See [failure handling](docs/core-stores.md#validation-and-failures) for every error code.

## Documentation

- [Documentation overview](docs/index.md)
- [Core stores](docs/core-stores.md)
- [Storage drivers](docs/storage-drivers.md)

## Requirements

- Node.js 24 or newer when running on Node.js.
- `structuredClone` is required.
- The default driver requires browser `localStorage`; other runtimes must choose an appropriate driver.
- Stored values must be structured-cloneable. Portable values must also survive a JSON round-trip; see [value portability](docs/storage-drivers.md#value-portability).

## When not to use it

Use a database when records need queries, transactions, or coordination between processes or writers. This package reads and writes whole small records with last-write-wins semantics; it does not provide those guarantees.

## Notes

- Store instances do not synchronize browser tabs.
- Do not share one driver instance between stores with different keys.
- Avoid unencrypted credentials or sensitive personal data in storage.

## License

Licensed under Apache-2.0.
