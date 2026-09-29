---
title: Errors and messages
description: The shape of issues and errors, the built-in codes and their params, message functions, and displaying errors next to form fields.
order: 20
---

# Errors and messages

When a value is invalid, the package tells you everything it found, in a shape you can branch on, display, or translate. This page covers that shape and how to change the wording.

## Issues

An issue describes one problem:

```ts
interface ValidationIssue {
  code: string; // stable category, safe to branch on
  message: string; // human-readable, meant for people
  path: (string | number)[]; // where the value sits, from the root of the input
  params?: Record<string, unknown>; // the facts behind the failure
  input?: unknown; // the invalid value, only with includeInput: true
}
```

`path` is the route from the root of the input to the offending value: `["user", "emails", 1]` means `input.user.emails[1]`. An empty path is the root itself. `formatPath` turns a path into text such as `user.emails[1]`.

Branch on `code` and `params`, never on `message`. Messages are for humans and can be reworded, localized, or replaced by you.

## ValidationError

A failed `validate` puts a `ValidationError` in `result.error`, and `parse` throws it. It is a normal `Error` with one extra field, `issues`, holding every issue found, in the order the schema encountered them. It is never empty.

Its `message` is the message of the single issue, prefixed with the path when there is one (`email: Invalid email address`), or a list when there are several:

```text
2 validation issues:
- email: Invalid email address
- age: Must be at least 18
```

## Codes

| Code               | Meaning                                                                   | Typical `params`                                                                  |
| ------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `invalid_type`     | The value is not the type expected, or coercion could not convert it.     | `{ expected: "string", received: "number" }`, plus `coerced: true` for coercion.  |
| `invalid_value`    | The type is right and the value is not allowed: an enum, an integer rule. | `{ options: [...] }` for enums, `{ expected }` for literals, `{ format: "int" }`. |
| `invalid_format`   | A string does not have the required format.                               | `{ format: "email" }`, and the name of the format for every string format.        |
| `too_small`        | Below a minimum: a length, a size, a number, a date.                      | `{ minimum, inclusive?, type, exact? }`                                           |
| `too_big`          | Above a maximum.                                                          | `{ maximum, inclusive?, type, exact? }`                                           |
| `unrecognized_key` | A `strict()` object received a property its shape does not list.          | `{ key }`                                                                         |
| `invalid_union`    | No variant of a union matched, or a discriminator matched none.           | `{ issues }` for `union`, `{ discriminator, options }` for `discriminatedUnion`.  |
| `custom`           | Reported by a `refine`, `check` or `transform` without a code of its own. | whatever you set                                                                  |

`type` in `too_small` and `too_big` names what was measured: `"string"`, `"number"`, `"bigint"`, `"date"`, `"array"`, `"set"` or `"map"`. `exact: true` marks a `length()` rule, where the value can be too small or too big.

The list is a set of suggestions, not a closed enum. Any string is a valid code, so your own checks can report `username_taken` or `password_too_common`, and consumers can branch on them like the built-in ones.

## Input values stay out of errors

Errors often end up in logs, error trackers and API responses, and the invalid value is frequently a password or a token. So the package never puts the input into an issue by default, and its built-in messages name types instead of echoing values: `Expected number, received string`, never `Expected number, received hunter2`.

Pass `includeInput: true` to keep the value as `issue.input` while debugging or when you know it is safe:

```ts
schema.validate(body, { includeInput: true });
```

Your own messages are yours to write, but the same care applies: do not interpolate the input into a message you return from a check.

## Changing the wording

Every rule accepts an optional `message`, either a string or a function.

```ts
val.string().min(3, "Too short");
val.string().min(3, ({ params }) => `Use at least ${params?.minimum} characters`);
val.string("Enter some text").email({ message: "That does not look like an email" });
```

A message function receives the details of the issue, everything except the message itself: `code`, `path`, `params` and, with `includeInput`, `input`. Because built-in issues put their facts in `params`, a function can build any wording from them, including in another language.

### Localizing

There is no built-in translation table on purpose: a table would have to ship every language. Instead, a function that maps issue details to a translated string plugs straight in wherever a message goes. Write it once:

```ts
import { type IssueDetails } from "@codenhub/validation";

const pt = (details: IssueDetails): string => {
  switch (details.code) {
    case "too_small":
      return `Mínimo de ${details.params?.minimum}`;
    case "invalid_format":
      return `Formato inválido (${details.params?.format})`;
    default:
      return "Valor inválido";
  }
};

val.string().min(3, pt).email({ message: pt });
```

To translate messages you did not set, convert issues after validation, when you present them:

```ts
const errors = result.error.issues.map((issue) => translate(issue.code, issue.params));
```

## Showing errors next to form fields

`error.flatten()` groups messages the way a form needs them:

```ts
const { formErrors, fieldErrors } = result.error.flatten();
// formErrors: messages of issues at the root, which belong to no field
// fieldErrors: { "email": ["Invalid email address"], "tags[1]": ["Must not be empty"] }
```

Field keys use the same notation as `formatPath`. The `fieldErrors` object has no prototype, so a field named `constructor` or `toString` cannot collide with anything inherited.

## Stopping early

By default a schema reports everything it finds, which is what a form wants. For a request handler that will reject the whole request anyway, `abortEarly: true` stops at the first issue and does less work:

```ts
schema.parse(body, { abortEarly: true });
```
