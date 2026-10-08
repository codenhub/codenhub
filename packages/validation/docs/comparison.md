---
title: Comparison
description: How the package differs from valibot, zod and yup, with what was measured, and when to choose one of them instead.
---

# Compared with valibot, zod and yup

All four check a value against a schema and give you a typed result. This page says where this package, at 0.4.0, differs, what that costs, and when one of the others is the better choice. Everything in the tables was run on 2026-10-07 against valibot 1.5.0, zod 4.6.5 and yup 1.7.1, on Node.js 24.19 on one machine; anything said from a library's documentation alone is marked so.

## What this package is for

It is built for data nobody you trust controls: a request body, a query string, a message from another origin, a file a user uploaded. Four things follow from that, and they are where it differs most.

### Formats return what a parser read

`email()` and `url()` give the text to the platform's URL parser and return what it read, so the value you store is the one a request or a mail server will use. A check made on it later, such as an allowlist of hosts, sees the same host the request goes to.

| Input                                 | This package                | valibot, zod, yup |
| ------------------------------------- | --------------------------- | ----------------- |
| `Ada@EXAMPLE.com`                     | `Ada@example.com`           | unchanged         |
| `https://Example.com/public/../admin` | `https://example.com/admin` | unchanged         |

They also accept less by default. A URL is `http` or `https` to a public host name. The `protocols` option changes the schemes accepted and nothing else, and `url({ host: hostname() })` is what accepts a host that is not public:

| `url()` given                   | This package | valibot  | zod      | yup      |
| ------------------------------- | ------------ | -------- | -------- | -------- |
| `javascript:alert(1)`           | rejected     | accepted | accepted | rejected |
| `https://localhost/x`           | rejected     | accepted | accepted | rejected |
| `http://169.254.169.254/latest` | rejected     | accepted | accepted | accepted |

The others can be made as strict with a pattern or a rule of your own. Here it is what you get without asking.

### What a failing input costs is bounded

A failing input reports a bounded number of issues and never overflows the stack. Input that passes is checked in full, so a `max` on a collection is what bounds the work for it.

| Case                                                | This package                   | valibot               | zod                   |
| --------------------------------------------------- | ------------------------------ | --------------------- | --------------------- |
| An array of 200,000 items, each invalid             | 1,001 issues, 2 ms             | 200,000 issues, 78 ms | 200,000 issues, 84 ms |
| A recursive schema, given input nested 100,000 deep | fails with one `too_big` issue | throws a `RangeError` | throws a `RangeError` |

yup throws the same `RangeError` on the nested input. A thrown `RangeError` is not a validation result: code that expects `safeParse` never to throw does not catch it, and on a server it is an unhandled exception a few kilobytes of JSON can cause. An array stops after 1,000 issues and says so, and `lazy` stops at 128 levels by default; [`lazy`](validators.md#lazy) says what is and is not limited.

### An issue never holds a value of the input

An issue the package reports has a `code`, a `path` and `params`, and none of them is the value that failed, so logging a failed validation cannot log a password or a token. It does name the input's properties, in `path` and for a key a strict object refuses, so keep a secret out of the keys of a `record`. The issue of a `literal` or a `oneOf` names the values it accepts, which the schema wrote: compare a secret, such as an API key, in code of your own and not with `literal`. A check or a validator you write decides what its own issue holds, so keep the value out of its `params` and `message`. Serialized, an issue of valibot and an error of yup contain the value; zod's does not.

### Mistakes in a schema are found early

- **A bad option throws when the validator is made.** `string({ min: -1 })` is a `RangeError` at module load. `v.minLength(-1)` and `z.string().min(-1)` are accepted.
- **An asynchronous rule cannot be read as if it were ready.** A validator is synchronous until a rule returns a promise, and then its type is `AsyncValidator`, whose result must be awaited; there is one `object`, not a second API for asynchronous schemas. Given an `async` rule in a synchronous call, zod throws, and valibot's `check` treats the promise as a pass, which only its types prevent.

## What it costs

The same schema in each library, `{ name: string of at least 2, email, age: optional integer }`, bundled with rolldown 1.2.12, minified and gzipped at level 9. Speed is the best of five runs of a million validations, each returning whether the input passed. The script that ran the four libraries is not in the repository, since it installs the other three; `pnpm bench` in the package measures this package alone.

| Library        | That object, gzipped | A lone `boolean`, gzipped | Valid input, M ops/s | Invalid input, M ops/s |
| -------------- | -------------------- | ------------------------- | -------------------- | ---------------------- |
| this package   | 5.79 kB              | 1.24 kB                   | 1.0                  | 2.0                    |
| valibot 1.5.0  | 1.58 kB              | 0.76 kB                   | 6.2                  | 3.3                    |
| zod/mini 4.6.5 | 5.76 kB              | 3.04 kB                   | 4.3                  | 0.6                    |
| zod 4.6.5      | 23.8 kB              | 14.7 kB                   | 8.6 to 9.1           | 0.9                    |
| yup 1.7.1      | 12.8 kB              | 12.7 kB                   | 0.3                  | 0.01                   |

Read the ratios and not the figures: this is one schema on one machine.

- **Size.** A program ships the validators it imports and no others, so a lone `boolean` is 1.24 kB. valibot is smaller, about a quarter of the size for this object. zod/mini is the same size and zod four times larger.
- **Speed on valid input is the weakest figure here**, six to nine times behind valibot and zod for this schema. Most of it is `email()`, which reads the domain as the URL parser does, where the others test a pattern. Since these figures were taken, it no longer asks the parser for an ASCII domain such as `example.com`, which it reads the same way by lowercasing it: on Node.js 24.14.1 that took `email()` from 0.76 to 1.65 million validations a second and this schema from 0.58 to 1.08. The rest is `object`: one of three plain strings validates about 4 million times a second here and about 12 million in valibot.

## When to choose another

- **valibot**, when size is what matters most, or when you need the widest set of ready-made checks. It is the smallest of the four by a wide margin and faster.
- **zod**, when other tools must accept your schema. It is what most form libraries, API frameworks and SDKs for language models take first. Many of those take any [Standard Schema](standard-schema.md), which `standard(validator)` gives them, and those that need a JSON Schema can have one from [`toJsonSchema`](json-schema.md), but a tool that asks for a zod schema by name needs zod. A codebase that stays on zod or valibot can still use `url()` or `email()` for one field, through a transform of a few lines that [Integrations](integrations.md#inside-a-zod-or-valibot-schema) shows.
- **zod or valibot**, when validating valid data in a hot path, such as every row of a large file, and a pattern is a good enough test of an email or a URL.
- **yup**, when a codebase already uses it. The measurements give no other reason.

Choose this package when the input comes from outside and what you do with the value matters: you store the email, fetch the URL, or validate a body anyone can send. It is pre-1.0, so the [changelog](changelog/index.md) lists what each release changes.

## What each can do

Run against the versions above, except where marked.

| Need                                           | This package           | valibot                            | zod                        | yup                           |
| ---------------------------------------------- | ---------------------- | ---------------------------------- | -------------------------- | ----------------------------- |
| A JSON Schema from a schema                    | `toJsonSchema`         | a separate package (documentation) | `z.toJSONSchema`           | none built in (documentation) |
| A type for the input, apart from the output    | `InferInput`           | `InferInput` (documentation)       | `z.input` (documentation)  | not checked                   |
| A rule across fields while another field fails | `checkFields`          | `partialCheck`                     | `refine`                   | `ref`                         |
| Standard Schema                                | `standard(validator)`  | built in (documentation)           | built in (documentation)   | built in (documentation)      |
| Method chains, such as `string().min(2)`       | no, options and checks | no, `pipe`                         | yes                        | yes                           |
| Messages in other languages                    | English and Portuguese | ready-made (documentation)         | ready-made (documentation) | ready-made (documentation)    |

English and Portuguese ship with this package, so a program in another language writes its own message map: [Issues and messages](errors.md#rewording-and-localizing) shows how.
