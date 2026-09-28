# @codenhub/validation

Zero-dependency validation and primitive coercion helpers for TypeScript application boundaries.

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

## License

Licensed under Apache-2.0.
