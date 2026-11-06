---
title: Getting started
description: What a validator is, how to read its result, and the validators for strings, numbers, dates, fixed values and objects.
order: 1
---

# Getting started

This page is the foundation the others stand on, which is why it is the long one: how a validator is made and called, what it returns, and the validators for each basic kind of value. By the end of it you can write the first version of the sign-up: an object with a name, an email address and a password, and the TypeScript type that comes from it.

## A validator is a function

Every validator takes any input and returns a result. You create a validator by calling a function, with options if you want them. Then you call the validator with the value:

```ts
import { number, string } from "@codenhub/validation";

const port = number({ int: true, min: 1, max: 65535 });

port(8080); // { ok: true, value: 8080 }
port(70000); // { ok: false, ... }, code "too_big"

string({ min: 3 })("ab"); // { ok: false, ... }
```

The `port` line runs once, when the module loads, and gives a function you can reuse for every value. To check a single value once, call both at once: `number({ int: true })(input)`.

Because a validator is only a function, you can pass any validator wherever another one is expected, and you can write your own with no helper at all. [Custom validators](custom-validators.md) shows how.

### The order of the arguments

Every validator takes its arguments in the same order:

1. Its own arguments, such as the shape of an object or the item validator of an array.
2. An options object, such as `{ min: 3 }`.
3. Any number of checks, which are rules for rarer cases, such as `string({ min: 3 }, startsWith("a"))`.

The options can be left out when there are checks: `string(startsWith("a"))`. Every validator that reports an issue of its own also takes a `message` option, which [Issues and messages](errors.md#wording-one-validator) explains.

### Mistakes in options throw at once

Options are read once, when the validator is created. An option that makes no sense is a mistake in your code, not in the input, so the factory throws a `RangeError` or a `TypeError` at that point, and the program fails where the mistake is. A crash at startup is rude, but it beats a schema that quietly accepts everything for six months. These throw:

- A value no input can satisfy: a negative length, a `NaN` bound, or limits that contradict each other, such as `{ min: 5, max: 2 }`.
- Options that are not a plain object, such as `string(/^a/)` where `string(pattern(/^a/))` was meant. Ignored, they would accept every string.
- A child that is not a function, such as `object({ name: undefined })` after an import that resolved to nothing. Every composer checks the validators and callbacks it is given, and names the wrong one.
- An option name the validator does not know, such as `string({ mni: 2 })`, which throws `TypeError: Unknown option mni`. Ignored, it would leave unset the limit it was meant to set. TypeScript reports such a name too, but not for options read from configuration, typed loosely or written in JavaScript.

An option given as `undefined` is no option. So a limit that may be missing can be passed directly: `string({ max: limit })`.

## Reading the result

A result is one of two plain objects, so you branch on `ok`:

```ts
import { email, formatIssue } from "@codenhub/validation";

const result = email()(input);

if (result.ok) {
  save(result.value); // typed as string
} else {
  for (const issue of result.error.issues) {
    console.log(issue.path, formatIssue(issue));
  }
}
```

When something is wrong, the validator reports every problem it can find, not only the first, so a form can show all its errors at once. Each issue has a stable `code` to branch on, the `path` to the value that failed, and `params` that describe what was wrong. [Issues and messages](errors.md) describes them in full.

### Invalid input does not throw

Invalid input is an expected outcome, not a bug: a sign-up form sees typos about as often as it sees sign-ups. So a validator returns it in the result. If you would rather stop the program, that is one line: `if (!result.ok) throw new Error(...)`, or [`assert`](errors.md#throwing-for-invalid-configuration), which writes the message for you.

One kind of input can still throw: input that runs code of its own while it is read, such as a getter or a `Proxy` trap that throws. That exception propagates, as one from your own callback does. Data parsed from JSON has no such code. Two validators differ:

- [`objectLike`](#objects-that-are-not-plain) reports a property it could not read as an issue.
- `instanceOf` rejects the value with `invalid_type` when the prototype trap of the value, or the `Symbol.hasInstance` of the class, throws.

### The value can differ from the input

`result.value` is the value after the validator ran, which is not always the input you gave it:

- Clean-up you asked for is applied, such as `trim`, `case` or `clamp`.
- An object drops the properties its shape does not list.
- A format with several spellings of one value produces one of them. `email` and `url` produce what the URL parser reads, such as a lowercase domain, and `phone` produces `+` and the digits.

So a check made later on the value sees what a mail server or a request will see. The input itself is never modified.

## Strings

`string(options?)` accepts strings and produces a string. Anything else fails with `invalid_type`, naming the type it received.

```ts
import { string } from "@codenhub/validation";

const name = string({ trim: true, min: 2, max: 100 });

name("  Ada  "); // { ok: true, value: "Ada" }
name("A"); // { ok: false, ... }, code "too_small"
```

| Option    | Meaning                                                                                                                                             |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trim`    | Remove leading and trailing white space, as `String.prototype.trim` does, before the other options run and in the output.                           |
| `case`    | `"lower"` or `"upper"`: convert the string before the other options run and in the output, with the full Unicode mapping, the same in every locale. |
| `min`     | At least this many characters.                                                                                                                      |
| `max`     | At most this many characters.                                                                                                                       |
| `length`  | Exactly this many characters.                                                                                                                       |
| `message` | Wording for the issues it reports itself.                                                                                                           |

Clean-up always happens first, and every option and check then sees the cleaned string. So `string({ trim: true, min: 1 })` rejects a string of spaces. Some details:

- `trim` removes Unicode white space and line terminators, so a no-break space goes. A zero-width space (U+200B) is not white space and stays, so `string({ trim: true, min: 1 })` accepts it. The `nonBlank()` check rejects it.
- `case` can change the length the other options see: `ß` in uppercase is `SS`, and `İ` in lowercase is two code units.
- Lengths count UTF-16 code units, as `String.length` does, so an emoji can count as two, and a family of four as eleven.

Every option that fails reports its own issue:

| Failure               | `code`         | `params`                                   |
| --------------------- | -------------- | ------------------------------------------ |
| Not a string          | `invalid_type` | `{ expected: "string", received }`         |
| Shorter than `min`    | `too_small`    | `{ minimum, type: "string" }`              |
| Longer than `max`     | `too_big`      | `{ maximum, type: "string" }`              |
| Shorter than `length` | `too_small`    | `{ minimum, exact: true, type: "string" }` |
| Longer than `length`  | `too_big`      | `{ maximum, exact: true, type: "string" }` |

Rarer rules are checks, given after the options: `pattern`, `startsWith`, `endsWith`, `includes`, `nonBlank`, `lowercase` and `uppercase`. [Checks](#checks) lists them.

```ts
import { pattern, string } from "@codenhub/validation";

const handle = string({ trim: true, min: 3, max: 30 }, pattern(/^[a-z0-9_]+$/));
```

## Numbers

`number(options?)` accepts finite numbers and produces a number. `NaN`, the infinities and every other type fail with `invalid_type`. `-0` is accepted and produced as given, since it is a number of its own.

```ts
import { number } from "@codenhub/validation";

const age = number({ int: true, min: 0, max: 130 });

age(42); // { ok: true, value: 42 }
age(1.5); // { ok: false, ... }, code "invalid_value"
```

| Option       | Meaning                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| `clamp`      | `{ min, max }`: move a finite value into the range instead of rejecting it, before the other options run. |
| `min`, `max` | At least or at most this value, inclusive.                                                                |
| `gt`, `lt`   | Strictly greater than or less than this value.                                                            |
| `int`        | A whole number.                                                                                           |
| `safeInt`    | A whole number a double holds exactly, that is, within `Number.MAX_SAFE_INTEGER`.                         |
| `message`    | Wording for the issues it reports itself.                                                                 |

Positive, negative and their "non-" variants are bounds: positive is `gt: 0`, non-negative is `min: 0`, negative is `lt: 0` and non-positive is `max: 0`.

`clamp` still rejects an infinity, as every `number` does, since an infinity more often means a fault earlier in the program than a value to clamp.

Bounds are checked when the validator is created:

- A `NaN` bound, or bounds no finite number can satisfy, such as `{ min: 5, max: 2 }`, `{ gt: 1, lt: 1 }` or `{ min: Infinity }`, throws a `RangeError`.
- A bound that is not a number, or a `clamp` that is not a range with a number `min` and `max`, throws a `TypeError`.
- A `clamp` throws a `RangeError` for a `NaN` bound, a minimum of `Infinity`, a maximum of `-Infinity`, a minimum above its maximum, or a range whose every value breaks a bound, such as `{ clamp: { min: 0, max: 10 }, min: 11 }`.

Bounds that hold numbers but no whole one, such as `{ int: true, gt: 1, lt: 2 }`, are not caught, since that check would add size to every program that uses `number`. Such a validator rejects every input, which the first test of an input meant to pass will notice.

| Failure             | `code`          | `params`                                         |
| ------------------- | --------------- | ------------------------------------------------ |
| Not a finite number | `invalid_type`  | `{ expected: "number", received }`               |
| Below `min` or `gt` | `too_small`     | `{ minimum, inclusive, type: "number" }`         |
| Above `max` or `lt` | `too_big`       | `{ maximum, inclusive, type: "number" }`         |
| `int` or `safeInt`  | `invalid_value` | `{ type: "number", format: "int" \| "safeInt" }` |

`multipleOf(step)` and `nonZero()` are checks: `number({ min: 0 }, multipleOf(0.01))`.

## Booleans and symbols

`boolean()` accepts `true` and `false` and produces a boolean. Truthy and falsy values, and text such as `"true"`, fail with `invalid_type` and `{ expected: "boolean", received }`. To read `"true"` from a form or an environment variable, use `coerceBoolean`, from [Text input](text-input.md).

`symbol()` accepts symbols and fails likewise, with `expected: "symbol"`. To accept one symbol only, use `literal`.

## Bigints

`bigint(options?)` accepts bigints and produces a bigint. Numbers, whole ones included, fail with `invalid_type`.

The options are bigints: `min` and `max` are inclusive, and `gt` and `lt` exclusive. They fail like the bounds of a number: `too_small` with `{ minimum, inclusive, type: "bigint" }`, or `too_big` with `{ maximum, inclusive, type: "bigint" }`. Positive is `gt: 0n`, non-negative is `min: 0n` and negative is `lt: 0n`.

In `params`, a bound is written as its decimal digits, `"10"` for `10n`, so an issue can be sent as JSON, which cannot hold a bigint. Read one back with `BigInt(params.minimum)`.

## Dates

`date(options?)` accepts valid `Date` objects and produces the same `Date`. An invalid date such as `new Date("nope")`, a timestamp or a string fails with `invalid_type` and `{ expected: "valid date", received }`. To check date text, use [`isoDate` or `datetime`](formats.md#datetime-and-time). To read a `Date` from text, use [`coerceDate`](text-input.md).

The options `min` and `max` are `Date`s, both inclusive:

- A value that is not a `Date`, such as a date string, throws a `TypeError` when the validator is created.
- An invalid `Date`, or `min` after `max`, throws a `RangeError`.
- They are read when the validator is created, so changing the `Date` objects later has no effect.

A date before `min` fails with `too_small` and `{ minimum, inclusive: true, type: "date" }`, and one after `max` with `too_big` and `{ maximum, inclusive: true, type: "date" }`. The bound in `params` is a `Date`.

## Fixed values

`literal(value)` accepts exactly one value, compared with `===`, and produces that value with its exact type. So `literal("admin")` produces the type `"admin"`, not `string`.

- Any primitive works, and this is how `null` and `undefined` are validated: `literal(null)`.
- It produces the declared value, not the input. The two differ only for zero: `===` matches `-0` to `0`, and `literal(0)` produces `0` for either.
- `NaN` is refused with a `RangeError` when the validator is created. `NaN === NaN` is false, so `literal(NaN)` could accept nothing, not even `NaN`.

`oneOf(values)` accepts any one value of a list and produces their union: `oneOf(["admin", "user"])` produces `"admin" | "user"`.

- The values may be any primitives `literal` accepts, so `oneOf([true, false, null])` is a flag with three states.
- It also takes a TypeScript `enum`. It ignores the reverse-mapping names TypeScript adds to a numeric enum, so only the numbers are values. An object written like an enum is read the same way, so `{ a: 1, "1": "a" }` holds `1` alone.
- It produces the listed value, so `oneOf([0])` produces `0` for `-0`.
- The values are copied when the validator is created.
- These throw a `TypeError` when the validator is created: no values, a list with a hole such as `[, "a"]`, which would accept `undefined`, and a `Set` or another object of a class, which would read as an enum with no members. A list holding `NaN`, which no value equals, throws a `RangeError`.

```ts
import { literal, oneOf } from "@codenhub/validation";

const plan = oneOf(["free", "pro"]);
const version = literal("v1", { message: "Only v1 is supported" });

enum Status {
  Active = "active",
  Archived = "archived",
}
const status = oneOf(Status);
```

Both fail with `invalid_value`: `literal` reports `{ expected }`, and `oneOf` reports `{ options }`, the list of accepted values.

A bigint is reported as its decimal digits, so the issue can be sent as JSON: `literal(1n)` reports `{ expected: "1", type: "bigint" }`, and a `oneOf` of bigints alone adds `type: "bigint"` too. In a `oneOf` that mixes bigints with other values, a bigint is reported as its digits, with nothing to tell it from a string.

Like every rule, `literal` and `oneOf` report what they were configured with, here the values they accept. So do not check a secret, such as an API key, with them or with a check such as `startsWith`: a failed check would print it, as [The issue](errors.md#the-issue) explains.

## Any value, no value, functions and instances

- `unknown()` accepts every value and passes it through unchanged. Use it for a property you do not check, or as the base for checks on a value of no particular type: `unknown(check((value) => JSON.stringify(value) !== undefined))`.
- `never()` rejects every value with `invalid_type` and `{ expected: "never", received }`. Use it to forbid a property, or for a branch that must never match.
- `func()` accepts any function from any realm, such as an iframe, classes and async and generator functions included, and produces it unchanged. It fails with `invalid_type` and `{ expected: "function", received }`. It can check only that the value is a function, not the parameters it takes or what it returns. So name the signature you expect as the type argument, `func<(value: string) => void>()`, and it becomes the output type without being checked, as a cast would. Without one, the output takes any arguments and returns `unknown`.
- `instanceOf(Class)` accepts instances of a class, subclasses and abstract classes included, checked with `instanceof`. It fails with `invalid_type` and `{ expected: "instance of Class", received }`. An instance from another realm, such as an iframe, is not recognized; `date`, `map`, `set` and `object` accept values from any realm. A target that is not a function, such as an import that resolved to nothing, throws a `TypeError` when the validator is created.

## Checks

A check is a rule about a value that already has its type, given to a validator after its options:

```ts
import { check, number, startsWith, string, uppercase } from "@codenhub/validation";

string({ min: 2 }, startsWith("A"), uppercase());
number(check((n: number) => n % 2 === 0, "Must be even"));
```

A check runs only once the value has passed the validator's type test and every option:

- For a string or a number, once the input has the type and passed options such as `min`, `max` or `int`.
- For a format, once the text is of the format, so a check given to `ip()` or `uuid()` never sees text that is not an address or a UUID.
- For an object or a collection, once every child has passed, since before that there is no value of the type to check.

While an option fails, no check runs, and the validator reports the issue of each option that failed. So `max` keeps a long string from a costly `pattern`, and an asynchronous check, such as one that asks a server whether a name is taken, never sees a value the options already rejected. Once the options pass, every check runs and every issue is reported.

The built-in checks are each imported on their own, and take their message as the last argument:

| Check              | For     | Requires                                                                                                                    | `code` and `params`                                                |
| ------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `pattern(regex)`   | strings | A match. The `g` and `y` flags are ignored, so the same check gives the same answer each time.                              | `invalid_format`, `{ format: "regex", pattern }`                   |
| `startsWith(text)` | strings | This prefix.                                                                                                                | `invalid_format`, `{ format: "startsWith", value }`                |
| `endsWith(text)`   | strings | This suffix.                                                                                                                | `invalid_format`, `{ format: "endsWith", value }`                  |
| `includes(text)`   | strings | This text anywhere.                                                                                                         | `invalid_format`, `{ format: "includes", value }`                  |
| `lowercase()`      | strings | Unchanged by `toLowerCase()`, so a string with no letters passes. It changes nothing; `string({ case: "lower" })` converts. | `invalid_format`, `{ format: "lowercase" }`                        |
| `uppercase()`      | strings | Unchanged by `toUpperCase()`.                                                                                               | `invalid_format`, `{ format: "uppercase" }`                        |
| `nonBlank()`       | strings | A character that is not blank. It changes nothing; `string({ trim: true, min: 1 })` trims.                                  | `invalid_format`, `{ format: "nonBlank" }`                         |
| `multipleOf(step)` | numbers | A multiple of the step, compared as the decimals both are written as, so `0.3` is a multiple of `0.1`.                      | `invalid_value`, `{ type: "number", format: "multipleOf", value }` |
| `nonZero()`        | numbers | Anything but zero.                                                                                                          | `invalid_value`, `{ type: "number", format: "nonZero" }`           |
| `unique(by?)`      | arrays  | Distinct items, as [Request bodies](request-bodies.md#array) explains.                                                      | `invalid_value`, `{ unique: true }`, at each repeat's index        |

Some details:

- The English message of `pattern` shows the expression, as in `Must match /^[a-z0-9_]+$/`. Where people read it, give the check a message: `pattern(regex, "Use letters, digits and _")`.
- For `nonBlank`, blank is white space, format characters (Unicode category Cf), the Hangul fillers and the blank braille pattern, which all render as space. So `""`, `"  "` and a zero-width space fail.
- A `pattern` that is not a regular expression, and a `multipleOf` step that is not a positive finite number, throw when the check is made.
- `multipleOf` is exact for every number in its written form: the shortest text that reads back as the same number, which is what JSON carries. Past `Number.MAX_SAFE_INTEGER`, that text is not always the number the double holds: `2 ** 60` is written `1152921504606847000`, so it is not a multiple of `1024`, though `1e23` is a multiple of `10`.
- A number computed in floating point is not always the decimal it looks like: `0.1 + 0.2` is `0.30000000000000004`, which is not a multiple of `0.1`.

`check(test, issue?)` makes a check of your own. [Custom validators](custom-validators.md) covers it.

## Objects

`object(shape, options?, ...checks)` takes a shape, an object whose values are validators, and returns a validator for objects of that shape. Here is the first version of the sign-up:

```ts
import { email, number, object, optional, string, type Infer } from "@codenhub/validation";

const signup = object({
  name: string({ trim: true, min: 2, max: 100 }),
  email: email(),
  password: string({ min: 12, max: 200 }),
  age: optional(number({ int: true, min: 18 })),
});

export type Signup = Infer<typeof signup>;
// { name: string; email: string; password: string; age?: number | undefined }

signup({ name: "Ada", email: "ada@example.com", password: "correct horse battery" }); // ok
signup({ email: "nope" }); // { ok: false, ... }, code "invalid_type"
```

The second call reports three issues, each at its own path: `["name"]` and `["password"]` are missing, and `["email"]` is not an address. Issue paths lead down to the value that failed, so one inside a list has segments such as `["addresses", 0, "street"]`.

How `object` reads its input:

- It accepts plain objects only, created by `{}`, `Object.create(null)` or `JSON.parse`, in this realm or another, such as an iframe. Arrays, class instances, objects with a prototype of their own, `Map`s, `Date`s and `null` fail with `invalid_type` and `{ expected: "object", received }`.
- It reads only own properties, so a value inherited through the prototype never satisfies a required property.
- It validates every property, even after an earlier one failed.
- A property whose validator accepts `undefined`, such as one wrapped in `optional`, is optional in the type, and is left out of the output when the input does not have it. [Forms](forms.md#optional-fields-and-defaults) covers `optional` and its defaults.
- The output is a new object, and the input is never modified. The copy is shallow: a property's value is what its validator produced. So a value that `unknown()` lets through is the input's own object, and changing it in the output changes the input too.

A shape holds enumerable text keys only. `object` throws a `TypeError` when created with a symbol key or a key that is not enumerable, whose validator would never run.

### Keys the shape does not list

The `unknownKeys` option decides what happens to input properties the shape does not list:

| `unknownKeys`   | Effect                                                                                  |
| --------------- | --------------------------------------------------------------------------------------- |
| `"strip"`       | Drop them from the output. This is the default.                                         |
| `"strict"`      | Reject each with an `unrecognized_key` issue at the key's path, and `params: { key }`.  |
| `"passthrough"` | Copy them to the output unchanged and unchecked, except `__proto__`, which is rejected. |

Any other value, such as a misspelled `"Strict"`, throws a `TypeError` when the validator is created, instead of falling back to `"strip"`.

A passthrough object rejects `__proto__` because a kept `__proto__` key would become the prototype of any copy of the output made by assignment, such as `Object.assign({}, output)`. The issue is `invalid_key` with one issue inside, `invalid_value` with `{ reserved: true }`.

### Objects that are not plain

`objectLike(shape, options?, ...checks)` validates any object that has the listed properties, where `object` accepts plain objects only. Use it for a value handed over as an instance, such as an `Error` or an object with methods, and use `object` for data.

```ts
import { boolean, objectLike, optional, string } from "@codenhub/validation";

const feedback = objectLike({ message: string({ min: 1 }), isRetryable: optional(boolean()) });

feedback(new Error("Try again")); // { ok: true, value: { message: "Try again" } }
feedback({ message: "" }); // { ok: false, ... }, code "too_small"
```

- It accepts every object that is not an array: a plain object, a class instance, a `Map`, a `Date`. Anything else, a function included, fails with `invalid_type` and `{ expected: "object", received }`.
- It reads each listed property as `input[key]`, so a property that is inherited, not enumerable or computed by a getter counts.
- A property that throws while it is read, as a getter or a `Proxy` trap may, is reported as `invalid_value` with `params: { unreadable: true }` at the property's path, and the other properties are still validated.
- The output is a new plain object that holds the listed properties only, without the ones whose value is `undefined`. There is no `unknownKeys` option.
- Its checks run once every property has passed, and see the output.

To choose between instances by a property, put the `objectLike` validators in a `union`. `tagged` reads the tag of a plain object only, as [Request bodies](request-bodies.md#tagged) explains.

## The type a validator produces

`Infer<typeof validator>` is the TypeScript type a validator produces, for a synchronous or an asynchronous validator. The validator is the single source of truth, so there is no separate interface to keep in step with it. In the sign-up above, `Signup` has a required `name`, `email` and `password`, and an optional `age`.

A validator can also accept a type that differs from what it produces, such as text it reads as a number. `InferInput` reads that type, which a form holds: [Forms](forms.md#the-types-of-a-form) covers it.

## Asking only whether a value passes

When you only need a yes or no, use `is(validator, input)`, which returns a `boolean`:

```ts
import { is, number } from "@codenhub/validation";

const isPort = (input: unknown): boolean => is(number({ int: true, min: 1, max: 65535 }), input);

isPort(8080); // true
```

`is` does not narrow the type of its input, and `isPort` is no type guard, for the same reason. A type guard also says that a value that fails is not of the type, which is false of most validators: `string({ min: 3 })` refuses `"ab"`, which is a string. Call the validator and read `result.value` where you want the typed value.

You can wrap `is` in a type guard of your own when the validator accepts every value of the type, as `string()` with no options does: `(input: unknown): input is string => is(string(), input)`. `number()` is not such a validator, since it refuses `NaN`.

`is` accepts synchronous validators only, and throws a `TypeError` for one that returns a promise.

## Sync and async

A validator is synchronous unless something it runs is asynchronous. Checking a name against a database is asynchronous; checking its length is not.

You do not pick a mode. You write the rule, and the types follow: a validator that contains an asynchronous rule is an `AsyncValidator`, its result must be awaited, and the compiler stops you from reading it as if it were ready. Every other validator stays synchronous and pays nothing for the asynchronous ones. [Custom validators](custom-validators.md#asynchronous-rules) has an example.

## Next

The sign-up now has a shape and a type. Next it meets a browser: [Forms](forms.md) turns it into a form, with a password typed twice, optional fields with defaults, an avatar file, and errors shown beside each field.
