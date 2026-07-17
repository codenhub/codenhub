# Validator Reference

The `val` object exposes `string`, `number`, `object`, and `array` factories.
Each accepts `unknown` plus optional `ValidationOptions`. A base-type failure is
created immediately and every method on that returned validator reports the
same failure. Validators return results and do not throw for ordinary invalid
input.

## Strings

`val.string(value, options?)` returns `StringValidators`. Non-string input fails
with `invalid_type`.

| Method                                 | Success and constraints                                                                                                                                                           |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `email({ allowPlus = true }?)`         | Trims input, lowercases the public host, and validates common local-part and total length limits. Invalid shape or disallowed plus addressing returns `invalid_format`.           |
| `url({ forceHttps = false }?)`         | Adds `https://` when absent and returns the normalized public HTTP(S) URL. Private/non-public host shapes, credentials, invalid URLs, or disallowed HTTP return `invalid_format`. |
| `fileType(allowed)`                    | Returns the lowercase final extension without a dot. An empty normalized allow list returns `invalid_value`; missing or disallowed extensions return `invalid_format`.            |
| `minLength(length, { trim = false }?)` | Optionally trims and enforces a finite non-negative minimum. Invalid limits return `invalid_value`; short values return `too_small`.                                              |
| `maxLength(length, { trim = false }?)` | Optionally trims and enforces a finite non-negative maximum. Invalid limits return `invalid_value`; long values return `too_big`.                                                 |
| `notEmpty({ trim = true }?)`           | Returns the checked value and fails empty strings with `too_small`.                                                                                                               |
| `matches(pattern, message?)`           | Tests a copied `RegExp`, returns the original string, and uses `invalid_format` plus the optional message on mismatch. Invalid non-RegExp arguments may throw.                    |

## Numbers

`val.number(value, options?)` returns `NumberValidators`. Non-number and `NaN`
input returns `invalid_type`; infinities return `invalid_value` before any
method-specific check.

`positive`, `negative`, `nonNegative`, `nonPositive`, `nonZero`, `int`, and
`safeInt` enforce their named constraint and return `invalid_value` on failure.
`finite()` succeeds because non-finite input is rejected by the factory.
`port()` accepts integers from 1 through 65535.

`range({ min?, max? })` uses inclusive bounds. Non-finite bounds or `min > max`
return `invalid_value`; values outside valid bounds return `too_small` or
`too_big`.

## Objects

`val.object(value, options?)` returns `ObjectValidators`. Only objects with
`Object.prototype` or a null prototype are accepted; arrays, `null`, functions,
and class instances return `invalid_type`.

- `plain()` returns the original `PlainObject`.
- `hasKeys(keys)` requires each string as an own property. The first missing key
  returns `missing_key` and is appended to the error path. Inherited properties
  do not satisfy the check.

## Arrays

`val.array<T>(value, options?)` returns `ArrayValidators<T>`. Non-arrays return
`invalid_type`. `minLength(length)` and `maxLength(length)` require finite,
non-negative limits; invalid limits return `invalid_value`, while length
failures return `too_small` or `too_big`. `notEmpty()` returns `too_small` for an
empty array. Successful array validators return the original array, not a copy.

`StringValidators`, `NumberValidators`, `ObjectValidators`,
`ArrayValidators<T>`, and `PlainObject` are exported for reusable consumer type
boundaries.
