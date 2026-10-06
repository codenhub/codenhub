---
title: Error Normalization
---

# Error Normalization And Registries

## Normalize Unknown Values

`createAppError(error, options?)` returns an `AppError`. It traverses the input and wrapper fields `cause`, `originalError`, `error`, `err`, `inner`, and `innerError` to find classifications. It also inspects the first ten entries of an `errors` list, the shape of `AggregateError` and of many API responses. Past the default depth of `3`, only a `cause` chain is followed, to a depth of `8`: it is linear, so a failure wrapped once per layer of an application is still found, while the other fields stop where they would multiply the candidates.

```ts
import { createAppError } from "@codenhub/error";

const error = createAppError(new Error("Request failed"), {
  fallbackMessage: "Please try again.",
  maxDepth: 2,
});
```

`AppErrorOptions` supports:

| Option            | Default                     | Behavior                                                                                                              |
| ----------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `fallbackMessage` | `DEFAULT_APP_ERROR_MESSAGE` | Message for an unmatched value; must be a non-empty string.                                                           |
| `registry`        | `getErrorRegistry()`        | Classification source; must expose the read-facing registry surface.                                                  |
| `maxDepth`        | `3`                         | Maximum wrapper depth; must be an integer from `0` through `3`. A value below `3` also stops the `cause` chain there. |

`DEFAULT_APP_ERROR_MESSAGE` is `"An unexpected error occurred."`. `isAppError(value)` identifies errors created by the current package runtime. Structurally similar or serialized values are not accepted. Passing an `AppError` to `createAppError` returns the same object when no custom options are supplied. Custom options classify the raw value it started from again, and re-normalization only ever upgrades: a pattern match replaces only an unknown error, and a known match replaces anything it differs from. Everything else returns the same object, so a `fallbackMessage` never replaces the message an `AppError` already has and the first layer to name a failure keeps its wording through every later one.

An `AppError` is frozen, implements `Error`, and exposes:

- `type: AppErrorType`, where deterministic matches are `"known"`, pattern matches are `"unexpected"`, and unmatched values are `"unknown"`.
- `code`, the registered code that matched, or the registered name when no code matched. It is `null` for message, prefix, and pattern matches and for unknown errors. Branch on it rather than on `message`. A mapping matched by message, prefix, or pattern has no code, so branch on its `messageKey` there: the built-in preset keys are stable, and one failure can arrive either way, as a stale code-split chunk does with `code: "ChunkLoadError"` from webpack and `code: null` from Chrome, both under `error.browser.moduleLoadFailed`.
- `message`, plus nullable `messageKey` and `source: AppErrorSource` metadata.
- `originalError`, preserving the original top-level input as a non-enumerable diagnostic value.
- `isRetryable`, which defaults to `false` unless matched feedback sets it. It means the operation can be repeated as it is, without user intervention and without the risk that it runs twice. A failure that may follow a request the server already received is not retryable, however likely a second try is to succeed.

Normalization does not throw for ordinary unknown input, including objects or proxies whose inspected properties throw. An explicit `toJSON()` defines serialization, so `JSON.stringify` yields exactly `name`, `message`, `type`, `code`, `messageKey`, `source`, and `isRetryable` on every engine. It excludes the raw `cause` and `originalError` diagnostic values, preventing sensitive fields and cyclic wrapper objects from being serialized through the normalized error. Nothing reads that shape back: `isAppError` is false for the parsed object, and passing it to `createAppError` classifies it as raw input, which loses a message, prefix, or pattern match. On the receiving side, read the parsed object's fields directly. Registry configuration errors throw `TypeError` at their configuration boundary. Invalid options are programmer errors and throw `TypeError` before traversal begins: a non-object `options` value, an empty or non-string `fallbackMessage`, a `registry` that does not expose the read-facing registry surface, and a `maxDepth` outside the integer range from `0` through `3`.

## Configure A Registry

`getErrorRegistry()` returns the active mutable global `ErrorRegistry`. `setErrorRegistry(registry)` replaces it and throws `TypeError` when the value does not implement the mutable registry interface. `createErrorRegistry(presets?)` creates an isolated, empty registry and merges optional presets in order; it throws `TypeError` when `presets` is not a list. `merge()` throws `TypeError` when its source does not expose the read-facing registry surface.

```ts
import { createAppError, createErrorRegistry } from "@codenhub/error";

const registry = createErrorRegistry();
registry.codes.add("E_RATE_LIMIT", {
  message: "Try again later.",
  messageKey: "error.myApp.api.rateLimit",
  source: "my-app.api",
  isRetryable: true,
});

const error = createAppError({ code: "E_RATE_LIMIT" }, { registry });
```

`ErrorFeedback` requires a non-empty `message` and optionally accepts `messageKey`, `source`, and `isRetryable`. A `messageKey` or `source` is any non-empty string, so an application can register the translation keys its catalog already uses. The built-in presets use dot-separated lower-camel-case keys under the `error` namespace, such as `error.supabase.auth.invalidCredentials`, and dot-separated lowercase kebab-case sources, such as `supabase.auth`.

An `ErrorRegistry` contains exact `codes`, `names`, and `messages` buckets, plus `prefixes` and regex `patterns`. It also provides `clear()` and `merge()`. Bucket contents are mutable, but the bucket references are read-only and cannot be replaced. Exact buckets implement `add`, `addList`, `get`, `delete`, `clear`, and `values`. Prefix and pattern buckets omit `get`; their `values()` methods return `ErrorPrefixDefinition` and `ErrorPatternDefinition` values.

Entries are validated and frozen when they are registered, and read methods return those frozen values directly instead of rebuilding a copy per lookup. Returned feedback objects, definitions, definition lists, and stored `RegExp` instances are all frozen, so writing to them throws `TypeError` in strict mode and cannot affect registry state. Prefix definitions are returned ordered from longest to shortest prefix; pattern definitions keep insertion order.

Code and name identifiers are trimmed but otherwise exact, so punctuation remains significant. A `DOMException` is matched by its name only: its legacy numeric `code`, such as `20` for `AbortError`, is ignored. The `codes` bucket is one namespace for every source merged into a registry, so a code two services share resolves to whichever was registered last; classify each service against its own registry when their codes can overlap. The `names` bucket is shared the same way and matches any value carrying the name: with the browser preset merged, a library's own `NotFoundError` or `TimeoutError` class is classified as the browser's. Message and prefix identifiers are trimmed and every trailing `.`, `!`, `?`, and whitespace character is removed, so `Done . .` and `Done` are the same identifier. Adding or deleting empty identifiers, adding inaccessible or invalid feedback fields, and adding or deleting non-`RegExp` patterns throw `TypeError`; exact-bucket `get` returns `undefined` for an empty or non-string identifier. Feedback fields are read once and copied into plain data. Duplicate exact identifiers, prefixes, or equivalent regexes are replaced. Global and sticky flags are removed from registered regexes.

`addList` validates the complete batch before adding entries. `merge` stages and validates the complete source before changing its target. Either operation leaves its target unchanged when validation fails.

Classification priority is:

1. Existing known `AppError` or code, name, exact-message, or prefix match.
2. Existing unexpected `AppError` or regex pattern match.
3. Any remaining `AppError`.
4. An unknown error using the fallback message.

The longest matching normalized prefix wins, including for custom registry implementations whose prefix definitions are not ordered. Feedback returned by a custom registry implementation must carry a non-empty `message`; anything else throws `TypeError`. Pattern insertion order determines the first heuristic match. `AppErrorType`, `AppErrorSource`, `ErrorRegistryBucket`, `ErrorPrefixRegistryBucket`, `ErrorPatternRegistryBucket`, `ErrorPrefixDefinition`, and `ErrorPatternDefinition` are exported for consumers typing registry workflows.

## Read-Only Presets

`freezeRegistry(registry)` returns an immutable `ReadonlyErrorRegistry` snapshot. Its frozen bucket facades expose only read methods at runtime; mutation methods are absent, including through reflection. Later mutations to the source registry do not affect the snapshot. Use frozen registries as presets passed to `createErrorRegistry` or `merge`.

```ts
import { getErrorRegistry } from "@codenhub/error";
import { browserErrorRegistry } from "@codenhub/error/registries/browser";

getErrorRegistry().merge(browserErrorRegistry);
```

Public preset exports are:

| Entrypoint                            | Exports                                                             |
| ------------------------------------- | ------------------------------------------------------------------- |
| `@codenhub/error/registries`          | Every export of the three entrypoints below                         |
| `@codenhub/error/registries/browser`  | `browserErrorRegistry`, `browserErrorNames`, `browserErrorPatterns` |
| `@codenhub/error/registries/node`     | `nodeErrorRegistry`, `nodeErrorCodes`, `nodeErrorPatterns`          |
| `@codenhub/error/registries/supabase` | `supabaseErrorRegistry`, `supabaseErrorCodes`, `supabaseErrorNames` |

The raw name/code records and pattern tuples are read-only exports; the prebuilt registry values are read-only. Preset messages say what happened and what to do next, and say only what the matched identifier proves: none assumes the application has a password reset, a support chat, or any other feature. Where the reader can do nothing else, a message says to contact support without naming a channel. A failure only a developer can fix, such as a missing table or column, carries one shared message that tells the reader the problem is not their doing and names no internals; the detail stays on `originalError`. Register your own message for a code when the application can say more. Browser mappings cover common `DOMException` names, a failed-fetch pattern, and a code-split chunk that fails to load, which is most often a tab left open across a deploy: webpack's `ChunkLoadError` name and the message Chrome produces for a failed `import()`. Firefox and Safari word that message differently and are not matched. The failed-fetch pattern matches only the whole message a browser engine produces (`Failed to fetch`, `Load failed`, `NetworkError when attempting to fetch resource.`), not text that merely contains those words. Ambiguous browser fetch and network-message matches are not marked retryable, and neither is `TimeoutError`: an `AbortSignal.timeout()` can fire after the server received the request. Node.js mappings cover network failures only: the system codes raised by sockets and DNS lookups (`ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`, `EHOSTUNREACH`, `ENETUNREACH`, `ETIMEDOUT`, `ECONNRESET`, `EPIPE`) and the `UND_ERR_*` codes the built-in `fetch` carries on the `cause` of its `TypeError`. Only failures that happen before the request reaches the server (refusal, an unresolved or unreachable address, a connection timeout) are marked retryable; a reset, a closed socket or pipe, or a response timeout is not, because the server may already have acted on the request. `ETIMEDOUT` is not either: it is raised when a connection attempt times out and also on a socket that already carried the request, and the code does not say which. The built-in `fetch` reports a connection timeout as `UND_ERR_CONNECT_TIMEOUT`, which is retryable. A failed `fetch` with no recognized cause matches a pattern and is not retryable. Filesystem codes such as `ENOENT` are left out, since the right message depends on what the application was doing, and so are TLS certificate codes, which only an operator can resolve. `AbortError` and `TimeoutError` from an `AbortSignal` are `DOMException` names in Node.js too; merge the browser preset to classify them. The codes were observed on Node.js 24; other runtimes are not covered. Supabase mappings cover the Auth codes a person using the application can run into and act on, taken from the list Supabase publishes, selected PostgreSQL codes, and Edge Function error names. Auth codes only a developer can resolve, such as `bad_jwt` and the `hook_*` and `saml_*` families, are left unmapped. Built-in `messageKey` values are stable integration keys for consumer-owned translations. The package does not yet ship a canonical translation map, so consumers must provide translations when using these keys. Each key maps to exactly one fallback message. Preset coverage is not exhaustive, and message patterns are heuristic.

Registered patterns run against arbitrary error text, so a pattern that backtracks catastrophically will stall classification. Keep custom patterns linear and prefer `codes`, `names`, `messages`, or `prefixes` whenever a stable identifier exists. The built-in preset patterns are simple alternations.

## Migrations

### To 0.3

- `AppError` has a `code` field and `toJSON()` includes it. Code that compares the serialized shape exactly needs the new field.
- A `messageKey` or `source` in any format is accepted; only an empty one throws `TypeError`.
- Passing options with an existing `AppError` returns the same object unless the options find a better classification. A `fallbackMessage` no longer replaces the message of an unknown `AppError`; set it where the failure is first normalized.
- `attempt` rejects a callback that returns a promise at the type level, and throws `TypeError` when one returns a promise or other thenable at runtime; use `attemptAsync`. `attempt` and `attemptAsync` throw `TypeError` for a callback that is not a function.
- The browser `TimeoutError` mapping is no longer retryable.
- Every preset message is rewritten; the `messageKey` values are unchanged. Code or tests that compare a preset's message text need the new wording, and translations written against the old meaning should be reviewed.
- The browser `connection refused|dns_probe_finished` pattern and its `error.browser.connectionRefused` key are removed, and so is the Supabase `invalid_grant` mapping and its `error.supabase.auth.invalidGrant` key. Register them yourself if you relied on either.
- A message or prefix identifier loses every trailing `.`, `!`, `?`, and whitespace character, where a punctuation run broken up by whitespace used to be stripped only once.
- The browser failed-fetch pattern is anchored, so a message that only contains `load failed` or `networkerror` is no longer classified.
- A `DOMException` is no longer matched through its numeric `code`, and entries of an `errors` list are classified.
- A `cause` chain is followed to a depth of `8` at the default `maxDepth`, where it stopped at `3`. An error that resolved to `unknown` because its classified cause sat deeper now resolves through it.
- An `AppError`'s `constructor` is `Error`, and the prototype the instances share is frozen.
- Bucket `get()` and `values()` return frozen values and frozen lists. Writing to a returned feedback object, definition, definition list, or stored `RegExp` throws `TypeError` in strict mode instead of mutating a private copy. Copy explicitly with a spread when a mutable object is needed.
- Invalid `createAppError` and `err()` options throw `TypeError`: `fallbackMessage` must be a non-empty string, `registry` must expose the read-facing registry surface, and `options` must be an object. An invalid registry previously surfaced only when the error carried a code, name, or message.
- `merge()` throws `TypeError` when its source does not expose the read-facing registry surface, and `createErrorRegistry(presets)` throws when `presets` is not a list.
- Strings are classified against the registry at every wrapper depth, including the top-level value passed to `err()`. Unmatched strings still resolve to the fallback message, so raw text is never surfaced. Registering a message, prefix, or pattern that matches a string previously had no effect at the top level and now produces a `known` or `unexpected` result.
- The browser pattern for generic fetch and network messages uses `error.browser.requestFailed` instead of sharing `error.browser.network` with the `NetworkError` name mapping.

### To 0.2

Version 0.2 intentionally resets unstable 0.1 behavior. `AppError` values are frozen, `isAppError` recognizes only values created by the current package runtime, `originalError` is non-enumerable, frozen registries are isolated snapshots without runtime mutators, code and name punctuation remains significant, and invalid `maxDepth` values throw.
