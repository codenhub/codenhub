---
title: Overview
---

# Persist Typed Application State

`@codenhub/store` provides typed object stores over pluggable synchronous and
asynchronous persistence drivers. Use it when application state needs one store
API across browser storage, in-memory workflows, Node.js JSON files, or
Cloudflare storage.

## Setup

### Installation

```sh
pnpm add @codenhub/store
```

### Quick start

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

## Requirements

- `structuredClone` is required.
- The default driver requires browser `localStorage`; other runtimes must choose
  an appropriate driver.
- Node.js drivers require `node:fs`, and Cloudflare drivers require compatible
  bindings.
- Stored values must be structured-cloneable and compatible with the selected
  driver.

The default browser driver does not make SSR storage persistent when
`localStorage` is unavailable. Store instances do not synchronize browser tabs,
and drivers should not be shared between stores that use different keys. Do not
place unencrypted credentials or sensitive personal data in storage.

## Next steps

- [Core stores](core-stores.md) covers sync and async creation, methods,
  runtime validation, concurrency, defaults, and failure behavior.
- [Storage drivers](storage-drivers.md) helps choose and configure memory,
  browser, Node.js, Cloudflare KV, or Durable Object persistence.
