---
title: Results and Coercion
---

# Results And Coercion

## Result Model

`ValidationResult<T>` is a discriminated union: `ValidationOk<T> | ValidationErr`.

- Success: `{ ok: true, value: T }`
- Failure: `{ ok: false, error: ValidationError }`

`ValidationError` extends `ValidationIssue` with child `issues`. Each issue contains:

- `code`: Stable machine code (`invalid_type`, `invalid_value`, `invalid_format`, `too_small`, `too_big`, `missing_key`, `custom`).
- `message`: Human-readable error description.
- `path`: Segment array describing location (`readonly (string | number)[]`).
- `input`: Retained only when `includeInput: true` is configured in `ValidationOptions`.
- `expected` / `received`: Optional descriptive strings.

### Multi-issue aggregation

By default (`abortEarly: false`), object and array validation runs across all fields and elements, collecting all encountered errors in `error.issues`. Callers can pass `{ abortEarly: true }` in `ValidationOptions` to halt execution on the first error.

```ts
const result = schema.validate(data, { abortEarly: false });
if (!result.ok) {
  for (const issue of result.error.issues ?? []) {
    console.error(issue.path.join("."), issue.message);
  }
}
```

## Custom Validators

`val.custom()` builds reusable, first-class validator schemas that integrate into objects, arrays, and pipelines:

```ts
import { val } from "@codenhub/validation";

const hexColor = val.custom<string>((input, ctx) => {
  if (typeof input !== "string") {
    return ctx.fail({ code: "invalid_type", message: "Expected hex color string" });
  }
  if (!/^#[0-9a-f]{6}$/i.test(input)) {
    return ctx.fail({ code: "invalid_format", message: "Invalid hex color format" });
  }
  return ctx.ok(input.toLowerCase());
});

const themeSchema = val.object({
  primary: hexColor,
  accent: hexColor,
});
```

### Refinements & Transformations

Every validator supports `.refine()` and `.transform()`:

```ts
const passwordSchema = val
  .string()
  .min(8)
  .refine((val) => /[A-Z]/.test(val), "Must contain at least one uppercase letter")
  .refine((val) => /[0-9]/.test(val), "Must contain at least one number");

const trimmedEmail = val
  .string()
  .email()
  .transform((val) => val.trim().toLowerCase());
```

Cross-field validation can be attached to object schemas:

```ts
const passwordResetSchema = val
  .object({
    password: val.string().min(8),
    confirmPassword: val.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
```

### Pipelines

`val.pipe()` combines multiple validators in sequence, piping the output of one step into the next:

```ts
const portSchema = val.pipe(val.coerce.int(), val.number().port());
```

## Primitive Coercion

Coercion is available both as declarative validator schemas via `val.coerce.*` and as direct functional helpers via `coerce.*`:

| Direct helper                    | Schema factory        | Behavior                                                          |
| -------------------------------- | --------------------- | ----------------------------------------------------------------- |
| `coerce.int(value, options?)`    | `val.coerce.int()`    | Coerces decimal integer strings or primitives to a safe integer.  |
| `coerce.number(value, options?)` | `val.coerce.number()` | Coerces decimal numeric strings or primitives to a finite number. |
| `coerce.bool(value, options?)`   | `val.coerce.bool()`   | Coerces booleans, `1`/`0`, `yes`/`no`, `on`/`off` to boolean.     |
| `coerce.string(value, options?)` | `val.coerce.string()` | Coerces defined primitives to string; rejects null and undefined. |
| `coerce.date(value, options?)`   | `val.coerce.date()`   | Coerces Date instances, timestamps, and ISO strings to a Date.    |

Objects and functions are rejected by all coercers.
