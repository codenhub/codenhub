---
title: Issues and messages
description: The shape of a failed result, the built-in issue codes and their params, and how to turn issues into text.
---

# Issues and messages

When a value is not valid, the result says exactly why. This page describes what a failed result holds, the codes the built-in validators report, and how to turn that into text for a person.

## The failed result

```ts
// What a validator returned for { name: "A", email: "nope" }
const result = {
  ok: false,
  error: {
    issues: [
      { code: "too_small", path: ["name"], params: { minimum: 2, type: "string" } },
      { code: "invalid_format", path: ["email"], params: { format: "email" } },
    ],
  },
};
```

`error.issues` lists every problem the validator found, in a fixed order, and is never empty. Its type says so too, so `result.error.issues[0]` is an issue and not `undefined`, even under `noUncheckedIndexedAccess`. A strict `object` reports its unrecognized keys first, then the issues of its properties in the order the shape lists them, whichever finished first.

## The issue

| Field     | Meaning                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `code`    | A stable string naming the kind of failure. Branch on this, never on message text.                                                          |
| `path`    | Where the invalid value is, from the root of what you validated. Keys are strings and array indexes are numbers. Empty for the root itself. |
| `params`  | The facts behind the failure, such as the limit that was crossed. Present when there are any.                                               |
| `message` | Fixed text, when the validator that reported the issue set one. The built-in validators never do; your own can.                             |

**An issue never contains an input value.** There is no field for it, and `params` holds type names and constraint values, never the value under test. Inputs are often passwords or tokens, and issues get logged and shown, so this is a rule and not a default. If you need the value, you already have it.

Keys are not values, and they do appear: a path leads through the keys of the input, so a `record` or `map` issue names the key it belongs to, and a strict `object` reports each key it does not recognize, in its path and in `params.key`. Do not put secrets in key names you validate. What a key spells is also text the sender chose, and `englishMessages` puts it inside the message as a quoted string literal (`Unrecognized key "…"`, with quotes and line breaks in it escaped), as `formatPath` does in the field names of `flatten`, where it is quoted only when it holds `.`, `[`, `]` or `"`. Escape both when you put a message into HTML, and a field name into a log line where a line break would matter.

The same goes for what your own schema names. `literal` and `oneOf` report the values they accept, in `params` and in the English message, so do not use them to check a secret such as an API key: a failed check would print it.

A path can be formatted for display with `formatPath`:

```ts
import { formatPath } from "@codenhub/validation";

formatPath(["user", "addresses", 0, "street"]); // "user.addresses[0].street"
formatPath([0, "title"]); // "[0].title"
formatPath(["a.b"]); // '["a.b"]'
```

A key that is empty or holds `.`, `[`, `]` or `"` is quoted in brackets, so a key named `a.b` and the path `a`, `b` never format the same.

## Built-in codes

The code set is open: a custom validator reports whatever code it likes. These are the ones the built-in validators use.

| Code                   | Meaning                                                                                                                        | `params`                                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid_type`         | The value is not the type expected, or could not be converted to it.                                                           | `expected` and `received`, both type names, and `coerced: true` when a coercing validator could not convert the value.                                                                                                                   |
| `invalid_format`       | A string does not have the required format.                                                                                    | `format`, such as `"email"` or `"regex"`, plus what the rule needs.                                                                                                                                                                      |
| `invalid_value`        | The value has the right type but a value that is not allowed.                                                                  | `expected` for a literal, `options` for a list of values, `unique: true` for a repeat in an array or a set, or, for a number, `type` plus either `format` (`"int"`, `"safeInt"`, `"nonZero"`) or `multipleOf`.                           |
| `too_small`            | Below a minimum: too short, too few items, or too small a number or date.                                                      | `minimum`, `type`, and `inclusive` or `exact` where they apply.                                                                                                                                                                          |
| `too_big`              | Above a maximum, or nested deeper than `lazy` allows.                                                                          | `maximum`, `type` (`"depth"` for `lazy`), and `inclusive` or `exact` where they apply.                                                                                                                                                   |
| `unrecognized_key`     | An object has a property its shape does not list, in strict mode.                                                              | `key`. The issue's path ends at the key.                                                                                                                                                                                                 |
| `invalid_key`          | A key of a `record` or `map` failed its key validator, or its key validator turned it into a key an earlier entry already has. | `issues`: what the key validator found, with paths relative to the key, or for a repeated key one `invalid_value` issue with `unique: true`. The issue's path ends at the key, so it is not mistaken for a problem with the value there. |
| `invalid_intersection` | Both validators of an `intersection` passed, but produced values that cannot be merged into one.                               | None. The issue's path is where the two outputs differ.                                                                                                                                                                                  |
| `invalid_union`        | A value matched none of the options of a `union`, or a tagged union got a missing or unknown tag.                              | For `union`, `issues`: the issues each option found, in order, with paths relative to the union's value. For `discriminatedUnion`, `discriminator` and `options`, and the issue's path is the tag's.                                     |
| `custom`               | The default code of a `refine` check or `fail` call that names no code.                                                        | Whatever the reporter set.                                                                                                                                                                                                               |

`received` names types the same way everywhere: `null`, `array`, `nan`, `infinity`, `date`, `invalid date` for a `Date` holding no moment, `map`, `set`, the class name of an instance, `object` for a plain object or anything that cannot be inspected without throwing, or the `typeof` of anything else. Where a plain object is expected (`object`, `record`, `discriminatedUnion`), one made with a prototype of its own, such as `Object.create({ a: 1 })`, is `non-plain object`.

The validator reference lists the exact code and `params` each validator reports.

## Turning an issue into text

Validators do not build message text when they fail. That keeps them small, and it means text is a choice you make where you show it. `formatIssue` builds it from a message map, and `englishMessages` is the built-in English one:

```ts
import { englishMessages, formatIssue, number } from "@codenhub/validation";

const result = number({ min: 18 })(15);
if (!result.ok) {
  formatIssue(result.error.issues[0], englishMessages); // "Must be at least 18"
}
```

The English wording is a separate value you import, and `formatIssue` does not carry it. A program that words its own issues, or never shows one, does not bundle it, which is about 1 kB gzipped. It also means `formatIssue(issue)` with no map says only "Invalid value", so pass a map wherever you show text.

The text comes from the first of these that exists:

1. The issue's own `message`.
2. An entry for its `code` in the message map you pass as the second argument.
3. The generic "Invalid value".

Two codes carry the issues behind them in `params.issues`. `englishMessages` words `invalid_key` with the first issue the key validator found, as in "Invalid key: Must be at least 3 characters", so a form says why the key is wrong, and words that issue with the map it was given, so an override of `too_small` in a spread of `englishMessages` reaches the key's message too. It words `invalid_union` generically, as "Does not match any of the allowed types", because listing what every option expected reads worse than saying none matched; the per-option issues are in `params.issues` for a message of your own. `flatten` and `standard` use the same wording, so neither lists nested issues separately.

### Rewording and localizing

A message map is an object from code to text. A string is used as it is, and a function receives the issue, so it can use `params`, and the map it was found in, so it can word an issue nested in `params` with `formatIssue(nested, messages)` and the same map. To change some of the English, spread `englishMessages` and override the codes you want; to translate, write a map of your own, and every code you leave out says "Invalid value", so cover the codes your validators can report, which the tables above list:

```ts
import { englishMessages, formatIssue, type Messages } from "@codenhub/validation";

const shorter: Messages = { ...englishMessages, too_small: "Too short" };

const pt: Messages = {
  invalid_type: (issue) => `Esperado ${String(issue.params?.expected)}`,
  too_small: (issue) => `Mínimo de ${String(issue.params?.minimum)}`,
  username_taken: "Este nome de usuário já existe",
};

formatIssue(issue, shorter);
formatIssue(issue, pt);
```

A custom validator's own codes belong in the map too, or can carry a `message` on the issue.

## Errors for a form

`flatten` groups the messages of a failed result for display: issues at the root go to `formErrors`, and the rest are keyed by their formatted path in `fieldErrors`.

```ts
import { englishMessages, flatten } from "@codenhub/validation";

const result = signup(input);
if (!result.ok) {
  const { formErrors, fieldErrors } = flatten(result.error, englishMessages);
  fieldErrors["email"]; // ["Invalid email address"]
  fieldErrors["addresses[0].street"]; // ["Must be at least 3 characters"]
}
```

It takes the same message map as `formatIssue`, and without one every message is "Invalid value". Field keys use the notation of `formatPath`. `fieldErrors` has no prototype, so a field named `constructor` or `toString` cannot be mistaken for an inherited member and `fieldErrors["toString"]` is `undefined` when there is no such field. The price is that it has no methods: ask with `"name" in fieldErrors` or `Object.hasOwn(fieldErrors, "name")`, not `fieldErrors.hasOwnProperty("name")`.

## Reading the result

A result is plain data, so it can be logged, sent to a client or stored, and because no issue holds the input, doing so does not leak what was submitted. One caveat: the bounds of a `bigint` validator are bigints in `params`, which `JSON.stringify` cannot serialize, and those of a `date` validator are `Date`s, which it turns into ISO strings. Convert them first if you send issues as JSON.
