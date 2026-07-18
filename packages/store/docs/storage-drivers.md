---
title: Storage Drivers
---

# Storage Drivers

Drivers are stateful and should not be shared between stores using different
keys. JSON-based drivers require serializable values; every store also requires
values that `structuredClone` can copy.

## Core Drivers

`localStorageDriver<TSchema>(storageKey?, onError?)` reads and writes JSON in
browser `localStorage`. `createStore` creates and binds this driver when no
driver is supplied. If `localStorage` is absent or inaccessible, reads return
`null`, writes return `false`, and clears return normally without an error event.
Per-key access and JSON parsing failures throw from the driver and report to the
driver callback; when used by a store, they become the store fallback behavior.

`memoryDriver<TSchema>()` and `asyncMemoryDriver<TSchema>()` keep one cloned
value in process memory and return `null` before a value is set or after clear.
They are useful for tests and non-persistent workflows. Cloning can still throw
for unsupported values.

## Node.js JSON Files

Import `nodeJsonFileDriver` and `nodeAsyncJsonFileDriver` from
`@codenhub/store/node`. Both accept `NodeJsonFileDriverOptions` with `filePath`.

```ts
import { createAsyncStore } from "@codenhub/store";
import { nodeAsyncJsonFileDriver } from "@codenhub/store/node";

const config = createAsyncStore({
  storageKey: "config",
  initialState: { port: 3000 },
  driver: nodeAsyncJsonFileDriver({ filePath: "./data/config.json" }),
});
```

Missing files and empty files read as no value. Writes create parent
directories and serialize indented JSON. Clear removes the file and ignores a
missing file. Invalid JSON and other filesystem errors throw or reject from the
driver and become recoverable when called through a store.

## Cloudflare Workers

Import from `@codenhub/store/cf`:

- `cloudflareKvDriver<TSchema>(options)` uses a `CloudflareKvNamespace` with
  promise-based `get`, `put`, and `delete`. It serializes JSON; malformed stored
  JSON rejects during reads.
- `cloudflareDoDriver<TSchema>(options)` uses
  `CloudflareDurableObjectStorage` with promise-based `get`, `put`, and `delete`.
  It stores values natively without JSON serialization.

`CloudflareKvDriverOptions` requires `kvNamespace` and optionally accepts
`storageKey`. `CloudflareDoDriverOptions` requires `storage` and optionally
accepts `storageKey`. The store binds its `storageKey`; supplying a different key
in driver options causes store creation to throw.

```ts
import { createAsyncStore } from "@codenhub/store";
import { cloudflareKvDriver, type CloudflareKvNamespace } from "@codenhub/store/cf";

declare const SETTINGS: CloudflareKvNamespace;

const settings = createAsyncStore({
  storageKey: "tenant:settings",
  initialState: { enabled: false },
  driver: cloudflareKvDriver({ kvNamespace: SETTINGS }),
});
```

`createAsyncStore` runs the driver's binding hook synchronously during creation,
outside operation recovery. Key conflicts and other binding failures throw from
`createAsyncStore`; they do not produce store error events or fallback behavior.
