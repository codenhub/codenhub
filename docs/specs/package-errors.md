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

## Providing a registry preset

Packages that have well-known, stable errors SHOULD ship a frozen registry preset as a named export.

```ts
import { createErrorRegistry, freezeRegistry } from "@codenhub/error";

const registry = createErrorRegistry();

registry.codes.addList([
  ["error_code", { message: "Human-readable message.", source: "package-name" }],
]);

export const myPackageErrorRegistry = freezeRegistry(registry);
```

**Naming convention:** `<camelCasePackageName>ErrorRegistry`.

The preset MUST be frozen with `freezeRegistry` before exporting. This prevents consumers from accidentally mutating a shared object.

The preset export MUST be placed in a dedicated subpath export (e.g. `@codenhub/my-package/error-registry`) if the package already has a primary entrypoint unrelated to error handling. This keeps the main entrypoint lean and avoids pulling in error handling dependencies when not needed.

Importing a preset MUST NOT mutate the global registry. Consumers opt in explicitly by calling `registry.merge(myPackageErrorRegistry)`.

Importing a preset MUST NOT require network calls, service credentials, or runtime environment globals.

## Choosing the right bucket

Use the bucket that matches the most stable identifier available for the error:

| Bucket       | Use when                                                                                                    | Examples                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `codes`      | The error source provides a stable machine-readable code (string or number) alongside the message.         | `"invalid_credentials"`, `"23505"`, `"ENOENT"`   |
| `names`      | The error has a stable `.name` property (native Error subclasses, SDK errors with named constructors).     | `"AbortError"`, `"FunctionsHttpError"`            |
| `messages`   | No code or name is available, but the message is exact and stable across versions.                          | `"fetch failed"` (avoid when possible)            |
| `prefixes`   | The message starts with a stable prefix but varies afterward.                                               | `"Upload failed:"`, `"RLS violation on table"`    |
| `patterns`   | The error can only be identified heuristically. Results are classified as `"unexpected"`, not `"known"`.   | `/connection timed out/i`, `/rate limit/i`        |

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

| Should be retryable | Should NOT be retryable |
| ------------------- | ----------------------- |
| Network timeouts    | Auth failures           |
| Rate limit (with backoff) | Permission denied  |
| Transient service errors (5xx) | Validation errors |
| DNS failures        | Unique constraint violations |

When in doubt, omit `isRetryable` (defaults to `false`). Do not mark an error as retryable speculatively.

## Using `Result<T>` for fallible public APIs

Public package functions that can fail SHOULD return `Result<T>` instead of throwing, when:
- The failure is a predictable domain error (not a programming mistake)
- The caller is expected to handle the error path explicitly

```ts
import { ok, err, type Result } from "@codenhub/error";

export async function uploadFile(file: File): Promise<Result<string>> {
  try {
    const url = await doUpload(file);
    return ok(url);
  } catch (error) {
    return err(error);
  }
}
```

Do NOT use `Result<T>` for programmer errors (invalid arguments, assertion failures). Those should throw.

Do NOT mix `Result<T>` and thrown errors for the same failure category within the same API surface.

## Anti-patterns

**Do not mutate the global registry from library code.** Packages MUST NOT call `getErrorRegistry()` or `setErrorRegistry()` at module load time or inside exported functions. Only application-level code should configure the global registry.

```ts
// Wrong — mutates the global registry on import
import { getErrorRegistry } from "@codenhub/error";
getErrorRegistry().codes.add("my_error", { message: "Error." });

// Correct — export a frozen preset; let consumers opt in
export const myPackageErrorRegistry = freezeRegistry(registry);
```

**Do not ship unfrozen registry presets.** Consumers should not be able to mutate a shared preset object.

**Do not rely on message matching when a stable code or name exists.** Message strings change across library versions; codes and names are generally more stable.

**Do not include internal error codes that are not meaningful to consumers.** Only register errors that consumers may realistically encounter and need to handle or display.

## Exceptions

Exceptions MUST follow `docs/docs-guidelines.md`.

A valid exception MUST name the package, the skipped rule, and why the package remains safe to publish.
