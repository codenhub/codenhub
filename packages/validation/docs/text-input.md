---
title: Text input
description: Read numbers, flags, bigints and dates from text, such as environment variables, query strings and form fields.
order: 4
---

# Text input

Much of the data a program receives is text pretending to be something else. Every environment variable, query-string parameter and text field of a form is a string, whether it stands for a port number, a yes-or-no flag or a date. A file field is a `File` instead, which [Files](forms.md#files) covers. This page covers the validators that read a value from such text, and two places it comes from: a query string and the environment. The sign-up server reads its configuration from the environment, and its sign-up page reads an invitation from the query string.

A strict validator such as `number()` rejects `"8080"`, because it is a string. That is correct, and no help here. A coercing validator converts the text first and then validates the result, so one call gives you a typed value or the reasons it could not be one:

```ts
import { coerceNumber } from "@codenhub/validation";

const port = coerceNumber({ int: true, min: 1, max: 65535 });

port("8080"); // { ok: true, value: 8080 }
port("0"); // { ok: false, ... }, code "too_small"
port("eighty"); // { ok: false, ... }, code "invalid_type"
```

## The coercing validators

There is one for each type that commonly arrives as text:

| Validator                | Produces | Accepts                                                                                                                     | Strict version |
| ------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `coerceString(options?)` | string   | Strings, finite numbers, bigints and booleans, converted to their string form.                                              | `string`       |
| `coerceNumber(options?)` | number   | Numbers, and strings that hold a decimal number, such as `"42"`, `" 3.5 "`, `"-1"`, `".5"` or `"5."`.                       | `number`       |
| `coerceBoolean()`        | boolean  | Booleans, the numbers `1` and `0`, and the words `true`, `false`, `yes`, `no`, `on`, `off`, `1` and `0` in any letter case. | `boolean`      |
| `coerceBigint(options?)` | bigint   | Bigints, safe integers, and strings that hold a decimal integer.                                                            | `bigint`       |
| `coerceDate(options?)`   | `Date`   | `Date`s, whole timestamps in milliseconds, and ISO 8601 strings such as `2026-09-28` or `2026-09-28T14:30:00Z`.             | `date`         |

Each takes the options of its strict version and applies them to the converted value. `coerceDate` also takes one option of its own, `zoneless`, described under [Dates](#dates). A bad option throws when the validator is created, so `coerceNumber({ min: Number.NaN })` fails at once, as `number({ min: Number.NaN })` does. They take checks and a `message` option too, and the message also words input that cannot be converted.

`coerceNumber` accepts a number written with no digits on one side of the dot, such as `".5"` or `"5."`, since that is how people type.

Surrounding white space is ignored in the text `coerceNumber`, `coerceBigint`, `coerceBoolean` and `coerceDate` read. That is white space as JavaScript's `trim` reads it, which includes a no-break space and a byte order mark, so text pasted with either is read too. `coerceString` passes a string through unchanged; trim it with `coerceString({ trim: true })`.

## What is not converted

Coercion is deliberately narrow, because a conversion that guesses turns a bug into a value that looks right. These fail, with the reason in the issue:

- **Strings:** `NaN` and `Infinity`, which a failed numeric conversion earlier in the program leaves behind, and `null`, `undefined`, objects, arrays, functions and symbols.
- **Numbers:** empty strings, `"1e3"`, `"0x10"`, `"1,5"`, `"Infinity"` and `"NaN"`; text that holds a whole number beyond `Number.MAX_SAFE_INTEGER`, which would silently lose digits (use `coerceBigint` for those); a nonzero decimal too small for a double, which would silently be `0`; and booleans, `null`, objects and arrays. `Number(true)` is `1` and `Number("")` is `0`, and reading a flag or a missing value as a count is how bugs hide.
- **Booleans:** every other word. A typo such as `"ture"` is an error, not `false`.
- **Bigints:** fractions, numbers beyond `Number.MAX_SAFE_INTEGER`, which have already lost precision, and any other text.
- **Dates:** free-form text such as `"yesterday"` or `"03/04/2026"`, whose reading depends on the runtime, and whose month depends on the continent, and days that do not exist, such as `2026-02-30`.

A value that cannot be converted fails with `invalid_type`, and its `params` are `{ expected, received, coerced: true }`. The English message names both types, as in "Cannot convert string to a number". The value itself is never in the issue.

A value that converts but then breaks an option fails with that option's own code, as for the strict validator.

A value that already has the type is given to the strict validator unchanged. So `NaN` or an infinity given to `coerceNumber`, or an invalid `Date` given to `coerceDate`, fails as `number()` or `date()` fails it: with `invalid_type`, and no `coerced`.

Some details of the conversions:

- The text `"-0"` is read as `0`. The number `-0` is passed through unchanged, as `number` does.
- A decimal is read as the nearest double, so `"0.30000000000000004999"` is `0.30000000000000004`.
- `coerceBigint` takes longer than linear time to convert long text. [`audit`](limits.md#checking-a-schema-for-the-bounds-it-needs) asks for a bound on each side of it, which also limits the digits it converts.

## Dates

`coerceDate` reads date text in these ISO 8601 forms:

- A date, `YYYY-MM-DD`, alone. It is read as midnight UTC.
- A date followed by `T` or a space, then a time, `HH:MM` or `HH:MM:SS`, with an optional fraction of a second after the seconds.
- Then a zone, which is `Z` or an offset written `+HH`, `+HHMM` or `+HH:MM`, or with `-`.

This is wider than `datetime()`, which accepts only the `T` separator, and `Z` or, with `offset`, `+HH:MM`. A converter reads what programs and people commonly write, while a [format](formats.md#datetime-and-time) checks one exact spelling.

A date-time without a zone fails. `2026-09-28T14:30` names a time on some clock, not a moment, and the package will not guess whose clock. Read in any one zone, it would give everyone elsewhere a moment hours off, without a word. When you know such text is written in UTC, pass `zoneless: "utc"`, the only value that option takes:

```ts
import { coerceDate } from "@codenhub/validation";

coerceDate()("2026-09-28T14:30"); // { ok: false, ... }, code "invalid_type"
coerceDate({ zoneless: "utc" })("2026-09-28T14:30"); // ok
```

An HTML `datetime-local` input sends text without a zone, and without seconds when they are zero. Add the user's offset to its value before converting it.

Either way, the result does not depend on the time zone of the machine. Some more rules:

- A fraction of a second beyond milliseconds is cut, not rounded, the same way on every runtime.
- A timestamp with a fraction of a millisecond is rejected, not cut.
- Leap seconds (`23:59:60`) are rejected, since a `Date` cannot hold one and prefers to believe they never happen.

## A query string

`searchParams(validator, options?, ...checks)` reads a query string, with or without its `?`, or a `URLSearchParams`, from this realm or another, into an object of its decoded parameters. It then produces what `validator` makes of that object. Each value is text, so the validator inside uses coercion for anything else:

```ts
import { array, coerceNumber, object, optional, searchParams, string } from "@codenhub/validation";

const invitation = searchParams(object({ invite: optional(string({ max: 64 })), step: coerceNumber({ int: true, min: 1 }) }));
invitation("?invite=AB12&step=2"); // { ok: true, value: { invite: "AB12", step: 2 } }

const tags = searchParams(object({ tag: array(string()) }), { repeated: true });
tags("tag=a&tag=b"); // { ok: true, value: { tag: ["a", "b"] } }
```

- It reads `+` as a space and decodes escapes.
- A key given more than once, as in `?id=1&id=2`, fails with `invalid_key` at `[key]`, unless `repeated` is set. A check that saw one of the two values while a server read the other would pass a value nobody checked.
- With `repeated: true`, every value of every key is a list, so validate it with `array`, as in `array(coerceNumber())`.
- Anything else fails with `invalid_type` and `{ expected: "query string", received }`.

The `query` part of [`url`](formats.md#parts-of-an-email-or-a-url) reads parameters the same way, but only to check them: the value it produces is still the whole URL.

## The environment

Combine coercion with `object` and with `optional` and a default to turn an environment into typed configuration, and to report every problem in it at once:

```ts
import { coerceBoolean, coerceNumber, object, optional, string, transform } from "@codenhub/validation";

const env = object({
  PORT: coerceNumber({ int: true, min: 1, max: 65535 }),
  DEBUG: optional(coerceBoolean(), false),
  RETRIES: optional(coerceNumber({ int: true, min: 0 }), 3),
  ORIGINS: transform(string(), (text) => text.split(",")),
});

const result = env({ PORT: "8080", ORIGINS: "https://a.example,https://b.example" });
// { ok: true, value: { PORT: 8080, DEBUG: false, RETRIES: 3, ORIGINS: [...] } }
```

In Node.js, pass a copy of the environment: `env({ ...process.env })`. `process.env` itself is not a plain object, since its prototype is not `Object.prototype`, so `object` rejects it as it rejects a class instance, with a message that says to copy it. A missing variable is `undefined`, which a default replaces and every other validator rejects.

The environment is configuration, so an invalid one is a mistake to stop at: a server that refuses to start is easier to debug than one that starts and misbehaves at 3 a.m. [`assert`](errors.md#throwing-for-invalid-configuration) returns the value or throws an error that names the variable.

## Cleaning text first

To clean text before converting it, put a strict validator in front with `pipe`: `pipe(string({ trim: true }), coerceNumber())`. [Shaping values](shaping-values.md#pipe) covers `pipe`.

For text that holds JSON, use [`json`](request-bodies.md#json-text), which parses the text and validates the result.

## Next

Every page so far has shown `{ ok: false, ... }` and politely skipped the `...`. [Issues and messages](errors.md) opens it: what a failed result holds, and how to turn its issues into text a person reads.
