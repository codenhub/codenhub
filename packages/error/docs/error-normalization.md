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

| Option            | Default                     | Behavior                         |
| ----------------- | --------------------------- | -------------------------------- |
| `fallbackMessage` | `DEFAULT_APP_ERROR_MESSAGE` | Message for an unmatched value.  |
| `registry`        | `getErrorRegistry()`        | Classification source.           |
| `maxDepth`        | `3`                         | Maximum wrapper traversal depth. |

`DEFAULT_APP_ERROR_MESSAGE` is `"An unexpected error occurred."`.
`isAppError(value)` identifies branded errors created by this package. Passing
an `AppError` to `createAppError` returns the same object when no custom options
are supplied; custom options cause it to be normalized again.

An `AppError` implements `Error` and exposes:

- `type: AppErrorType`, where deterministic matches are `"known"`, pattern
  matches are `"unexpected"`, and unmatched values are `"unknown"`.
- `message`, plus nullable `messageKey` and `source: AppErrorSource` metadata.
- `originalError`, preserving the original top-level input.
- `isRetryable`, which defaults to `false` unless matched feedback sets it.

Normalization does not throw for ordinary unknown input. Accessors on hostile
objects are ignored when they throw. Registry configuration errors and invalid
`maxDepth` values are not normalized or validated specially.

## Configure A Registry

`getErrorRegistry()` returns the active mutable global `ErrorRegistry`.
`setErrorRegistry(registry)` replaces it and throws `TypeError` when passed
`null` or a non-object. `createErrorRegistry(presets?)` creates an isolated,
empty registry and merges optional presets in order.

```ts
import { createAppError, createErrorRegistry } from "@codenhub/error";

const registry = createErrorRegistry();
registry.codes.add("E_RATE_LIMIT", {
  message: "Try again later.",
  messageKey: "errors.rateLimit",
  source: "api",
  isRetryable: true,
});

const error = createAppError({ code: "E_RATE_LIMIT" }, { registry });
```

`ErrorFeedback` requires a non-empty `message` and optionally accepts
`messageKey`, `source`, and `isRetryable`.

An `ErrorRegistry` contains exact `codes`, `names`, and `messages` buckets, plus
`prefixes` and regex `patterns`. It also provides `clear()` and `merge()`.
Exact buckets implement `add`, `addList`, `get`, `delete`, `clear`, and
`values`. Prefix and pattern buckets omit `get`; their `values()` methods return
`ErrorPrefixDefinition` and `ErrorPatternDefinition` values. All returned
feedback is defensively copied.

Identifiers are trimmed and trailing `.`, `!`, and `?` are removed. Empty
identifiers, invalid feedback fields, and non-`RegExp` patterns throw
`TypeError`. Duplicate exact identifiers, prefixes, or equivalent regexes are
replaced. Global and sticky flags are removed from registered regexes.

Classification priority is:

1. Existing known `AppError` or code, name, exact-message, or prefix match.
2. Existing unexpected `AppError` or regex pattern match.
3. Any remaining `AppError`.
4. An unknown error using the fallback message.

The longest matching normalized prefix wins. Pattern insertion order determines
the first heuristic match. `AppErrorType`, `AppErrorSource`,
`ErrorRegistryBucket`, `ErrorPrefixRegistryBucket`,
`ErrorPatternRegistryBucket`, `ErrorPrefixDefinition`, and
`ErrorPatternDefinition` are exported for consumers typing registry workflows.

## Read-Only Presets

`freezeRegistry(registry)` returns a `ReadonlyErrorRegistry`. Its read methods
remain available, but runtime attempts to mutate a proxied bucket throw
`TypeError`. Use frozen registries as presets passed to `createErrorRegistry`
or `merge`.

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

The raw name/code records and browser pattern tuples are mutable exports; the
prebuilt registry values are read-only. Browser mappings cover common
`DOMException` names and network-message patterns. Supabase mappings cover
selected Auth and PostgreSQL codes plus Edge Function error names. Preset
coverage is not exhaustive, and message patterns are heuristic.
