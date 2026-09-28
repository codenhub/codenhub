---
title: Overview
---

# Validate Application Inputs

`@codenhub/validation` provides declarative data and structure validation, primitive coercion helpers, and deep customization without runtime dependencies. It allows defining typed schemas for unknown request parameters, API payloads, form submissions, or environment variables and validating them with discriminated results.

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

Validators never throw for ordinary validation failures; they return a `ValidationResult<T>` that discriminates on `ok: true | false`.

## Requirements

- ESM-aware package resolution.
- Browser, Node.js, and SSR runtimes are supported.
- No runtime dependencies.

All public symbols are imported from `@codenhub/validation`; there are no public subpath exports. Error input is omitted by default; enable `includeInput` only when retaining the original value is safe. URL and email validators intentionally accept public host shapes only.

## Next steps

- [Results and coercion](results-and-coercion.md) explains error shapes, result construction, custom validators, pipeline composition, and primitive coercion.
- [Validator reference](validators.md) documents all schema builders including strings, numbers, booleans, dates, objects, arrays, records, tuples, unions, and modifiers.
