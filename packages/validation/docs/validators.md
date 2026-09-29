---
title: Validator reference
description: Every validator and combinator, with its options, what it produces and the issue it reports.
---

# Validator reference

Every validator here is created by calling a function and is then called with the value to check. Every one returns `{ ok: true, value }` or `{ ok: false, error: { issues } }`, and never throws for invalid input. The code and `params` each failure reports are listed with the validator; [Issues and messages](errors.md) explains what they mean and how to turn them into text.

Options are read once, when the validator is created. An option that makes no sense, such as a negative length, throws a `RangeError` or `TypeError` at that point, because it is a mistake in your code and not in the input.

## Strings

`string(options?)` accepts strings and produces a string. Anything else fails with `invalid_type`, naming the type it received.

```ts
import { string } from "@codenhub/validation";

const username = string({ trim: true, min: 3, max: 30 });

username("  ada  "); // { ok: true, value: "ada" }
username("ab"); // { ok: false, ... }, code "too_small"
```

The options, all optional:

| Option       | Meaning                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `trim`       | Remove leading and trailing whitespace before the constraints run, and from the output.                                       |
| `lowercase`  | Lowercase the string before the constraints run, and in the output. Cannot be combined with `uppercase`.                      |
| `uppercase`  | Uppercase the string before the constraints run, and in the output. Cannot be combined with `lowercase`.                      |
| `min`        | At least this many characters. Counted in UTF-16 code units, as `String.length` counts them, so an emoji can count as two.    |
| `max`        | At most this many characters.                                                                                                 |
| `length`     | Exactly this many characters.                                                                                                 |
| `pattern`    | Must match this regular expression. The `g` and `y` flags are ignored, so the same validator gives the same answer each time. |
| `startsWith` | Must start with this text.                                                                                                    |
| `endsWith`   | Must end with this text.                                                                                                      |
| `includes`   | Must contain this text.                                                                                                       |

Clean-up (`trim`, `lowercase`, `uppercase`) always happens first, and every constraint is then checked against the cleaned string, so `string({ trim: true, min: 1 })` rejects a string of spaces. Every constraint that fails reports its own issue.

| Failure                                      | `code`           | `params`                                                      |
| -------------------------------------------- | ---------------- | ------------------------------------------------------------- |
| Not a string                                 | `invalid_type`   | `{ expected: "string", received }`                            |
| Shorter than `min`                           | `too_small`      | `{ minimum, type: "string" }`                                 |
| Longer than `max`                            | `too_big`        | `{ maximum, type: "string" }`                                 |
| Shorter than `length`                        | `too_small`      | `{ minimum, exact: true, type: "string" }`                    |
| Longer than `length`                         | `too_big`        | `{ maximum, exact: true, type: "string" }`                    |
| Does not match `pattern`                     | `invalid_format` | `{ format: "regex", pattern }`                                |
| Wrong `startsWith`, `endsWith` or `includes` | `invalid_format` | `{ format: "startsWith" \| "endsWith" \| "includes", value }` |

## Numbers

`number(options?)` accepts finite numbers and produces a number. `NaN`, the infinities and every other type fail with `invalid_type`.

```ts
import { number } from "@codenhub/validation";

const age = number({ int: true, min: 0, max: 130 });

age(42); // { ok: true, value: 42 }
age(1.5); // { ok: false, ... }, code "invalid_value"
```

The options, all optional:

| Option       | Meaning                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| `clamp`      | `{ min, max }`. Move the value into the range instead of rejecting it, before the constraints run and in the output. |
| `min`, `max` | At least or at most this value, inclusive.                                                                           |
| `gt`, `lt`   | Strictly greater than or less than this value.                                                                       |
| `int`        | A whole number.                                                                                                      |
| `safeInt`    | A whole number a double can represent exactly, that is within `Number.MAX_SAFE_INTEGER`.                             |
| `multipleOf` | A multiple of this positive number, tolerating floating-point error, so `0.3` is a multiple of `0.1`.                |
| `nonZero`    | Anything but zero.                                                                                                   |

Positive, negative and their "non-" variants are bounds: positive is `gt: 0`, non-negative is `min: 0`, negative is `lt: 0` and non-positive is `max: 0`. `clamp` throws a `RangeError` for a `NaN` bound or a minimum above its maximum, and `multipleOf` throws one unless it is a positive finite number.

| Failure                       | `code`          | `params`                                                      |
| ----------------------------- | --------------- | ------------------------------------------------------------- |
| Not a finite number           | `invalid_type`  | `{ expected: "number", received }`                            |
| Below `min` or `gt`           | `too_small`     | `{ minimum, inclusive, type: "number" }`                      |
| Above `max` or `lt`           | `too_big`       | `{ maximum, inclusive, type: "number" }`                      |
| `int`, `safeInt` or `nonZero` | `invalid_value` | `{ type: "number", format: "int" \| "safeInt" \| "nonZero" }` |
| `multipleOf`                  | `invalid_value` | `{ multipleOf }`                                              |

## Booleans

`boolean()` accepts `true` and `false` and produces a boolean. Truthy and falsy values, and text such as `"true"`, fail with `invalid_type` and `{ expected: "boolean", received }`.

## Email addresses

`email(options?)` accepts a string that is an email address with a public domain name and produces it unchanged. It does not trim or lowercase, so clean the input first with `pipe` when it may need it:

```ts
import { email, pipe, string } from "@codenhub/validation";

const address = pipe(string({ trim: true, lowercase: true }), email());

address("  Ada@Example.com "); // { ok: true, value: "ada@example.com" }
```

The one option is `allowPlus`, default `true`, which controls whether `+` is accepted in the part before the `@`, as in `ada+news@example.com`.

The local part is limited to 64 characters and the whole address to 254. Hosts that are not public domain names, such as `localhost`, single-label hosts and IP addresses, are rejected.

| Failure      | `code`           | `params`                           |
| ------------ | ---------------- | ---------------------------------- |
| Not a string | `invalid_type`   | `{ expected: "string", received }` |
| Not an email | `invalid_format` | `{ format: "email" }`              |

## Objects

`object(shape, options?)` takes a shape, an object whose values are validators, and produces an object with the same keys and the output of each validator.

```ts
import { number, object, optional, string } from "@codenhub/validation";

const user = object({ name: string(), age: optional(number()) });

user({ name: "Ada" }); // { ok: true, value: { name: "Ada" } }
user({ age: "x" }); // two issues: ["name"] and ["age"]
```

- Only plain objects are accepted. Arrays, class instances, `Map`s, `Date`s and `null` fail with `invalid_type` and `{ expected: "object", received }`.
- Only own properties are read, so a value inherited through the prototype never satisfies a required property.
- Every property is validated, even after an earlier one failed, and each issue's path leads down to it.
- A property whose validator accepts `undefined`, such as one wrapped in `optional`, is optional in the inferred type, and is left out of the output when absent from the input.
- The output is a new object and the input is never modified.

The `unknownKeys` option decides what happens to input properties the shape does not list:

| `unknownKeys`   | Effect                                                                                 |
| --------------- | -------------------------------------------------------------------------------------- |
| `"strip"`       | Drop them from the output. This is the default.                                        |
| `"strict"`      | Reject each with an `unrecognized_key` issue at the key's path, and `params: { key }`. |
| `"passthrough"` | Copy them to the output unchanged and unchecked.                                       |

A shape is an ordinary object, so it can be reused with ordinary JavaScript: spread one into another to extend it, and leave keys out with destructuring.

```ts
import { email, number, object, string } from "@codenhub/validation";

const base = { name: string(), email: email() };
const withAge = object({ ...base, age: number() });
```

## Combining validators

### `optional`

`optional(validator)` accepts `undefined`, passes it through, and gives every other value to `validator`. `null` and the empty string are not absent, and go to `validator`. Inside an `object`, the property becomes optional in the inferred type.

### `pipe`

`pipe(a, b, ...)` runs validators in order, giving each the value the previous one produced, and produces what the last produces. The first failure stops it, because a later step has nothing valid to work on. Use it to clean a value before checking a format, or to check one rule after another.

### `refine`

`refine(validator, check, issue?)` adds a rule that `validator` cannot express. It runs only when `validator` succeeded, and receives the value `validator` produced. `check` returns `true` for an acceptable value. The optional `issue` says how a rejection is reported: a string is the message, and an object can set a `code`, `path`, `params` and `message`. Without it the issue has code `custom`.

```ts
import { object, refine, string } from "@codenhub/validation";

const signup = refine(object({ password: string({ min: 8 }), confirm: string() }), (data) => data.password === data.confirm, { code: "mismatch", path: ["confirm"], message: "Passwords must match" });
```

A `check` that returns a promise makes the result asynchronous; see [Custom validators](custom-validators.md#asynchronous-rules).

## Working with results

### `Infer`

`Infer<typeof validator>` is the type a validator produces. It reads the output of either a synchronous or an asynchronous validator.

### `is`

`is(validator, input)` returns whether `input` passes, and narrows it to the validator's output type. It accepts synchronous validators only, and throws a `TypeError` if the validator turns out to return a promise. The narrowing is exact for a validator that does not change the value; for one that trims, clamps or transforms, read `result.value` from calling the validator.

### `pass` and `fail`

`pass(value)` and `fail(...issues)` build results, and are what a validator you write returns. See [Custom validators](custom-validators.md).

### Types

`Validator<T>`, `AsyncValidator<T>`, `AnyValidator`, `ValidationResult<T>`, `ValidationOk<T>`, `ValidationErr`, `ValidationFailure`, `ValidationIssue`, `ValidationIssueCode`, `ValidationPathSegment`, `IssueInput`, `Composed`, `Shape`, `InferShape`, `StringOptions`, `NumberOptions`, `EmailOptions`, `ObjectOptions`, `RefineIssue`, `Messages` and `FlattenedErrors` are exported for annotating your own code. Each is documented in the source, and the ones you meet in everyday use are explained in [Custom validators](custom-validators.md) and [Issues and messages](errors.md).
