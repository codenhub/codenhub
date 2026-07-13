# Package errors spec

**Status:** APPROVED
**Last updated:** 2026-07-12
**Scope:** Packages under `packages/*` that expose errors to consumers.

This document defines how packages in this repository should design and expose their error handling so that consumers using `@codenhub/error` get consistent, predictable, and interoperable errors across packages.

## Applicability

This spec applies only to packages that **already expose errors to consumers** — functions that throw, return errors, or expose error types as part of their public API.

Packages that do not expose errors do not need to follow this spec.

## Overview

`@codenhub/error` provides a normalized `AppError` shape, a registry system for classifying errors, and a `Result<T>` pattern for fallible operations. When packages expose errors using these conventions, consumers benefit from:

- Consistent error shape across the codebase (`AppError.type`, `AppError.source`, `AppError.messageKey`)
- Opt-in classifications — consumers pick what they classify; nothing is hidden in a global
- i18n-ready error messages via `messageKey`
- Retry signaling via `isRetryable`
- Composable registry presets that consumers can merge into their own registry

## Providing error mappings (not registries)

Packages MUST NOT introduce a runtime dependency on `@codenhub/error` solely for the purpose of exposing their error definitions. Consequently, if a package only wants to publish error definitions, it MUST NOT create or export `ErrorRegistry` or `ReadonlyErrorRegistry` instances directly.

However, if a package requires `@codenhub/error` for its own internal runtime logic or features (such as UI/feedback components), it is allowed to carry it as a runtime dependency and use it directly.

When avoiding a runtime dependency, the package SHOULD export a plain JavaScript object (dictionary) containing its error feedback definitions, importing type definitions via `import type`.

```ts
import type { ErrorFeedback } from "@codenhub/error"; // Erased at runtime

export const myPackageErrors: Record<string, ErrorFeedback> = {
  invalid_credentials: {
    message: "Invalid email or password.",
    source: "my-package",
  },
};
```

**Naming convention:** `<camelCasePackageName>Errors` (e.g., `supabaseErrors`, `routerErrors`).

### Dependency Rules

- **Runtime Dependencies**: `@codenhub/error` MUST NOT be listed in the `dependencies` or `peerDependencies` of the package if it is only needed to expose error definitions. It is allowed if needed for internal runtime logic.
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
- Omit `messageKey` when there is no i18n system or translation file to back it up.

## `isRetryable` guidance

Set `isRetryable: true` only when retrying the same operation **without user intervention** is likely to succeed.

| Should be retryable            | Should NOT be retryable      |
| ------------------------------ | ---------------------------- |
| Network timeouts               | Auth failures                |
| Rate limit (with backoff)      | Permission denied            |
| Transient service errors (5xx) | Validation errors            |
| DNS failures                   | Unique constraint violations |

When in doubt, omit `isRetryable` (defaults to `false`). Do not mark an error as retryable speculatively.

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
getErrorRegistry().codes.add("my_error", { message: "Error." });

// Correct — export raw mappings; let the consumer merge them
export const myPackageErrors = {
  my_error: { message: "Error.", source: "my-package" },
};
```

**Do not ship preset registries.** Presets MUST NOT instantiate `createErrorRegistry()` or `freezeRegistry()` in general library packages to avoid forcing a runtime dependency. Export raw dictionary objects instead.

**Do not rely on message matching when a stable code or name exists.** Message strings change across library versions; codes and names are generally more stable.

**Do not include internal error codes that are not meaningful to consumers.** Only register errors that consumers may realistically encounter and need to handle or display.

## Exceptions

Exceptions MUST follow `docs/docs-guidelines.md`.

A valid exception MUST name the package, the skipped rule, and why the package remains safe to publish.
