---
title: JSON Schema
description: Write a validator as a JSON Schema, for the body of an HTTP API, the arguments of a tool a language model calls, or a form generator.
order: 10
---

# JSON Schema

`toJsonSchema(validator)` writes a validator as a [JSON Schema](https://json-schema.org/), draft 2020-12. It is what an OpenAPI document, the tool definitions of a language model and many form generators take, so one validator can both check a value and tell another program what the value must look like. The sign-up endpoint can publish its body in an OpenAPI document from the same validator that checks it.

This page covers what the schema promises, how each validator is written, and how to read a validator yourself with `describe`. The schema it returns has the type `JsonSchema`, and its options the type `JsonSchemaOptions`.

```ts
import { email, number, object, optional, string, toJsonSchema } from "@codenhub/validation";

const user = object({
  name: string({ min: 2 }),
  email: email(),
  age: optional(number({ int: true, min: 0 })),
});

toJsonSchema(user);
// {
//   $schema: "https://json-schema.org/draft/2020-12/schema",
//   type: "object",
//   properties: {
//     name: { type: "string", minLength: 2 },
//     email: { type: "string" },
//     age: { type: "integer", minimum: 0 },
//   },
//   required: ["name", "email"],
// }
```

The result is a new plain object that `JSON.stringify` can write. It is its own import, so a program that never asks for a schema does not bundle the code that writes one.

## What the schema promises

A schema says less than a validator checks. `email()` refuses an address at `localhost`, and JSON Schema's `email` format has no such rule. So the schema is written to one promise: **a value the validator accepts passes the schema**. The schema may accept a value the validator then refuses, and the validator stays the check that counts. Validate what you receive with the validator, and give the schema to whoever needs to know the shape.

Three places bend that promise. In two, the validator cleans a value before it checks it, which a schema cannot say, and in the other, the two count the length of text differently:

- **Clean-up options.** `string({ trim: true, max: 5 })` is written with `maxLength: 5`, which describes text that needs no trimming. Text with spaces around five letters passes the validator and not the schema. `case` is the same, and so is `clamp` beside a limit, as in `number({ max: 10, clamp: { min: 0, max: 10 } })`: the schema describes the value after cleaning. The range of a `clamp` is itself not written.
- **Length of text.** A string's `length` counts an emoji, and any other character outside the Basic Multilingual Plane, as two, and JSON Schema counts it as one, so a `min` or `max` can differ by the number of such characters. A `pattern` is the same: a schema reads it in Unicode mode, the `u` flag, so in one written without that flag `.` and a negated class such as `[^a]` match a whole character in the schema and half of an emoji in the validator.
- **Formats that accept several spellings.** `phone()` accepts `+55 (11) 98765-4321` and produces `+5511987654321`. A check on such a format, as in `hostname(pattern(/^[a-z.]+$/))`, sees the spelling the format produces and is written for the text as it arrives, so `EXAMPLE.com` passes the validator and not the schema.

## Input and output

A validator that changes its value has two shapes: what it accepts and what it produces. `toJsonSchema` writes the input by default, since that is what a request or a tool call must satisfy. Pass `{ io: "output" }` for what the validator produces, such as the body of a response.

```ts
import { coerceNumber, object, oneOf, optional, toJsonSchema } from "@codenhub/validation";

const query = object({
  page: coerceNumber({ int: true }),
  sort: optional(oneOf(["new", "top"]), "new"),
});

toJsonSchema(query).properties;
// { page: { anyOf: [{ type: "integer" }, { type: "string" }] }, sort: { enum: ["new", "top"], default: "new" } }
// and only `page` is required

toJsonSchema(query, { io: "output" }).properties;
// { page: { type: "integer" }, sort: { enum: ["new", "top"] } }
// and both are required
```

| Validator                                    | Input                                                                                                                                           | Output                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `optional(validator, value)`                 | The validator's schema, not required, with `default` when the default is a JSON primitive                                                       | The validator's schema, required                       |
| `lazy`, `json` or `searchParams` with checks | For `lazy` and `json`, the checks in an `allOf` beside what it refers to or parses to. For `searchParams`, a string, which says nothing of them | The checks in an `allOf` beside the validator's schema |
| The `coerce` validators                      | An `anyOf` of the schema of the type they produce, bounds and checks included, and the types they convert from                                  | The type they produce                                  |
| `transform`                                  | The schema of the validator it converts from                                                                                                    | Cannot be written                                      |
| `pipe`                                       | Its first validator                                                                                                                             | Its last                                               |
| `json(validator)`                            | A string, with `contentSchema` for what it parses to                                                                                            | The validator's schema                                 |
| `searchParams(validator)`                    | A string                                                                                                                                        | The validator's schema                                 |
| `fallback`                                   | Anything, since it never fails                                                                                                                  | The schema of the validator it wraps                   |

The output side takes a default and the value of a `fallback` to pass the validator they are given to. Neither is validated, so `optional(string({ min: 3 }), "")` produces text its own output schema refuses: give a default its validator accepts.

## How each validator is written

| Validator                                                   | Schema                                                                                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `string`                                                    | `type: "string"` with `minLength` and `maxLength`                                                                              |
| `number`                                                    | `type: "number"`, or `"integer"` with `int` or `safeInt`, with `minimum`, `maximum`, `exclusiveMinimum` and `exclusiveMaximum` |
| `boolean`, `unknown`, `never`                               | `type: "boolean"`, `{}` and `{ not: {} }`                                                                                      |
| `literal`, `oneOf`                                          | `const` and `enum`                                                                                                             |
| A format                                                    | `type: "string"` with `format`, as the table below writes it                                                                   |
| `port`, `base64`                                            | An integer from 1 to 65535, and a string with `contentEncoding`                                                                |
| `object`, `objectLike`                                      | `type: "object"` with `properties`, `required`, and `additionalProperties: false` for a strict `object`                        |
| `array`                                                     | `type: "array"` with `items`, `minItems` and `maxItems`                                                                        |
| `tuple`                                                     | `prefixItems`, with `items` for `rest` and `false` without it                                                                  |
| `record`                                                    | `propertyNames` and `additionalProperties`, with `minProperties` and `maxProperties`                                           |
| `union`, `intersection`                                     | `anyOf` and `allOf`                                                                                                            |
| `tagged`                                                    | `oneOf`, with the tag as a `const` property of each variant                                                                    |
| `nullable`, `nullish`                                       | `anyOf` with `type: "null"`                                                                                                    |
| `readonly`, `brand`                                         | What the validator inside is written as                                                                                        |
| `codec`                                                     | Its `input`, or its `output` with `io: "output"`                                                                               |
| `lazy`                                                      | A `$ref` to a definition under `$defs`                                                                                         |
| `pattern`, `startsWith`, `endsWith`, `includes`, `nonBlank` | `pattern`                                                                                                                      |
| `multipleOf`, `nonZero`, `unique()`                         | `multipleOf`, `not: { const: 0 }` and `uniqueItems`                                                                            |

`multipleOf` is written only for a step binary floating point holds exactly: an integer it holds as written, so not `1e23`, or a fraction such as `0.5` or `0.25`. A reader divides in binary, where `0.3 / 0.1` is not `3`, so with a step such as `0.1` or `0.01` it would refuse values the validator accepts; such a step is left out. Ajv also refuses some very large numbers: it divides the value by the step and reads the result with `parseInt`, which misreads a result of `1e21` or more, so it refuses `1e25` against `multipleOf: 5`, which `number(multipleOf(5))` accepts. Where Ajv reads the schema, give the number a `min` and a `max` that keep the value divided by the step strictly between `-1e21` and `1e21`. Above `2 ** 53`, where a number is not the integer its digits spell, any reader that divides can refuse a value the validator accepts, as it does `20054952883093950` with `multipleOf(5)`. `uniqueItems` is written only for items that are primitives, since `unique()` compares an object by identity and `uniqueItems` by what it holds.

A format is written under JSON Schema's name for it, and with no `format` where that name's rules refuse text the validator accepts, which would break the promise above:

| Format                                                   | Input                                                   | Output     |
| -------------------------------------------------------- | ------------------------------------------------------- | ---------- |
| `email`                                                  | None, since the domain may be internationalized         | `email`    |
| `domain`                                                 | None, for the same reason                               | `hostname` |
| `hostname`, `uuid`                                       | Their own names                                         | The same   |
| `datetime`                                               | `date-time`, and none with `local`, which has no offset | The same   |
| `isoDate`                                                | `date`                                                  | The same   |
| `ip`                                                     | `ipv4` with `version: "v4"`, and none otherwise         | The same   |
| `time`, `duration`, `url`                                | None                                                    | None       |
| `port`, `base64`                                         | As the table above writes them                          | The same   |
| Any other, and any made with `format`, whatever its name | None                                                    | None       |

A format is left out where JSON Schema's has stricter rules: `time` needs an offset, which a time of day such as `12:00` never has, `duration` allows no fraction, as in `PT0.5S`, and no weeks beside days, as in `P1W1D`, an IPv6 address may have a zone, as in `fe80::1%eth0`, which `ipv6` does not allow, and a URL may hold `|` or `^`, which a URI may not. The input of `email` and `domain` may be internationalized, as in `user@bücher.example`, which `email` and `hostname` refuse; `idn-email` and `idn-hostname` would fit, but [ajv-formats](https://github.com/ajv-validator/ajv-formats) does not know them, and Ajv in its default strict mode refuses to compile a schema with a format it does not know. That is also why a format JSON Schema has no name for, such as `phone`, `slug` or one made with `format`, is written with none.

A property is left out of `required` when its validator accepts `undefined`: `optional`, `nullish`, `unknown`, `fallback`, a `literal` or a `oneOf` of `undefined`, a `union` with one of those, or a `lazy`, `nullable`, `readonly`, `transform` or `pipe` around one. An `intersection` is left out when every validator in it accepts `undefined`. JSON has no `undefined`, so `literal(undefined)` in a `union` is left out of its `anyOf`, and a `union` or a `oneOf` of nothing else is written as `{ not: {} }`, which no value passes.

A recursive schema is written once, as a definition the schema refers to:

```ts
import { array, lazy, object, string, toJsonSchema, type Validator } from "@codenhub/validation";

interface Category {
  name: string;
  children: Category[];
}

const category: Validator<Category> = object({ name: string(), children: array(lazy(() => category)) });

toJsonSchema(category).$defs;
// {
//   schema1: {
//     type: "object",
//     properties: { name: { type: "string" }, children: { type: "array", items: { $ref: "#/$defs/schema1" } } },
//     required: ["name", "children"],
//   },
// }
```

Build a recursive schema once and refer to it, as [Limits](limits.md#build-a-recursive-schema-once) explains. One built anew at every level, as `lazy(() => build())` inside `build` does, has no end to write, and `toJsonSchema` throws a `TypeError` saying so.

## Saying what a value is for

A schema that gives only the types tells a reader what to send and not what it means. [`meta`](shaping-values.md#meta) adds a title, a description, examples and whether a value is deprecated to the part it is given to, and `toJsonSchema` writes each under JSON Schema's keyword of the same name. A language model reads the `description` of a tool's arguments to decide what to put in them, and an OpenAPI document shows all four.

```ts
import { meta, number, object, string, toJsonSchema } from "@codenhub/validation";

const forecast = meta(
  object({
    city: meta(string({ min: 1 }), { description: "The city to get the weather for", examples: ["Lisbon"] }),
    days: meta(number({ int: true, min: 1, max: 7 }), { description: "How many days ahead" }),
  }),
  { title: "Forecast" },
);

toJsonSchema(forecast);
// {
//   $schema: "https://json-schema.org/draft/2020-12/schema",
//   type: "object",
//   title: "Forecast",
//   properties: {
//     city: { type: "string", minLength: 1, description: "The city to get the weather for", examples: ["Lisbon"] },
//     days: { type: "integer", minimum: 1, maximum: 7, description: "How many days ahead" },
//   },
//   required: ["city", "days"],
// }
```

The keys are written on whatever schema the part is written as, beside a `$ref` for a `lazy` and beside an `anyOf` for a `nullable`, and the same on the input and the output side. In draft-07, which ignores a keyword beside a `$ref`, the reference is wrapped in an `allOf` and the keys are written beside that. Examples are written as given, and are not checked against the validator.

## Drafts

The schema is written in draft 2020-12 unless `target: "draft-07"` asks for the older draft, which some readers, such as the tools of a language model in the AI SDK, still take. In draft-07 the items of a `tuple` are listed under `items` and its `rest` under `additionalItems`, definitions are under `definitions`, and what `json` parses is not written, since that draft has no `contentSchema`. Any other target is a `TypeError`, and so is an option `toJsonSchema` does not have, such as `draft` written for `target`, as an unknown option is for a factory. [`standardJsonSchema`](standard-schema.md#with-its-json-schema) writes the draft a library asks for, through the same function.

## What cannot be written

JSON Schema has no words for some of what a validator can check, and JSON has no value for some of what it can produce:

- `date`, `bigint`, `symbol`, `func`, `instanceOf`, `set`, `map` and `file`, none of which is a JSON value, `formData`, which reads a form and not JSON, and a validator made by `guard`, whose test is a function nobody can read.
- A validator you wrote by hand, and a check made by `check`, whose rule is a function nobody can read.
- `lowercase`, `uppercase`, `unique` with a key function, and a `pattern` with a flag such as `i` or `v`, which JSON Schema patterns do not have. The flags `g` and `y`, which `pattern` drops, are left out, and so is `u`, the mode a schema reads every pattern in.
- A `pattern` written without `u` that Unicode mode reads otherwise: one that is an error there, such as `/^\@x$/`, whose `\@` only that mode refuses, and one with `\u{…}` or `\p{…}`, which are escapes only there and text with braces without it.
- What a `transform` returns, on the output side.
- A check on an `object`, and a variant of `tagged` that is not an `object`, such as a `lazy`. With `unrepresentable: "any"` that variant is written as an object with only its tag, so the other variants still match one branch of the `oneOf`.

By default `toJsonSchema` throws a `TypeError` that names the part and where it is, such as `toJsonSchema cannot write a validator of kind "date" at createdAt`, so a schema is never quietly weaker than you meant. Pass `{ unrepresentable: "any" }` to write such a part as `{}`, which accepts anything, and to leave such a check out:

```ts
import { check, date, object, string, toJsonSchema } from "@codenhub/validation";

const post = object({ title: string(check((text) => !text.includes("spam"))), createdAt: date() });

toJsonSchema(post, { unrepresentable: "any" }).properties;
// { title: { type: "string" }, createdAt: {} }
```

To send a date as JSON, validate the text it travels as, with `datetime()` or `isoDate()`, or convert it with `coerceDate()`, whose input side is a string or a whole number of milliseconds.

## Reading a schema

`toJsonSchema` writes one notation. To write another, or to build a form from a schema, read the validator yourself. `describe(validator)` returns what a validator is made of, as plain data, typed `Description`: its `kind`, the `options` it was given, its `checks`, and the validators inside it. A program walks a schema with it, to write the schema in another notation, to build a form from it, or to make another validator from its parts.

```ts
import { describe, email, object, optional, string, type AnyValidator } from "@codenhub/validation";

const signupForm = object({ name: string({ min: 2 }), email: email(), nickname: optional(string()) });

const top = describe(signupForm);
top?.kind; // "object"
const shape = top?.["shape"] as Record<string, AnyValidator>;
describe(shape["name"] as AnyValidator)?.options; // { min: 2 }
describe(shape["email"] as AnyValidator)?.["format"]; // "email"
describe(shape["nickname"] as AnyValidator)?.kind; // "optional"
```

A validator inside another is given as the validator itself, to be described in turn. So a recursive schema is read one level at a time, and never without end. The description and its options are frozen, and are a copy of what the factory was given. So changing an options object afterwards changes neither the validator nor what it says of itself.

| `kind`                                                                                                  | Made by                                           | Beside `options` and `checks`                                                                                                   |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `"string"`, `"number"`, `"bigint"`, `"boolean"`, `"date"`, `"symbol"`, `"unknown"`, `"never"`, `"file"` | The validator of that name                        |                                                                                                                                 |
| `"function"`                                                                                            | `func`                                            |                                                                                                                                 |
| `"literal"`                                                                                             | `literal`                                         | `value`                                                                                                                         |
| `"oneOf"`                                                                                               | `oneOf`                                           | `values`, a list, for an enum too                                                                                               |
| `"instance"`                                                                                            | `instanceOf`                                      | `target`, the class                                                                                                             |
| `"guard"`                                                                                               | A factory `guard` made                            | `expected`                                                                                                                      |
| `"format"`                                                                                              | Every format, `port`, and a factory `format` made | `format`, its name, as in the issue it reports                                                                                  |
| `"coerce"`                                                                                              | The `coerce` validators                           | `inner`, the strict validator, which has the options; `options` for an option of the coercion's own, `zoneless` of `coerceDate` |
| `"object"`, `"objectLike"`                                                                              | `object`, `objectLike`                            | `shape`                                                                                                                         |
| `"array"`, `"set"`                                                                                      | `array`, `set`                                    | `item`                                                                                                                          |
| `"tuple"`                                                                                               | `tuple`                                           | `items`, and `rest` when it has one                                                                                             |
| `"record"`, `"map"`                                                                                     | `record`, `map`                                   | `key`, `value`                                                                                                                  |
| `"union"`, `"intersection"`                                                                             | `union`, `intersection`                           | `members`                                                                                                                       |
| `"tagged"`                                                                                              | `tagged`                                          | `key`, `variants`                                                                                                               |
| `"optional"`                                                                                            | `optional`                                        | `inner`, `default`; no `options` or `checks`                                                                                    |
| `"nullable"`, `"nullish"`                                                                               | `nullable`, `nullish`                             | `inner`; no `options` or `checks`                                                                                               |
| `"readonly"`                                                                                            | `readonly`                                        | `inner`; no `options` or `checks`                                                                                               |
| `"fallback"`                                                                                            | `fallback`                                        | `inner`, `value`; no `options` or `checks`                                                                                      |
| `"transform"`                                                                                           | `transform`                                       | `inner`, `convert`; no `options` or `checks`                                                                                    |
| `"pipe"`                                                                                                | `pipe`                                            | `steps`; no `options` or `checks`                                                                                               |
| `"codec"`                                                                                               | `codec`                                           | `input`, `output`, `decode`, `encode`; no `options` or `checks`                                                                 |
| `"lazy"`                                                                                                | `lazy`                                            | `getter`, which returns the validator                                                                                           |
| `"json"`, `"searchParams"`, `"formData"`                                                                | `json`, `searchParams`, `formData`                | `inner`                                                                                                                         |
| `"check"`                                                                                               | Every built-in check                              | `code` and `params` of the issue it reports                                                                                     |

A check is described the same way, so the list in `checks` can be read too: `describe(pattern(/^a/))` gives `{ kind: "check", code: "invalid_format", params: { format: "regex", pattern: "/^a/" } }`. A check made by `checkFields` gives `{ kind: "check", fields }`, the properties it waits for, and no `params`, since its test is a function. What nobody can read gives `undefined`: a validator or a check you wrote by hand, and a check made by `check`, whose test is a function. A reader of a schema decides what such a rule means to it, and code that turns a schema into another notation usually refuses it. The function a `transform` converts with and a `lazy`'s getter are in the description as functions, for the same reason. The test of a `guard` and what a format reads with are not in it: a `guard` gives the `expected` it names and a format its name.

What `standard` returns is described as the validator it wraps, and so is what `meta` returns, with a `meta` part added: `{ title, description, examples, deprecated }`, each key only when given. A validator written by hand that `meta` was given is described as `{ kind: "meta", inner, meta }`. The parts are typed as `unknown`, since what a part is depends on the kind: read `kind` first, then the parts of that kind from the table.

## Next

The libraries that take a Standard Schema or a JSON Schema each have a few details of their own. [Integrations](integrations.md) shows the common ones, with the sign-up.
