# @codenhub/error

Typed error normalization and result-style control flow for TypeScript apps. The package starts with an empty error registry by default, so consumers opt into known-error mappings explicitly, including ready-made registries for common platform and library errors.

## Installation

```sh
pnpm add @codenhub/error
```

## Usage

Configure the app-level `AppError.registry` during initialization, then normalize thrown or returned unknown values into a predictable error shape.

```ts
import { AppError, err, ok, type Result } from "@codenhub/error";

AppError.registry.codes.add("invalid_credentials", {
  message: "Invalid email or password.",
  messageKey: "error.auth.invalidCredentials",
  source: "auth",
});

const signIn = async (): Promise<Result<string>> => {
  try {
    return ok("user-id");
  } catch (error) {
    return err(error);
  }
};

const appError = new AppError({ code: "invalid_credentials" });

console.log(appError.message, appError.messageKey);
```

Ready registries are opt-in. Merge them into an app-owned registry when the app wants those classifications.

```ts
import { AppError } from "@codenhub/error";
import { browserErrorRegistry } from "@codenhub/error/registries/browser";
import { supabaseErrorRegistry } from "@codenhub/error/registries/supabase";

AppError.registry.merge(browserErrorRegistry);
AppError.registry.merge(supabaseErrorRegistry);
```

## Reference

### `@codenhub/error`

Primary entrypoint for app-owned registries, error normalization, and result helpers.

```ts
import {
  AppError,
  DEFAULT_APP_ERROR_MESSAGE,
  createErrorRegistry,
  err,
  ok,
  type AppErrorOptions,
  type ErrorFeedback,
  type ErrorRegistry,
  type Result,
} from "@codenhub/error";
```

Supported import paths:

| Path                                  | Description                                             |
| ------------------------------------- | ------------------------------------------------------- |
| `@codenhub/error`                     | Core error normalization, registry, and result helpers. |
| `@codenhub/error/registries`          | Index of opt-in ready registry presets.                 |
| `@codenhub/error/registries/browser`  | Browser and Web API error mappings.                     |
| `@codenhub/error/registries/supabase` | Supabase error mappings.                                |

#### `createErrorRegistry()`

Creates an empty isolated registry. This is also available as `AppError.createRegistry()`.

```ts
function createErrorRegistry(): ErrorRegistry;
```

Use isolated registries for tests, request scopes, tenant-specific mappings, or integrations where mappings should not use the app-level `AppError.registry`.

#### `ErrorRegistry`

Stores deterministic and heuristic mappings used by `AppError`.

```ts
interface ErrorRegistry {
  codes: ErrorRegistryBucket;
  names: ErrorRegistryBucket;
  messages: ErrorRegistryBucket;
  prefixes: ErrorPrefixRegistryBucket;
  patterns: ErrorPatternRegistryBucket;
  clear(): void;
  merge(registry: ErrorRegistry): void;
}
```

Code, name, exact message, and prefix matches are deterministic known errors. Pattern matches are heuristic and should be treated as unexpected errors with better user-facing feedback.

Registry buckets support adding one mapping at a time or a tuple list:

```ts
interface ErrorRegistryBucket {
  add(identifier: string, feedback: ErrorFeedback): void;
  addList(entries: readonly (readonly [identifier: string, feedback: ErrorFeedback])[]): void;
  clear(): void;
  get(identifier: string): ErrorFeedback | undefined;
}

interface ErrorPatternRegistryBucket {
  add(pattern: RegExp, feedback: ErrorFeedback): void;
  addList(entries: readonly (readonly [pattern: RegExp, feedback: ErrorFeedback])[]): void;
  clear(): void;
}
```

#### `AppError`

Normalizes an unknown value into a predictable error object. By default, it classifies errors with `AppError.registry`.

```ts
class AppError extends Error {
  static readonly registry: ErrorRegistry;

  static createRegistry(): ErrorRegistry;

  readonly type: "known" | "unexpected" | "unknown";
  readonly message: string;
  readonly messageKey: string | null;
  readonly source: string | null;
  readonly originalError: unknown;
  readonly retryable: boolean;

  constructor(error: unknown, options?: AppErrorOptions);
}
```

`AppError` does not throw during construction. If no registry mapping matches, it uses `DEFAULT_APP_ERROR_MESSAGE` or `fallbackMessage` and classifies the value as `"unknown"`.

#### `AppErrorOptions`

```ts
interface AppErrorOptions {
  fallbackMessage?: string;
  registry?: ErrorRegistry;
}
```

| Option            | Type            | Default                     | Description                                   |
| ----------------- | --------------- | --------------------------- | --------------------------------------------- |
| `fallbackMessage` | `string`        | `DEFAULT_APP_ERROR_MESSAGE` | Message used when no mapping matches.         |
| `registry`        | `ErrorRegistry` | `AppError.registry`         | Registry used to classify the provided error. |

#### `ok()`

Creates a successful result.

```ts
function ok<T>(value: T): { ok: true; value: T };
```

#### `err()`

Creates a failed result containing an `AppError`.

```ts
function err(error: unknown, options?: AppErrorOptions): { ok: false; error: AppError };
```

String errors are also used as the fallback message, so `err("Missing user id")` produces that message when no registry entry matches.

#### `Result<T>`

Represents success or failure without exceptions.

```ts
type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };
```

### `@codenhub/error/registries`

Index entrypoint for ready registry presets.

```ts
import { browserErrorRegistry, supabaseErrorRegistry } from "@codenhub/error/registries";
```

Ready registries are plain `ErrorRegistry` values intended to be merged into `AppError.registry` or another app-owned registry. Importing a preset does not mutate `AppError.registry`.

### `@codenhub/error/registries/browser`

Browser and Web API error mappings.

```ts
import { browserErrorRegistry } from "@codenhub/error/registries/browser";
```

Use this preset when normalizing `DOMException`, fetch, storage, abort, permissions, quota, and other browser API errors.

### `@codenhub/error/registries/supabase`

Supabase error mappings.

```ts
import { supabaseErrorRegistry } from "@codenhub/error/registries/supabase";
```

Use this preset when normalizing Supabase Auth, PostgREST, Storage, Realtime, and Edge Functions errors.

## Examples

### Isolate Tests

```ts
import { createErrorRegistry, err } from "@codenhub/error";

const errors = createErrorRegistry();

errors.names.add("AbortError", {
  message: "Request cancelled.",
  source: "browser",
});

const result = err(new DOMException("Aborted", "AbortError"), { registry: errors });
```

### Merge Presets

```ts
import { AppError } from "@codenhub/error";
import { browserErrorRegistry, supabaseErrorRegistry } from "@codenhub/error/registries";

AppError.registry.merge(browserErrorRegistry);
AppError.registry.merge(supabaseErrorRegistry);
```

### Add Multiple Mappings

```ts
import { AppError } from "@codenhub/error";

AppError.registry.codes.addList([
  ["invalid_credentials", { message: "Invalid email or password.", source: "auth" }],
  ["email_not_confirmed", { message: "Email address is not confirmed.", source: "auth" }],
]);
```

## Requirements

- TypeScript consumers should use `moduleResolution: "bundler"` or another resolver that understands package `exports`.
- The core API is intended to run in browsers, Node, SSR, workers, and edge runtimes.
- Browser-specific registry presets may reference browser error names and messages, but importing them must not require browser globals to exist.
- The package has no runtime dependencies.

## Notes

- Registries are opt-in by design. Consumers start from a blank registry to avoid hidden global classifications.
- Registries, including `AppError.registry` and ready registry presets, are currently mutable. Configure shared registries during app initialization and avoid mutating imported presets at runtime. A future version is expected to provide stronger mutation safeguards.
- Preset registries should prefer stable error codes or names over message matching when a library provides them.
