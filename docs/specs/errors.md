---
status: APPROVED
last_updated: 2026-10-07
scope: Workspace packages that expose errors to consumers.
---

# Package errors spec

This document defines how packages in this repository should design and expose their error handling so that consumers using `@codenhub/error` get consistent, predictable, and interoperable errors across packages.

## Applicability

This spec applies only to packages that **already expose errors to consumers** — functions that throw, return errors, or expose error types as part of their public API.

Packages that do not expose errors do not need to follow this spec.

## Overview

`@codenhub/error` provides a normalized `AppError` shape, a registry system for classifying errors, and a `Result<T>` pattern for fallible operations. When packages expose errors using these conventions, consumers benefit from:

- Consistent error shape across the codebase (`AppError.type`, `AppError.code`, `AppError.source`, `AppError.messageKey`)
- Opt-in classifications — consumers pick what they classify; nothing is hidden in a global
- i18n-ready error messages via `messageKey`
- Retry signaling via `isRetryable`
- Composable registry presets that consumers can merge into their own registry
- Messages that say what happened and what to do next, written to the conventions below
- Diagnostic access through `AppError.originalError` while default JSON serialization retains normalized fields without including raw input

`isAppError()` recognizes `AppError` instances created by the current `@codenhub/error` package runtime. It is an identity guard, not a mechanism for recognizing serialized errors or instances created by another package copy or runtime.

## `@codenhub/error` runtime contract

`createAppError()` and `appErrorFromJSON()` MUST be the only ways to build an `AppError`: an instance MUST NOT expose the class that constructs it, and the prototype instances share MUST be frozen, so no code can build an `AppError` with fields neither a registry nor a serialized `AppError` supplied, or replace its serialization. Every own property of an `AppError` MUST be non-writable and non-configurable, so its classification cannot change or be removed after construction. The instance MUST stay extensible: frameworks add properties to the errors they catch, as Koa's `ctx.onerror` assigns `status` and hapi's `Boom.boomify` assigns `isBoom`, and on a frozen error that assignment throws inside the framework's own handler, which in Koa leaves the rejection unhandled and ends the process. Freezing the instance was the rule through 0.2 and was reversed for that reason; an added property cannot reach `toJSON()`, whose output is fixed. The referenced `originalError` value is diagnostic input and is not recursively frozen. Default JSON serialization MUST include `name`, `message`, `type`, `code`, `messageKey`, `source`, and `isRetryable`, and MUST omit diagnostic `cause` and `originalError` values. `appErrorFromJSON()` MUST rebuild an `AppError` from exactly that shape without consulting a registry, keep the parsed value as `originalError`, and normalize any other value as raw input, as `createAppError()` does. It is the one other way to obtain an `AppError`, and it exists for the receiving side of a JSON boundary, such as a client reading its own server's response. Whoever produced the value chooses the message, so it is for sources the application trusts to word its errors. Leaving the helper out was the rule until 0.3 and was reversed: `Err` holds an `AppError` instance, so without it a failure sent by a server could not be held in a `Result<T>` on the client, and passing the parsed object to `createAppError()` lost every name, message, prefix, and pattern match and kept a code match only when the receiver held the same registry. The reason it was left out, that the sender would choose the message, did not separate it from what any caller can already do with a `fallbackMessage`.

`AppError.code` MUST be the registry identifier that classified the error: the matched code, or the matched name when no code matched. It MUST be `null` for message, prefix, and pattern matches and for unknown errors. It exists so consumers can branch on a specific failure without comparing message text. A mapping matched by message, prefix, or pattern has no identifier to expose, so one failure can carry a code from one source and `null` from another; consumers branch on `messageKey` there, which is why a preset's keys are public API (see "`messageKey` conventions"). Letting feedback carry its own identifier was weighed and deferred: it adds surface that no application has asked for yet.

Wrapper traversal defaults to a maximum depth of `3`. At that depth a `cause` chain alone MUST be followed further, to a depth of `8`: the cap exists because every other wrapper field multiplies the candidates at each level, and a `cause` chain adds one, while an error wrapped once per layer of an application routinely sits deeper than `3`. A `maxDepth` below `3` stops every field, `cause` included, at that depth. A supplied `maxDepth` MUST be an integer from `0` through `3`; all other values are programmer errors and MUST throw `TypeError` before traversal begins, and before `attempt()` or `attemptAsync()` run their callback.

`attempt()` MUST throw `TypeError` when its callback returns a promise or other thenable, and MUST NOT call `then` on a thenable that is not a native promise, since that would start it. For a callback that is not a function, `attempt()` MUST throw `TypeError` and `attemptAsync()` MUST return a promise rejected with one, before anything else runs; an async function reports every failure through its promise, invalid options included.

Normalizing error text MUST take time linear in its length. Error messages routinely embed input an attacker controls, so no step that runs on every message may backtrack.

Passing a `registry` to `createAppError()` with an existing `AppError` classifies the raw value it started from again, unwinding any earlier `AppError` first. Re-normalization MUST only upgrade: an unexpected result replaces only an unknown error, and a known result replaces anything it differs from. In every other case the same `AppError` MUST be returned. Without a `registry` option the same `AppError` MUST be returned whatever else is passed: a `fallbackMessage` or `maxDepth` MUST NOT change an `AppError`, so an error passed through several layers keeps the wording of the first one that named it. The same holds for an `AppError` nested in another value, as in `new Error("checkout failed", { cause: appError })`: without a `registry` option its own classification is a candidate and its raw value MUST NOT be looked into, and a supplied `registry` classifies that raw value like any other candidate. Looking into it without one was the behavior until 0.3 and was reversed: one wrapper was enough for the global registry to replace an unknown or unexpected classification a per-service registry had made, and to mark as retryable a response body that had been classified against a registry holding no transport preset. Classifying again against the global registry whenever any option was passed was tried and reversed: the error may have been classified by a per-service registry, as "Code namespacing" advises, and a later layer that only supplied a `fallbackMessage` had the global registry's mapping for the same code replace it. Never replacing a known `AppError` was weighed and rejected, because an application that passes its own registry is asking for its wording.

Raw strings passed to `err()` MUST be treated as untrusted error values. They MUST NOT become user-facing messages unless the caller explicitly supplies a safe `fallbackMessage`.

`freezeRegistry()` MUST return an immutable snapshot rather than a live view. The returned registry and buckets MUST expose only their documented read methods at runtime. Reflection MUST NOT reveal mutation methods from the source or snapshot registry.

Registry feedback MUST be copied into plain data before storage. Each feedback field MUST be read at most once, and inaccessible or invalid fields MUST produce a `TypeError` rather than allowing invalid data into a bucket.

The registry MUST accept any non-empty string as a `messageKey` or `source`. The naming conventions below bind packages in this repository, not applications: an application registers the translation keys its catalog already has. Tests hold the built-in presets to the conventions.

## Providing error mappings (not registries)

Packages MUST NOT introduce a runtime dependency on `@codenhub/error` solely for the purpose of exposing their error definitions. Consequently, if a package only wants to publish error definitions, it MUST NOT create or export `ErrorRegistry` or `ReadonlyErrorRegistry` instances directly.

However, if a package requires `@codenhub/error` for its own internal runtime logic or features (such as UI/feedback components), it is allowed to carry it as a runtime dependency and use it directly.

A package that classifies at runtime, by calling `createAppError()`, `err()`, `attempt()`, or `attemptAsync()`, or that returns `Result<T>` or `AppError` values to its consumer, MUST list `@codenhub/error` in `peerDependencies`, not `dependencies`. The global registry and the `isAppError()` identity both belong to one copy of the package. A second copy, which a `dependencies` range installs whenever it disagrees with the application's version, has its own empty global registry and does not recognize the application's `AppError` values, so everything the package classifies resolves to an unknown error. A package that reads only constants or types from `@codenhub/error` is not affected.

When avoiding a runtime dependency, the package SHOULD export a plain JavaScript object (dictionary) containing its error feedback definitions, importing type definitions via `import type`.

```ts
import type { ErrorFeedback } from "@codenhub/error"; // Erased at runtime

export const myPackageErrors: Record<string, ErrorFeedback> = {
  "my-package.invalid_credentials": {
    message: "We couldn't sign you in. The email or password is incorrect. Check them and try again.",
    source: "my-package",
  },
};
```

**Naming convention:** `<camelCasePackageName>Errors` for a dictionary keyed by error code (e.g., `i18nErrors`, `routerErrors`). A dictionary keyed by another identifier names its bucket: `<camelCasePackageName>ErrorNames`, `<camelCasePackageName>ErrorMessages`. The built-in presets of `@codenhub/error` name the bucket for codes too (`supabaseErrorCodes`, `nodeErrorCodes`): they are named for the third party whose errors they map, not for a package, and each sits beside a names or patterns export it has to be told apart from.

Every error the package throws or returns MUST carry the identifier its dictionary is keyed by: a `code` property equal to the key for a code dictionary, a `name` equal to the key for a name dictionary. A mapping whose key no error carries can never match.

### Code namespacing

A registry's `codes` bucket is one flat namespace shared by every source merged into it, and a later registration silently replaces an earlier one. Two packages that both export `not_found` cannot be registered together.

The `names` bucket is flat in the same way, and a name matches any value that carries it, whatever threw it. `NotFoundError`, `TimeoutError`, and `NetworkError` are `DOMException` names and also common class names in libraries, so a registry holding the browser preset classifies a library's `NotFoundError` as the browser's. A name mapping's message MUST hold for every error that plausibly carries the name, and the same per-service `registry` advice below applies.

A package in this repository MUST prefix each code it defines with its unscoped package name and a dot: `i18n.locale_load_failed`, `router.not_found`.

Codes that belong to a third party keep the spelling that party emits, because they have to match the raw error: `23505`, `invalid_credentials`, `ENOENT`. Presets of such codes cannot be namespaced, so a code two services share resolves to whichever was registered last. Consumers that merge presets for overlapping services SHOULD classify each service's errors against its own registry through the `registry` option.

### Dependency Rules

- **Runtime Dependencies**: `@codenhub/error` MUST NOT be listed in the `dependencies` or `peerDependencies` of the package if it is only needed to expose error definitions. It is allowed if needed for internal runtime logic, in `peerDependencies` when the package classifies errors or returns `Result<T>` or `AppError` values.
- **Development Dependencies**: If the package does not use it at runtime, `@codenhub/error` MUST be listed in `devDependencies` to allow compiling the `import type` statement.

### Integrating with Registries

Since the package only exports raw mapping objects, applications or wrapper libraries that consume the package can easily register these definitions. For example:

```ts
import { getErrorRegistry } from "@codenhub/error";
import { myPackageErrors } from "@codenhub/my-package";

getErrorRegistry().codes.addList(Object.entries(myPackageErrors));
```

## Choosing the right bucket

Use the bucket that matches the most stable identifier available for the error:

| Bucket     | Use when                                                                                                 | Examples                                       |
| ---------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `codes`    | The error source provides a stable machine-readable code (string or number) alongside the message.       | `"invalid_credentials"`, `"23505"`, `"ENOENT"` |
| `names`    | The error has a stable `.name` property (native Error subclasses, SDK errors with named constructors).   | `"AbortError"`, `"FunctionsHttpError"`         |
| `messages` | No code or name is available, but the message is exact and stable across versions.                       | `"fetch failed"` (avoid when possible)         |
| `prefixes` | The message starts with a stable prefix but varies afterward.                                            | `"Upload failed:"`, `"RLS violation on table"` |
| `patterns` | The error can only be identified heuristically. Results are classified as `"unexpected"`, not `"known"`. | `/connection timed out/i`, `/rate limit/i`     |

Prefer `codes` over `names` over `messages`. Prefer `messages` over `prefixes`. Prefer `prefixes` over `patterns`.

Code and name identifiers are exact machine identifiers after trimming leading and trailing whitespace. Their punctuation MUST remain significant. Message and prefix identifiers are human-readable text; implementations MAY ignore trailing sentence punctuation consistently during registration and matching.

Avoid registering message patterns unless no stable code or name exists. Pattern matches are heuristic by nature and classified as `"unexpected"`, which signals lower confidence to consumers.

## `source` field conventions

The `source` field identifies where the error originated. Use a dot-separated namespace of the form `packageName.service`.

```
"supabase.auth"
"supabase.database"
"browser.network"
"my-package.uploads"
```

Rules:

- Use the npm package name (without scope) as the root segment: `supabase`, `browser`, `router`.
- Add a service or subsystem segment when the package covers multiple distinct areas.
- Use `null` (the default) only when the source is genuinely ambiguous or unknown.
- Keep segments lowercase and hyphenated (`kebab-case`), matching the package naming convention.

## `message` conventions

The `message` is what a person using the application reads. A code translated into a sentence, such as "Invalid email or password.", is not enough: the message has to help that person get past the failure.

Write one string of full sentences, in this order:

1. **What happened**, in terms of what the person was trying to do when the identifier proves it, and as the plain fact when it does not.
2. **Why**, when the identifier says why and knowing it helps.
3. **What to do next.**

```
"We couldn't sign you in. The email or password is incorrect. Check them and try again."
"We've sent too many emails to this address. Wait a few minutes before requesting another."
```

Rules:

- Say only what the identifier proves. `invalid_credentials` proves a sign-in failed, so the message can name it. `23505` proves a duplicate value and nothing about which record, and `ECONNREFUSED` proves nothing about what the person was doing.
- Advise only actions that always exist. A mapping cannot know that the application has a password reset, a support chat, or a retry button, so "check them and try again" is safe and "reset your password" is not. An application that has the feature registers its own message for the code. "Contact support", with no channel named, is the one exception, and only where the reader can do nothing else: it points at whoever runs the application and claims no feature.
- Speak as the application, in the first person plural: "We couldn't…". Do not blame the reader, and do not use jargon, identifiers, or the raw error text.
- "Try again" in a message is advice to a person and does not make the mapping `isRetryable`. When the operation may already have taken effect, say so: "Check whether it went through before trying again."
- A failure with nothing to act on, such as a cancelled request, MAY be a single sentence.

### Who can act on the failure

Every mapping is written for one of two audiences, decided by who can make the failure go away:

| Audience                 | The failure is                                                                                         | Examples                                                        | The message                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| The person using the app | Caused by their input, their account, their device, or a condition that passes on its own.             | `invalid_credentials`, `weak_password`, `23505`, `ECONNREFUSED` | Follows the three parts above.                                                                                                  |
| The developer of the app | A defect or a misconfiguration: nothing the person does will fix it, and only a code or config change. | `42P01`, `42703`, `InvalidStateError`, `unexpected_failure`     | Says the problem is on the application's side and not the reader's doing, and names no table, column, state, or other internal. |

Rules:

- A developer-facing mapping MUST NOT describe the defect or suggest a fix the reader cannot make. What went wrong is diagnostic, and it stays on `AppError.originalError` for logs.
- Developer-facing mappings in one package SHOULD share one message, so the reader is told the same thing whichever defect produced it. `@codenhub/error` uses a single sentence for all of its own.
- Register a developer-facing identifier only when it is common enough that telling the reader "this is not your doing" is worth more than the generic fallback. Identifiers that only surface during development, such as a malformed token or a misconfigured hook, are left unmapped and resolve to an unknown error.
- When the same identifier can be either, write for the person using the app. `23502`, a missing required value, is usually a form the application failed to validate, but the reader can still fill the field in.
- The audience is a rule for writing mappings, not a field on `AppError`. Code that needs to tell the two apart branches on `AppError.code`. Known gap: `type` is `"known"` for both audiences, and a preset does not export which of its identifiers are developer-facing, so an application that reports defects to an error tracker has to list them itself. A field can be added without a breaking change once an application needs it. `type` says how the error was matched, not how serious it is: a missing table is `"known"` and an offline user matched by pattern is `"unexpected"`, so `type !== "known"` is not a test for a defect. The name `"unexpected"` suggests otherwise and is to be reconsidered before `1.0`.

## `messageKey` conventions

The `messageKey` field is an optional i18n translation key. When provided, consumers can use it to look up localized messages instead of displaying the English fallback.

Use a dot-separated key under the `error` namespace:

```
"error.packageName.service.errorName"
```

Examples:

```
"error.supabase.auth.invalidCredentials"
"error.browser.network"
"error.router.notFound"
```

Rules:

- All segments lowercase camelCase, except `error` root which is always lowercase.
- The key must match the `message` fallback in meaning and tone.
- A key MAY be backed by bundled translations or defined as a documented, stable integration key for consumer-owned translations.
- Packages that define stable integration keys MUST treat them as public API and preserve their meaning across non-breaking releases.
- Omit `messageKey` when neither bundled translations nor a consumer translation contract exists.

## `isRetryable` guidance

Set `isRetryable: true` only when the same operation can be repeated **without user intervention** and **without the risk that it runs twice**. The flag describes the failure, and the code that reads it does not know whether the operation was idempotent, so a mapping MUST be safe to act on for the call that raised the failure.

| Should be retryable                       | Should NOT be retryable                             |
| ----------------------------------------- | --------------------------------------------------- |
| Connection refused, connection timeout    | Response timeout, connection reset, aborted request |
| DNS failures                              | Auth failures, permission denied                    |
| Service errors that reject before running | Validation errors, unique constraint violations     |
|                                           | Service errors that may have run the request (5xx)  |
|                                           | Rate limits                                         |

When in doubt, omit `isRetryable` (defaults to `false`). Do not mark an error as retryable speculatively. A failure that is likely to pass on a second try but may follow a request the server already received is not retryable. Neither is a failure a service reports on a response it sent back, such as the Supabase `FunctionsRelayError`: the request arrived, and the service may have acted on it.

A rate limit is not retryable, though repeating the operation is safe: the flag carries no delay, so code that retries on it does so at once and counts against the limit again. The message tells the reader how long to wait. Letting feedback carry a delay was weighed and left out as surface no application has asked for.

The flag describes the call that raised the matched failure, not every operation the error passed through on its way up. Traversal finds a match at any depth, so a `publish()` that uploads a file and then fails to save a record with `ECONNREFUSED` resolves to a retryable error, and repeating `publish()` uploads the file again. Only code that made the failing call directly, or knows everything around it is safe to repeat, SHOULD retry on the flag. Carrying the flag only from the top-level value or its direct `cause` was weighed and rejected: the depth is a guess, and it would drop the flag from the `service → repository → fetch` chain the `cause` depth of `8` exists to reach. The same limit applies to an `errors` list, where the first classified entry decides.

The flag also holds only for an error the local runtime raised. Matching does not know where a value came from: a server that forwards its own upstream failure as `{ "code": "ECONNREFUSED" }` in a response body produces a value that matches the Node.js mapping, although the request reached the server and may have run. Applications SHOULD classify response bodies against a registry that holds the service's own codes and no transport preset, through the `registry` option. Restricting a mapping to `Error` instances was weighed and left out: it adds a matching rule to every bucket for a case the `registry` option already covers.

Generic browser fetch messages such as `Failed to fetch` or `Load failed` SHOULD remain non-retryable because they can represent permanent failures such as CORS, invalid URLs, or TLS errors. A `TimeoutError` from `AbortSignal.timeout()` SHOULD remain non-retryable because it can fire after the request was sent. So SHOULD `ETIMEDOUT`: Node.js raises it for a connection attempt and for an established socket alike, and the code does not say which. More specific signals that the request never arrived, such as connection refusal or DNS failure, MAY be marked retryable.

## Error-propagation pattern (throwing vs. returning Results)

Packages that avoid runtime dependencies on `@codenhub/error` MUST NOT return `@codenhub/error`'s `Result<T>` or instantiate `AppError` at runtime.

Instead, they should follow one of these patterns:

1. **Standard Throwing**: Throw native `Error` instances or custom error subclasses.
2. **Package-local Result**: Define a local, lightweight, plain-object result type.

In both cases, the consumer application layer is responsible for catching or receiving the raw error and normalizing it via `createAppError()` using the package's exported error mappings.

If a package is a high-level framework or app-integration package that _already_ carries a runtime dependency on `@codenhub/error`, it MAY return `@codenhub/error`'s `Result<T>` and use `ok()` and `err()` helpers directly.

Do NOT use `Result<T>` or throw domain errors for programmer errors (such as invalid arguments or assertion failures). Those MUST always throw immediately.

Do NOT mix throwing and returning results for the same failure category within the same API surface.

## Anti-patterns

**Do not mutate the global registry from library code.** Packages MUST NOT call `getErrorRegistry()` or `setErrorRegistry()` at module load time or inside exported functions. Only application-level code should configure the global registry.

```ts
// Wrong — mutates the global registry on import
import { getErrorRegistry } from "@codenhub/error";
getErrorRegistry().codes.add("my-package.my_error", { message: "Error." });

// Correct — export raw mappings; let the consumer merge them
export const myPackageErrors = {
  "my-package.my_error": { message: "Error.", source: "my-package" },
};
```

**Do not ship preset registries from general library packages.** Presets MUST NOT instantiate `createErrorRegistry()` or `freezeRegistry()` in packages that only expose error definitions, because doing so forces a runtime dependency. Export raw dictionary objects instead. `@codenhub/error` is the designated owner of built-in, opt-in presets and MAY export frozen registry snapshots alongside their raw mappings; those presets MUST NOT mutate the global registry on import. This exception is recorded in `docs/specs/packages-exceptions.md`.

**Do not rely on message matching when a stable code or name exists.** Message strings change across library versions; codes and names are generally more stable.

**Do not include internal error codes that are not meaningful to consumers.** Only register errors that consumers may realistically encounter and need to handle or display.

## Exceptions

`docs/guidelines/documentation.md` defines exception requirements; `docs/specs/packages-exceptions.md` owns package-specific exceptions and compliance-check waivers.

A valid exception MUST name the package, the skipped rule, and why the package remains safe to publish.
