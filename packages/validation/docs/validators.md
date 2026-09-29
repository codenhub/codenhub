---
title: Validator reference
description: Every factory on val and every rule on the validators it returns, with failure codes.
order: 10
---

# Validator reference

`val` holds one factory per kind of data. Each returns a validator, and each validator has rules you chain onto it. This page lists all of them. Rules that every validator shares (`optional`, `refine`, `transform` and the rest) come first, since they apply to everything below.

Conventions used throughout:

- **Failure code** is the `code` of the issue a rule reports. Built-in issues carry the facts behind the failure in `params`, listed in [Errors and messages](errors.md); issues from your own rules may omit it.
- **Messages.** The last argument of a rule is an optional `message`: a string, or a function that builds one from the issue. A rule that takes options puts `message` inside them instead. Type failures accept a message as the factory's only argument, for example `val.string("Enter some text")`.
- **Limits are checked when you build the schema.** `val.string().min(-1)` throws a `RangeError` immediately instead of failing every input later.
- **Rules run in the order you chain them** and all of them report, so `val.string().min(5).email()` can produce two issues for one value.

## Shared by every validator

| Method                        | What it does                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `optional()`                  | Also accepts `undefined`. The output type gains `undefined`.                                                                                                  |
| `nullable()`                  | Also accepts `null`.                                                                                                                                          |
| `nullish()`                   | Also accepts `null` and `undefined`.                                                                                                                          |
| `default(value)`              | Replaces `undefined` input with `value`, or with the result of calling it when it is a function. The default is used as given and is not validated.           |
| `catch(fallback)`             | Replaces a failed validation with `fallback`, or with the result of calling it with the discarded issues. Exceptions thrown by your callbacks are not caught. |
| `refine(predicate, options?)` | A yes-or-no rule. See [Customization](customization.md).                                                                                                      |
| `check(fn)`                   | A rule that reports its own issues. See [Customization](customization.md).                                                                                    |
| `transform(fn)`               | Maps the validated value to another value.                                                                                                                    |
| `pipe(next)`                  | Feeds the output into another validator.                                                                                                                      |
| `and(other)`                  | The input must satisfy both. Object outputs are merged.                                                                                                       |
| `or(other)`                   | The input may satisfy either one. Tried in order.                                                                                                             |

`refine` and `check` return the same validator type, so `val.string().refine(...).max(20)` and `val.object(...).refine(...).extend(...)` work. `optional`, `nullable`, `default`, `catch`, `transform`, `pipe`, `and` and `or` wrap the validator: the result is a general validator without the original's type-specific rules, so add those rules first.

## Strings

`val.string(message?)` accepts strings and nothing else. Failure code of a wrong type: `invalid_type`.

| Rule                                                       | Accepts                                                                                                                                                                                                                                      | Failure code          |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `min(length)`                                              | At least `length` characters (UTF-16 code units, as `String.length` counts them).                                                                                                                                                            | `too_small`           |
| `max(length)`                                              | At most `length` characters.                                                                                                                                                                                                                 | `too_big`             |
| `length(length)`                                           | Exactly `length` characters.                                                                                                                                                                                                                 | `too_small`/`too_big` |
| `nonEmpty()`                                               | At least one character. Whitespace counts; `trim()` first to reject blank strings.                                                                                                                                                           | `too_small`           |
| `email({ allowPlus?, message? })`                          | An address with a public domain name, at most 254 characters, local part at most 64. `allowPlus` defaults to `true`.                                                                                                                         | `invalid_format`      |
| `url({ protocols?, allowLocal?, message? })`               | An absolute URL. `protocols` defaults to `["http", "https"]`. Credentials in the URL are rejected. The host must be a public domain name unless `allowLocal` is `true`, which also accepts `localhost`, single-label hosts and IP addresses. | `invalid_format`      |
| `uuid()`                                                   | A hyphenated UUID of version 1 to 8.                                                                                                                                                                                                         | `invalid_format`      |
| `ulid()`                                                   | A ULID, in any case.                                                                                                                                                                                                                         | `invalid_format`      |
| `nanoid()`                                                 | A default Nano ID: 21 characters of `A-Za-z0-9_-`.                                                                                                                                                                                           | `invalid_format`      |
| `cuid2()`                                                  | A CUID2.                                                                                                                                                                                                                                     | `invalid_format`      |
| `ip({ version?, message? })`                               | An IPv4 or IPv6 address. `version: "v4"` or `"v6"` narrows it.                                                                                                                                                                               | `invalid_format`      |
| `hostname()`                                               | Dot-separated labels of letters, digits and hyphens. Single labels such as `localhost` are accepted.                                                                                                                                         | `invalid_format`      |
| `datetime({ offset?, precision?, message? })`              | An ISO 8601 date and time such as `2026-09-28T14:30:00Z`, on a day that exists. `offset: true` allows `+02:00`; `precision` fixes the digits of fractional seconds (`0` forbids them).                                                       | `invalid_format`      |
| `date()`                                                   | An ISO 8601 calendar date such as `2026-09-28`, on a day that exists.                                                                                                                                                                        | `invalid_format`      |
| `base64()`                                                 | Standard base64 with padding.                                                                                                                                                                                                                | `invalid_format`      |
| `hex()`                                                    | Hexadecimal digits of any case.                                                                                                                                                                                                              | `invalid_format`      |
| `regex(pattern)`                                           | A match of `pattern`. The `g` and `y` flags are ignored so the answer does not depend on earlier calls.                                                                                                                                      | `invalid_format`      |
| `startsWith(prefix)`, `endsWith(suffix)`, `includes(text)` | The string starts with, ends with or contains the text.                                                                                                                                                                                      | `invalid_format`      |
| `trim()`, `toLowerCase()`, `toUpperCase()`                 | Not rules: they change the value, for the rules after them and for the output.                                                                                                                                                               | none                  |

The format rules validate; they never rewrite. `val.string().email().validate("Ada@Example.COM")` returns the value exactly as given. To normalize, say so: `val.string().trim().toLowerCase().email()`.

## Numbers and bigints

`val.number(message?)` accepts finite numbers. `NaN`, `Infinity` and `-Infinity` are always rejected, and numeric strings are not converted (see [Coercion](coercion.md) for that).

| Rule                                                         | Accepts                                                                                | Failure code           |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ---------------------- |
| `min(n)`, `max(n)`                                           | At least, or at most, `n`.                                                             | `too_small`, `too_big` |
| `gt(n)`, `lt(n)`                                             | Strictly greater than, or less than, `n`.                                              | `too_small`, `too_big` |
| `positive()`, `negative()`, `nonNegative()`, `nonPositive()` | Above, below, at or above, at or below zero.                                           | `too_small`, `too_big` |
| `nonZero()`                                                  | Any value except zero.                                                                 | `invalid_value`        |
| `int()`                                                      | A whole number.                                                                        | `invalid_value`        |
| `safeInt()`                                                  | A whole number a double represents exactly (within `Number.MAX_SAFE_INTEGER`).         | `invalid_value`        |
| `multipleOf(step)`                                           | A multiple of `step`, tolerating floating-point error so `0.3` is a multiple of `0.1`. | `invalid_value`        |
| `clamp(min, max)`                                            | Not a rule: moves the value into the range instead of rejecting it.                    | none                   |

`val.bigint(message?)` accepts bigints and supports `min(n)`, `max(n)`, `positive()` and `negative()` with bigint arguments.

## Booleans and dates

`val.boolean(message?)` accepts `true` and `false`. `.true()` and `.false()` pin the value, which is how you require a checkbox to be ticked: `val.boolean().true("You must accept the terms")`.

`val.date(message?)` accepts `Date` instances that are valid; `Invalid Date` is rejected. `min(date)` and `max(date)` are inclusive (`too_small`, `too_big`). Timestamps and date strings are not converted; see [Coercion](coercion.md).

## Fixed values

| Factory                            | Accepts                                                                                                               |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `val.literal(value, message?)`     | Exactly `value`, compared with `===`: a string, number, boolean, bigint, symbol, `null` or `undefined`.               |
| `val.enum(values, message?)`       | One of a list of strings or numbers. Pass a literal array (`["a", "b"]`) and the type is the union of its members.    |
| `val.nativeEnum(object, message?)` | The values of a TypeScript `enum` or an `as const` object. Reverse-mapped names of numeric enums are not accepted.    |
| `val.null()`, `val.undefined()`    | Only `null`, or only `undefined`.                                                                                     |
| `val.unknown()`                    | Anything, unchecked. Use it for a value you do not care about, or before a `check` or `transform` does the real work. |
| `val.never(message?)`              | Nothing: every value fails. Forbids a property, or marks a union branch that must never match.                        |
| `val.instanceOf(Class, message?)`  | Instances of a class, subclasses included.                                                                            |

Failure code: `invalid_value` for literals and enums, `invalid_type` for `instanceOf`, `never` and the type check of every other validator.

## Objects

`val.object(shape, message?)` validates each property against the validator listed for it. Notes on what it accepts are in the [overview](index.md#objects).

| Method                     | What it does                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `strict()`                 | Rejects properties not in the shape, one `unrecognized_key` issue each.                                                        |
| `passthrough()`            | Copies properties not in the shape to the output, unvalidated.                                                                 |
| `strip()`                  | Drops them. This is the default.                                                                                               |
| `extend(shape)`            | Adds properties, replacing any with the same name. Pass another object's `.shape` to merge two objects.                        |
| `pick(keys)`, `omit(keys)` | Keeps only, or removes, the listed properties.                                                                                 |
| `partial()`                | Makes every property optional.                                                                                                 |
| `required(keys?)`          | Undoes `.optional()` on the listed properties, or all of them. A property that was not wrapped by `.optional()` is left alone. |
| `keyof()`                  | An enum validator of the property names.                                                                                       |
| `shape`                    | The property validators, for building other schemas from this one.                                                             |

`strict`, `passthrough` and `strip` keep rules added with `refine` and `check`. The methods that change the shape do not, because the output type changes with the shape; add rules after deriving.

## Collections

| Factory                            | Accepts                                                                                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `val.array(item, message?)`        | Arrays whose items all satisfy `item`. Rules: `min(n)`, `max(n)`, `length(n)`, `nonEmpty()`, `unique(by?)`. Use `val.unknown()` to accept any item. |
| `val.tuple([a, b, ...], message?)` | Arrays with one validator per position and exactly that length. `.rest(validator)` accepts extra items of one type after them.                      |
| `val.record(key, value, message?)` | Plain objects used as dictionaries, where every key satisfies `key` and every value satisfies `value`. Use `val.string()` for any key.              |
| `val.set(item, message?)`          | `Set` instances whose values satisfy `item`. Rules: `min(n)`, `max(n)`, `nonEmpty()`.                                                               |
| `val.map(key, value, message?)`    | `Map` instances. Rules: `min(n)`, `max(n)`, `nonEmpty()`.                                                                                           |

Size rules report `too_small` or `too_big`. `unique()` reports `invalid_value` at the index of each repeated item, and compares items with `Map` semantics: objects match only by identity, so pass a key function to compare by content, as in `.unique((user) => user.id)`. It runs on the output, after items were transformed.

Where an issue is located:

- **Arrays and tuples:** the item's index, `[2]`.
- **Sets:** the position of the value in iteration order.
- **Records:** the key. An issue on the key itself sits at the same place as one on the value.
- **Maps:** the key when it is a string or a number, and the position in iteration order otherwise. Issues on the key are located at the same entry as issues on the value.

A record keyed by a union of literals, such as `val.record(val.enum(["admin", "user"]), val.number())`, infers `Partial<Record<...>>` because the validator does not require every key to be present.

## Combining validators

| Factory                                           | Accepts                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `val.union([a, b, ...], message?)` or `a.or(b)`   | Input that satisfies any of them, tried in order, first match wins. When none matches, one `invalid_union` issue carries each variant's issues in `params.issues`.                                                                                                                                                                                                      |
| `val.discriminatedUnion(key, variants, message?)` | Objects of several shapes told apart by one property. Reads the discriminator, picks the one variant it names and validates only against it, so issues describe the shape the input meant. Each variant must declare `key` with `val.literal()` or `val.enum()`, and no value may be claimed twice: both are checked when you build the schema and throw a `TypeError`. |
| `val.intersection(a, b)` or `a.and(b)`            | Input that satisfies both. All issues from both are reported. Plain-object outputs are merged deeply; for anything else the right-hand output wins.                                                                                                                                                                                                                     |
| `val.lazy(() => schema)`                          | A schema built on first use, so it can refer to itself. Annotate the variable with `Validator<T>`: TypeScript cannot infer a type that mentions itself.                                                                                                                                                                                                                 |

Prefer `discriminatedUnion` over `union` for objects that share a tag: its errors say what is wrong with the variant you meant, instead of listing every variant's complaints.

```ts
interface Category {
  name: string;
  children: Category[];
}

const category: Validator<Category> = val.lazy(() => val.object({ name: val.string(), children: val.array(category) }));
```

## Other factories

| Factory                              | What it does                                                                                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `val.json(schema?, message?)`        | Accepts a string holding JSON and outputs the parsed value, validated against `schema` when given. Invalid JSON reports `invalid_format`. |
| `val.custom<T>(predicate, options?)` | A predicate turned into a validator for a type none of the built-ins describe. See [Customization](customization.md).                     |
| `val.coerce.*`                       | Validators that convert text input first. See [Coercion](coercion.md).                                                                    |
