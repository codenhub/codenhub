# @codenhub/validation

Validation and primitive coercion helpers for TypeScript apps. Validators return a validation-owned result shape, so callers can handle invalid input without exceptions.

## Installation

```sh
pnpm add @codenhub/validation
```

## Usage

Validate unknown boundary input with `val` and convert primitive values with `coerce` when input arrives as strings, environment values, form values, or query params.

```ts
import { coerce, val, type ValidationResult } from "@codenhub/validation";

const parsePort = (raw: unknown): ValidationResult<number> => {
  const port = coerce.int(raw, { path: ["port"] });

  if (!port.ok) return port;

  return val.number(port.value, { path: ["port"] }).port();
};

const result = parsePort("3000");

if (result.ok) {
  console.log(result.value);
} else {
  console.error(result.error.message);
}
```

## Reference

### `@codenhub/validation`

Primary entrypoint for validation, coercion, custom validators, and result helpers.

```ts
import {
  coerce,
  custom,
  err,
  ok,
  parseResult,
  type ArrayValidators,
  type NumberValidators,
  type ObjectValidators,
  type PlainObject,
  type StringValidators,
  val,
  type ValidationErr,
  type ValidationError,
  type ValidationErrorCode,
  type ValidationErrorInput,
  type ValidationErrorOptions,
  type ValidationIssue,
  type ValidationOk,
  type ValidationOptions,
  type ValidationPathSegment,
  type ValidationResult,
} from "@codenhub/validation";
```

Supported import paths:

| Path                   | Description                                 |
| ---------------------- | ------------------------------------------- |
| `@codenhub/validation` | Validation, coercion, and result utilities. |

#### `ValidationResult<T>`

Represents success or validation failure without throwing.

```ts
type ValidationResult<T> = ValidationOk<T> | ValidationErr;

interface ValidationOk<T> {
  ok: true;
  value: T;
}

interface ValidationErr {
  ok: false;
  error: ValidationError;
}
```

#### `ValidationError`

Plain object describing why validation failed.

```ts
interface ValidationError {
  code: ValidationErrorCode;
  message: string;
  path: readonly ValidationPathSegment[];
  input?: unknown;
  expected?: string;
  received?: string;
  issues?: readonly ValidationIssue[];
}

type ValidationErrorCode =
  | "invalid_type"
  | "invalid_value"
  | "invalid_format"
  | "too_small"
  | "too_big"
  | "missing_key"
  | "custom";

type ValidationPathSegment = string | number;

interface ValidationIssue {
  code: ValidationErrorCode;
  message: string;
  path: readonly ValidationPathSegment[];
  input?: unknown;
  expected?: string;
  received?: string;
}
```

`path` points to the invalid value. `input` is included only when requested through validation options.

#### `ValidationOptions`

Common options accepted by validators and coercers.

```ts
interface ValidationOptions {
  path?: readonly ValidationPathSegment[];
  includeInput?: boolean;
}
```

#### `ok()`

Creates a successful validation result.

```ts
function ok<T>(value: T): ValidationOk<T>;
```

#### `err()`

Creates a failed validation result.

```ts
function err(error: ValidationErrorInput): ValidationErr;

type ValidationErrorInput = string | ValidationIssue | ValidationErrorOptions;

interface ValidationErrorOptions {
  code?: ValidationErrorCode;
  message: string;
  path?: readonly ValidationPathSegment[];
  input?: unknown;
  expected?: string;
  received?: string;
  issues?: readonly ValidationIssue[];
}
```

String input uses `code: "custom"` and an empty path.

#### `parseResult()`

Normalizes unknown validator output into `ValidationResult<T>`.

```ts
function parseResult<T>(value: unknown): ValidationResult<T>;
```

Accepted input:

| Input shape              | Output                                             |
| ------------------------ | -------------------------------------------------- |
| `{ ok: true, value }`    | Success result.                                    |
| `{ ok: false, error }`   | Failure with normalized `ValidationError`.         |
| `ValidationErrorOptions` | Failure result.                                    |
| `Error`                  | Failure with `code: "custom"` and `message`.       |
| `string`                 | Failure with `code: "custom"` and `message`.       |
| Anything else            | Failure with `code: "custom"` and generic message. |

#### `val`

Validation factory for common string, number, object, and array checks.

```ts
const val: {
  string(value: unknown, options?: ValidationOptions): StringValidators;
  number(value: unknown, options?: ValidationOptions): NumberValidators;
  object(value: unknown, options?: ValidationOptions): ObjectValidators;
  array<T = unknown>(value: unknown, options?: ValidationOptions): ArrayValidators<T>;
};
```

Validators return `ValidationResult<T>` and do not throw for invalid input.

All validator factories accept `unknown` input. If the input has the wrong base type, every method on the returned validator object returns the same `ValidationErr` with `code: "invalid_type"`, the provided `path`, and the original `input` only when `includeInput` is enabled.

#### Validator Types

Validator interfaces describe the method sets returned by `val` factories. They are exported for callers that need to type reusable validators or function boundaries.

```ts
type PlainObject = Record<string, unknown>;

interface StringValidators { ... }
interface NumberValidators { ... }
interface ObjectValidators { ... }
interface ArrayValidators<T> { ... }
```

| Type                 | Import path            | Purpose                                           |
| -------------------- | ---------------------- | ------------------------------------------------- |
| `StringValidators`   | `@codenhub/validation` | Return type for `val.string()`.                   |
| `NumberValidators`   | `@codenhub/validation` | Return type for `val.number()`.                   |
| `ObjectValidators`   | `@codenhub/validation` | Return type for `val.object()`.                   |
| `ArrayValidators<T>` | `@codenhub/validation` | Return type for `val.array<T>()`.                 |
| `PlainObject`        | `@codenhub/validation` | Plain object shape returned by object validators. |

##### `val.string()`

```ts
val.string(value: unknown, options?: ValidationOptions): StringValidators;
```

Creates validators for input that must be a string. Non-string input fails with `code: "invalid_type"`.

| Method                                                    | Success value                                                                  | Failure behavior                                                                                                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `email(options?: { allowPlus?: boolean })`                | Trimmed email with the host lowercased. `allowPlus` defaults to `true`.        | Returns `code: "invalid_format"` for invalid local parts, public hosts, length limits, or disallowed plus addressing.                                             |
| `url(options?: { forceHttps?: boolean })`                 | Normalized public HTTP(S) URL string. Missing protocol defaults to `https://`. | Returns `code: "invalid_format"` for invalid URLs, private/non-public host shapes, credentials, or HTTP when `forceHttps` is `true`.                              |
| `fileType(allowed: string[])`                             | Lowercase file extension without a leading dot.                                | Returns `code: "invalid_value"` when the allow list is empty after normalization, or `code: "invalid_format"` when the input extension is missing or not allowed. |
| `minLength(length: number, options?: { trim?: boolean })` | Original string, or trimmed string when `trim` is `true`.                      | Returns `code: "invalid_value"` for invalid limits, or `code: "too_small"` when shorter than `length`.                                                            |
| `maxLength(length: number, options?: { trim?: boolean })` | Original string, or trimmed string when `trim` is `true`.                      | Returns `code: "invalid_value"` for invalid limits, or `code: "too_big"` when longer than `length`.                                                               |
| `notEmpty(options?: { trim?: boolean })`                  | Original string, or trimmed string. `trim` defaults to `true`.                 | Returns `code: "too_small"` when the checked string is empty.                                                                                                     |
| `matches(pattern: RegExp, message?: string)`              | Original string.                                                               | Returns `code: "invalid_format"` with the provided message when the pattern does not match.                                                                       |

##### `val.number()`

```ts
val.number(value: unknown, options?: ValidationOptions): NumberValidators;
```

Creates validators for finite number input. Non-number and `NaN` input fails with `code: "invalid_type"`; non-finite numbers fail with `code: "invalid_value"` before method-specific checks run.

| Method                                           | Success value    | Failure behavior                                                                                                                    |
| ------------------------------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `positive()`                                     | Original number. | Returns `code: "invalid_value"` when the number is not greater than zero.                                                           |
| `negative()`                                     | Original number. | Returns `code: "invalid_value"` when the number is not less than zero.                                                              |
| `nonNegative()`                                  | Original number. | Returns `code: "invalid_value"` when the number is less than zero.                                                                  |
| `nonPositive()`                                  | Original number. | Returns `code: "invalid_value"` when the number is greater than zero.                                                               |
| `nonZero()`                                      | Original number. | Returns `code: "invalid_value"` when the number is zero.                                                                            |
| `int()`                                          | Original number. | Returns `code: "invalid_value"` when the number is not an integer.                                                                  |
| `safeInt()`                                      | Original number. | Returns `code: "invalid_value"` when the number is not a safe JavaScript integer.                                                   |
| `range(options: { min?: number; max?: number })` | Original number. | Returns `code: "invalid_value"` for invalid range configuration, `code: "too_small"` below `min`, or `code: "too_big"` above `max`. |
| `finite()`                                       | Original number. | Returns success because non-finite values fail before this method runs.                                                             |
| `port()`                                         | Original number. | Returns `code: "invalid_value"` unless the number is an integer from `1` through `65535`.                                           |

##### `val.object()`

```ts
val.object(value: unknown, options?: ValidationOptions): ObjectValidators;
```

Creates validators for plain objects, including null-prototype objects. Arrays, `null`, functions, and class instances fail with `code: "invalid_type"`.

| Method                             | Success value          | Failure behavior                                                                                                |
| ---------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| `plain()`                          | Original plain object. | Returns the base type failure for non-plain objects.                                                            |
| `hasKeys(keys: readonly string[])` | Original plain object. | Returns `code: "missing_key"` with the missing key appended to `path` when any required own property is absent. |

##### `val.array()`

```ts
val.array<T = unknown>(value: unknown, options?: ValidationOptions): ArrayValidators<T>;
```

Creates validators for array input. Non-array input fails with `code: "invalid_type"`.

| Method                      | Success value   | Failure behavior                                                                                           |
| --------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------- |
| `minLength(length: number)` | Original array. | Returns `code: "invalid_value"` for invalid limits, or `code: "too_small"` when the array has fewer items. |
| `maxLength(length: number)` | Original array. | Returns `code: "invalid_value"` for invalid limits, or `code: "too_big"` when the array has more items.    |
| `notEmpty()`                | Original array. | Returns `code: "too_small"` when the array is empty.                                                       |

#### `coerce`

Converts primitive input before validation.

```ts
const coerce: {
  int(value: unknown, options?: ValidationOptions): ValidationResult<number>;
  number(value: unknown, options?: ValidationOptions): ValidationResult<number>;
  bool(value: unknown, options?: ValidationOptions): ValidationResult<boolean>;
  string(value: unknown, options?: ValidationOptions): ValidationResult<string>;
};
```

Objects and functions are rejected. `null` and `undefined` are rejected by `coerce.string()`.

| Method                           | Success value          | Failure behavior                                                                                                                                                                               |
| -------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `coerce.int(value, options?)`    | Safe integer.          | Returns `code: "invalid_type"` for objects/functions, or `code: "invalid_format"` for non-decimal or unsafe integer input.                                                                     |
| `coerce.number(value, options?)` | Finite number.         | Returns `code: "invalid_type"` for objects/functions, or `code: "invalid_format"` for unsupported number strings such as exponent notation.                                                    |
| `coerce.bool(value, options?)`   | Boolean.               | Accepts booleans and `true`, `false`, `1`, `0`, `yes`, `no`, `on`, and `off` strings. Other primitive values return `code: "invalid_format"`; objects/functions return `code: "invalid_type"`. |
| `coerce.string(value, options?)` | Stringified primitive. | Returns `code: "invalid_type"` for `null`, `undefined`, objects, functions, or values that cannot be converted to strings.                                                                     |

#### `custom()`

Runs a custom validator and normalizes returned or thrown failures.

```ts
function custom<T>(
  value: unknown,
  validator: (value: unknown) => unknown,
  options?: ValidationOptions,
): ValidationResult<T>;
```

Thrown strings, `Error` objects, result-like objects, and validation error options become `ValidationErr`.

## Examples

### Validate Object Fields

```ts
import { err, val } from "@codenhub/validation";

const input = { email: "user@example.com", port: 3000 };
const email = val.string(input.email, { path: ["email"] }).email();
const port = val.number(input.port, { path: ["port"] }).port();

const issues = [];

for (const result of [email, port]) {
  if (!result.ok) issues.push(result.error);
}

const result = issues.length > 0 ? err({ message: "Invalid config", issues }) : port;
```

### Custom Validator

```ts
import { custom, err, ok } from "@codenhub/validation";

const userId = custom("usr_123", (value) => {
  if (typeof value !== "string") return err({ code: "invalid_type", message: "Expected user id" });
  if (!value.startsWith("usr_")) return err({ code: "invalid_format", message: "Invalid user id" });

  return ok(value);
});
```

## Requirements

- TypeScript strict mode.
- ESM package.
- No runtime dependencies.
- Browser, Node, and SSR safe.

## Notes

- Validators return results instead of throwing for invalid input.
- Validation errors are plain serializable objects.
- `includeInput` should be used only when retaining the original input is safe for the caller.

## License

This project is licensed under the Apache License 2.0.
