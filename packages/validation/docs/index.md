---
title: Overview
---

# Validate Application Inputs

`@codenhub/validation` validates unknown boundary values and performs explicit
primitive coercion without runtime dependencies. It is useful when request
parameters, environment values, form input, or other unknown data needs a typed
success-or-failure result before entering application logic.

## Setup

### Installation

```sh
pnpm add @codenhub/validation
```

### Quick start

Validators and coercers return a discriminated `ValidationResult` rather than
throwing for ordinary invalid input:

```ts
import { coerce, val } from "@codenhub/validation";

const coerced = coerce.int("3000", { path: ["port"] });
const port = coerced.ok ? val.number(coerced.value).port() : coerced;

if (!port.ok) {
  console.error(port.error.code, port.error.path);
}
```

Coercion only converts primitive values; follow it with a validator when the
result must satisfy a domain constraint such as a valid port range.

## Requirements

- ESM-aware package resolution.
- Browser, Node.js, and SSR runtimes are supported.
- No runtime dependencies.

All public symbols are imported from `@codenhub/validation`; there are no public
subpath exports. Error input is omitted by default; enable `includeInput` only
when retaining the original value is safe. URL and email validators
intentionally accept public host shapes only.

## Next steps

- [Results and coercion](results-and-coercion.md) explains error shapes, result
  construction, custom validators, primitive conversion, and safe input
  retention.
- [Validator reference](validators.md) documents the string, number, object,
  and array validators with their defaults and constraints.
