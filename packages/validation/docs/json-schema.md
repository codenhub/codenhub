---
title: JSON Schema
description: Write a validator as a JSON Schema, for the body of an HTTP API, the arguments of a tool a language model calls, or a form generator.
---

# JSON Schema

`toJsonSchema(validator)` writes a validator as a [JSON Schema](https://json-schema.org/), draft 2020-12. It is what an OpenAPI document, the tool definitions of a language model and many form generators take, so one validator can both check a value and tell another program what the value must look like.

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

Three places bend that promise, each because the validator cleans a value before it checks it, which a schema cannot say:

- **Clean-up options.** `string({ trim: true, max: 5 })` is written with `maxLength: 5`, which describes text that needs no trimming. Text with spaces around five letters passes the validator and not the schema. `case` is the same, and so is `clamp` beside a limit, as in `number({ max: 10, clamp: { min: 0, max: 10 } })`: the schema describes the value as it is after cleaning. The range of a `clamp` is itself not written.
- **Length of text.** A string's `length` counts an emoji, and any other character outside the Basic Multilingual Plane, as two, and JSON Schema counts it as one, so a `min` or `max` can differ by the number of such characters. A `pattern` is the same: a schema reads it in Unicode mode, the `u` flag, so in one written without that flag `.` and a negated class such as `[^a]` match a whole character in the schema and half of an emoji in the validator.
- **Formats that accept several spellings.** `phone()` accepts `+55 (11) 98765-4321` and produces `+5511987654321`. A check on such a format, as in `hostname(pattern(/^[a-z.]+$/))`, sees the spelling the format produces and is written for the text as it arrives, so `EXAMPLE.com` passes the validator and not the schema. A format JSON Schema has no name for is written under its own, such as `"format": "phone"`, which a reader that does not know it ignores.

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

`multipleOf` is written only for a step binary floating point holds exactly, an integer or a fraction such as `0.5` or `0.25`. A reader divides in binary, where `0.3 / 0.1` is not `3`, so with a step such as `0.1` or `0.01` it would refuse values the validator accepts; such a step is left out.

A format is written under JSON Schema's name for it, and with no `format` where that name's rules refuse text the validator accepts, which would break the promise above:

| Format                       | Input                                                   | Output     |
| ---------------------------- | ------------------------------------------------------- | ---------- |
| `email`                      | None, since the domain may be internationalized         | `email`    |
| `domain`                     | None, for the same reason                               | `hostname` |
| `hostname`, `uuid`           | Their own names                                         | The same   |
| `datetime`                   | `date-time`, and none with `local`, which has no offset | The same   |
| `isoDate`                    | `date`                                                  | The same   |
| `ip`                         | `ipv4` with `version: "v4"`, and none otherwise         | The same   |
| `time`, `duration`, `url`    | None                                                    | None       |
| `port`, `base64`             | As the table above writes them                          | The same   |
| Any other, `format` included | Its own name                                            | The same   |

A format is left out where JSON Schema's has stricter rules: `time` needs an offset, which a time of day such as `12:00` never has, `duration` allows no fraction, as in `PT0.5S`, and no weeks beside days, as in `P1W1D`, an IPv6 address may have a zone, as in `fe80::1%eth0`, which `ipv6` does not allow, and a URL may hold `|` or `^`, which a URI may not. The input of `email` and `domain` may be internationalized, as in `user@bücher.example`, which `email` and `hostname` refuse; `idn-email` and `idn-hostname` would fit, but [ajv-formats](https://github.com/ajv-validator/ajv-formats) does not know them, and Ajv in its default strict mode refuses to compile a schema with a format it does not know, as it does for `phone` or `slug`: register those, or create Ajv with `strict: false`, which ignores them.

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

Build a recursive schema once and refer to it, as the [validator reference](validators.md#lazy) says. One built anew at every level, as `lazy(() => build())` inside `build` does, has no end to write, and `toJsonSchema` throws a `TypeError` saying so.

## Saying what a value is for

A schema that gives only the types tells a reader what to send and not what it means. [`meta`](validators.md#meta) adds a title, a description, examples and whether a value is deprecated to the part it is given to, and `toJsonSchema` writes each under JSON Schema's keyword of the same name. A language model reads the `description` of a tool's arguments to decide what to put in them, and an OpenAPI document shows all four.

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

The schema is written in draft 2020-12 unless `target: "draft-07"` asks for the older draft, which some readers, such as the tools of a language model in the AI SDK, still take. In draft-07 the items of a `tuple` are listed under `items` and its `rest` under `additionalItems`, definitions are under `definitions`, and what `json` parses is not written, since that draft has no `contentSchema`. Any other target is a `TypeError`, and so is an option `toJsonSchema` does not have, such as `draft` written for `target`, as it is for a factory. [`standardJsonSchema`](standard-schema.md#with-its-json-schema) writes the draft a library asks for, through the same function.

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
