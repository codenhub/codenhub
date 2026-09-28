# @codenhub/validation

Zero-dependency declarative schema validation and primitive coercion helpers for TypeScript application boundaries. Version 0.1.0 is a pure declarative schema builder designed with zero legacy baggage.

> **Experimental:** Validator coverage, normalization rules, error details, and the public API may change before a stable release.

## Installation

```sh
pnpm add @codenhub/validation
```

## Usage

Define declarative schemas and validate unknown boundary data returning discriminated results without throwing:

```ts
import { val, type Infer } from "@codenhub/validation";

const userSchema = val.object({
  name: val.string().min(2),
  email: val.string().email(),
  role: val.enum(["admin", "user"]).default("user"),
  age: val.number().int().min(18).optional(),
});

export type User = Infer<typeof userSchema>;

const result = userSchema.validate(data);

if (result.ok) {
  console.log("Valid user:", result.value);
} else {
  console.error("Validation failed:", result.error.message, result.error.issues);
}
```

## Features

### Schemas and Discriminated Unions

Construct typed primitives, objects, arrays, records, tuples, and indexed discriminated unions:

```ts
const eventSchema = val.discriminatedUnion("type", [
  val.object({
    type: val.literal("click"),
    coordinates: val.tuple([val.number(), val.number()]),
  }),
  val.object({
    type: val.literal("keypress"),
    key: val.string().nonEmpty(),
  }),
]);
```

### Coercion Chaining

Convert raw string or boundary inputs into typed, validated values using chainable coercers:

```ts
const portSchema = val.coerce.number().int().min(1).max(65535);
const activeSchema = val.coerce.boolean().default(false);
```

### Customization and Async Validation

Extend validation with `.check()`, `.superRefine()`, `val.custom()`, or asynchronous validations:

```ts
const userAvailabilitySchema = val.string().refineAsync(async (username) => await checkUsernameAvailability(username), "Username is already taken");

const complexCheck = val.object({ password: val.string(), confirm: val.string() }).check((data, ctx) => {
  if (data.password !== data.confirm) {
    ctx.addIssue({
      code: "custom",
      message: "Passwords must match",
      path: ["confirm"],
    });
  }
});
```

### Standard Schema & Ergonomics

All schemas implement the [Standard Schema v1](https://standardschema.dev/) specification (`~standard`) for seamless compatibility with ecosystem tools:

```ts
import { assert, flatten, is, parse, parseAsync, validate } from "@codenhub/validation";

// Throwing parse or assertion
const user = parse(rawData, userSchema);
assert(rawData, userSchema);

// Standalone result validation and flattening
const res = validate(rawData, userSchema);
if (!res.ok) {
  const { formErrors, fieldErrors } = flatten(res);
}
```

## Documentation

- [Documentation overview](docs/index.md)
- [Results and coercion](docs/results-and-coercion.md)
- [Validator reference](docs/validators.md)

## Requirements

- ESM-aware package resolution.
- Browser, Node.js, and SSR runtimes are supported.
- No runtime dependencies.

## Notes

- `includeInput` defaults to `false`; enable it only when retaining input is safe.
- Object and array validation defaults to `abortEarly: false`, aggregating all field and element errors into `error.issues`.
- URL and email validators intentionally accept public host shapes only.
- Validation failures do not throw by default when using `.validate()` or `val.validate()`; use `.parse()`, `val.parse()`, or `val.assert()` when an exception is preferred.

## License

Licensed under Apache-2.0.
