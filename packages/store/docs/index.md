---
title: Overview
---

# Persist Small Typed Records

`@codenhub/store` persists small typed records to key-value backends. It saves the repeated work of reading a settings object, merging a change, and handling an empty or damaged value. Each storage key holds one typed object, read and written as a whole, using browser storage, memory, a Node.js JSON file, or Cloudflare storage.

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

Stores snapshot `initialState`, clone returned state, and convert recoverable storage failures into fallback values plus optional `onError` events. A generic state type does not validate persisted data at runtime; provide `validate` when stored values are not already trusted.

## Requirements

- Node.js 24 or newer when running on Node.js.
- `structuredClone` is required.
- The default driver requires browser `localStorage`; other runtimes must choose an appropriate driver.
- Node.js drivers require `node:fs`, and Cloudflare drivers require compatible bindings.
- Stored values must be structured-cloneable. For portable persistence, use values that survive a JSON round-trip; [value portability](storage-drivers.md#value-portability) explains the differences between drivers.

The default browser driver does not make SSR storage persistent when `localStorage` is unavailable. Store instances do not synchronize browser tabs, and drivers should not be shared between stores that use different keys. Do not place unencrypted credentials or sensitive personal data in storage.

## When not to use it

The package uses last-write-wins whole-object access. It has no queries, transactions, or cross-process coordination, and separate stores can overwrite each other. Use a database when your data needs those guarantees. Small preferences records fit; a record that needs coordinated updates from several writers needs more than this store provides.

## Next steps

1. [Core stores](core-stores.md) covers sync and async creation, methods, runtime validation, concurrency, defaults, and failure behavior.
2. [Storage drivers](storage-drivers.md) helps choose and configure memory, browser, Node.js, Cloudflare KV, or Durable Object persistence.
