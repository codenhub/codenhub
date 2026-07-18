---
title: Core Stores
---

# Core Stores

## Synchronous Stores

`createStore<TSchema>(options)` creates a `Store<TSchema>`. `TSchema` must be an
object type. The initial state is cloned immediately; unavailable
`structuredClone` or uncloneable values throw during creation.

```ts
import { createStore, memoryDriver } from "@codenhub/store";

interface Settings {
  theme: "light" | "dark";
  nickname?: string;
}

const settings = createStore<Settings>({
  storageKey: "settings",
  initialState: { theme: "light" },
  driver: memoryDriver(),
});
```

`CreateStoreOptions` requires `storageKey` and `initialState`. `driver` defaults
to `localStorageDriver`. `validate(raw)` can reject stored data at runtime, and
`onError(event)` receives recoverable failures.

`Store<TSchema>` methods are:

| Method                | Observable behavior                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `get()`               | Reads and returns a deep clone; falls back to initial state for missing, failed, or invalid data.                       |
| `set(state)`          | Replaces persisted state and returns whether the driver wrote it.                                                       |
| `patch(partial)`      | Shallow-merges with the current state, attempts a write, and returns a clone of the merged value even if writing fails. |
| `getItem(key)`        | Reads the full state and returns one property.                                                                          |
| `setItem(key, value)` | Updates one property, attempts a write, and returns the resulting clone even if writing fails.                          |
| `removeItem(key)`     | Removes a key and behaves like `setItem`; `RemovableStoreKey<TSchema>` permits only optional schema keys.               |
| `clear()`             | Asks the driver to remove persisted state; the next read falls back to initial state if removal succeeded.              |

Sync stores do not lock operations or synchronize browser tabs.

## Asynchronous Stores

`createAsyncStore<TSchema>(options)` creates an `AsyncStore<TSchema>`. Its
`CreateAsyncStoreOptions` requires an `AsyncStorageDriver`; there is no default
async driver. It otherwise supports the same `storageKey`, `initialState`,
`validate`, and `onError` semantics.

All `AsyncStore` methods return promises. Each store instance serializes reads
and writes through an internal queue, including read-modify-write methods. This
prevents races within one instance but does not coordinate separate instances
or external writers.

## Validation And Errors

`validate` receives the raw driver value. A `false` result reports
`storage-validation-failed` and returns initial state. Without `validate`, data
is trusted as `TSchema` after cloning; the generic type does not perform runtime
validation.

`StoreErrorEvent` contains a stable `code`, diagnostic `message`, `storageKey`,
and optional original `cause`. Codes are:

- `storage-read-failed`
- `storage-write-failed`
- `storage-clear-failed`
- `storage-parse-failed`
- `storage-validation-failed`

Read, parse, and validation failures return initial state. Write failures return
`false`; read-modify-write methods still return their computed state. Clear
failures resolve or return normally. Errors are silent when `onError` is absent.
Exceptions thrown by `onError`, `validate`, cloning, or driver key binding are
not caught as recoverable storage failures.

`StorageDriver<TSchema>` defines synchronous `get`, `set`, and optional `clear`;
`AsyncStorageDriver<TSchema>` defines promise-based equivalents. `SET_STORAGE_KEY`
is an exported symbol used by built-in drivers for one-time key binding. Custom
drivers may implement this symbol, but application code normally should not call
it. A driver that has been bound to a different key may throw during store
creation.
