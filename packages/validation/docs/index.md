---
title: Overview
description: What the validation package does, how to read results, and where to go next.
---

# Validate data and shapes

`@codenhub/validation` answers one question: does this unknown value look the way I said it should? You describe the expected data as a schema, run a value through it, and get either the value with its TypeScript type or a complete list of what is wrong. It ships the validators most applications need and lets you build any others from small, composable pieces.

Validation matters wherever data crosses a boundary you do not control: a request body, a form, a query string, an environment variable, a file read from disk, a message from another service. TypeScript cannot check those at runtime, so the type you wrote for them is a promise nothing enforces until a schema does.

## Installation

```sh
pnpm add @codenhub/validation
```

The package is ESM only and has no runtime dependencies. All public symbols are imported from `@codenhub/validation`; there are no subpath exports.

## A first schema

Everything starts from `val`, which holds one factory per kind of data. A schema is built by calling factories and chaining rules onto them:

```ts
import { val, type Infer } from "@codenhub/validation";

const signup = val.object({
  username: val.string().trim().min(3).max(30),
  email: val.string().email(),
  age: val.number().int().min(18).optional(),
  newsletter: val.boolean().default(false),
  tags: val.array(val.string()).max(5).default([]),
});

export type Signup = Infer<typeof signup>;
```

`Infer` reads the TypeScript type a schema produces, so the schema is the single source of truth: no separate interface to keep in sync. Here `Signup` has a required `username` and `email`, an optional `age`, and a `newsletter` and `tags` that are always present because they have defaults.

Schemas are immutable. Every method that adds a rule returns a new schema and leaves the original alone, so a base schema can be shared and extended freely:

```ts
const username = val.string().trim().min(3);
const adminUsername = username.startsWith("admin_");
```

## Reading the result

`validate` returns a result you branch on. It never throws for invalid input:

```ts
const result = signup.validate(requestBody);

if (result.ok) {
  save(result.value); // typed as Signup
} else {
  for (const issue of result.error.issues) {
    console.log(issue.path, issue.message);
  }
}
```

`result.value` is not the input you passed in. It is a new value after the schema has run: defaults filled in, `trim()` applied, unknown object properties dropped, transforms mapped. The input is never modified.

When something is wrong the schema reports **every** problem it can find, not just the first, each with a stable `code`, the `path` to the offending value, and a human-readable `message`. See [Errors and messages](errors.md) for the full shape.

## Ways to run a schema

| Method                                  | Returns                                         | Use it when                                               |
| --------------------------------------- | ----------------------------------------------- | --------------------------------------------------------- |
| `schema.validate(input, options?)`      | `{ ok: true, value }` or `{ ok: false, error }` | You handle failure as a normal outcome.                   |
| `schema.parse(input, options?)`         | The value, or throws `ValidationError`          | A failure should abort, such as inside a request handler. |
| `schema.is(input)`                      | `boolean`, narrowing the type                   | You only need a yes or no.                                |
| `schema.validateAsync(input, options?)` | A promise of the `validate` result              | The schema has async rules.                               |
| `schema.parseAsync(input, options?)`    | A promise of the value, or rejects              | Same, but throwing.                                       |

`options` is optional and accepts:

- `abortEarly`: stop at the first issue instead of collecting all of them. Default `false`.
- `includeInput`: keep the invalid value on each issue as `input`. Default `false`. Enable it only when retaining the value is safe: inputs can hold passwords and tokens.
- `context`: any value you want your own checks to reach, available as `ctx.options.context`. See [Customization](customization.md).

### Sync and async

Validation stays synchronous until one of your callbacks (`refine`, `check`, `transform`) returns a promise, so a plain schema costs nothing extra. If a schema does contain async work, the sync methods `validate`, `parse` and `is` throw an `Error` that tells you to use `validateAsync` or `parseAsync`. They never guess or silently report the input as invalid. `validateAsync` and `parseAsync` work on every schema, sync or not.

Independent properties and array items run their async checks concurrently. Issues are still reported in the order the schema lists them, not the order the promises settle. With `abortEarly`, work runs one step at a time and nothing starts after the first failure.

## Objects

`val.object(shape)` accepts plain objects: created by `{}`, `Object.create(null)` or `JSON.parse`. Arrays, class instances, `Map`s and `null` are rejected.

- Properties not listed in the shape are dropped from the output. Call `.strict()` to reject them with an `unrecognized_key` issue instead, or `.passthrough()` to copy them through unvalidated.
- Only own properties are read, so inherited values never satisfy a required property.
- A property whose schema accepts `undefined` (through `.optional()`, `.nullish()` or `val.undefined()`) is optional in the inferred type, and is left out of the output when absent.
- `.extend()`, `.pick()`, `.omit()`, `.partial()` and `.required()` derive new object schemas from existing ones. They start a fresh schema, so rules added earlier with `refine` or `check` are not carried over; add them after deriving.

## Standard Schema

Every schema implements [Standard Schema v1](https://standardschema.dev/) through its `~standard` property, so libraries that accept any Standard Schema (form libraries, API frameworks, routers) can use it without an adapter. The `validate` function there returns a promise only when the validation in progress reaches a callback that returns one; otherwise it returns the result directly.

## Next steps

- [Validator reference](validators.md) lists every factory and rule with its failure code.
- [Customization](customization.md) shows how to write your own rules, transforms, async checks and reusable validators.
- [Errors and messages](errors.md) explains issues, error codes, `params`, message functions and localization.
- [Coercion](coercion.md) covers text input such as environment variables and form values.
