---
title: Storage Drivers
---

# Storage Drivers

This guide helps you choose a backend for your preferences record and write a custom driver when needed. Each backend has its own portability and consistency limits; knowing them prevents a successful write from becoming a surprise on the next read.

Drivers are stateful and should not be shared between stores using different keys. `StorageDriver<TSchema>` supplies sync `get`, `set`, and optional `clear`; `AsyncStorageDriver<TSchema>` supplies their promise-based equivalents.

## Value portability

Every store requires values that `structuredClone` can copy. For portable drivers (localStorage, Node JSON files, and Cloudflare KV), values must also survive a JSON round-trip. A `Date` comes back as a string, `Map` and `Set` become `{}`, and `BigInt` throws during JSON serialization. Use strings, numbers, booleans, null, arrays, and plain objects whose contents follow the same rule. Convert dates to ISO strings yourself if your schema expects strings.

Memory drivers use `structuredClone` and preserve more types, including `Date`, `Map`, `Set`, and `BigInt`. Durable Object storage persists native values supported by that binding. A record that works in memory may therefore fail or change shape after switching drivers: portability needs JSON-safe values. The store documents this contract without enforcing it or supplying codecs.

## Core Drivers

`localStorageDriver<TSchema>(storageKey?)` reads and writes JSON in browser `localStorage`. `createStore` creates and binds this driver when no driver is supplied. If `localStorage` is absent or inaccessible, reads return `null`, writes return `false`, and clears return normally without an error event. Availability probing is cached for the current localStorage object. Per-key access and JSON parsing failures throw the original cause; the store reports them through its own `onError` callback. When used by a store, driver failures become the [store recovery behavior](core-stores.md#validation-and-failures). A store reports a false write as `store.write_failed`, even when the driver has no availability error event.

`memoryDriver<TSchema>()` and `asyncMemoryDriver<TSchema>()` keep one cloned value in process memory and return `null` before a value is set or after clear. They are useful for tests and non-persistent workflows. Cloning can still throw for unsupported values.

## Node.js JSON Files

Node.js 24 or newer is required.

Import `nodeJsonFileDriver` and `nodeAsyncJsonFileDriver` from `@codenhub/store/node`. Both accept `NodeJsonFileDriverOptions` with `filePath`.

```ts
import { createAsyncStore } from "@codenhub/store";
import { nodeAsyncJsonFileDriver } from "@codenhub/store/node";

const config = createAsyncStore({
  storageKey: "config",
  initialState: { port: 3000 },
  driver: nodeAsyncJsonFileDriver<{ port: number }>({ filePath: "./data/config.json" }),
});
```

Missing files and empty files read as no value. Writes create parent directories and serialize indented JSON to a unique temporary file in the same directory, then rename it over the destination. A failed write or rename leaves the previous file intact and cleans up the temporary file. These drivers are single-process: they provide no cross-process locking or coordination. A file holds one record and the drivers do not use the storage key inside it, so binding a second storage key to the same resolved path throws during store creation. The binding lasts for the life of the process, including in test suites; use one file per storage key. Atomic replacement prevents a partial file from replacing a good one; it does not make a read-modify-write sequence transactional or promise crash durability. Clear removes the file and ignores a missing file. Invalid JSON and other filesystem errors throw or reject from the driver and become recoverable when called through a store.

## Cloudflare Workers

Import from `@codenhub/store/cf`:

- `cloudflareKvDriver<TSchema>(options)` uses a `CloudflareKvNamespace` with promise-based `get`, `put`, and `delete`. It serializes JSON; malformed stored JSON rejects during reads.
- `cloudflareDoDriver<TSchema>(options)` uses `CloudflareDurableObjectStorage` with promise-based `get`, `put`, and `delete`. It stores values natively without JSON serialization.

`CloudflareKvDriverOptions` requires `kvNamespace` and optionally accepts `storageKey`. `CloudflareDoDriverOptions` requires `storage` and optionally accepts `storageKey`. The store binds its `storageKey`; supplying a different key in driver options causes store creation to throw.

```ts
import { createAsyncStore } from "@codenhub/store";
import { cloudflareKvDriver, type CloudflareKvNamespace } from "@codenhub/store/cf";

declare const SETTINGS: CloudflareKvNamespace;

const settings = createAsyncStore({
  storageKey: "tenant:settings",
  initialState: { enabled: false },
  driver: cloudflareKvDriver<{ enabled: boolean }>({ kvNamespace: SETTINGS }),
});
```

Cloudflare KV is eventually consistent. A read can return a stale value even at the location that just wrote it, so rapid or concurrent `patch` and `setItem` calls can lose changes. For example, writing `{ theme: "dark", enabled: false }` and then setting `enabled` using an old `{ theme: "light", enabled: false }` read can persist `{ theme: "light", enabled: true }`. The theme change is lost even when the calls were awaited in order on one store. KV is also limited to about one write per key per second; avoid rapid updates to the same preferences record.

Prefer `cloudflareDoDriver` for read-modify-write in a Durable Object. Its `delete` binding may resolve to a boolean (the driver ignores the result). Coordinate other instances and external writers in your Durable Object: the store itself does not expose transactions or cross-process coordination.

`createAsyncStore` runs the driver's binding hook synchronously during creation, outside operation recovery. Key conflicts and other binding failures throw from `createAsyncStore`; they do not produce store error events or fallback behavior.

## Custom drivers

A driver reads one whole record or returns `null`/`undefined` for a missing record. `set` returns `true` when it saves and `false` when it cannot write; other access failures should throw or reject so the store can report them. Use `SyntaxError` for malformed JSON. Leave error reporting to the store to keep callback failures separate from driver failures.

The optional `SET_STORAGE_KEY` hook receives the store key during creation, even when no operation has run yet. Reject attempts to bind one driver to a different key. This synchronous hook is shared by sync and async drivers.

```ts
import { createStore, SET_STORAGE_KEY, type StorageDriver } from "@codenhub/store";

interface Settings {
  theme: "light" | "dark";
}

const records = new Map<string, string>();
let boundKey: string | undefined;

function getKey(): string {
  if (boundKey === undefined) throw new Error("Driver is not bound");
  return boundKey;
}

const driver: StorageDriver<Settings> = {
  get() {
    const raw = records.get(getKey());
    return raw === undefined ? null : JSON.parse(raw);
  },
  set(value) {
    records.set(getKey(), JSON.stringify(value));
    return true;
  },
  clear() {
    records.delete(getKey());
  },
  [SET_STORAGE_KEY](key) {
    if (boundKey !== undefined && boundKey !== key) throw new Error("Driver is already bound");
    boundKey = key;
  },
};

const settings = createStore<Settings>({
  storageKey: "settings",
  initialState: { theme: "light" },
  driver,
});

settings.setItem("theme", "dark");
```

`clear` is optional: omit it for a backend without deletion. Calling the store's `clear()` then reports `store.clear_unsupported` and leaves the record intact. A driver with a fixed key may omit `SET_STORAGE_KEY`, but then it is responsible for selecting the same key the store identifies in error events. An async custom driver follows the same contract with promise-returning `get`, `set`, and `clear` methods.

Return to [Core stores](core-stores.md#validation-and-failures) for validation and the failure-handling example when connecting your backend.
