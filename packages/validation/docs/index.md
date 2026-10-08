---
title: Overview
description: What the validation package does, how to read a result, and where to go next.
---

# Validate values and shapes

`@codenhub/validation` answers one question: is this value what I said it should be? You hand a value to a validator and get back either that value, typed, or a complete list of what is wrong with it. It works the same for one value, such as an email address or a port number, and for a whole object such as a form or a request body.

This matters wherever data crosses a boundary you do not control: a request, a form, a query string, an environment variable, a file, a message from another service. TypeScript cannot check those at runtime, so the type you wrote for them is a promise nothing enforces until a validator does.

The package is built for that boundary, where the input may be hostile. `email()` and `url()` return what the platform's URL parser read, so the value you store is the one a request or a mail server will use. What a failing input costs is bounded: a long list of bad items stops at 1,000 issues, and input nested too deep is one issue and never a stack overflow, while input that passes is checked in full, so give collections a `max`. An issue the package reports never holds the value that failed, so a log of failures holds no passwords; it does name the input's properties, in `path`, and a check you write decides what its own issue holds.

## Installation

```sh
pnpm add @codenhub/validation
```

The package is ESM only and has no dependencies. Its types need TypeScript 5.0 or newer. Everything is imported by name from `@codenhub/validation`; the only other export is `@codenhub/validation/package.json`, for tools that read the version.

## A validator is a function

Every validator takes any input and returns a result. That is the whole idea, and it has two consequences worth knowing up front.

You create a validator by calling a function, with options if you want them, and then you call the validator with the value:

```ts
import { number, string } from "@codenhub/validation";

const port = number({ int: true, min: 1, max: 65535 });

port(8080); // { ok: true, value: 8080 }
port(70000); // { ok: false, error: { issues: [...] } }

string({ min: 3 })("ab"); // { ok: false, ... }
```

Every validator takes its arguments in the same order: its own, such as the shape of an object, then options, then checks, which are rules for the rarer cases, such as `string({ min: 3 }, startsWith("a"))`. Options and checks can both be left out.

The first line of that example runs once, when the module loads, and produces a function you can reuse for every value. When you only need to check a single value once, call both at once: `number({ int: true })(input)`.

Because a validator is only a function, you can write your own with no helper at all, and you can pass any validator wherever another expects one. [Custom validators](custom-validators.md) shows how.

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

A validator never throws for invalid input, because invalid input is an expected outcome and not a bug. The one exception is input that runs code of its own while it is read, a getter or a `Proxy` trap that throws: that exception propagates, as one from your own callback does, except in `objectLike`, which reports a property it could not read as an issue. Data parsed from JSON has no such code. If you would rather stop the program, that is one line: `if (!result.ok) throw new Error(...)`.

`result.value` is not necessarily the input you passed in. It is the value after the validator has run, with any clean-up you asked for applied (`trim`, `case`, `clamp`) and, for an object, unlisted properties dropped. A format with several spellings produces one: `email` and `url` produce what the URL parser reads, such as a lowercase domain, and `phone` produces `+` and the digits, so a check made later on the value sees what a mail server or a request will, and one value is one string. The input is never modified.

When something is wrong, the validator reports every problem it can find and not just the first, so a form can show all its errors at once. Each issue has a stable `code` to branch on, the `path` to the offending value, and `params` describing what was wrong. Give a validator a `message` option for a sentence of its own, as in `string({ min: 2, message: "Enter your full name" })`, or word every issue at once with a message map. [Issues and messages](errors.md) has the details.

## Objects

`object` takes a shape, an object whose values are validators, and returns a validator for objects of that shape:

```ts
import { email, number, object, optional, string, type Infer } from "@codenhub/validation";

const signup = object({
  username: string({ trim: true, min: 3, max: 30 }),
  email: email(),
  age: optional(number({ int: true, min: 18 })),
});

export type Signup = Infer<typeof signup>;
```

`Infer` reads the TypeScript type a validator produces, so the validator is the single source of truth and there is no separate interface to keep in sync. Here `Signup` has a required `username` and `email` and an optional `age`.

Issue paths lead down to the offending value, so a problem with `email` has the path `["email"]` and one inside a list has segments such as `["addresses", 0, "street"]`.

`object` accepts plain objects only: created by `{}`, `Object.create(null)` or `JSON.parse`, in this realm or another such as an iframe. Arrays, class instances, `Map`s and `null` are rejected. Properties the shape does not list are dropped from the output by default; the [validator reference](validators.md#objects) shows how to reject them or keep them.

## Combining validators

A few functions combine validators into new ones:

- `optional(validator)`, `nullable(validator)` and `nullish(validator)` accept `undefined`, `null` or both as well, and `optional(validator, value)` replaces a missing value with a default.
- `brand(validator, name)` marks the type a validator produces, so only a validated value is accepted where that type is asked for, and `readonly(validator)` makes what it produces read-only in its type and freezes the object or array the validator made.
- `pipe(a, b, c)` runs validators in order, feeding each the value the previous one produced. This is how you clean a string before checking a format: `pipe(string({ trim: true, case: "lower" }), email())`.
- `check(test, issue)` adds a rule the validator cannot express, given to the validator after its options, and `checkFields(keys, test, issue)` one across properties of an object, such as two fields having to match, that runs as soon as those properties have passed, and `transform(validator, convert)` changes the value into another.
- `array`, `tuple`, `record`, `set` and `map` validate collections, and `union`, `tagged` and `intersection` choose between or merge validators.
- `url` and `email` take validators for their parts, such as `url({ host: hostname() })` to accept local hosts, and `searchParams` reads a query string into typed values.

The [validator reference](validators.md) covers every one.

## Sync and async

A validator is synchronous unless something it runs is asynchronous. Checking a username against a database is asynchronous; checking its length is not. You do not pick a mode: you write the rule, and the types follow. A validator that contains an async rule is an `AsyncValidator`, its result must be `await`ed, and the compiler stops you from reading it as if it were ready. Everything else stays synchronous and pays nothing. [Custom validators](custom-validators.md#asynchronous-rules) has an example.

## Testing whether a value passes

When you only need a yes or no, or a type guard, use `is`:

```ts
import { is, number } from "@codenhub/validation";

const isPort = (input: unknown): input is number => is(number({ int: true, min: 1, max: 65535 }), input);
```

`is` returns a `boolean` and does not narrow its input, so the guard above names the type itself. A type guard also says that a value that fails is not of the type, which is false of a validator: `string({ min: 3 })` refuses `"ab"`, which is a string. Read `result.value` from calling the validator where you want the typed value. `is` accepts synchronous validators only.

## Throwing for invalid configuration

A validator reports invalid input in its result instead of throwing, and only code the input carries, a getter or a `Proxy` trap that throws while it is read, propagates an exception. When invalid input is a mistake of the caller, such as an options object passed to your function, `assert` returns the value or throws a `TypeError` that names the problem and where it is:

```ts
import { assert, englishMessages, number, object } from "@codenhub/validation";

const options = object({ port: number({ int: true, min: 1, max: 65535 }) });

assert(options, { port: 8080 }, { subject: "createServer:", messages: englishMessages }); // { port: 8080 }
assert(options, { port: 0 }, { subject: "createServer:", messages: englishMessages });
// TypeError: createServer: port: Must be at least 1
```

[Issues and messages](errors.md#throwing-for-invalid-configuration) covers the message, and how to bundle only the wording you need.

## Next steps

- [Validator reference](validators.md): every validator and combinator, with its options and the issue it reports.
- [Custom validators](custom-validators.md): add rules with `check`, build validators with `format` and `guard`, and validate asynchronously.
- [Coercion](coercion.md): validate text input such as environment variables, query strings and form fields by converting it.
- [Standard Schema](standard-schema.md): use a validator wherever a library accepts a Standard Schema.
- [JSON Schema](json-schema.md): write a validator as a JSON Schema, for an HTTP API, the tools of a language model or a form generator.
- [Integrations](integrations.md): use a validator with react-hook-form, TanStack Form, tRPC, Hono, the AI SDK, the Model Context Protocol and OpenAPI.
- [Issues and messages](errors.md): the shape of an issue, the built-in codes, message text, localization and form errors.
- [API reference](reference/index.md): every export with its signature and documentation, generated from the source.
- [Changelog](changelog/index.md): release notes, and the migrations from 0.1.0 and from 0.0.1.
