# @codenhub/helpers

Small TypeScript helpers for app errors, result-style control flow, validation, and primitive coercion.

## Install

```sh
pnpm add @codenhub/helpers
```

## Imports

```ts
import { AppError, coerce, err, ok, val } from "@codenhub/helpers";
import { AppErrorRegistry } from "@codenhub/helpers/error";
import { type Result } from "@codenhub/helpers/result";
import { custom } from "@codenhub/helpers/validation";
```

Supported import paths:

| Path                           | Description                                      |
| ------------------------------ | ------------------------------------------------ |
| `@codenhub/helpers`            | Root export for all public helpers.              |
| `@codenhub/helpers/error`      | `AppError`, error registry, and error types.     |
| `@codenhub/helpers/result`     | `Result`, `ok()`, and `err()`.                   |
| `@codenhub/helpers/validation` | `val`, `coerce`, `custom()`, and result exports. |

## Quick Start

```ts
import { coerce, err, ok, val, type Result } from "@codenhub/helpers";

const parsePort = (raw: unknown): Result<number> => {
  const port = coerce.int(raw);

  if (!port.ok) return err(port.error);

  return val.number(port.value).port();
};

const result = parsePort("3000");

if (result.ok) {
  console.log(result.value);
} else {
  console.error(result.error.message);
}
```

## API Reference

### `AppError`

Normalizes unknown errors into a predictable app error shape.

```ts
class AppError extends Error {
  readonly type: "known" | "unexpected" | "unknown";
  readonly message: string;
  readonly messageKey: string | null;
  readonly source: string | null;
  readonly originalError: unknown;
  readonly retryable: boolean;

  constructor(error: unknown, options?: AppErrorOptions);
}
```

Import from `@codenhub/helpers` or `@codenhub/helpers/error`.

| Parameter | Type              | Description                         |
| --------- | ----------------- | ----------------------------------- |
| `error`   | `unknown`         | Error value to normalize.           |
| `options` | `AppErrorOptions` | Optional fallback message settings. |

`AppError` does not throw during construction. Unknown errors use `DEFAULT_APP_ERROR_MESSAGE` unless `fallbackMessage` is provided.

### `AppErrorRegistry`

Global registry used by `AppError` to classify known and unexpected errors.

```ts
const AppErrorRegistry: {
  codes: { add(identifier: string, feedback: ErrorFeedback): void; clear(): void };
  names: { add(identifier: string, feedback: ErrorFeedback): void; clear(): void };
  messages: { add(identifier: string, feedback: ErrorFeedback): void; clear(): void };
  prefixes: { add(prefix: string, feedback: ErrorFeedback): void; clear(): void };
  patterns: { add(pattern: RegExp, feedback: ErrorFeedback): void; clear(): void };
  clear(): void;
};
```

Import from `@codenhub/helpers` or `@codenhub/helpers/error`.

Registry buckets support `add()` and `clear()`. Code, name, exact message, and prefix matches become `known`; pattern matches become `unexpected` because they are heuristic.

```ts
import { AppError, AppErrorRegistry } from "@codenhub/helpers/error";

AppErrorRegistry.codes.add("invalid_credentials", {
  message: "Invalid email or password.",
  messageKey: "error.auth.invalidCredentials",
  source: "auth",
});

const error = new AppError({ code: "invalid_credentials" });

console.log(error.type, error.messageKey);
```

### `DEFAULT_APP_ERROR_MESSAGE`

Default message used when `AppError` cannot classify an unknown error.

```ts
const DEFAULT_APP_ERROR_MESSAGE = "An unexpected error occurred.";
```

Import from `@codenhub/helpers` or `@codenhub/helpers/error`.

### Error Types

Types exported by `@codenhub/helpers` and `@codenhub/helpers/error`.

```ts
interface AppErrorOptions {
  fallbackMessage?: string;
}

type AppErrorType = "known" | "unexpected" | "unknown";
type AppErrorSource = string | null;

interface ErrorFeedback {
  message: string;
  messageKey?: string;
  source?: string;
  retryable?: boolean;
}
```

### `ok()`

Creates a successful result.

```ts
function ok<T>(value: T): Ok<T>;
```

Import from `@codenhub/helpers`, `@codenhub/helpers/result`, or `@codenhub/helpers/validation`.

### `err()`

Creates a failed result with an `AppError`.

```ts
function err(error: unknown, options?: AppErrorOptions): Err;
```

Import from `@codenhub/helpers`, `@codenhub/helpers/result`, or `@codenhub/helpers/validation`.

String errors are also used as the fallback message, so `err("Missing user id")` produces that message when no registry entry matches.

### `Result<T>`

Represents success or failure without exceptions.

```ts
type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };
```

Import from `@codenhub/helpers`, `@codenhub/helpers/result`, or `@codenhub/helpers/validation`.

`Ok<T>` is the success branch of `Result<T>`. `Err` is the failure branch with an `AppError`.

### `val`

Validation factory for common string, number, object, and array checks.

```ts
const val: {
  string(value: unknown): StringValidators;
  number(value: unknown): NumberValidators;
  object(value: unknown): ObjectValidators;
  array<T = unknown>(value: unknown): ArrayValidators<T>;
};
```

Import from `@codenhub/helpers` or `@codenhub/helpers/validation`.

Validators return `Result<T>` and do not throw for invalid input.

| Validator      | Methods                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------- |
| `val.string()` | `email()`, `url()`, `fileType()`, `minLength()`, `maxLength()`, `notEmpty()`, `matches()`    |
| `val.number()` | `positive()`, `negative()`, `nonNegative()`, `nonPositive()`, `nonZero()`, `int()`, `port()` |
| `val.number()` | `safeInt()`, `range()`, `finite()`                                                           |
| `val.object()` | `plain()`, `hasKeys()`                                                                       |
| `val.array()`  | `minLength()`, `maxLength()`, `notEmpty()`                                                   |

### `coerce`

Converts primitive input before validation.

```ts
const coerce: {
  int(value: unknown): Result<number>;
  number(value: unknown): Result<number>;
  bool(value: unknown): Result<boolean>;
  string(value: unknown): Result<string>;
};
```

Import from `@codenhub/helpers` or `@codenhub/helpers/validation`.

Objects and functions are rejected. `null` and `undefined` are rejected by `coerce.string()`.

### `custom()`

Runs a custom validator and converts thrown errors into failed results.

```ts
function custom<T>(value: unknown, fn: (value: unknown) => Result<T>): Result<T>;
```

Import from `@codenhub/helpers` or `@codenhub/helpers/validation`.

## Examples

### Normalize External Errors

```ts
import { AppError, AppErrorRegistry } from "@codenhub/helpers/error";

AppErrorRegistry.patterns.add(/network|fetch/i, {
  message: "Connection failed. Try again.",
  source: "network",
  retryable: true,
});

const error = new AppError(new Error("Failed to fetch"));

console.log(error.message, error.retryable);
```

### Validate Boundary Input

```ts
import { coerce, val } from "@codenhub/helpers/validation";

const rawPort = process.env.PORT;
const port = coerce.int(rawPort);

if (port.ok) {
  const validPort = val.number(port.value).port();

  if (!validPort.ok) throw validPort.error;
}
```

## Runtime Requirements

- Framework-agnostic TypeScript.
- No browser, DOM, storage, network, or Node-only runtime requirement.
- Uses built-in JavaScript APIs such as `Error`, `Map`, `RegExp`, `URL`, and `Object.hasOwn`.

## Limitations And Non-Goals

- Does not replace schema validators or form libraries.
- Does not validate data automatically; call validators at input boundaries.
- Does not provide logging, telemetry, or user-facing i18n.
- Does not decide whether `originalError` is safe to log or show to users.
