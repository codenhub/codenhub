---
title: Validators
---

# Validator Reference

The `val` object provides declarative schema builders for primitive values, complex structures, unions, and custom constraints. Every schema extends `BaseValidator` and provides validation methods (`.validate()`, `.validateAsync()`, `.parse()`, `.parseAsync()`, `.is()`), modifiers (`.optional()`, `.nullable()`, `.nullish()`, `.default()`, `.catch()`), and customization methods (`.refine()`, `.refineAsync()`, `.check()`, `.superRefine()`, `.transform()`, `.transformAsync()`, `.pipe()`, `.and()`).

## Strings

`val.string()` returns a `StringValidator`. Non-string input fails with `code: "invalid_type"`.

| Method                         | Description                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| `min(length, message?)`        | Enforces minimum string character length (`too_small`).                                             |
| `max(length, message?)`        | Enforces maximum string character length (`too_big`).                                               |
| `length(length, message?)`     | Enforces exact string length (`too_small` / `too_big`).                                             |
| `nonEmpty(message?)`           | Requires length > 0 (`too_small`).                                                                  |
| `email(options?, message?)`    | Validates public email address format (`invalid_format`). Supports `{ allowPlus: boolean }`.        |
| `url(options?, message?)`      | Normalizes and validates public HTTP(S) URL (`invalid_format`). Supports `{ forceHttps: boolean }`. |
| `uuid(message?)`               | Validates RFC 9562 UUID string (`invalid_format`).                                                  |
| `regex(pattern, message?)`     | Tests against a `RegExp` pattern (`invalid_format`). Alias: `matches`.                              |
| `startsWith(prefix, message?)` | Enforces required string prefix (`invalid_format`).                                                 |
| `endsWith(suffix, message?)`   | Enforces required string suffix (`invalid_format`).                                                 |
| `includes(search, message?)`   | Enforces substring presence (`invalid_format`).                                                     |
| `fileType(allowed, message?)`  | Validates file extension against an allow list (`invalid_format`).                                  |
| `ip(options?, message?)`       | Validates IPv4 and/or IPv6 address (`invalid_format`). Supports `{ version: "v4" \| "v6" }`.        |
| `datetime(options?, message?)` | Validates ISO 8601 string (`invalid_format`). Supports `{ offset?: boolean; precision?: number }`.  |
| `base64(message?)`             | Validates standard Base64 string (`invalid_format`).                                                |
| `cuid2(message?)`              | Validates CUID2 identifier format (`invalid_format`).                                               |
| `json(schema?, message?)`      | Parses string as JSON and optionally validates against a nested schema.                             |
| `trim()`                       | Transformation trimming leading and trailing whitespace.                                            |
| `toLowerCase()`                | Transformation lowercasing the string.                                                              |
| `toUpperCase()`                | Transformation uppercasing the string.                                                              |

## Numbers

`val.number()` returns a `NumberValidator`. Rejects non-numbers, `NaN`, and non-finite input.

| Method                            | Description                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| `clamp(min, max)`                 | Transforms number by clamping between `min` and `max` bounds.                        |
| `min(min, message?)`              | Enforces minimum value, inclusive (`too_small`). Alias: `gte`.                       |
| `max(max, message?)`              | Enforces maximum value, inclusive (`too_big`). Alias: `lte`.                         |
| `gt(limit, message?)`             | Enforces strictly greater than limit (`too_small`).                                  |
| `lt(limit, message?)`             | Enforces strictly less than limit (`too_big`).                                       |
| `range({ min?, max? }, message?)` | Enforces inclusive range bounds (`too_small` / `too_big`).                           |
| `int(message?)`                   | Enforces integer value (`invalid_value`).                                            |
| `safeInt(message?)`               | Enforces safe integer value within `Number.MIN_SAFE_INTEGER` and `MAX_SAFE_INTEGER`. |
| `positive(message?)`              | Requires number > 0 (`invalid_value`).                                               |
| `negative(message?)`              | Requires number < 0 (`invalid_value`).                                               |
| `nonNegative(message?)`           | Requires number >= 0 (`invalid_value`).                                              |
| `nonPositive(message?)`           | Requires number <= 0 (`invalid_value`).                                              |
| `nonZero(message?)`               | Requires number !== 0 (`invalid_value`).                                             |
| `multipleOf(step, message?)`      | Enforces number is a multiple of step (`invalid_value`).                             |
| `port(message?)`                  | Requires integer between 1 and 65535 (`invalid_value`).                              |
| `finite(message?)`                | Requires finite number.                                                              |

## Booleans

`val.boolean()` returns a `BooleanValidator`. Rejects non-boolean input with `invalid_type`.

| Method            | Description                                 |
| ----------------- | ------------------------------------------- |
| `true(message?)`  | Requires literal `true` (`invalid_value`).  |
| `false(message?)` | Requires literal `false` (`invalid_value`). |

## Dates

`val.date()` returns a `DateValidator`. Rejects non-Date instances and invalid dates with `NaN` timestamp.

| Method                   | Description                                        |
| ------------------------ | -------------------------------------------------- |
| `min(minDate, message?)` | Requires date on or after `minDate` (`too_small`). |
| `max(maxDate, message?)` | Requires date on or before `maxDate` (`too_big`).  |

## Literals & Enums

- `val.literal(value, message?)`: Requires exact equality (`===`) with a string, number, or boolean literal.
- `val.enum(values, message?)`: Accepts an array or tuple of allowed string or number values (`invalid_value`).
- `val.nativeEnum(enumObj, message?)`: Matches values from a TypeScript runtime enum or `as const` object map:

```ts
enum Role {
  Admin = "ADMIN",
  User = "USER",
}
const roleSchema = val.nativeEnum(Role);
```

## Primitives

Schema builders for primitive edge cases:

- `val.null(message?)`: Strictly matches `null`.
- `val.undefined(message?)`: Strictly matches `undefined`.
- `val.void(message?)`: Matches `void` (accepts `undefined`).
- `val.never(message?)`: Unconditionally fails validation.

```ts
const nullableString = val.union([val.string(), val.null()]);
```

## Any & Unknown

- `val.any()`: Accepts any input, typed as `any`.
- `val.unknown()`: Accepts any input, typed as `unknown`.

## Objects

`val.object(shape?)` creates an `ObjectValidator` that validates plain object shapes. Calling `val.object()` or `val.object({})` constructs an empty schema validator. Nested objects and properties validate recursively with full path reporting.

- `strict(message?)`: Rejects objects containing unknown keys (`invalid_value`).
- `passthrough()`: Preserves unknown keys in output.
- `strip()`: Strips unknown keys (default behavior).
- `extend(extraShape)`: Merges property schemas into a new object validator.
- `merge(other)`: Merges another `ObjectValidator` into this one.
- `pick(keys)`: Creates a new schema retaining only the specified keys.
- `omit(keys)`: Creates a new schema omitting the specified keys.
- `partial()`: Creates a new schema where top-level properties are optional.
- `deepPartial()`: Creates a new schema where all properties and nested object properties are recursively optional.
- `keyof()`: Creates an `EnumValidator` matching the shape's property keys.

```ts
const baseUser = val.object({ name: val.string(), email: val.string().email() });
const partialUser = baseUser.partial();
const strictUser = baseUser.strict();
```

## Arrays

`val.array(elementValidator?)` creates an `ArrayValidator`. When an element validator is supplied, each item is validated and element issues record child indices (`path: ["items", 0]`).

- `min(length, message?)`: Minimum item count (`too_small`).
- `max(length, message?)`: Maximum item count (`too_big`).
- `length(length, message?)`: Exact item count.
- `nonEmpty(message?)`: Requires at least one element (`too_small`).
- `unique(keySelector?, message?)`: Enforces element uniqueness (by value equality or key selector).

```ts
const tagsSchema = val.array(val.string().min(1)).min(1).max(5).unique();
```

## Records, Tuples, and Unions

- `val.record(valueValidator, keyValidator?)`: Validates arbitrary key-value dictionaries:
  ```ts
  const scores = val.record(val.number().int());
  ```
- `val.tuple([v1, v2, ...])`: Validates fixed-length arrays where each element matches its positional validator:
  ```ts
  const coord = val.tuple([val.number(), val.number()]).rest(val.string());
  ```
- `val.union([v1, v2, ...])`: Validates that at least one branch succeeds. If all branches fail, combines branch issues into a failure.
- `val.discriminatedUnion(discriminatorKey, variants)`: Fast O(1) indexed variant lookup based on a literal discriminator property:
  ```ts
  const messageSchema = val.discriminatedUnion("kind", [val.object({ kind: val.literal("text"), body: val.string() }), val.object({ kind: val.literal("media"), url: val.string().url() })]);
  ```

## Combinators & Special Validators

- `val.lazy(getter)`: Defers schema resolution until validation time, enabling recursive data structures (e.g. comment threads or trees):
  ```ts
  interface Category {
    name: string;
    subcategories?: Category[];
  }
  const categorySchema: val.Validator<Category> = val.object({
    name: val.string(),
    subcategories: val.lazy(() => val.array(categorySchema)).optional(),
  });
  ```
- `val.intersection(left, right)` / `schema.and(other)`: Requires input to satisfy both schemas; deeply merges plain object outputs:
  ```ts
  const timestampedUser = val.intersection(val.object({ name: val.string() }), val.object({ createdAt: val.date() }));
  ```
- `val.instanceof(constructor, message?)`: Validates that input is an `instanceof` the given class constructor (also aliased as `val.instanceOf`):
  ```ts
  const regexSchema = val.instanceof(RegExp);
  const bufferSchema = val.instanceof(Uint8Array);
  ```
- `val.set(itemValidator?)`: Validates JavaScript `Set` instances with `.min()`, `.max()`, and `.nonEmpty()` constraints:
  ```ts
  const numberSet = val.set(val.number()).min(1);
  ```
- `val.map(keyValidator, valueValidator)`: Validates JavaScript `Map` instances with `.min()`, `.max()`, and `.nonEmpty()` constraints:
  ```ts
  const headerMap = val.map(val.string(), val.string());
  ```

## Modifiers (All Validators)

Every validator provides common modifier methods:

- `.optional()`: Accepts `undefined` or the valid value (`T | undefined`).
- `.nullable()`: Accepts `null` or the valid value (`T | null`).
- `.nullish()`: Accepts `null`, `undefined`, or the valid value (`T | null | undefined`).
- `.default(fallback)`: Replaces `undefined` with `fallback` value or zero-argument factory result.
- `.catch(fallback)`: Returns a fallback value when validation fails.
- `.refine(predicate, message?)`: Appends a custom synchronous validation predicate.
- `.refineAsync(predicate, message?)`: Appends an asynchronous validation predicate.
- `.check(fn)` / `.superRefine(fn)`: Attaches contextual validation logic with issue reporting.
- `.transform(fn)` / `.transformAsync(fn)`: Maps successfully validated values.
- `.pipe(next)`: Chains output into another validator.
- `.and(other)`: Intersects with another validator.

## Execution and Ergonomics

Validators provide multiple execution methods:

- `.validate(input, options?)`: Synchronous validation returning `ValidationResult<T>`.
- `.validateAsync(input, options?)`: Asynchronous validation returning `Promise<ValidationResult<T>>`.
- `.parse(input, options?)`: Synchronous validation returning `T` or throwing `ValidationError`.
- `.parseAsync(input, options?)`: Asynchronous validation returning `Promise<T>` or throwing `ValidationError`.
- `.is(input)`: Type guard returning `input is T`.
- `~standard`: Standard Schema v1 implementation property for framework compatibility.

Corresponding top-level standalone and `val` namespace helpers are also exported:

- `validate(data, validator, options?)` / `val.validate(data, validator, options?)`
- `validateAsync(data, validator, options?)` / `val.validateAsync(data, validator, options?)`
- `parse(data, validator, options?)` / `val.parse(data, validator, options?)`
- `parseAsync(data, validator, options?)` / `val.parseAsync(data, validator, options?)`
- `is(data, validator)` / `val.is(data, validator)`
- `assert(data, validator, options?)` / `val.assert(data, validator, options?)`
- `flatten(target)`: Formats validation issues or errors into `{ formErrors, fieldErrors }`.
