---
title: Overview
---

# Validate Application Inputs

`@codenhub/validation` provides declarative data and structure validation, primitive coercion helpers, and deep customization without runtime dependencies. Version 0.1.0 is built from scratch as a pure declarative schema builder with zero legacy baggage. It allows defining typed schemas for unknown request parameters, API payloads, form submissions, or environment variables and validating them with discriminated results or throwing parsers.

## Setup

### Installation

```sh
pnpm add @codenhub/validation
```

### Quick start

Create reusable validator schemas using `val` and run `.validate()` against unknown boundary data:

```ts
import { val, type Infer } from "@codenhub/validation";

const signupSchema = val.object({
  username: val.string().min(3).max(30).trim(),
  email: val.string().email(),
  age: val.number().int().min(18).optional(),
  newsletter: val.boolean().default(false),
  tags: val.array(val.string()).default([]),
});

export type SignupInput = Infer<typeof signupSchema>;

const result = signupSchema.validate(payload);

if (result.ok) {
  // result.value is strongly typed as SignupInput
  console.log("Registered:", result.value.username);
} else {
  // result.error contains code, message, path, and child issues
  console.error("Validation failed:", result.error.message);
  for (const issue of result.error.issues ?? []) {
    console.error(`- [${issue.path.join(".")}] ${issue.message}`);
  }
}
```

## Validation Modes

Schemas can be evaluated across multiple execution workflows depending on whether application boundaries prefer safe result types, thrown exceptions, assertions, or async resolution:

### Discriminated Results

The default execution mode returns a `ValidationResult<T>` that discriminates on `ok: true | false`:

```ts
const res = schema.validate(input);
if (res.ok) {
  handleSuccess(res.value);
} else {
  handleFailure(res.error);
}
```

### Throwing Parsers

When exceptions are preferred at application boundaries (e.g. RPC handlers or controllers), use `.parse()`:

```ts
import { parse } from "@codenhub/validation";

try {
  const user = schema.parse(input);
  // or standalone: parse(input, schema);
} catch (error) {
  // Throws ValidationError with .issues and .flatten()
}
```

### Asynchronous Validation

Schemas with asynchronous refinements, transforms, or checks evaluate via `.validateAsync()` or `.parseAsync()`:

```ts
import { parseAsync, validateAsync } from "@codenhub/validation";

const res = await schema.validateAsync(input);
const value = await schema.parseAsync(input);
```

### Type Guards and Assertions

Validate input type conformance without creating full error trees using `.is()`, `val.is()`, or assertion functions:

```ts
import { assert, is } from "@codenhub/validation";

if (schema.is(input)) {
  // input is narrowed to schema output type
}

assert(input, schema);
// input is asserted as schema output type in current scope or throws ValidationError
```

## Standard Schema v1

All schemas implement the [Standard Schema v1](https://standardschema.dev/) specification via the `~standard` property. This enables direct interoperability with modern forms and libraries (such as TanStack Form or React Hook Form) without external adapters.

## Requirements

- ESM-aware package resolution.
- Browser, Node.js, and SSR runtimes are supported.
- No runtime dependencies.

All public symbols are imported from `@codenhub/validation`; there are no public subpath exports. Error input is omitted by default; enable `includeInput` only when retaining the original value is safe. URL and email validators intentionally accept public host shapes only.

## Next steps

- [Results and coercion](results-and-coercion.md) explains error shapes, result construction, custom validators, pipeline composition, and primitive coercion.
- [Validator reference](validators.md) documents all schema builders including strings, numbers, booleans, dates, objects, arrays, records, tuples, unions, and modifiers.
