# @codenhub/store

`@codenhub/store` provides typed object stores over pluggable synchronous and
asynchronous persistence drivers. Use it when application state needs one store
API across browser storage, in-memory workflows, Node.js JSON files, or
Cloudflare storage.

> **Experimental:** Store APIs, driver contracts, and persistence behavior may
> change before a stable release.

## Start with a browser store

`createStore()` uses browser `localStorage` by default:

```ts
import { createStore } from "@codenhub/store";

const preferences = createStore({
  storageKey: "app:preferences",
  initialState: { theme: "light" as "light" | "dark" },
  onError: (error) => console.warn(error.code, error.cause),
});

preferences.patch({ theme: "dark" });
```

Stores snapshot `initialState`, clone returned state, and convert recoverable
storage failures into fallback values plus optional `onError` events. A generic
state type does not validate persisted data at runtime; provide `validate` when
stored values are not already trusted.

## Choose where to go next

- [Core stores](core-stores.md) covers sync and async creation, methods,
  runtime validation, concurrency, defaults, and failure behavior.
- [Storage drivers](storage-drivers.md) helps choose and configure memory,
  browser, Node.js, Cloudflare KV, or Durable Object persistence.

`structuredClone` is required. Node.js drivers require `node:fs`; Cloudflare
drivers require compatible bindings. The default browser driver does not make
SSR storage persistent when `localStorage` is unavailable.

Store instances do not synchronize browser tabs. Drivers are stateful and
should not be shared between stores that use different keys. Store only values
that are structured-cloneable and compatible with the selected driver, and do
not place unencrypted credentials or sensitive personal data in storage.
