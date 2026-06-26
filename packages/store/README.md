# @codenhub/store

Typed state stores with multi-platform compatibility for browser, Node.js, and Cloudflare Workers apps. The package creates small object stores scoped by a storage key, supports pluggable synchronous and asynchronous storage drivers, returns cloned state snapshots to prevent mutations, and reports recoverable failures through an optional `onError` hook.

## Installation

```sh
pnpm add @codenhub/store
```

## Usage

### Synchronous Store (Browser / Memory)

Create one store per persisted state object. By default, stores use the browser's `localStorage`.

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

### Asynchronous Store (Edge / Cloudflare / Filesystem)

For environments like Node.js or Cloudflare Workers where storage operations are non-blocking, use `createAsyncStore`.

```ts
import { createAsyncStore, asyncMemoryDriver } from "@codenhub/store";

interface SessionState {
  userId: string;
  token: string;
}

const session = createAsyncStore<SessionState>({
  storageKey: "user:session",
  initialState: { userId: "", token: "" },
  driver: asyncMemoryDriver(), // Or a platform driver
});

// All methods return Promises
await session.set({ userId: "123", token: "abc" });
const userId = await session.getItem("userId");
```

### Runtime Schema Validation

Use a validator when stored data may come from older versions, manual edits, or external sources.

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
```

## Reference

Supported entrypoint paths:

| Path                   | Description                                                     |
| ---------------------- | --------------------------------------------------------------- |
| `@codenhub/store`      | Core store APIs, sync/async stores, memory & localStorage.      |
| `@codenhub/store/node` | Node.js filesystem drivers (`node:fs` based JSON file storage). |
| `@codenhub/store/cf`   | Cloudflare Workers drivers (KV and Durable Object storage).     |

---

### `@codenhub/store`

Primary entrypoint containing core interfaces and in-memory/localStorage sync/async stores.

```ts
import { createStore, createAsyncStore, localStorageDriver, memoryDriver, asyncMemoryDriver } from "@codenhub/store";
```

#### `createStore()`

Creates a strictly typed synchronous store.

```ts
function createStore<TSchema extends object>(options: CreateStoreOptions<TSchema>): Store<TSchema>;
```

If `options.driver` is omitted, defaults to `localStorageDriver`. Throws if `structuredClone` is unavailable or `initialState` cannot be cloned.

#### `CreateStoreOptions<TSchema>`

Options for configuring a synchronous store.

```ts
interface CreateStoreOptions<TSchema extends object> {
  storageKey: string;
  initialState: TSchema;
  driver?: StorageDriver<TSchema>;
  validate?: (raw: unknown) => raw is TSchema;
  onError?: (error: StoreErrorEvent) => void;
}
```

- **`storageKey`**: Storage key used to identify the stored state.
- **`initialState`**: Fallback state snapshotted at store creation and returned when storage is empty, unavailable, invalid, or rejected by `validate`.
- **`driver`**: Custom storage driver. Defaults to `localStorageDriver`.
- **`validate`**: Optional runtime validator for parsed JSON.
- **`onError`**: Optional hook for recoverable storage, parsing, and validation failures.

#### `createAsyncStore()`

Creates a strictly typed asynchronous store.

```ts
function createAsyncStore<TSchema extends object>(options: CreateAsyncStoreOptions<TSchema>): AsyncStore<TSchema>;
```

#### `CreateAsyncStoreOptions<TSchema>`

Options for configuring an asynchronous store.

```ts
interface CreateAsyncStoreOptions<TSchema extends object> {
  storageKey: string;
  initialState: TSchema;
  driver: AsyncStorageDriver<TSchema>;
  validate?: (raw: unknown) => raw is TSchema;
  onError?: (error: StoreErrorEvent) => void;
}
```

- **`storageKey`**: Storage key used to identify the stored state.
- **`initialState`**: Fallback state snapshotted at store creation.
- **`driver`**: Asynchronous storage driver. **Required** for async stores.
- **`validate`**: Optional runtime validator for parsed JSON.
- **`onError`**: Optional hook for recoverable storage, parsing, and validation failures.

#### `Store<TSchema>`

Synchronous store returned by `createStore()`.

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

#### `AsyncStore<TSchema>`

Asynchronous store returned by `createAsyncStore()`.

```ts
interface AsyncStore<TSchema extends object> {
  get(): Promise<TSchema>;
  set(nextState: TSchema): Promise<boolean>;
  patch(partialState: Partial<TSchema>): Promise<TSchema>;
  getItem<TKey extends keyof TSchema>(key: TKey): Promise<TSchema[TKey] | undefined>;
  setItem<TKey extends keyof TSchema>(key: TKey, value: TSchema[TKey]): Promise<TSchema>;
  removeItem<TKey extends RemovableStoreKey<TSchema>>(key: TKey): Promise<TSchema>;
  clear(): Promise<void>;
}
```

#### `StoreErrorEvent`

Describes a recoverable failure reported through the `onError` hook.

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

#### `RemovableStoreKey<TSchema>`

Utility type representing the optional keys that can be removed from a store. Required keys are excluded at type level.

#### `StorageDriver<TSchema>`

Interface for custom synchronous storage drivers.

```ts
interface StorageDriver<TSchema extends object> {
  get(): unknown;
  set(value: TSchema): boolean;
  clear?(): void;
}
```

#### `AsyncStorageDriver<TSchema>`

Interface for custom asynchronous storage drivers.

```ts
interface AsyncStorageDriver<TSchema extends object> {
  get(): Promise<unknown>;
  set(value: TSchema): Promise<boolean>;
  clear?(): Promise<void>;
}
```

#### Drivers (Core)

- **`localStorageDriver(storageKey?, onError?)`**: Sync driver persisting to the browser's `localStorage`. If `storageKey` is omitted, it will be injected automatically.
- **`memoryDriver()`**: Sync in-memory driver (local variable).
- **`asyncMemoryDriver()`**: Async in-memory driver.

---

### `@codenhub/store/node`

Node.js specific entrypoint containing local filesystem persistence drivers.

```ts
import { nodeJsonFileDriver, nodeAsyncJsonFileDriver } from "@codenhub/store/node";
```

#### `nodeJsonFileDriver()`

Synchronous driver that persists state to a local JSON file.

```ts
function nodeJsonFileDriver<TSchema extends object>(options: { filePath: string }): StorageDriver<TSchema>;
```

#### `nodeAsyncJsonFileDriver()`

Asynchronous driver that persists state to a local JSON file using promise-based `node:fs`.

```ts
function nodeAsyncJsonFileDriver<TSchema extends object>(options: { filePath: string }): AsyncStorageDriver<TSchema>;
```

---

### `@codenhub/store/cf`

Cloudflare Workers specific entrypoint containing Cloudflare bindings drivers.

```ts
import { cloudflareKvDriver, cloudflareDoDriver } from "@codenhub/store/cf";
```

#### `cloudflareKvDriver()`

Asynchronous driver that persists state to a Cloudflare Workers KV Namespace.

```ts
function cloudflareKvDriver<TSchema extends object>(options: {
  kvNamespace: CloudflareKvNamespace;
  storageKey?: string;
}): AsyncStorageDriver<TSchema>;
```

#### `cloudflareDoDriver()`

Asynchronous driver that persists state natively to Cloudflare Durable Object transactional storage.

```ts
function cloudflareDoDriver<TSchema extends object>(options: {
  storage: CloudflareDurableObjectStorage;
  storageKey?: string;
}): AsyncStorageDriver<TSchema>;
```

---

## Examples

### Node.js Filesystem Persisted Store

Configure an asynchronous JSON file store for CLI tools or server apps.

```ts
import { createAsyncStore } from "@codenhub/store";
import { nodeAsyncJsonFileDriver } from "@codenhub/store/node";
import * as path from "node:path";

const configPath = path.join(process.cwd(), "config.json");

const store = createAsyncStore({
  storageKey: "app-config",
  initialState: { port: 3000, debug: false },
  driver: nodeAsyncJsonFileDriver({ filePath: configPath }),
});

await store.patch({ debug: true });
```

### Cloudflare Workers KV Persisted Store

Persist state on Cloudflare's Edge using KV bindings.

```ts
import { createAsyncStore } from "@codenhub/store";
import { cloudflareKvDriver } from "@codenhub/store/cf";
import type { CloudflareKvNamespace } from "@codenhub/store/cf";

interface Env {
  SETTINGS_KV: CloudflareKvNamespace;
}

export default {
  async fetch(request: Request, env: Env) {
    const settings = createAsyncStore({
      storageKey: "user-123",
      initialState: { darkMode: false },
      driver: cloudflareKvDriver({
        kvNamespace: env.SETTINGS_KV,
      }),
    });

    const current = await settings.get();
    return new Response(JSON.stringify(current));
  },
};
```

## Requirements

- `structuredClone` is required to snapshot `initialState` and return cloned state objects.
- Browser `localStorage` is used by default in browser environments.
  - **SSR Compatibility**: When running in Server-Side Rendering (SSR) environments where `localStorage` is unavailable, the store safely falls back to a temporary in-memory state (`initialState`) without throwing errors.
- Node.js runtime (v18+) is required for `@codenhub/store/node` (uses `node:fs` and `node:path`).
- Cloudflare Workers environment is required for `@codenhub/store/cf` (uses KV namespace and Durable Object storage).

## Notes

- **Isolation**: Stores are isolated by key; consumers must ensure collision-free keys.
- **Serialization**: Values must be JSON-serializable and structured-cloneable.
- **Synchronization & Concurrency**:
  - The synchronous `Store` does not synchronize across browser tabs out of the box. Simultaneous cross-tab writes to the same localStorage key can lead to race conditions.
  - The asynchronous `AsyncStore` automatically serializes all read/write operations (like `patch()`, `setItem()`, and `removeItem()`) via an internal queue to prevent concurrency race conditions on the same store instance.
- **Security**: Do not store plain credentials or sensitive PII without encryption.
- **Diagnostics**: Logging is off by default. Provide `onError` in configuration for diagnostics or custom telemetry.
- **Driver Reusability & Key Binding**: Storage drivers bind to a specific store's `storageKey`. Do not share driver instances across multiple stores. Reassigning a driver instance to a different store with a different key will throw a runtime error.

## License

This project is licensed under the [Apache-2.0](LICENSE) license.
