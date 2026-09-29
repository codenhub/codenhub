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

| Validator                | Produces | Accepts                                                                                                                     | Strict version |
| ------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `coerceString(options?)` | string   | Strings, numbers, bigints and booleans, converted to their string form.                                                     | `string`       |
| `coerceNumber(options?)` | number   | Numbers, and strings holding a decimal number such as `"42"`, `" 3.5 "`, `"-1"`, `".5"`.                                    | `number`       |
| `coerceBoolean()`        | boolean  | Booleans, the numbers `1` and `0`, and the words `true`, `false`, `yes`, `no`, `on`, `off`, `1` and `0` in any letter case. | `boolean`      |
| `coerceBigint(options?)` | bigint   | Bigints, safe integers, and strings holding a decimal integer.                                                              | `bigint`       |
| `coerceDate(options?)`   | `Date`   | `Date`s, finite timestamps in milliseconds, and ISO 8601 strings such as `2026-09-28` or `2026-09-28T14:30:00Z`.            | `date`         |

Surrounding whitespace is ignored in the text each accepts.

## What is not converted

Coercion is deliberately narrow, because a conversion that guesses turns a bug into a plausible-looking value. These fail, with the reason in the issue:

- **Numbers:** empty strings, `"1e3"`, `"0x10"`, `"1,5"`, `"Infinity"` and `"NaN"`, and booleans, `null`, objects and arrays. `Number(true)` is `1` and `Number("")` is `0`; reading a flag or a missing value as a count is how bugs hide.
- **Booleans:** every other word. A typo such as `"ture"` is an error, not `false`.
- **Bigints:** fractions, numbers beyond `Number.MAX_SAFE_INTEGER`, which have already lost precision, and any other text.
- **Dates:** free-form text such as `"yesterday"` or `"09/28/2026"`, whose reading depends on the runtime, and days that do not exist such as `2026-02-30`.
- **Strings:** `null`, `undefined`, objects, arrays, functions and symbols.

A value that cannot be converted fails with `invalid_type`, and its `params` are `{ expected, received, coerced: true }`. The default message reads "Cannot convert string to number", and the value itself is never in the issue. A value that converts but then breaks a constraint fails with that constraint's own code, as for the strict validator.

Date-only strings are read as UTC, and date-times without an offset are read as local time, which is how `new Date` reads them. Include an offset or `Z` in text you produce.

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

A missing variable is `undefined`, which `withDefault` replaces and everything else rejects. A value that repeats, as in `?id=1&id=2`, arrives as an array, so validate it with `array(coerceNumber())`.

To clean text before converting it, put a strict validator in front with `pipe`: `pipe(string({ trim: true }), coerceNumber())`. For text that holds JSON, use `json`, which parses it and validates the result.
