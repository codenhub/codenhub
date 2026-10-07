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
//     email: { type: "string", format: "email" },
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
- **Length of text.** A string's `length` counts an emoji, and any other character outside the Basic Multilingual Plane, as two, and JSON Schema counts it as one, so a `min` or `max` can differ by the number of such characters.
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
// { page: { type: ["number", "string"] }, sort: { enum: ["new", "top"], default: "new" } }
// and only `page` is required

toJsonSchema(query, { io: "output" }).properties;
// { page: { type: "integer" }, sort: { enum: ["new", "top"] } }
// and both are required
```

| Validator                                    | Input                                                                                                                                           | Output                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `optional(validator, value)`                 | The validator's schema, not required, with `default` when the default is a JSON primitive                                                       | The validator's schema, required                       |
| `lazy`, `json` or `searchParams` with checks | For `lazy` and `json`, the checks in an `allOf` beside what it refers to or parses to. For `searchParams`, a string, which says nothing of them | The checks in an `allOf` beside the validator's schema |
| The `coerce` validators                      | The types they convert from                                                                                                                     | The type they produce                                  |
| `transform`                                  | The schema of the validator it converts from                                                                                                    | Cannot be written                                      |
| `pipe`                                       | Its first validator                                                                                                                             | Its last                                               |
| `json(validator)`                            | A string, with `contentSchema` for what it parses to                                                                                            | The validator's schema                                 |
| `searchParams(validator)`                    | A string                                                                                                                                        | The validator's schema                                 |
| `fallback`                                   | Anything, since it never fails                                                                                                                  | The schema of the validator it wraps                   |

The output side takes a default and the value of a `fallback` to pass the validator they are given to. Neither is validated, so `optional(string({ min: 3 }), "")` produces text its own output schema refuses: give a default its validator accepts.

## How each validator is written

| Validator                                                   | Schema                                                                                                                                                                                                                                          |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `string`                                                    | `type: "string"` with `minLength` and `maxLength`                                                                                                                                                                                               |
| `number`                                                    | `type: "number"`, or `"integer"` with `int` or `safeInt`, with `minimum`, `maximum`, `exclusiveMinimum` and `exclusiveMaximum`                                                                                                                  |
| `boolean`, `unknown`, `never`                               | `type: "boolean"`, `{}` and `{ not: {} }`                                                                                                                                                                                                       |
| `literal`, `oneOf`                                          | `const` and `enum`                                                                                                                                                                                                                              |
| A format                                                    | `type: "string"` with `format`: `email`, `uuid`, `time`, `duration`, `hostname` as named, `uri` for `url`, `date-time` for `datetime`, `date` for `isoDate`, `hostname` for `domain`, `ipv4` or `ipv6` for `ip`, and its own name for any other |
| `port`, `base64`                                            | An integer from 1 to 65535, and a string with `contentEncoding`                                                                                                                                                                                 |
| `object`, `objectLike`                                      | `type: "object"` with `properties`, `required`, and `additionalProperties: false` for a strict `object`                                                                                                                                         |
| `array`                                                     | `type: "array"` with `items`, `minItems` and `maxItems`                                                                                                                                                                                         |
| `tuple`                                                     | `prefixItems`, with `items` for `rest` and `false` without it                                                                                                                                                                                   |
| `record`                                                    | `propertyNames` and `additionalProperties`, with `minProperties` and `maxProperties`                                                                                                                                                            |
| `union`, `intersection`                                     | `anyOf` and `allOf`                                                                                                                                                                                                                             |
| `tagged`                                                    | `oneOf`, with the tag as a `const` property of each variant                                                                                                                                                                                     |
| `nullable`, `nullish`                                       | `anyOf` with `type: "null"`                                                                                                                                                                                                                     |
| `readonly`, `brand`                                         | What the validator inside is written as                                                                                                                                                                                                         |
| `lazy`                                                      | A `$ref` to a definition under `$defs`                                                                                                                                                                                                          |
| `pattern`, `startsWith`, `endsWith`, `includes`, `nonBlank` | `pattern`                                                                                                                                                                                                                                       |
| `multipleOf`, `nonZero`, `unique()`                         | `multipleOf`, `not: { const: 0 }` and `uniqueItems`                                                                                                                                                                                             |

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

## What cannot be written

JSON Schema has no words for some of what a validator can check, and JSON has no value for some of what it can produce:

- `date`, `bigint`, `symbol`, `func`, `instanceOf`, `set` and `map`, none of which is a JSON value, and a validator made by `guard`, whose test is a function nobody can read.
- A validator you wrote by hand, and a check made by `check`, whose rule is a function nobody can read.
- `lowercase`, `uppercase`, `unique` with a key function, and a `pattern` with a flag such as `i`, which JSON Schema patterns do not have. The flags `g` and `y`, which `pattern` drops, are left out.
- What a `transform` returns, on the output side.
- A check on an `object`, and a variant of `tagged` that is not an `object`.

By default `toJsonSchema` throws a `TypeError` that names the part and where it is, such as `toJsonSchema cannot write a validator of kind "date" at createdAt`, so a schema is never quietly weaker than you meant. Pass `{ unrepresentable: "any" }` to write such a part as `{}`, which accepts anything, and to leave such a check out:

```ts
import { check, date, object, string, toJsonSchema } from "@codenhub/validation";

const post = object({ title: string(check((text) => !text.includes("spam"))), createdAt: date() });

toJsonSchema(post, { unrepresentable: "any" }).properties;
// { title: { type: "string" }, createdAt: {} }
```

To send a date as JSON, validate the text it travels as, with `datetime()` or `isoDate()`, or convert it with `coerceDate()`, whose input side is a string or a whole number of milliseconds.
