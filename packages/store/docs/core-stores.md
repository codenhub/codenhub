---
title: Core Stores
---

# Core Stores

This guide builds a small preferences store, then covers validation, queued updates, and recovery. Start here to understand what each call returns and when a failed operation leaves the persisted record alone.

## Synchronous stores

`createStore<TSchema>(options)` creates a `Store<TSchema>`. `TSchema` must be an object type. The initial state is cloned immediately; an unavailable `structuredClone` or an uncloneable initial value throws during creation.

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

settings.patch({ theme: "dark", nickname: "Ada" });
settings.removeItem("nickname");
```

`CreateStoreOptions` requires `storageKey` and `initialState`. The `driver` defaults to `localStorageDriver`; the example uses memory so it can run without browser storage. The fallback is a snapshot taken at creation, so changing your original `initialState` later does not change it. Reads and state returned from updates are deep clones.

| Method                | What the caller receives                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| `get()`               | A clone of the stored record, or initial state for an empty, unreadable, or invalid value.                     |
| `set(state)`          | `true` after a successful whole-record replacement, otherwise `false`. It does not read first.                 |
| `patch(partial)`      | A clone of the shallow merge of the current record and the supplied fields, skipping `undefined` values.       |
| `getItem(key)`        | One property from a full-record read, or `undefined` if absent.                                                |
| `setItem(key, value)` | A clone of the record with one property replaced.                                                              |
| `removeItem(key)`     | A clone of the record without an optional property; `RemovableStoreKey<TSchema>` excludes required properties. |
| `clear()`             | No value; asks the driver to remove the persisted record.                                                      |

`patch` skips fields whose value is `undefined`, so `patch({ token: maybeToken })` cannot drop a required field when `maybeToken` is missing; use `removeItem` to delete an optional field. `patch`, `setItem`, and `removeItem` read before writing. A driver read failure reports `store.read_failed`, skips the write, and returns a clone of initial state without applying the requested change. This prevents a transient read failure from wiping unrelated fields. Parse and validation failures still permit replacing a corrupt value with fallback plus the requested change. A failed write returns the computed record from these methods, but it has not been persisted. A later read uses whatever remains in the backend.

Every field read parses (on a JSON driver) and clones the whole record. This is suitable for small records; read once when you need several fields, and batch several changes in one `patch`. There is no per-field storage or cache. A small settings drawer is welcome; an entire warehouse is going to be cramped.

Successful `clear` makes later reads use initial state. A failed or unsupported clear leaves data in place. Sync stores do not lock operations, synchronize browser tabs, or coordinate other instances; the last whole-record write wins.

## Asynchronous stores

`createAsyncStore<TSchema>(options)` creates an `AsyncStore<TSchema>`. `CreateAsyncStoreOptions` requires an `AsyncStorageDriver`; there is no default async driver. The other options and recovery rules match sync stores.

```ts
import { asyncMemoryDriver, createAsyncStore } from "@codenhub/store";

const settings = createAsyncStore({
  storageKey: "settings",
  initialState: { theme: "light", nickname: "" },
  driver: asyncMemoryDriver<{ theme: string; nickname: string }>(),
});

await settings.patch({ theme: "dark", nickname: "Ada" });
const current = await settings.get();
```

Every method returns a promise. Each instance serializes reads and writes, including read-modify-write operations, through its own queue. A rejected operation does not block later operations. `set`, `patch`, and `setItem` clone their inputs at call time, before queueing, so later caller mutations do not change queued writes. Cloning at call time can throw synchronously.

The queue coordinates one instance only. Separate stores and external writers can still overwrite each other. It cannot make an eventually consistent backend return a fresh read; see the [Cloudflare KV limits](storage-drivers.md#cloudflare-workers).

## Validation and failures

TypeScript does not validate persisted values. A stored value that is not an object, such as a string another script wrote under the same key, always reports `store.validation_failed`. Without `validate`, any other non-null driver value is trusted as `TSchema` after cloning. Supply a predicate when old versions, user edits, or another writer may have stored a different shape:

```ts
import { createStore, type StoreErrorEvent } from "@codenhub/store";

interface Settings {
  theme: "light" | "dark";
  nickname?: string;
}

function isSettings(raw: unknown): raw is Settings {
  if (typeof raw !== "object" || raw === null || !("theme" in raw)) return false;
  return (raw.theme === "light" || raw.theme === "dark") && (!("nickname" in raw) || raw.nickname === undefined || typeof raw.nickname === "string");
}

function reportFailure(event: StoreErrorEvent): void {
  console.warn(event.code, event.storageKey, event.message, event.cause);
}

const settings = createStore<Settings>({
  storageKey: "settings",
  initialState: { theme: "light" },
  validate: isSettings,
  onError: reportFailure,
});

settings.patch({ theme: "dark" });
```

A predicate returning `false` reports a validation failure. The store does not validate new inputs before writing; your typed code supplies them. `StoreErrorEvent` carries a stable `code`, a diagnostic `message`, the `storageKey`, and the original `cause` when a driver threw. Use the code to decide what to show or record, rather than matching message text.

| Code                      | What the store does                                                                                               | What your application can do                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `store.read_failed`       | Returns cloned initial state; read-modify-write calls skip writing.                                               | Keep the current UI and offer a retry when access recovers.         |
| `store.parse_failed`      | Returns cloned initial state; read-modify-write calls may overwrite the damaged JSON with fallback plus change.   | Investigate or back up malformed persisted data before changing it. |
| `store.validation_failed` | Returns cloned initial state; read-modify-write calls may overwrite the rejected value with fallback plus change. | Check whether a schema migration is needed.                         |
| `store.write_failed`      | `set` returns `false`; read-modify-write calls return the computed clone even though persistence failed.          | Tell the user the change was not saved.                             |
| `store.clear_failed`      | Returns or resolves normally; existing data may still be present.                                                 | Offer a retry instead of claiming the data was removed.             |
| `store.clear_unsupported` | Returns or resolves normally without removing data.                                                               | Use a driver that implements `clear` if deletion is required.       |

Drivers signal malformed JSON with `SyntaxError`, which the store classifies as `store.parse_failed`. Missing records fall back silently. Unavailable localStorage reads also fall back silently; its writes return `false`, which a store reports as `store.write_failed`. An unavailable localStorage clear returns normally without an event and may leave data in place. With no `onError`, recoverable failures remain silent.

Each recoverable failure is reported once. The store's `onError` callback is the only reporting path, including with an explicitly supplied localStorage driver. Errors are never marked or modified. Exceptions thrown by `onError` propagate directly, once, without being caught and reported as storage failures. Exceptions from `validate`, store cloning, or driver key binding also propagate; async queued operations reject. A driver may itself fail while cloning, which is handled as a driver read or write failure.

### Register user-facing feedback

`StoreErrorCode` is the union of the six codes above. `storeErrors` maps every code to user-facing feedback for `@codenhub/error`; its messages omit storage keys and raw causes. The event's `message` remains diagnostic. Register the dictionary once, then normalize events in your store's callback:

```ts
import { createAppError, getErrorRegistry } from "@codenhub/error";
import { createStore, storeErrors } from "@codenhub/store";

getErrorRegistry().codes.addList(Object.entries(storeErrors));

const preferences = createStore({
  storageKey: "preferences",
  initialState: { theme: "light" },
  onError(event) {
    const error = createAppError(event);
    console.warn(error.message); // Safe user-facing feedback; event.cause is diagnostic.
  },
});
```

Install `@codenhub/error` in your application to use its registry. The store imports its feedback type only and has no runtime dependency on it. Registration is opt-in; you can replace messages in your own registry for your application's recovery flow.

Next, choose a backend and learn its portability and consistency limits in [Storage drivers](storage-drivers.md).
