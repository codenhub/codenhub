---
status: IMPLEMENTED
last_updated: 2026-11-03
scope: Why `@codenhub/store` behaves as it does, with the alternatives each decision rejected, for whoever changes it next.
---

# Decisions

The public docs describe current behavior. This page keeps the reasons and rejected alternatives so future changes can tell whether they reopen a settled question.

## Small typed records over key-value backends

Each storage key holds one typed object, read and written as a whole. The package serves small records with last-write-wins semantics. Queries, transactions, and cross-process coordination belong in a database, potentially a future separate package. A consumer can check these guarantees when choosing where a record belongs.

Rejected: a general key-value wrapper, because it overlaps unstorage and Keyv; a key-value core plus typed layer, because it creates too much public surface for the use case; and the importance of data as the boundary, because users store important data anyway and importance says nothing checkable about the guarantees it needs.

## Read failure skips a read-modify-write write

When a driver throws or rejects during a read, `patch`, `setItem`, and `removeItem` report `store.read_failed`, skip the write, and return a clone of initial state without applying changes. A transient filesystem or backend access failure must not turn a fallback record into a replacement for data that still exists. Parse and validation failures continue to allow replacing corrupt data with fallback plus changes. `get` and `getItem` keep their fallback behavior.

Rejected: overwrite with fallback plus changes after an access failure, because that wipes unrelated fields after a transient failure. A full `set` remains an explicit replacement and does not read first.

## Reads fill missing fields from initial state

A stored plain object reads as `{ ...initialState, ...stored }`, one level deep, before `validate` runs. The most common shape a settings record fails is not corruption but a valid record saved before the application added a field. Without filling, a consumer without `validate` read the new field as `undefined` despite its type, and a consumer with `validate` lost the user's saved fields: validation failed, the store fell back, and the next `patch` replaced the record with fallback plus change. zustand's `persist` merges the same way by default.

`removeItem` returns `withDefaults(initialState, record)`, so it matches the next read: an optional field with an initial value is reset to it, and one without is absent. The persisted record omits the field so a later change to the initial value applies.

Rejected: merging only when `validate` rejects the stored value, because records without a validator would still read new fields as missing; a `migrate(raw)` option, because it adds public surface and the common case is an added field, which needs no consumer code; and a deep merge, because it would fill arrays and nested objects whose shape the record owns. Fields removed from the schema stay in the record until a `set`; renamed and retyped fields still need a validator and fallback. Cost accepted: an optional field cannot be absent while `initialState` gives it a value.

## `patch` skips `undefined` values

`patch` ignores fields whose value is `undefined`. `Partial<TSchema>` admits `undefined` for required fields unless a consumer enables `exactOptionalPropertyTypes`, so `patch({ token: maybeToken })` type-checked and then dropped `token` on JSON drivers while memory drivers kept it as `undefined`. Skipping the value keeps the guarantee `RemovableStoreKey` gives `removeItem` and makes every driver store the same record.

Rejected: keeping spread semantics and documenting the gap, because the type system cannot catch the case in the default compiler configuration; and a narrower parameter type, because without `exactOptionalPropertyTypes` an optional property still admits `undefined`. Cost accepted: `patch({ nickname: undefined })` no longer removes an optional field on JSON drivers; `removeItem` does.

## Non-object stored values fail validation

`TSchema extends object`, so a stored primitive can never be a valid record. The store reports `store.validation_failed` for a non-object value whether or not `validate` is supplied, instead of returning it as the record and letting `patch` spread a string's characters into the next write.

Rejected: trusting the value when `validate` is absent, because no schema can accept it and the failure mode corrupts the next write.

## One storage key per Node JSON file

The file drivers hold one record per file and ignore the storage key inside it. Binding a second key to a file already bound to another key in the process throws during store creation, compared by `path.resolve`. Without the check, two stores on one file silently overwrote each other and each read the other's record.

The binding lasts for the life of the process because stores have no disposal step, so a test suite that reuses one path with different keys must use one file per key. Paths that differ only in case on a case-insensitive filesystem, or reach the same file through a link, are not detected.

Rejected: keyed records inside one file, because it changes the one-record-per-key model and turns a whole-file write into a read-modify-write across stores; and documentation alone, because the failure corrupts data silently.

## Empty storage keys are valid keys

Drivers treat a key as unbound only when it is `undefined`. localStorage accepts `""` as a key; the previous truthiness check made every operation under `""` fail as unbound.

## Package-owned `store.*` error codes

Recoverable failures use `store.read_failed`, `store.write_failed`, `store.clear_failed`, `store.parse_failed`, and `store.validation_failed`, plus `store.clear_unsupported`. The prefix follows the repository's flat error-code namespace so applications can register errors from several packages without collisions.

The plain `storeErrors` dictionary covers every code with user-facing feedback, typed with `ErrorFeedback` imported as a type only. This lets applications register the codes without introducing a runtime dependency or registry instance.

Rejected: the prior `storage-*-failed` names, because they do not identify the owning package or follow the namespacing contract; and exporting a registry instance, because applications own registration and the dictionary requires no runtime error dependency.

## One error-reporting callback on the store

`localStorageDriver(storageKey?)` leaves error reporting to the store's `onError`. Its former callback duplicated the store's callback: when both were set, the driver's callback silently replaced the store's for read, write, and clear failures, while validation failures still went to the store's. Removing it keeps every failure on one reporting path.

Rejected: keeping the driver callback, because it requires two reporting paths and a hidden lookup table to keep each failure reported once.

## Unsupported clear reports a failure

A store whose driver omits `clear` reports `store.clear_unsupported` and leaves data in place. Callers can distinguish an unsupported deletion from a successful one and choose a driver that can remove the record.

Rejected: a silent no-op, because application code could claim it removed data that remains persisted.

## Portable values are JSON-safe by documentation

localStorage, Node JSON files, and Cloudflare KV require values that survive a JSON round-trip. Memory drivers preserve more types through `structuredClone`, and native Durable Object storage has its own supported values. The docs make the portability boundary explicit without runtime enforcement.

Rejected: codecs, because they add more public surface than small typed records need. Applications can model a date as an ISO string without a serialization layer in the package.

## Keep the `./cf` entrypoint

Cloudflare drivers remain at `@codenhub/store/cf`. All other current export names and import paths remain stable during the internal module split.

Rejected: renaming it to `./cloudflare`, because a longer spelling provides no behavior improvement and breaks existing consumer imports.

## Whole-object access without field storage or caching

`getItem` still reads, parses (for JSON drivers), and clones the whole object, and updates write the whole record. The small-record scope keeps that cost reasonable; consumers can read once or batch changes with `patch`.

Rejected: per-field storage, because it changes the one-record-per-key persistence model and requires coordinating several keys; and caching, because it adds invalidation and freshness behavior without solving coordination between writers. Neither belongs in this refactor.

## Check binding assignments while skipping dependency declarations

The store typecheck includes the Cloudflare test worker and checks `state.storage` directly against the built driver declarations. Like the JWT reference package, it uses `skipLibCheck`: Miniflare 5.20261012.1-beta's published declarations reference missing modules such as `@cloudflare/workers-shared` and `./shared`. Checking those declarations fails before application code can be verified; skipping library declaration bodies still checks the worker's assignments and calls.

Rejected: excluding the worker from typechecking, because it would leave the real Durable Object storage/delete compatibility unverified; and adding ambient replacement declarations, because that would test our substitutes for dependency types.
