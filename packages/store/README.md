# @codenhub/store

Typed localStorage-backed state stores for browser apps. The package creates small object stores scoped by a storage key, persists JSON to `localStorage`, returns cloned state snapshots, and falls back safely when browser storage is empty, invalid, blocked, or unavailable.

## Installation

```sh
pnpm add @codenhub/store
```

## Usage

Create one store per persisted state object. The `storageKey` owns the `localStorage` entry, and `initialState` is the fallback returned when nothing valid is stored.

```ts
import { createStore } from "@codenhub/store";

interface PreferencesState {
  colorScheme: "light" | "dark";
  sidebarOpen: boolean;
}

const preferences = createStore<PreferencesState>("app:preferences", {
  colorScheme: "light",
  sidebarOpen: true,
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

const settings = createStore<UserSettings>(
  "app:user-settings",
  { density: "comfortable" },
  { validate: isUserSettings },
);

const current = settings.get();
```

## Reference

### `@codenhub/store`

Primary entrypoint for the store API.

```ts
import { createStore } from "@codenhub/store";
import type { Store, StoreOptions } from "@codenhub/store";
```

Supported import paths:

| Path              | Description                               |
| ----------------- | ----------------------------------------- |
| `@codenhub/store` | Main JavaScript and TypeScript store API. |

#### `createStore()`

Creates a typed store bound to one `localStorage` key.

```ts
function createStore<TSchema extends object>(
  storageKey: string,
  initialState: TSchema,
  options?: StoreOptions<TSchema>,
): Store<TSchema>;
```

| Parameter      | Type                    | Description                                                |
| -------------- | ----------------------- | ---------------------------------------------------------- |
| `storageKey`   | `string`                | Key used for the `localStorage` entry.                     |
| `initialState` | `TSchema`               | Fallback state returned when no valid stored state exists. |
| `options`      | `StoreOptions<TSchema>` | Optional runtime validation settings.                      |

Returns a `Store<TSchema>` instance. `createStore()` does not read or write storage immediately; storage is accessed by store methods.

#### `Store<TSchema>`

Object returned by `createStore()`.

```ts
interface Store<TSchema extends object> {
  get(): TSchema;
  set(nextState: TSchema): boolean;
  patch(partialState: Partial<TSchema>): TSchema;
  getItem<TKey extends keyof TSchema>(key: TKey): TSchema[TKey] | undefined;
  setItem<TKey extends keyof TSchema>(key: TKey, value: TSchema[TKey]): TSchema;
  removeItem<TKey extends keyof TSchema>(key: TKey): TSchema;
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
- Returns a cloned copy of `initialState` when storage is empty.
- Returns a cloned copy of `initialState` and logs a warning when storage reads throw, stored JSON is malformed, or `options.validate` rejects the parsed value.
- Does not remove invalid stored values.

##### `set()`

Replaces the full persisted state.

```ts
function set(nextState: TSchema): boolean;
```

Returns `true` when `nextState` is serialized and written to `localStorage`. Returns `false` when storage is unavailable. Returns `false` and logs a warning when writing fails, including serialization errors and storage quota errors.

##### `patch()`

Merges a partial object into the current state and attempts to persist the result.

```ts
function patch(partialState: Partial<TSchema>): TSchema;
```

Returns the merged state. If persistence fails, the returned value still reflects the attempted merge, but later reads may fall back to the last stored state or `initialState`.

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
function removeItem<TKey extends keyof TSchema>(key: TKey): TSchema;
```

Returns the updated state without the removed key. If persistence fails, the returned value still reflects the removal, but later reads may not.

##### `clear()`

Removes this store's `localStorage` entry.

```ts
function clear(): void;
```

After `clear()`, `get()` returns a cloned copy of `initialState`. If storage is unavailable, `clear()` does nothing. If removal throws, `clear()` logs a warning and does not rethrow.

#### `StoreOptions<TSchema>`

Options passed to `createStore()`.

```ts
interface StoreOptions<TSchema extends object> {
  validate?: (raw: unknown) => raw is TSchema;
}
```

| Property   | Type                               | Default     | Description                                                               |
| ---------- | ---------------------------------- | ----------- | ------------------------------------------------------------------------- |
| `validate` | `(raw: unknown) => raw is TSchema` | `undefined` | Optional guard used to validate parsed stored JSON before it is returned. |

The validator only runs for values read from storage. It does not validate values passed to `set()`, `patch()`, or `setItem()`.

## Examples

### Clear Stored State

```ts
import { createStore } from "@codenhub/store";

const filters = createStore("app:filters", { query: "", page: 1 });

filters.patch({ query: "design systems", page: 2 });
filters.clear();

console.log(filters.get());
// { query: "", page: 1 }
```

### Handle Write Failures

```ts
import { createStore } from "@codenhub/store";

const draft = createStore("app:draft", { body: "" });

const didSave = draft.set({ body: "Unsaved text" });

if (!didSave) {
  // Storage may be blocked, full, or unavailable.
  // Keep using app-owned in-memory state if persistence matters.
}
```

### Optional Keys

```ts
import { createStore } from "@codenhub/store";

interface SessionState {
  token?: string;
}

const session = createStore<SessionState>("app:session", {});

session.setItem("token", "abc123");
session.removeItem("token");

console.log(session.getItem("token"));
// undefined
```

## Requirements

- Browser `localStorage` is used for persistence.
- Server-side and storage-restricted environments are supported by falling back to `initialState` for reads and `false` for direct writes.
- `structuredClone` is required because returned state is cloned to avoid leaking consumer mutations into future reads.
- Stored state must be JSON-serializable for persistence and structured-cloneable for reads.
- No framework, CSS, DOM rendering, or external runtime dependency is required.

## Notes

- Each store is isolated only by its `storageKey`; consumers are responsible for choosing stable, collision-free keys.
- State is object-based. Primitive schemas are not supported.
- `patch()` is a shallow merge.
- The package does not synchronize state across tabs, windows, components, or subscribers.
- The package does not encrypt, redact, or secure stored data. Do not store secrets or sensitive personal data in `localStorage`.
- Warnings are logged with `console.warn` for recoverable storage and parsing failures.
