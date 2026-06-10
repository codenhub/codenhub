# @codenhub/store

Typed localStorage-backed state stores for browser apps. The package creates small object stores scoped by a storage key, persists JSON to `localStorage`, returns cloned state snapshots, snapshots the initial fallback state at store creation, falls back safely when browser storage is empty, invalid, blocked, or unavailable, and reports recoverable failures only through an optional `onError` hook.

## Installation

```sh
pnpm add @codenhub/store
```

## Usage

Create one store per persisted state object. The `storageKey` owns the `localStorage` entry, and `initialState` is cloned when the store is created so later mutations to the original object do not affect fallback reads.

```ts
import { createStore } from "@codenhub/store";

interface PreferencesState {
  colorScheme: "light" | "dark";
  sidebarOpen: boolean;
}

const preferences = createStore<PreferencesState>({
  storageKey: "app:preferences",
  initialState: {
    colorScheme: "light",
    sidebarOpen: true,
  },
});

preferences.set({ colorScheme: "dark", sidebarOpen: false });
preferences.patch({ sidebarOpen: true });

const colorScheme = preferences.getItem("colorScheme");
```

Use a runtime validator when stored data may come from older app versions, manual edits, or other code paths. Without a validator, parsed JSON is trusted as the store schema.

```ts
import { createStore } from "@codenhub/store";

interface UserSettings {
  density: "compact" | "comfortable";
}

const isUserSettings = (raw: unknown): raw is UserSettings => {
  if (typeof raw !== "object" || raw === null) return false;

  const value = (raw as Record<string, unknown>)["density"];
  return value === "compact" || value === "comfortable";
};

const settings = createStore<UserSettings>({
  storageKey: "app:user-settings",
  initialState: { density: "comfortable" },
  validate: isUserSettings,
  onError(error) {
    console.warn(error.message, error.cause);
  },
});

const current = settings.get();
```

`@codenhub/store` does not log by default. Provide `onError` when the app should report recoverable storage, parsing, or validation failures.

## Reference

### `@codenhub/store`

Primary entrypoint for the store API.

```ts
import { createStore } from "@codenhub/store";
import type { CreateStoreOptions, RemovableStoreKey, Store, StoreErrorEvent } from "@codenhub/store";
```

Supported import paths:

| Path              | Description                               |
| ----------------- | ----------------------------------------- |
| `@codenhub/store` | Main JavaScript and TypeScript store API. |

#### `createStore()`

Creates a typed store bound to one `localStorage` key.

```ts
function createStore<TSchema extends object>(options: CreateStoreOptions<TSchema>): Store<TSchema>;
```

| Parameter | Type                          | Description                                                            |
| --------- | ----------------------------- | ---------------------------------------------------------------------- |
| `options` | `CreateStoreOptions<TSchema>` | Store configuration, including storage key, fallback state, and guard. |

Returns a `Store<TSchema>` instance. `createStore()` snapshots `initialState` immediately with `structuredClone`, but does not read or write storage until store methods are called. Store creation throws if `structuredClone` is unavailable or `initialState` is not structured-cloneable.

#### `Store<TSchema>`

Object returned by `createStore()`.

```ts
interface Store<TSchema extends object> {
  get(): TSchema;
  set(nextState: TSchema): boolean;
  patch(partialState: Partial<TSchema>): TSchema;
  getItem<TKey extends keyof TSchema>(key: TKey): TSchema[TKey] | undefined;
  setItem<TKey extends keyof TSchema>(key: TKey, value: TSchema[TKey]): TSchema;
  removeItem<TKey extends RemovableStoreKey<TSchema>>(key: TKey): TSchema;
  clear(): void;
}
```

##### `get()`

Reads the current state.

```ts
function get(): TSchema;
```

Behavior:

- Returns a cloned copy of the stored state when storage contains valid JSON.
- Returns a cloned copy of the initial-state snapshot when storage is empty.
- Returns a cloned copy of the initial-state snapshot and calls `options.onError` when provided if storage reads throw, stored JSON is malformed, or `options.validate` rejects the parsed value.
- Does not remove invalid stored values.

##### `set()`

Replaces the full persisted state.

```ts
function set(nextState: TSchema): boolean;
```

Returns `true` when `nextState` is serialized and written to `localStorage`. Returns `false` when storage is unavailable. Returns `false` and calls `options.onError` when provided if writing fails, including serialization errors and storage quota errors.

##### `patch()`

Merges a partial object into the current state and attempts to persist the result.

```ts
function patch(partialState: Partial<TSchema>): TSchema;
```

Returns the merged state. If persistence fails, the returned value still reflects the attempted merge, but later reads may fall back to the last stored state or the initial-state snapshot.

##### `getItem()`

Reads a single key from the current state.

```ts
function getItem<TKey extends keyof TSchema>(key: TKey): TSchema[TKey] | undefined;
```

Returns the value for `key`, or `undefined` when the key is not present in the current state.

##### `setItem()`

Sets one key on the current state and attempts to persist the result.

```ts
function setItem<TKey extends keyof TSchema>(key: TKey, value: TSchema[TKey]): TSchema;
```

Returns the full updated state. If persistence fails, the returned value still includes the change, but later reads may not.

##### `removeItem()`

Removes one key from the current state and attempts to persist the result.

```ts
function removeItem<TKey extends RemovableStoreKey<TSchema>>(key: TKey): TSchema;
```

Returns the updated state without the removed key. Only optional schema keys can be removed; required keys must remain present to preserve the typed store shape. If persistence fails, the returned value still reflects the removal, but later reads may not.

##### `clear()`

Removes this store's `localStorage` entry.

```ts
function clear(): void;
```

After `clear()`, `get()` returns a cloned copy of the initial-state snapshot. If storage is unavailable, `clear()` does nothing. If removal throws, `clear()` calls `options.onError` when provided and does not rethrow.

#### `RemovableStoreKey<TSchema>`

Type alias for keys that can be removed from a store without violating its schema shape.

```ts
type RemovableStoreKey<TSchema extends object> = {
  [TKey in keyof TSchema]-?: object extends Pick<TSchema, TKey> ? TKey : never;
}[keyof TSchema];
```

Use this type when writing helpers that accept keys passed to `removeItem()`.

#### `CreateStoreOptions<TSchema>`

Options passed to `createStore()`.

```ts
interface CreateStoreOptions<TSchema extends object> {
  storageKey: string;
  initialState: TSchema;
  validate?: (raw: unknown) => raw is TSchema;
  onError?: (error: StoreErrorEvent) => void;
}
```

| Property       | Type                               | Default     | Description                                                                                             |
| -------------- | ---------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------- |
| `storageKey`   | `string`                           | Required    | Key used for the `localStorage` entry.                                                                  |
| `initialState` | `TSchema`                          | Required    | Fallback state snapshotted at creation and returned when no valid stored state exists.                  |
| `validate`     | `(raw: unknown) => raw is TSchema` | `undefined` | Optional guard used to validate parsed stored JSON before it is returned.                               |
| `onError`      | `(error: StoreErrorEvent) => void` | `undefined` | Optional hook for recoverable storage, parsing, and validation failures. No logging happens by default. |

The validator only runs for values read from storage. It does not validate values passed to `set()`, `patch()`, or `setItem()`.

#### `StoreErrorEvent`

Event passed to `CreateStoreOptions.onError` for recoverable failures.

```ts
interface StoreErrorEvent {
  code:
    | "storage-read-failed"
    | "storage-write-failed"
    | "storage-clear-failed"
    | "storage-parse-failed"
    | "storage-validation-failed";
  message: string;
  storageKey: string;
  cause?: unknown;
}
```

`message` is intended for diagnostics. `code` is the stable field to branch on. `cause` is present when the failure came from a thrown value.

## Examples

### Clear Stored State

```ts
import { createStore } from "@codenhub/store";

const filters = createStore({ storageKey: "app:filters", initialState: { query: "", page: 1 } });

filters.patch({ query: "design systems", page: 2 });
filters.clear();

console.log(filters.get());
// { query: "", page: 1 }
```

### Handle Write Failures

```ts
import { createStore } from "@codenhub/store";

const draft = createStore({ storageKey: "app:draft", initialState: { body: "" } });

const didSave = draft.set({ body: "Unsaved text" });

if (!didSave) {
  // Storage may be blocked, full, or unavailable.
  // Keep using app-owned in-memory state if persistence matters.
}
```

### Handle Store Errors

Use `onError` for app-owned logging or telemetry. This package does not call `console.warn` unless the app provides that behavior.

```ts
import { createStore } from "@codenhub/store";

const draft = createStore({
  storageKey: "app:draft",
  initialState: { body: "" },
  onError(error) {
    console.warn(error.message, error.cause);
  },
});

draft.get();
```

Apps that use `@codenhub/error` can normalize the original cause without coupling `@codenhub/store` to the error package.

```ts
import { AppError } from "@codenhub/error";
import { createStore } from "@codenhub/store";

const preferences = createStore({
  storageKey: "app:preferences",
  initialState: { colorScheme: "light" },
  onError(error) {
    const appError = new AppError(error.cause ?? error, {
      fallbackMessage: error.message,
    });

    console.warn(appError.message, appError);
  },
});

preferences.get();
```

### Optional Keys

```ts
import { createStore } from "@codenhub/store";

interface SessionState {
  token?: string;
}

const session = createStore<SessionState>({ storageKey: "app:session", initialState: {} });

session.setItem("token", "abc123");
session.removeItem("token");

console.log(session.getItem("token"));
// undefined
```

## Requirements

- Browser `localStorage` is used for persistence.
- Server-side and storage-restricted environments are supported by falling back to the initial-state snapshot for reads and `false` for direct writes.
- `structuredClone` is required because `initialState` is snapshotted at store creation and returned state is cloned to avoid leaking consumer mutations into future reads.
- Stored state must be JSON-serializable for persistence and structured-cloneable for reads.
- No framework, CSS, DOM rendering, or external runtime dependency is required.

## Notes

- Each store is isolated only by its `storageKey`; consumers are responsible for choosing stable, collision-free keys.
- State is object-based. Primitive schemas are not supported.
- `patch()` is a shallow merge.
- The package does not synchronize state across tabs, windows, components, or subscribers.
- The package does not encrypt, redact, or secure stored data. Do not store secrets or sensitive personal data in `localStorage`.
- The package does not log by default. Use `onError` for app-owned logging, telemetry, user feedback, or error normalization.
