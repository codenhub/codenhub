---
title: Validators
---

# Validator Reference

The `val` object provides declarative schema builders for primitive values, structures, unions, and custom constraints. Every schema extends `BaseValidator` and provides `.validate(input, options?)`, `.is(input)`, modifiers (`.optional()`, `.nullable()`, `.nullish()`, `.default()`), and customization methods (`.refine()`, `.transform()`, `.pipe()`).

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
| `uuid(message?)`               | Validates RFC 4122 UUID string (`invalid_format`).                                                  |
| `regex(pattern, message?)`     | Tests against a `RegExp` pattern (`invalid_format`). Alias: `matches`.                              |
| `startsWith(prefix, message?)` | Enforces required string prefix (`invalid_format`).                                                 |
| `endsWith(suffix, message?)`   | Enforces required string suffix (`invalid_format`).                                                 |
| `includes(search, message?)`   | Enforces substring presence (`invalid_format`).                                                     |
| `fileType(allowed, message?)`  | Validates file extension against an allow list (`invalid_format`).                                  |
| `trim()`                       | Transformation trimming whitespace before further checks.                                           |
| `toLowerCase()`                | Transformation lowercasing the string.                                                              |
| `toUpperCase()`                | Transformation uppercasing the string.                                                              |

## Numbers

`val.number()` returns a `NumberValidator`. Rejects non-numbers, `NaN`, and non-finite input.

| Method                            | Description                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------ |
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

- `val.literal(value, message?)`: Requires exact equality (`===`) with string, number, or boolean literal.
- `val.enum(values, message?)`: Accepts an array or tuple of allowed string values (`invalid_value`).

## Any & Unknown

- `val.any()`: Accepts any input, typed as `any`.
- `val.unknown()`: Accepts any input, typed as `unknown`.

## Objects

`val.object(shape)` creates an `ObjectValidator` that validates plain object shapes. Nested objects and properties validate recursively with full path reporting.

- `strict(message?)`: Rejects objects with unknown keys with `invalid_value`.
- `passthrough()`: Preserves unknown keys in output.
- `strip()`: Strips unknown keys (default mode).
- `extend(extraShape)`: Merges two object schemas into a combined schema.
- `pick(keys)`: Creates a new schema retaining only the specified keys.
- `omit(keys)`: Creates a new schema omitting the specified keys.
- `partial()`: Creates a new schema where every property is made optional.

## Arrays

`val.array(elementValidator?)` creates an `ArrayValidator`. When an element validator is supplied, each item is validated and element issues record child indices (`path: ["items", 0]`).

- `min(length, message?)`: Minimum item count (`too_small`).
- `max(length, message?)`: Maximum item count (`too_big`).
- `length(length, message?)`: Exact item count.
- `nonEmpty(message?)`: Requires at least one element (`too_small`).

## Records, Tuples, and Unions

- `val.record(valueValidator, keyValidator?)`: Validates arbitrary key-value dictionaries.
- `val.tuple([v1, v2, ...])`: Validates fixed-length arrays where each element matches its positional validator.
- `val.union([v1, v2, ...])`: Validates that at least one branch succeeds. If all branches fail, combines branch issues into a failure.

## Modifiers (All Validators)

Every validator provides common modifier methods:

- `.optional()`: Accepts `undefined` or the valid value (`T | undefined`).
- `.nullable()`: Accepts `null` or the valid value (`T | null`).
- `.nullish()`: Accepts `null`, `undefined`, or the valid value (`T | null | undefined`).
- `.default(fallback)`: Replaces `undefined` with `fallback` (or `fallback()`).
