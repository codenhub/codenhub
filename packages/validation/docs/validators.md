---
title: Validator reference
description: Every validator and combinator, with its options, what it produces and the issue it reports.
---

# Validator reference

Every validator here is created by calling a function and is then called with the value to check. Every one returns `{ ok: true, value }` or `{ ok: false, error: { issues } }`, and never throws for invalid input. The code and `params` each failure reports are listed with the validator; [Issues and messages](errors.md) explains what they mean and how to turn them into text.

Options are read once, when the validator is created. An option that makes no sense, such as a negative length, a `NaN` bound, or limits no value can satisfy together such as `{ min: 5, max: 2 }`, throws a `RangeError` or `TypeError` at that point, because it is a mistake in your code and not in the input.

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
| `multipleOf` | A multiple of this positive number, compared as the decimals both are written as, so `0.3` is a multiple of `0.1`.   |
| `nonZero`    | Anything but zero.                                                                                                   |

Positive, negative and their "non-" variants are bounds: positive is `gt: 0`, non-negative is `min: 0`, negative is `lt: 0` and non-positive is `max: 0`. A `NaN` bound, or bounds no finite number can satisfy such as `{ min: 5, max: 2 }`, `{ gt: 1, lt: 1 }` or `{ min: Infinity }`, throws a `RangeError` rather than being ignored. `clamp` throws one for a `NaN` bound or a minimum above its maximum, and `multipleOf` throws one unless it is a positive finite number. `multipleOf` is exact at any size: whole numbers are compared as they are, and anything else as the decimal it is written as, which is what a number parsed from text is. A number computed in floating point is not always the decimal it looks like: `0.1 + 0.2` is `0.30000000000000004`, which is not a multiple of `0.1`.

| Failure                       | `code`          | `params`                                                      |
| ----------------------------- | --------------- | ------------------------------------------------------------- |
| Not a finite number           | `invalid_type`  | `{ expected: "number", received }`                            |
| Below `min` or `gt`           | `too_small`     | `{ minimum, inclusive, type: "number" }`                      |
| Above `max` or `lt`           | `too_big`       | `{ maximum, inclusive, type: "number" }`                      |
| `int`, `safeInt` or `nonZero` | `invalid_value` | `{ type: "number", format: "int" \| "safeInt" \| "nonZero" }` |
| `multipleOf`                  | `invalid_value` | `{ multipleOf }`                                              |

## Booleans

`boolean()` accepts `true` and `false` and produces a boolean. Truthy and falsy values, and text such as `"true"`, fail with `invalid_type` and `{ expected: "boolean", received }`.

## Bigints

`bigint(options?)` accepts bigints and produces a bigint. Numbers, including whole ones, fail with `invalid_type`. The options `min` and `max` are inclusive and `gt` and `lt` are exclusive, all bigints, and fail like the number bounds: `too_small` with `{ minimum, inclusive, type: "bigint" }`, or `too_big` with `{ maximum, inclusive, type: "bigint" }`. Positive is `gt: 0n`, non-negative is `min: 0n` and negative is `lt: 0n`.

Bounds appear in `params` as bigints, which `JSON.stringify` cannot serialize. Convert them first if you send issues as JSON.

## Dates

`date(options?)` accepts valid `Date` objects and produces the same `Date`. An invalid date such as `new Date("nope")`, a timestamp or a string fails with `invalid_type` and `{ expected: "valid date", received }`. To check date text, use [`isoDate` or `datetime`](#formats).

The options `min` and `max` are `Date`s, both inclusive, and throw a `RangeError` when created with an invalid `Date` or with `min` after `max`. They are read when the validator is created, so changing the `Date` objects later has no effect. A date before `min` fails with `too_small` and `{ minimum, inclusive: true, type: "date" }`, and one after `max` with `too_big` and `{ maximum, inclusive: true, type: "date" }`, the bound being a `Date`.

## Fixed values

- `literal(value)` accepts exactly one value, compared with `===`, and produces that value with its exact type, so `literal("admin")` produces `"admin"` and not `string`. Any primitive works, and this is how `null` and `undefined` are validated: `literal(null)`. The one exception is `literal(NaN)`, which matches nothing, since `NaN === NaN` is false.
- `oneOf(values)` accepts any one string or number of a list and produces their union: `oneOf(["admin", "user"])` produces `"admin" | "user"`. The list is copied when the validator is created.
- `nativeEnum(enumObject)` accepts any value of a TypeScript `enum`. It ignores the reverse-mapping names TypeScript adds to a numeric enum, so only the numbers are values.

All three fail with `invalid_value`. `literal` reports `{ expected }` and the other two report `{ options }`, the list of accepted values.

```ts
import { literal, nativeEnum, oneOf } from "@codenhub/validation";

const role = oneOf(["admin", "user"]);
const version = literal("v1");

enum Status {
  Active = "active",
  Archived = "archived",
}
const status = nativeEnum(Status);
```

## Any value, no value and instances

- `unknown()` accepts every value and passes it through unchanged. Use it for a property you do not check.
- `never()` rejects every value with `invalid_type` and `{ expected: "never", received }`. Use it to forbid a property, or for a branch that must never match.
- `instanceOf(Class)` accepts instances of a class, subclasses and abstract classes included, checked with `instanceof`, so an instance from another realm such as an iframe is not recognized. `date`, `map`, `set` and `object` do not have that limit and accept values from any realm. It fails with `invalid_type` and `{ expected: "instance of Class", received }`.

## Formats

A format is a validator for a string of a particular shape. Each accepts a string and produces it unchanged, so trim or lowercase first with `pipe` when the input may need it. Each is imported on its own, so you only ship the ones you use.

A non-string fails with `invalid_type` and `{ expected: "string", received }`. A string that does not match fails with `invalid_format` and `{ format }`, and `format` names it as the table shows.

| Validator    | Accepts                                                                                   | `format`                     |
| ------------ | ----------------------------------------------------------------------------------------- | ---------------------------- |
| `email()`    | An email address with a public domain name.                                               | `"email"`                    |
| `url()`      | An absolute URL with an allowed protocol and a public host.                               | `"url"`                      |
| `uuid()`     | A UUID of version 1 to 8, or the nil or max UUID, hyphenated, in any case.                | `"uuid"`                     |
| `ip()`       | An IPv4 or IPv6 address.                                                                  | `"ip"`, `"ipv4"` or `"ipv6"` |
| `datetime()` | An ISO 8601 date-time such as `2026-09-28T14:30:00Z`, on a day that exists.               | `"datetime"`                 |
| `isoDate()`  | An ISO 8601 calendar date such as `2026-09-28`, on a day that exists.                     | `"date"`                     |
| `hostname()` | A hostname: dot-separated labels of letters, digits and hyphens, the last not all digits. | `"hostname"`                 |
| `hex()`      | One or more hexadecimal digits of any case.                                               | `"hex"`                      |
| `base64()`   | Standard base64 with correct padding. The empty string is base64 of no bytes.             | `"base64"`                   |
| `ulid()`     | A ULID, in any case.                                                                      | `"ulid"`                     |
| `nanoid()`   | A Nano ID in its default form: 21 characters of `A-Za-z0-9_-`.                            | `"nanoid"`                   |
| `cuid2()`    | A CUID2 identifier.                                                                       | `"cuid2"`                    |

`isoDate()` produces a string. To get a `Date`, use `date()` on a `Date` you built yourself.

### `email`

`email(options?)` takes `allowPlus`, default `true`, which controls whether `+` is accepted before the `@`, as in `ada+news@example.com`. The local part is limited to 64 characters and the whole address to 254. The domain may be internationalized, as in `ada@münchen.de`, and is checked in its ASCII (punycode) form, while the local part must be ASCII: an address with other letters before the `@` (RFC 6531) is rejected. Hosts that are not public domain names are rejected: `localhost`, single-label hosts, IP addresses, and special-use names that never reach a public host, which are those ending in `localhost`, `local`, `internal`, `home.arpa`, `test`, `example`, `invalid`, `alt` or `onion`.

```ts
import { email, pipe, string } from "@codenhub/validation";

const address = pipe(string({ trim: true, lowercase: true }), email());

address("  Ada@Example.com "); // { ok: true, value: "ada@example.com" }
```

### `url`

`url(options?)` requires an absolute URL, so `example.com` and `//example.com` are rejected and no scheme is guessed. It rejects embedded credentials such as `https://user:password@example.com`, always. The value is returned as it came, so text the URL parser would quietly clean up is rejected instead: surrounding or embedded whitespace, control characters such as line breaks, backslashes, and a host written without both slashes, such as `https:example.com`, which a page on the same scheme would read as a path on its own host. Trim first with `pipe(string({ trim: true }), url())` when the input may have surrounding spaces. The options are:

| Option       | Meaning                                                                                                                                                                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `protocols`  | Accepted protocols without the colon, in any letter case. Default `["http", "https"]`. The list is copied when the validator is created, and a protocol that is not a scheme name, such as `"https:"`, throws a `TypeError` then, since it would match nothing. |
| `allowLocal` | Accept `localhost`, single-label hosts, every IP address and special-use names such as `db.internal`, which are rejected by default, as for `email`. Default `false`.                                                                                           |

```ts
import { url } from "@codenhub/validation";

url()("https://example.com/a?b=1"); // ok
url()("http://localhost:3000"); // fails: not a public host
url({ allowLocal: true })("http://localhost:3000"); // ok
url({ protocols: ["ftp"] })("ftp://example.com"); // ok
```

Three schemes have no host, and each is checked by its own rules when listed in `protocols`:

| Scheme   | Accepted when                                                                                                                                                                                             |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mailto` | It names at least one recipient, and every recipient, in the path and in `to`, `cc` or `bcc`, is an address `email()` accepts. With `allowLocal`, an address may be on any hostname, such as `localhost`. |
| `tel`    | It is a global number: `+`, digits with `-`, `.`, `(` or `)` between them, then optional `;name=value` parameters. A local number with `phone-context` is rejected.                                       |
| `urn`    | It follows RFC 8141: a namespace of 2 to 32 letters, digits and inner hyphens, a colon, and a non-empty name.                                                                                             |

Any other scheme without a host, such as `data`, `file` or `javascript`, is rejected even when listed and even with `allowLocal`, so listing a protocol never lets a URL through unchecked.

```ts
url({ protocols: ["mailto"] })("mailto:ada@example.com?cc=bob@example.org"); // ok
url({ protocols: ["mailto"] })("mailto:ada@localhost"); // fails: not a public host
url({ protocols: ["tel"] })("tel:+1-201-555-0123"); // ok
url({ protocols: ["urn"] })("urn:isbn:0451450523"); // ok
```

### `ip`

`ip(options?)` takes `version`, `"v4"` or `"v6"`, to accept one address family only. Without it both are accepted. The `format` in the issue is `"ipv4"` or `"ipv6"` when a version is given, and `"ip"` otherwise.

IPv4 is four decimal parts from 0 to 255 without leading zeros, which some parsers read as octal. IPv6 is written as RFC 4291 allows: eight groups of one to four hex digits, one run of zero groups shortened to `::`, and an IPv4 address in place of the last two groups, as in `::ffff:192.0.2.1`, whose parts follow the IPv4 rule. A zone such as `%eth0` is accepted only after a link-local address (`fe80::/10`), the one place it means something.

### `datetime`

`datetime(options?)` requires the `T` separator, a time, and `Z`, and rejects days that do not exist, so `2026-02-30T00:00:00Z` fails. The options are `offset`, default `false`, which accepts a UTC offset such as `+02:00` instead of only `Z`, and `precision`, a non-negative integer, which requires exactly that many fractional-second digits (`0` forbids them; without it they are optional). A `precision` that is not a non-negative integer throws a `RangeError` when the validator is created.

## Objects

`object(shape, options?)` takes a shape, an object whose values are validators, and produces an object with the same keys and the output of each validator.

```ts
import { number, object, optional, string } from "@codenhub/validation";

const user = object({ name: string(), age: optional(number()) });

user({ name: "Ada" }); // { ok: true, value: { name: "Ada" } }
user({ age: "x" }); // two issues: ["name"] and ["age"]
```

- Only plain objects are accepted, whichever realm made them. Arrays, class instances, objects with a prototype of their own, `Map`s, `Date`s and `null` fail with `invalid_type` and `{ expected: "object", received }`.
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

See [Reusing shapes](#reusing-shapes) for extending, omitting and making properties optional.

## Collections

Every collection validator takes the validator for its items, checks them all, and reports each issue with a path that leads through the item's position. A wrong size is reported at once, without validating the items, so a huge input is never worked through only to be rejected.

The size options `min`, `max` and `length` are non-negative integers, and each throws a `RangeError` when created with anything else, as do limits no size can satisfy together, such as `min` above `max` or a `length` outside them. `min` and `max` are inclusive. A size failure is `too_small` with `{ minimum, type }` or `too_big` with `{ maximum, type }`, where `type` is `"array"`, `"set"` or `"map"`, and `exact: true` is added for `length`.

### `array`

`array(element, options?)` accepts arrays whose every item passes `element` and produces a new array of what it produced. It takes `min`, `max` and `length`, and `unique`:

- `unique: true` rejects repeats, comparing the validated items the way a `Set` does. Each repeat is reported at its own index as `invalid_value` with `{ unique: true }`, and the first occurrence is kept.
- `unique: (item) => key` compares the key the function returns, so `unique: (user) => user.id` makes ids unique.

Repeats are checked only once every item is valid. A sparse array's holes are validated as `undefined`.

```ts
import { array, string } from "@codenhub/validation";

const tags = array(string({ trim: true, min: 1 }), { max: 5, unique: true });

tags(["a", "b"]); // ok
tags(["a", "a"]); // fails: invalid_value at path [1]
```

### `tuple`

`tuple(items, options?)` accepts arrays of fixed length in which each position has its own validator, and produces a tuple type. Without `rest` the array must be exactly as long as `items`, and a wrong length fails with `too_small` and `{ minimum, type: "array", exact: true }`, or `too_big` and `{ maximum, type: "array", exact: true }`. With `rest` the array must still have at least as many items as `items`, and only `too_small` is possible, without `exact`. The `rest` option is a validator for every position after the fixed ones, which lets the array be longer.

```ts
import { number, string, tuple } from "@codenhub/validation";

const point = tuple([number(), number()]); // [number, number]
const call = tuple([string()], { rest: number() }); // [string, ...number[]]
```

### `record`

`record(key, value)` accepts plain objects used as a dictionary: any number of keys, each passing `key`, each value passing `value`. An issue's path ends at the key it belongs to. A key that fails is reported as one `invalid_key` issue whose `params.issues` holds what the key validator found, so it is not mistaken for a problem with the value, and a bad key still has its value checked. The output type has every key when `key` produces `string`, and is partial when it produces a fixed set of strings, such as `oneOf(["mon", "tue"])`. A `__proto__` key from parsed JSON is kept as data and never writes to a prototype.

### `set` and `map`

`set(element, options?)` accepts `Set`s and produces a new `Set` of the validated values, and `map(key, value, options?)` accepts `Map`s and produces a new `Map`. Arrays and plain objects are not accepted for them. Paths lead through the position in iteration order for a set, and through the entry's key for a map when it is a string or a number and its position otherwise. A map key that fails is reported as `invalid_key`, as for `record`. Both take `min`, `max` and `length`.

## Combining validators

### `optional`, `nullable` and `nullish`

- `optional(validator)` accepts `undefined`.
- `nullable(validator)` accepts `null`.
- `nullish(validator)` accepts both.

The accepted value is passed through, and every other value goes to `validator`, so `null` and the empty string are not treated as absent by `optional`. Inside an `object`, a property whose validator can produce `undefined` becomes optional in the inferred type, and is left out of the output when absent from the input.

### `withDefault`

`withDefault(validator, value)` replaces `undefined` with a default, and gives every other value to `validator`, so an invalid value is still rejected and only a missing one is replaced. The default is trusted and is not validated. A function is called every time to produce the default, so pass one for an array or object, which would otherwise be shared by every result. Inside an `object`, the property is then always present in the output type.

```ts
import { array, oneOf, string, withDefault } from "@codenhub/validation";

const role = withDefault(oneOf(["admin", "user"]), "user");
const tags = withDefault(array(string()), () => []);
```

### `fallback`

`fallback(validator, value)` replaces a value that fails `validator` with a fallback, so the result never fails. The fallback is trusted and is not validated, and a function receives the issues that were found, which is the place to log them. This turns bad input into a valid-looking value, so reserve it for data where a sensible default is safer than an error, such as a stored preference that may be out of date.

### `pipe`

`pipe(a, b, ...)` runs validators in order, giving each the value the previous one produced, and produces what the last produces. The first failure stops it, because a later step has nothing valid to work on. Use it to clean a value before checking a format, or to check one rule after another.

### `transform`

`transform(validator, convert)` changes the value a validator produced into another, such as text into a `Date`. `convert` runs only when `validator` succeeded and cannot reject the value: to fail, write a validator that returns `fail(...)` and put it after this one with `pipe`. A `convert` that returns a promise makes the result asynchronous. A `convert` that throws is a bug and propagates.

```ts
import { string, transform } from "@codenhub/validation";

const length = transform(string(), (text) => text.length);
```

### `refine`

`refine(validator, check, issue?)` adds a rule that `validator` cannot express. It runs only when `validator` succeeded, and receives the value `validator` produced. `check` returns `true` for an acceptable value. The optional `issue` says how a rejection is reported: a string is the message, and an object can set a `code`, `path`, `params` and `message`. Without it the issue has code `custom`.

```ts
import { object, refine, string } from "@codenhub/validation";

const signup = refine(object({ password: string({ min: 8 }), confirm: string() }), (data) => data.password === data.confirm, { code: "mismatch", path: ["confirm"], message: "Passwords must match" });
```

A `check` that returns a promise makes the result asynchronous; see [Custom validators](custom-validators.md#asynchronous-rules).

## Choosing between validators

### `union`

`union(options)` accepts a value that passes any one of several validators and produces what the first one that accepts it produced, so put the more specific options first. A value that none accepts fails with one `invalid_union` issue at the value's own location, and `params.issues` lists, for each option in order, the issues it found. Those paths are relative to the value the union received.

```ts
import { number, string, union } from "@codenhub/validation";

const id = union([string({ min: 1 }), number({ int: true })]);
```

### `discriminatedUnion`

`discriminatedUnion(key, variants)` is for objects that share a tag property and differ in the rest, such as events with a `type`. It takes the name of the tag property and a record with a validator for each tag value. The input's tag chooses the variant, the variant validates the rest of the input, and a failure reports that variant's own issues instead of a list of everything that did not match.

```ts
import { discriminatedUnion, number, object, string, type Infer } from "@codenhub/validation";

const event = discriminatedUnion("type", {
  click: object({ x: number(), y: number() }),
  key: object({ key: string({ min: 1 }) }),
});

type Event = Infer<typeof event>;
// { type: "click"; x: number; y: number } | { type: "key"; key: string }

event({ type: "key", key: "a" }); // { ok: true, value: { type: "key", key: "a" } }
```

**A variant must not list the tag.** Unlike some other libraries, where each variant is `object({ type: literal("click"), ... })`, a variant here is given the input without its tag, so a variant that lists it fails with `invalid_value` at the tag's path even though the input's tag is right. The record key already says which tag the variant is for.

A variant does not list the tag property itself, and does not see it, so a strict `object` works as a variant: the tag is added back to the output, so the result is a proper tagged union and checking `event.type` narrows the type. A missing, unknown or non-string tag fails with `invalid_union`, at the tag's path, with `params: { discriminator, options }` listing the accepted tags. Each variant must produce an object.

### `intersection`

`intersection(left, right)` accepts a value only when it passes both validators, reports the issues of both together, and produces the two outputs merged. Plain objects are merged key by key, recursively, and for anything else the right validator's output wins.

## Recursive data and JSON

### `lazy`

`lazy(getter)` looks up another validator the first time it runs, so a validator can refer to itself. TypeScript cannot infer a type that refers to itself, so annotate the variable with the type it produces:

```ts
import { array, lazy, object, string, type Validator } from "@codenhub/validation";

interface Category {
  name: string;
  children: Category[];
}

const category: Validator<Category> = object({
  name: string(),
  children: array(lazy(() => category)),
});
```

Each level of nesting is one level of recursion, which the JavaScript stack can only hold so many of, so `lazy` counts them. `lazy(getter, { maxDepth })` takes the most levels of `lazy` that may be open at once, 128 by default, counting every `lazy` validator and not only that one, and a value found deeper fails with `too_big` and `{ maximum, type: "depth" }` at its own path. A request body of thousands of nested arrays and a cyclic object, which a recursive validator would follow forever, both come back as that failure and never throw. Raise `maxDepth` only for data you know is deeper, and only as far as the stack of your runtime holds for the validators you wrote. `maxDepth` must be a positive integer, or `lazy` throws a `RangeError` when created.

The limit is about the stack and not about size, so it does not stop a large flat input: cap the size of untrusted input, for instance with `pipe(string({ max: 100_000 }), json(category))`, and give `array` a `max`.

### `json`

`json(validator?)` accepts text that holds JSON, parses it, and then gives the parsed value to `validator` when there is one. A non-string fails with `invalid_type`, and text that is not JSON fails with `invalid_format` and `{ format: "json" }`. Without a validator the result is `unknown`. Paths of issues from `validator` are relative to the parsed value.

## Reusing shapes

A shape is an ordinary object, so it is reused with ordinary JavaScript: spread one into another to extend it, and leave keys out with destructuring. `partial(shape)` returns a new shape with every property wrapped in `optional`, for an update where any field may be left out. The original shape is unchanged, so the required version is still there to use.

```ts
import { email, number, object, partial, string } from "@codenhub/validation";

const user = { name: string({ min: 2 }), email: email() };

const create = object(user);
const update = object(partial(user)); // every property optional
const withAge = object({ ...user, age: number() });
```

## Coercing text input

The coercing validators accept text that holds a value, convert it, and then apply the constraints of their strict counterpart: `coerceString` and `string`, `coerceNumber` and `number`, `coerceBoolean` and `boolean`, `coerceBigint` and `bigint`, `coerceDate` and `date`. They take the same options, and fail with `invalid_type` and `coerced: true` in `params` when the value cannot be converted. [Coercion](coercion.md) lists exactly what each accepts and refuses, and how to read a whole environment or form with them.

## Exposing a validator to other libraries

`standard(validator, messages)` returns the validator with the `~standard` property that [Standard Schema](standard-schema.md) asks for, so libraries that accept one can take it directly. Its `messages` map, such as `englishMessages`, supplies the text that specification requires on every issue.

## Working with results

### `formatIssue`, `flatten`, `formatPath` and `englishMessages`

`formatIssue(issue, messages?)` turns an issue into text, `flatten(failure, messages?)` groups the text of a failure by field for a form, and `formatPath(path)` writes a path as `user.addresses[0].street`. The text comes from the issue's own `message`, then a message map you pass, then "Invalid value". `englishMessages` is the built-in English map, a separate value so that a program that words its own issues does not bundle it. [Issues and messages](errors.md) explains all four.

### `Infer`

`Infer<typeof validator>` is the type a validator produces. It reads the output of either a synchronous or an asynchronous validator.

### `is`

`is(validator, input)` returns whether `input` passes, and narrows it to the validator's output type. It accepts synchronous validators only, and throws a `TypeError` if the validator turns out to return a promise. The narrowing is exact for a validator that does not change the value; for one that trims, clamps or transforms, read `result.value` from calling the validator.

### `pass` and `fail`

`pass(value)` and `fail(...issues)` build results, and are what a validator you write returns. See [Custom validators](custom-validators.md).

### Types

`Validator<T>`, `AsyncValidator<T>`, `AnyValidator`, `ValidationResult<T>`, `ValidationOk<T>`, `ValidationErr`, `ValidationFailure`, `ValidationIssue`, `ValidationIssueCode`, `ValidationPathSegment`, `IssueInput`, `Composed`, `Shape`, `InferShape`, `StringOptions`, `NumberOptions`, `BigintOptions`, `DateOptions`, `EmailOptions`, `UrlOptions`, `IpOptions`, `DatetimeOptions`, `ObjectOptions`, `ArrayOptions`, `TupleOptions`, `SizeOptions`, `RefineIssue`, `InferTuple`, `InferRecord`, `InferDiscriminated`, `Variants`, `PartialShape`, `LiteralValue`, `EnumLike`, `Constructor`, `Messages`, `FlattenedErrors` and `StandardSchemaV1` are exported for annotating your own code. Each is documented in the source, and the ones you meet in everyday use are explained in [Custom validators](custom-validators.md) and [Issues and messages](errors.md).
