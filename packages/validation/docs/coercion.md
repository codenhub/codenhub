---
title: Coercion
description: Converting text input such as environment variables, query strings and form values before validating it.
order: 30
---

# Coercion

Values that arrive as text (environment variables, query strings, form fields, CSV columns) are strings even when they mean a number or a switch. `val.number()` rejects `"8080"` on purpose: silently accepting whatever converts is how `"0x10"` and `""` end up as numbers. Coercion is the opt-in for when text is what you expect.

`val.coerce.*` validators convert the input first, then apply every rule of the plain validator, so `val.coerce.number().int().min(1)` works exactly like `val.number().int().min(1)` on the converted value.

```ts
const env = val.object({
  PORT: val.coerce.number().int().min(1).max(65535),
  DEBUG: val.coerce.boolean().default(false),
  ORIGINS: val.string().transform((text) => text.split(",")),
});

const config = env.parse(process.env);
// { PORT: 8080, DEBUG: false, ORIGINS: ["https://a.example", "https://b.example"] }
```

## What converts

| Validator              | Accepts                                                                                                                   | Notes                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `val.coerce.string()`  | Strings, numbers, bigints and booleans.                                                                                   | `null`, `undefined`, objects, arrays, functions and symbols are rejected.                         |
| `val.coerce.number()`  | Finite numbers, and strings holding a decimal number, such as `"42"`, `" 3.5 "`, `"-1"`, `".5"`.                          | Empty and blank strings, hex, exponents and `"NaN"` are rejected. Booleans are not numbers.       |
| `val.coerce.boolean()` | Booleans, and the words `true`/`false`, `yes`/`no`, `on`/`off` and `1`/`0` in any case, and the numbers `1` and `0`.      | Anything else is rejected, so a typo is not read as `false`.                                      |
| `val.coerce.bigint()`  | Bigints, safe integer numbers, and strings holding a decimal integer.                                                     | Fractions and unsafe integers are rejected.                                                       |
| `val.coerce.date()`    | `Date` instances, finite timestamps in milliseconds, and ISO 8601 strings such as `2026-09-28` or `2026-09-28T14:30:00Z`. | Free-form strings like `"yesterday"` and `"09/28/2026"` are rejected. Invalid dates are rejected. |

Surrounding whitespace is ignored where a string is parsed. Objects and arrays are never converted: `[5]` is not `5`.

## Failures

A value that cannot be converted fails with `invalid_type`, `params: { expected, received, coerced: true }` and a message such as `Cannot convert string to number`. The message names types and does not repeat the input. Rules that run after a successful conversion report their own codes: `"0"` through `val.coerce.number().min(1)` fails with `too_small`, not `invalid_type`.

Each coercing validator accepts a message for the conversion failure, `val.coerce.number("Enter a number")`, like any factory.

## Defaults and optional values

Coercion runs only when there is a value to convert. Missing input follows the usual rules: `.default()` fills in `undefined`, and `.optional()` accepts it.

```ts
val.coerce.boolean().default(false).parse(undefined); // false
val.coerce.number().optional().parse(undefined); // undefined
```

An empty string is a value, not a missing one. `val.coerce.number().validate("")` fails, which is usually what you want for a required form field. To treat empty text as absent, do it explicitly before the schema:

```ts
const optionalNumber = val
  .string()
  .transform((text) => (text.trim() === "" ? undefined : text))
  .pipe(val.coerce.number().optional());
```

## JSON strings

`val.json(schema?)` is the same idea for structured data. It accepts a string holding JSON and outputs the parsed value, validated against `schema` when you pass one:

```ts
const settings = val.json(val.object({ theme: val.enum(["light", "dark"]) }));

settings.parse('{"theme":"dark"}'); // { theme: "dark" }
settings.validate("{oops"); // fails with invalid_format
```

Issues inside the parsed value are located from its root, so `theme` above reports at `["theme"]`.
