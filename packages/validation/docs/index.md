---
title: Overview
description: What the validation package is for, how to install it, and the order to read its pages in.
---

# Validate values and shapes

`@codenhub/validation` answers one question: is this value what I said it should be? You give a value to a validator. You get back either that value, typed, or a list of what is wrong with it.

It works the same for one value, such as an email address or a port number, and for a whole object, such as a form or a request body.

## Why validate

Data that crosses a boundary you do not control can hold anything: a request, a form, a query string, an environment variable, a file, a message from another service. TypeScript checks types when you compile, not when the program runs. So the type you wrote for that data is a promise, and the data never agreed to it. A validator is what makes it keep it.

The package is built for that boundary, where the input may be hostile:

- **A format gives you what the parser read.** `email()` and `url()` produce the value the platform's URL parser reads. The value you store is the one a request or a mail server will use.
- **A failing input has a bounded report.** Each collection stops reporting at 1,000 issues, as [Limits](limits.md#a-failing-input-has-a-bounded-cost) explains. Input nested too deep is one issue, not a stack overflow, as long as the depth limit of a recursive schema, [`maxDepth`](limits.md#maxdepth), fits the stack.
- **An issue never holds a value of the input.** A log of failures holds no password that was sent. An issue does hold what the schema was configured with, such as the values a `oneOf` accepts or the prefix of a `startsWith`, and the input's keys, in its `path`, as [The issue](errors.md#the-issue) says.

The 1,000-issue limit of a collection bounds its report, not the work: an input that passes, or fails only near its end, is still checked item by item, so a large one costs its size. [Limits](limits.md) says how to bound its size and its depth.

## Installation

```sh
pnpm add @codenhub/validation
```

The package is ESM only and has no dependencies. Its types need TypeScript 5.0 or newer. Everything is imported by name from `@codenhub/validation`. The only other export is `@codenhub/validation/package.json`, for tools that read the version.

## A first validator

```ts
import { email, object, string } from "@codenhub/validation";

const signup = object({
  name: string({ trim: true, min: 2, max: 100 }),
  email: email(),
});

signup({ name: "  Ada ", email: "ada@example.com" }); // { ok: true, value: { name: "Ada", email: "ada@example.com" } }
signup({ name: "A", email: "nope" }); // { ok: false, ... }: "too_small" for name, "invalid_format" for email
```

These pages follow one example: the sign-up of a web app. It starts here as two fields and, like every sign-up form ever built, grows a little on each page. Each page adds what that page teaches, such as a form with a password check, a JSON request body, the server's configuration and the messages a user reads.

## Reading path

Read the pages in this order to learn the package from start to end, or jump to the one you need:

1. [Getting started](getting-started.md): what a validator is, how to read its result, and the validators for strings, numbers, dates, fixed values and objects.
2. [Forms](forms.md): rules across fields, optional fields and defaults, errors per field, files, and the types of a form.
3. [Request bodies](request-bodies.md): JSON text, lists and dictionaries, a choice between shapes, and recursive data.
4. [Text input](text-input.md): numbers, flags and dates that arrive as text, from environment variables, query strings and form fields.
5. [Issues and messages](errors.md): what a failed result holds, the built-in codes, and the text a person reads, in English, in Portuguese or in your own words.
6. [Custom validators](custom-validators.md): rules, formats and types of your own, asynchronous rules, and how to test them.
7. [Formats](formats.md): every built-in format, such as `email`, `url`, `ip` and `datetime`, what each accepts and what it produces.
8. [Shaping values](shaping-values.md): changing a value, writing it back, marking its type, describing it, and deriving one object from another.
9. [Standard Schema](standard-schema.md): give a validator to any library that accepts a Standard Schema.
10. [JSON Schema](json-schema.md): write a validator as a JSON Schema, and read what a validator is made of.
11. [Integrations](integrations.md): use a validator with react-hook-form, TanStack Form, tRPC, Hono, the AI SDK, the Model Context Protocol, OpenAPI, zod and valibot.
12. [Limits](limits.md): what input that may be hostile costs, the limits of recursive data, and how to check a schema for the bounds it needs.

To look up one export, use the [API reference](reference/index.md), generated from the source. The [changelog](changelog/index.md) lists every release and the migrations between them.
