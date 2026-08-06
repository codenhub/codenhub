---
title: Error Normalization
---

# Error Normalization And Registries

## Normalize Unknown Values

`createAppError(error, options?)` returns an `AppError`. It traverses the input
and wrapper fields `cause`, `originalError`, `error`, `err`, `inner`, and
`innerError` to find classifications.

```ts
import { createAppError } from "@codenhub/error";

const error = createAppError(new Error("Request failed"), {
  fallbackMessage: "Please try again.",
  maxDepth: 2,
});
```

`AppErrorOptions` supports:

| Option            | Default                     | Behavior                                                        |
| ----------------- | --------------------------- | --------------------------------------------------------------- |
| `fallbackMessage` | `DEFAULT_APP_ERROR_MESSAGE` | Message for an unmatched value.                                 |
| `registry`        | `getErrorRegistry()`        | Classification source.                                          |
| `maxDepth`        | `3`                         | Maximum wrapper depth; must be an integer from `0` through `3`. |

`DEFAULT_APP_ERROR_MESSAGE` is `"An unexpected error occurred."`.
`isAppError(value)` identifies errors created by the current package runtime.
Structurally similar or serialized values are not accepted. Passing an `AppError`
to `createAppError` returns the same object when no custom options are supplied;
custom options cause it to be normalized again.

An `AppError` is frozen, implements `Error`, and exposes:

- `type: AppErrorType`, where deterministic matches are `"known"`, pattern
  matches are `"unexpected"`, and unmatched values are `"unknown"`.
- `message`, plus nullable `messageKey` and `source: AppErrorSource` metadata.
- `originalError`, preserving the original top-level input as a non-enumerable diagnostic value.
- `isRetryable`, which defaults to `false` unless matched feedback sets it.

Normalization does not throw for ordinary unknown input, including objects or
proxies whose inspected properties throw. JSON serialization includes `name`,
`message`, `type`, `messageKey`, `source`, and `isRetryable`. It excludes the raw
`cause` and `originalError` diagnostic values, preventing sensitive fields and
cyclic wrapper objects from being serialized through the normalized error.
Registry configuration errors throw `TypeError` at their configuration
boundary. A `maxDepth` outside the integer range from `0` through `3` also
throws `TypeError` before traversal.

## Configure A Registry

`getErrorRegistry()` returns the active mutable global `ErrorRegistry`.
`setErrorRegistry(registry)` replaces it and throws `TypeError` when the value
does not implement the mutable registry interface. `createErrorRegistry(presets?)`
creates an isolated, empty registry and merges optional presets in order.

```ts
import { createAppError, createErrorRegistry } from "@codenhub/error";

const registry = createErrorRegistry();
registry.codes.add("E_RATE_LIMIT", {
  message: "Try again later.",
  messageKey: "error.my-app.api.rateLimit",
  source: "my-app.api",
  isRetryable: true,
});

const error = createAppError({ code: "E_RATE_LIMIT" }, { registry });
```

`ErrorFeedback` requires a non-empty `message` and optionally accepts
`messageKey`, `source`, and `isRetryable`.

An `ErrorRegistry` contains exact `codes`, `names`, and `messages` buckets, plus
`prefixes` and regex `patterns`. It also provides `clear()` and `merge()`.
Bucket contents are mutable, but the bucket references are read-only and cannot
be replaced.
Exact buckets implement `add`, `addList`, `get`, `delete`, `clear`, and
`values`. Prefix and pattern buckets omit `get`; their `values()` methods return
`ErrorPrefixDefinition` and `ErrorPatternDefinition` values. All returned
feedback, definitions, and collection arrays are defensively copied.

Code and name identifiers are trimmed but otherwise exact, so punctuation
remains significant. Message and prefix identifiers are trimmed and trailing
`.`, `!`, and `?` are removed. Adding or deleting empty identifiers, adding
inaccessible or invalid feedback fields, and adding or deleting non-`RegExp`
patterns throw `TypeError`; exact-bucket `get` returns `undefined` for an empty
or non-string identifier. Feedback fields are read once and copied into plain
data. Duplicate exact identifiers, prefixes, or equivalent regexes are
replaced. Global and sticky flags are removed from registered regexes.

`addList` validates the complete batch before adding entries. `merge` stages and
validates the complete source before changing its target. Either operation
leaves its target unchanged when validation fails.

Classification priority is:

1. Existing known `AppError` or code, name, exact-message, or prefix match.
2. Existing unexpected `AppError` or regex pattern match.
3. Any remaining `AppError`.
4. An unknown error using the fallback message.

The longest matching normalized prefix wins, including for custom registry
implementations whose prefix definitions are not ordered. Pattern insertion
order determines the first heuristic match. `AppErrorType`, `AppErrorSource`,
`ErrorRegistryBucket`, `ErrorPrefixRegistryBucket`,
`ErrorPatternRegistryBucket`, `ErrorPrefixDefinition`, and
`ErrorPatternDefinition` are exported for consumers typing registry workflows.

## Read-Only Presets

`freezeRegistry(registry)` returns an immutable `ReadonlyErrorRegistry` snapshot.
Its frozen bucket facades expose only read methods at runtime; mutation methods
are absent, including through reflection. Later mutations to the source registry
do not affect the snapshot. Use frozen registries as presets passed to
`createErrorRegistry` or `merge`.

```ts
import { getErrorRegistry } from "@codenhub/error";
import { browserErrorRegistry } from "@codenhub/error/registries/browser";

getErrorRegistry().merge(browserErrorRegistry);
```

Public preset exports are:

| Entrypoint                            | Exports                                                                                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `@codenhub/error/registries`          | `browserErrorRegistry`, `browserErrorNames`, `browserErrorPatterns`, `supabaseErrorRegistry`, `supabaseErrorCodes`, `supabaseErrorNames` |
| `@codenhub/error/registries/browser`  | `browserErrorRegistry`, `browserErrorNames`, `browserErrorPatterns`                                                                      |
| `@codenhub/error/registries/supabase` | `supabaseErrorRegistry`, `supabaseErrorCodes`, `supabaseErrorNames`                                                                      |

The raw name/code records and browser pattern tuples are read-only exports; the
prebuilt registry values are read-only. Browser mappings cover common
`DOMException` names and network-message patterns. Ambiguous browser fetch and
network-message matches are not marked retryable; connection refusal and DNS
matches are. Supabase mappings cover selected Auth and PostgreSQL codes plus
Edge Function error names. Built-in `messageKey` values are stable integration
keys for consumer-owned translations. The package does not yet ship a canonical
translation map, so consumers must provide translations when using these keys.
Preset coverage is not exhaustive, and message patterns are heuristic.

## Migration From 0.1

Version 0.2 intentionally resets unstable 0.1 behavior. `AppError` values are
frozen, `isAppError` recognizes only values created by the current package
runtime, `originalError` is non-enumerable, frozen registries are isolated
snapshots without runtime mutators, code and name punctuation remains
significant, and invalid `maxDepth` values throw. Pass `fallbackMessage`
explicitly when a string supplied to `err()` is safe for users.
