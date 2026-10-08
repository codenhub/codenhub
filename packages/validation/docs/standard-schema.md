---
title: Standard Schema
description: Use a validator wherever a library accepts a Standard Schema, such as form libraries, API frameworks and routers.
---

# Standard Schema

[Standard Schema](https://standardschema.dev/) is a small shared interface that lets libraries accept a validator without depending on the one that made it. Form libraries, API frameworks and routers that support it take any conforming validator, from any library, directly. Every validator a factory of this package makes is one as it is:

```ts
import { email, number, object } from "@codenhub/validation";

const signup = object({ email: email(), age: number({ int: true }) });

signup["~standard"].validate({ email: "nope", age: 1.5 });
// {
//   issues: [
//     { message: "Invalid email", path: ["email"] },
//     { message: "Must be an integer", path: ["age"] },
//   ],
// }
```

Pass `signup` to the library that asks for a Standard Schema, and it will call `~standard.validate` itself. You do not call it yourself unless you are writing that library. Its type is [`Schema`](#the-types), which says so to TypeScript.

## Short English, or `standard`

The specification requires a message on every issue, and a validator's own `~standard` words each in short English: the issue's own `message`, set with the `message` option or by a check, or one sentence for its code, such as "Must be at least 2 characters" or "Invalid email". It is kept short because every program that makes a validator carries it, about 0.4 kB gzipped.

`standard(validator, messages?)` gives the same validator with a `~standard` of its own that words issues as [`formatIssue`](errors.md#turning-an-issue-into-text) does. Use it for:

- **The full English**, such as "Invalid email address" and "Must contain at most 3 items", which is the default.
- **Another language**, with `portugueseMessages` or a map of your own.
- **A validator you wrote by hand**, which has no `~standard` of its own, since this package did not make it.

```ts
import { email, number, object, portugueseMessages, standard } from "@codenhub/validation";

const signup = standard(object({ email: email(), age: number({ int: true }) }), portugueseMessages);
```

## The types

A factory returns a `Schema<T, TInput>`, or an `AsyncSchema<T, TInput>` when one of its rules waits: a `Validator` or `AsyncValidator` that is also a `StandardSchemaV1<TInput, T>`. It is accepted wherever a `Validator` is, so code that takes a validator, such as `assert` or a function of your own, takes it as before. A validator you write by hand is typed `Validator`, which asks for no `~standard`, and `brand` of one stays a `Validator`, since `brand` returns the validator it is given.

## What `standard` returns

A validator that behaves exactly as the one you gave, with the `~standard` property added, so it is still an ordinary validator you can call and compose. The validator you gave is not modified, so the same one can be exposed twice, with different messages for different audiences.

`~standard.validate` returns `{ value }` on success and `{ issues }` on failure, and never both. It returns its result directly for a synchronous validator and a `Promise` for an asynchronous one, which the specification allows. That holds even for a validator of your own that returns another kind of thenable, such as a query builder's, since callers tell the two apart with `instanceof Promise` and would read anything else as a result without issues. The input type is what the validator accepts, [`InferInput`](validators.md#inferinput), and the output type is what it produces, so a library that infers types from a Standard Schema gets both: a form library types the field of a `coerceNumber()` as `string | number`, since a number passes as it is, and what it hands you after validation as a number.

The package exports the `StandardSchemaV1` type so you can accept one in your own code.

## Messages of `standard`

`standard` builds each message from the message map given as its second argument: the built-in English when you give none, `portugueseMessages` for Portuguese, or a map of your own. A program that calls `standard` bundles the English, about 1.7 kB gzipped, even when it passes another map; calling it is what brings the English in, so a program that words its issues with a map of its own and never calls `standard` does not bundle it. A second argument left out or given as `undefined` is the English; any other that is not a map, such as `null`, text or a list, is a `TypeError` when `standard` is called. Messages then come from [`formatIssue`](errors.md#turning-an-issue-into-text): an issue's own `message`, then an entry for its `code` in the map, then the map's `default` entry, then "Invalid value".

```ts
import { englishMessages, number, standard } from "@codenhub/validation";

const age = standard(number({ min: 18 }), {
  ...englishMessages,
  too_small: (issue) => `Você precisa ter pelo menos ${String(issue.params?.minimum)} anos`,
});
```

Each issue's `path` is the issue's own path, as an array of strings and numbers.

## With its JSON Schema

Some libraries need to write the schema down too, such as the AI SDK, which sends the arguments of a tool to a language model as a JSON Schema. They read it from `~standard.jsonSchema`, which [Standard JSON Schema](https://standardschema.dev/json-schema) adds to the specification. `standardJsonSchema(validator, messages?)` returns what `standard` does with it added:

```ts
import { meta, number, object, optional, standardJsonSchema, string } from "@codenhub/validation";

const forecast = standardJsonSchema(
  object({
    city: meta(string({ min: 1, max: 100 }), { description: "The city to get the weather for" }),
    days: optional(number({ int: true, min: 1, max: 7 })),
  }),
);

forecast["~standard"].jsonSchema.input({ target: "draft-07" });
// { $schema: "http://json-schema.org/draft-07/schema#", type: "object", properties: { city: { ..., description: "The city to get the weather for" }, ... }, required: ["city"] }
```

`input` and `output` write the validator with [`toJsonSchema`](json-schema.md), the side and the draft as asked. `"draft-2020-12"` and `"draft-07"` are written, and any other target throws a `TypeError`. When a part of the validator cannot be written as JSON Schema, such as a custom check, `toJsonSchema` throws for it, and so do `input` and `output`, unless the library passes `libraryOptions: { unrepresentable: "any" }`. Give [`meta`](validators.md#meta) to the validator before passing it here, since the schema is written from the validator `standardJsonSchema` is given.

It is a separate export so that `standard`, which a form in the browser uses, does not bundle the code that writes a schema: use `standard` where only validation is asked for, and `standardJsonSchema` where the schema is read too.

## A note on functions

A validator here is a function, and `standard` attaches `~standard` to a function. The specification allows any object, and libraries that follow it read the property, so this works. A library that insists on `typeof schema === "object"` before looking would not recognize it; if you meet one, wrap the validator in an object of your own: `{ "~standard": standard(validator)["~standard"] }`.
