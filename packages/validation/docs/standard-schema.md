---
title: Standard Schema
description: Use a validator wherever a library accepts a Standard Schema, such as form libraries, API frameworks and routers.
---

# Standard Schema

[Standard Schema](https://standardschema.dev/) is a small shared interface that lets libraries accept a validator without depending on the one that made it. Form libraries, API frameworks and routers that support it take any conforming validator, from any library, directly. `standard` makes a validator conforming.

```ts
import { email, englishMessages, number, object, standard } from "@codenhub/validation";

const signup = standard(object({ email: email(), age: number({ int: true }) }), englishMessages);

signup["~standard"].validate({ email: "nope", age: 1.5 });
// {
//   issues: [
//     { message: "Invalid email address", path: ["email"] },
//     { message: "Must be an integer", path: ["age"] },
//   ],
// }
```

Pass `signup` to the library that asks for a Standard Schema, and it will call `~standard.validate` itself. You do not call it yourself unless you are writing that library.

## What `standard` returns

A validator that behaves exactly as the one you gave, with the `~standard` property added, so it is still an ordinary validator you can call and compose. The validator you gave is not modified, so the same one can be exposed twice, with different messages for different audiences.

`~standard.validate` returns `{ value }` on success and `{ issues }` on failure, and never both. It returns its result directly for a synchronous validator and a `Promise` for an asynchronous one, which the specification allows. That holds even for a validator of your own that returns another kind of thenable, such as a query builder's, since callers tell the two apart with `instanceof Promise` and would read anything else as a result without issues. The input type is what the validator accepts, [`InferInput`](validators.md#inferinput), and the output type is what it produces, so a library that infers types from a Standard Schema gets both: a form library types a field that holds text for `coerceNumber()` as text, and what it hands you after validation as a number.

The package exports the `StandardSchemaV1` type so you can accept one in your own code.

## Messages

The specification requires a message on every issue, and this is the one place this package builds it, so a program that never uses `standard` never bundles the text. `standard` therefore takes the message map as its second argument, and it is required, so `standard` throws a `TypeError` when created without one: pass `englishMessages` for the built-in English, or a map of your own. Messages then come from [`formatIssue`](errors.md#turning-an-issue-into-text): an issue's own `message`, then an entry for its `code` in the map, then the map's `default` entry, then "Invalid value".

```ts
import { englishMessages, number, standard } from "@codenhub/validation";

const age = standard(number({ min: 18 }), {
  ...englishMessages,
  too_small: (issue) => `Você precisa ter pelo menos ${String(issue.params?.minimum)} anos`,
});
```

Each issue's `path` is the issue's own path, as an array of strings and numbers.

## A note on functions

A validator here is a function, and `standard` attaches `~standard` to a function. The specification allows any object, and libraries that follow it read the property, so this works. A library that insists on `typeof schema === "object"` before looking would not recognize it; if you meet one, wrap the validator in an object of your own: `{ "~standard": standard(validator, englishMessages)["~standard"] }`.
