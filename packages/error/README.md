# @codenhub/error

Typed error normalization and result-style control flow for TypeScript apps. The package starts with an empty error registry by default, so consumers opt into known-error mappings explicitly, including ready-made registries for common platform and library errors.

## Installation

```sh
pnpm add @codenhub/error
```

## Usage

Configure the app-level global registry retrieved by `getErrorRegistry()` during initialization, then normalize thrown or returned unknown values into a predictable error shape using `createAppError()`.

```ts
import { createAppError, getErrorRegistry, err, ok, type Result } from "@codenhub/error";

getErrorRegistry().codes.add("invalid_credentials", {
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

const appError = createAppError({ code: "invalid_credentials" });

console.log(appError.message, appError.messageKey);
```

Ready registries are opt-in. Merge them into an app-owned registry when the app wants those classifications.

```ts
import { getErrorRegistry } from "@codenhub/error";
import { browserErrorRegistry } from "@codenhub/error/registries/browser";
import { supabaseErrorRegistry } from "@codenhub/error/registries/supabase";

getErrorRegistry().merge(browserErrorRegistry);
getErrorRegistry().merge(supabaseErrorRegistry);
```

## Reference

### `@codenhub/error`

Primary entrypoint for app-owned registries, error normalization, and result helpers.

```ts
import {
  createAppError,
  isAppError,
  DEFAULT_APP_ERROR_MESSAGE,
  createErrorRegistry,
  getErrorRegistry,
  setErrorRegistry,
  freezeRegistry,
  err,
  ok,
  type AppError,
  type AppErrorOptions,
  type AppErrorSource,
  type AppErrorType,
  type Err,
  type ErrorFeedback,
  type ErrorPatternDefinition,
  type ErrorPatternRegistryBucket,
  type ErrorPrefixDefinition,
  type ErrorPrefixRegistryBucket,
  type ErrorRegistry,
  type ErrorRegistryBucket,
  type Ok,
  type ReadonlyErrorRegistry,
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

#### `createAppError()`

Normalizes an unknown value into a predictable `AppError` object. By default, it classifies errors with the active global error registry.

```ts
function createAppError(error: unknown, options?: AppErrorOptions): AppError;
```

If no registry mapping matches, it uses `DEFAULT_APP_ERROR_MESSAGE` or `fallbackMessage` and classifies the value as `"unknown"`.

#### `isAppError()`

Type guard to check if a value is a normalized `AppError`.

```ts
function isAppError(value: unknown): value is AppError;
```

#### `AppError` Interface

Predictable normalized error shape extending the native `Error` class.

```ts
interface AppError extends Error {
  readonly type: "known" | "unexpected" | "unknown";
  readonly message: string;
  readonly messageKey: string | null;
  readonly source: string | null;
  readonly originalError: unknown;
  readonly isRetryable: boolean;
}
```

#### `getErrorRegistry()`

Retrieves the active global error registry.

```ts
function getErrorRegistry(): ErrorRegistry;
```

#### `setErrorRegistry()`

Sets the active global error registry.

```ts
function setErrorRegistry(registry: ErrorRegistry): void;
```

#### `createErrorRegistry()`

Creates an empty isolated registry.

```ts
function createErrorRegistry(presets?: readonly (ErrorRegistry | ReadonlyErrorRegistry)[]): ErrorRegistry;
```

Use isolated registries for tests, request scopes, tenant-specific mappings, or integrations where mappings should not use the active global registry.

#### `freezeRegistry()`

Wraps an ErrorRegistry in a read-only Proxy to prevent future mutations.

```ts
function freezeRegistry(registry: ErrorRegistry): ReadonlyErrorRegistry;
```

#### `DEFAULT_APP_ERROR_MESSAGE`

Default fallback message used when an error has no registry match and no `fallbackMessage` was provided.

```ts
const DEFAULT_APP_ERROR_MESSAGE = "An unexpected error occurred.";
```

#### `ErrorRegistry`

Stores deterministic and heuristic mappings used by `createAppError`.

```ts
interface ErrorRegistry {
  codes: ErrorRegistryBucket;
  names: ErrorRegistryBucket;
  messages: ErrorRegistryBucket;
  prefixes: ErrorPrefixRegistryBucket;
  patterns: ErrorPatternRegistryBucket;
  clear(): void;
  merge(registry: ErrorRegistry | ReadonlyErrorRegistry): void;
}
```

#### `ReadonlyErrorRegistry`

Read-only view of a registry returned by `freezeRegistry`. Exposes only the read-facing surface of each bucket. Pass it directly to `createErrorRegistry` presets or `merge`.

```ts
interface ReadonlyErrorRegistry {
  readonly codes: Pick<ErrorRegistryBucket, "get" | "values">;
  readonly names: Pick<ErrorRegistryBucket, "get" | "values">;
  readonly messages: Pick<ErrorRegistryBucket, "get" | "values">;
  readonly prefixes: Pick<ErrorPrefixRegistryBucket, "values">;
  readonly patterns: Pick<ErrorPatternRegistryBucket, "values">;
}
```

Code, name, exact message, and prefix matches are deterministic known errors. When multiple prefixes match the same message, the longest normalized prefix wins. Pattern matches are heuristic and should be treated as unexpected errors with better user-facing feedback.

The global error registry is mutable and starts empty. `createErrorRegistry()` creates another empty registry with the same bucket API.

Registry buckets support adding one mapping at a time or a tuple list:

```ts
interface ErrorRegistryBucket {
  add(identifier: string, feedback: ErrorFeedback): void;
  addList(entries: readonly (readonly [identifier: string, feedback: ErrorFeedback])[]): void;
  clear(): void;
  delete(identifier: string): boolean;
  get(identifier: string): ErrorFeedback | undefined;
  values(): IterableIterator<[string, ErrorFeedback]>;
}

interface ErrorPrefixRegistryBucket {
  add(prefix: string, feedback: ErrorFeedback): void;
  addList(entries: readonly (readonly [prefix: string, feedback: ErrorFeedback])[]): void;
  clear(): void;
  delete(prefix: string): boolean;
  values(): readonly ErrorPrefixDefinition[];
}

interface ErrorPatternRegistryBucket {
  add(pattern: RegExp, feedback: ErrorFeedback): void;
  addList(entries: readonly (readonly [pattern: RegExp, feedback: ErrorFeedback])[]): void;
  clear(): void;
  delete(pattern: RegExp): boolean;
  values(): readonly ErrorPatternDefinition[];
}
```

`values()` returns defensive copies. Pattern buckets clone `RegExp` values so global or sticky regex state does not leak across classifications.

`add()` and `addList()` validate entries immediately and throw `TypeError` for invalid input. Exact and prefix identifiers must be non-empty strings after trimming whitespace and trailing sentence punctuation. Exact identifiers are stored and looked up in that normalized form. Feedback must be an object with a non-empty `message`; optional `messageKey` and `source` values must be strings, and optional `isRetryable` must be a boolean. Pattern buckets only accept `RegExp` patterns.

#### `ErrorFeedback`

Feedback stored in registry buckets.

```ts
interface ErrorFeedback {
  message: string;
  messageKey?: string;
  source?: string;
  isRetryable?: boolean;
}
```

`message` should be safe to show to users. `messageKey`, `source`, and `isRetryable` are optional metadata copied onto matched `AppError` instances.

#### `ErrorPrefixDefinition` and `ErrorPatternDefinition`

Entries returned by `prefixes.values()` and `patterns.values()`.

```ts
interface ErrorPrefixDefinition extends ErrorFeedback {
  prefix: string;
}

interface ErrorPatternDefinition extends ErrorFeedback {
  pattern: RegExp;
}
```

Most consumers only need these when inspecting, copying, or testing registry contents.

#### `AppErrorType` and `AppErrorSource`

Reusable property types for consumers that store or pass around normalized error metadata.

```ts
type AppErrorType = "known" | "unexpected" | "unknown";
type AppErrorSource = string | null;
```

#### `AppErrorOptions`

```ts
interface AppErrorOptions {
  fallbackMessage?: string;
  registry?: ErrorRegistry;
  maxDepth?: number;
}
```

| Option            | Type            | Default           | Description                                                                           |
| ----------------- | --------------- | ----------------- | ------------------------------------------------------------------------------------- |
| `fallbackMessage` | `string`        | `DEFAULT_APP_...` | Message used when no mapping matches.                                                 |
| `registry`        | `ErrorRegistry` | Global registry   | Registry used to classify the provided error.                                         |
| `maxDepth`        | `number`        | `3`               | Maximum depth when unwrapping nested error wrappers (`cause`, `originalError`, etc.). |

#### `ok()`

Creates a successful result.

```ts
function ok<T>(value: T): { ok: true; value: T };
```

The returned shape is also exported as `Ok<T>`.

#### `err()`

Creates a failed result containing an `AppError`.

```ts
function err(error: unknown, options?: AppErrorOptions): { ok: false; error: AppError };
```

String errors are also used as the fallback message, so `err("Missing user id")` produces that message when no registry entry matches.

The returned shape is also exported as `Err`.

#### `Result<T>`

Represents success or failure without exceptions.

```ts
type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };
```

#### `unwrap()`

Unwraps a `Result`, returning the value if successful, or throwing the normalized `AppError` if failed.

```ts
function unwrap<T>(result: Result<T>): T;
```

#### `map()`

Maps the success value of a `Result` using the provided mapper function.

```ts
function map<T, U>(result: Result<T>, mapper: (value: T) => U): Result<U>;
```

#### `match()`

Pattern matches on a `Result`, executing the corresponding callback based on the outcome.

```ts
function match<T, U>(
  result: Result<T>,
  callbacks: {
    readonly onOk: (value: T) => U;
    readonly onErr: (error: AppError) => U;
  },
): U;
```

### `@codenhub/error/registries`

Index entrypoint for ready registry presets.

```ts
import { browserErrorRegistry, supabaseErrorRegistry } from "@codenhub/error/registries";
```

Ready registries are plain `ErrorRegistry` values intended to be merged into the global registry or another app-owned registry. Importing a preset does not mutate the global registry.

The preset registry objects are frozen and read-only. Merge them into an app-owned registry before adding app-specific mappings.

### `@codenhub/error/registries/browser`

Browser and Web API error mappings.

```ts
import { browserErrorRegistry } from "@codenhub/error/registries/browser";
```

Use this preset when normalizing `DOMException`, fetch, storage, abort, permissions, quota, and other browser API errors.

Importing this preset does not require `window`, `document`, `DOMException`, or other browser globals to exist.

### `@codenhub/error/registries/supabase`

Supabase error mappings.

```ts
import { supabaseErrorRegistry } from "@codenhub/error/registries/supabase";
```

Use this preset when normalizing Supabase Auth, PostgREST, Storage, Realtime, and Edge Functions errors.

Importing this preset only creates static error mappings. It does not contact Supabase services or require Supabase client packages.

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
import { getErrorRegistry } from "@codenhub/error";
import { browserErrorRegistry, supabaseErrorRegistry } from "@codenhub/error/registries";

getErrorRegistry().merge(browserErrorRegistry);
getErrorRegistry().merge(supabaseErrorRegistry);
```

### Add Multiple Mappings

```ts
import { getErrorRegistry } from "@codenhub/error";

getErrorRegistry().codes.addList([
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
- The global error registry is mutable. Ready registry presets are frozen and read-only. Configure registries during app initialization.
- Preset registries should prefer stable error codes or names over message matching when a library provides them.

## License

This project is licensed under the [Apache-2.0](LICENSE) license.
