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

`error.issues` lists every problem the validator found, in a fixed order, and is never empty. Objects report the issues of their properties in the order the shape lists them, whichever finished first.

## The issue

| Field     | Meaning                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `code`    | A stable string naming the kind of failure. Branch on this, never on message text.                                                          |
| `path`    | Where the invalid value is, from the root of what you validated. Keys are strings and array indexes are numbers. Empty for the root itself. |
| `params`  | The facts behind the failure, such as the limit that was crossed. Present when there are any.                                               |
| `message` | Fixed text, when the validator that reported the issue set one. The built-in validators never do; your own can.                             |

**An issue never contains the input.** There is no field for it, and `params` holds type names and constraint values, never the value under test. Inputs are often passwords or tokens, and issues get logged and shown, so this is a rule and not a default. If you need the value, you already have it.

A path can be formatted for display with `formatPath`:

```ts
import { formatPath } from "@codenhub/validation";

formatPath(["user", "addresses", 0, "street"]); // "user.addresses[0].street"
formatPath([0, "title"]); // "[0].title"
```

## Built-in codes

The code set is open: a custom validator reports whatever code it likes. These are the ones the built-in validators use.

| Code               | Meaning                                                                                           | `params`                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid_type`     | The value is not the type expected, or could not be converted to it.                              | `expected` and `received`, both type names, and `coerced: true` when a coercing validator could not convert the value.                                                                               |
| `invalid_format`   | A string does not have the required format.                                                       | `format`, such as `"email"` or `"regex"`, plus what the rule needs.                                                                                                                                  |
| `invalid_value`    | The value has the right type but a value that is not allowed.                                     | `expected` for a literal, `options` for a list of values, `unique: true` for a repeat in an array, or `type` plus `format` (`"int"`, `"safeInt"`, `"nonZero"`) or `multipleOf` for a number.         |
| `too_small`        | Below a minimum: too short, too few items, or too small a number or date.                         | `minimum`, `type`, and `inclusive` or `exact` where they apply.                                                                                                                                      |
| `too_big`          | Above a maximum.                                                                                  | `maximum`, `type`, and `inclusive` or `exact` where they apply.                                                                                                                                      |
| `unrecognized_key` | An object has a property its shape does not list, in strict mode.                                 | `key`. The issue's path ends at the key.                                                                                                                                                             |
| `invalid_union`    | A value matched none of the options of a `union`, or a tagged union got a missing or unknown tag. | For `union`, `issues`: the issues each option found, in order, with paths relative to the union's value. For `discriminatedUnion`, `discriminator` and `options`, and the issue's path is the tag's. |
| `custom`           | The default code of a `refine` check or `fail` call that names no code.                           | Whatever the reporter set.                                                                                                                                                                           |

`received` names types the same way everywhere: `null`, `array`, `nan`, `infinity`, `date`, `map`, `set`, the class name of an instance, or the `typeof` of anything else.

The validator reference lists the exact code and `params` each validator reports.

## Turning an issue into text

Validators do not build message text when they fail. That keeps them small, and it means text is a choice you make where you show it. `formatIssue` builds it from a message map, and `englishMessages` is the built-in English one:

```ts
import { englishMessages, formatIssue, number } from "@codenhub/validation";

const result = number({ min: 18 })(15);
if (!result.ok) {
  formatIssue(result.error.issues[0]!, englishMessages); // "Must be at least 18"
}
```

The English wording is a separate value you import, and `formatIssue` does not carry it. A program that words its own issues, or never shows one, does not bundle it, which is about 1 kB gzipped. It also means `formatIssue(issue)` with no map says only "Invalid value", so pass a map wherever you show text.

The text comes from the first of these that exists:

1. The issue's own `message`.
2. An entry for its `code` in the message map you pass as the second argument.
3. The generic "Invalid value".

### Rewording and localizing

A message map is an object from code to text. A string is used as it is, and a function receives the issue, so it can use `params`. To change some of the English, spread `englishMessages` and override the codes you want; to translate, write a map of your own, and every code you leave out says "Invalid value", so cover the codes your validators can report, which the tables above list:

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

It takes the same message map as `formatIssue`, and without one every message is "Invalid value". Field keys use the notation of `formatPath`.

## Reading the result

A result is plain data, so it can be logged, sent to a client or stored, and because no issue holds the input, doing so does not leak what was submitted. One caveat: the bounds of a `bigint` validator are bigints in `params`, which `JSON.stringify` cannot serialize, and those of a `date` validator are `Date`s, which it turns into ISO strings. Convert them first if you send issues as JSON.
