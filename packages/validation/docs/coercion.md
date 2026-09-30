---
title: Coercion
description: Validate text input such as environment variables, query strings and form fields by converting it to the type you need.
---

# Coercion

Data that arrives from outside a program is often text even when it means something else: every environment variable, query-string parameter and form field is a string, whether it stands for a port number, a yes-or-no flag or a date. A strict validator such as `number()` rejects `"8080"` because it is a string, which is correct and no help. A coercing validator converts the text first and then validates the result, so one call gives you a typed value or the reasons it could not be one.

```ts
import { coerceNumber } from "@codenhub/validation";

const port = coerceNumber({ int: true, min: 1, max: 65535 });

port("8080"); // { ok: true, value: 8080 }
port("0"); // { ok: false, ... }, code "too_small"
port("eighty"); // { ok: false, ... }, code "invalid_type"
```

## The validators

There is one for each type that commonly arrives as text. Each takes exactly the options of its strict counterpart, applies them to the converted value, and throws for a bad option when it is created, so `coerceNumber({ multipleOf: 0 })` fails at once just as `number({ multipleOf: 0 })` does.

| Validator                | Produces | Accepts                                                                                                                                                  | Strict version |
| ------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `coerceString(options?)` | string   | Strings, finite numbers, bigints and booleans, converted to their string form.                                                                           | `string`       |
| `coerceNumber(options?)` | number   | Numbers, and strings holding a decimal number such as `"42"`, `" 3.5 "`, `"-1"`, `".5"`, `"5."`, a dot with no digits on one side being how people type. | `number`       |
| `coerceBoolean()`        | boolean  | Booleans, the numbers `1` and `0`, and the words `true`, `false`, `yes`, `no`, `on`, `off`, `1` and `0` in any letter case.                              | `boolean`      |
| `coerceBigint(options?)` | bigint   | Bigints, safe integers, and strings holding a decimal integer.                                                                                           | `bigint`       |
| `coerceDate(options?)`   | `Date`   | `Date`s, whole timestamps in milliseconds, and ISO 8601 strings such as `2026-09-28` or `2026-09-28T14:30:00Z`.                                          | `date`         |

Surrounding whitespace is ignored in the text each accepts.

## What is not converted

Coercion is deliberately narrow, because a conversion that guesses turns a bug into a plausible-looking value. These fail, with the reason in the issue:

- **Strings:** `NaN` and `Infinity`, which a failed numeric conversion upstream leaves behind, and `null`, `undefined`, objects, arrays, functions and symbols.
- **Numbers:** empty strings, `"1e3"`, `"0x10"`, `"1,5"`, `"Infinity"` and `"NaN"`, text holding a whole number beyond `Number.MAX_SAFE_INTEGER`, which would silently lose digits (use `coerceBigint` for those), and booleans, `null`, objects and arrays. `Number(true)` is `1` and `Number("")` is `0`; reading a flag or a missing value as a count is how bugs hide.
- **Booleans:** every other word. A typo such as `"ture"` is an error, not `false`.
- **Bigints:** fractions, numbers beyond `Number.MAX_SAFE_INTEGER`, which have already lost precision, and any other text.
- **Dates:** free-form text such as `"yesterday"` or `"09/28/2026"`, whose reading depends on the runtime, and days that do not exist such as `2026-02-30`.

A value that cannot be converted fails with `invalid_type`, and its `params` are `{ expected, received, coerced: true }`. The default message reads "Cannot convert string to number", and the value itself is never in the issue. A value that converts but then breaks a constraint fails with that constraint's own code, as for the strict validator.

A fraction of a second beyond milliseconds is cut, not rounded, the same way on every runtime, and a timestamp with a fraction of a millisecond is rejected rather than cut. Leap seconds (`23:59:60`) are rejected, since a `Date` cannot hold one. The text `"-0"` is read as `0`, and a decimal is read as the nearest double, so `"0.30000000000000004999"` is `0.30000000000000004`.

Date text is read in these ISO 8601 forms: a date `YYYY-MM-DD` alone, or followed by `T` or a space, a time `HH:MM:SS`, an optional fraction of a second, and an optional zone, which is `Z` or an offset written `+HH`, `+HHMM` or `+HH:MM` (or with `-`). This is wider than `datetime()`, which accepts only the `T` separator and `Z` or, with `offset`, `+HH:MM`, because a converter reads what programs and people commonly write while a format checks one exact spelling. Date-only strings and date-times without an offset are both read as UTC, so the result does not depend on the timezone of the machine. Include an offset or `Z` in text you produce when the moment is not UTC.

## Reading a whole environment

Combine coercion with `object` and `withDefault` to turn an environment, a query string or a form into typed configuration, and to report every problem in it at once:

```ts
import { coerceBoolean, coerceNumber, object, string, transform, withDefault } from "@codenhub/validation";

const env = object({
  PORT: coerceNumber({ int: true, min: 1, max: 65535 }),
  DEBUG: withDefault(coerceBoolean(), false),
  RETRIES: withDefault(coerceNumber({ int: true, min: 0 }), 3),
  ORIGINS: transform(string(), (text) => text.split(",")),
});

const result = env({ PORT: "8080", ORIGINS: "https://a.example,https://b.example" });
// { ok: true, value: { PORT: 8080, DEBUG: false, RETRIES: 3, ORIGINS: [...] } }
```

In Node.js, pass a copy of the environment: `env({ ...process.env })`. `process.env` itself is not a plain object, since its prototype is not `Object.prototype`, and `object` rejects it as it rejects a class instance. A missing variable is `undefined`, which `withDefault` replaces and everything else rejects. A value that repeats, as in `?id=1&id=2`, arrives as an array, so validate it with `array(coerceNumber())`.

To clean text before converting it, put a strict validator in front with `pipe`: `pipe(string({ trim: true }), coerceNumber())`. For text that holds JSON, use `json`, which parses it and validates the result.
