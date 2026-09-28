---
title: Results and Coercion
---

# Results And Coercion

## Result Model

`ValidationResult<T>` is a discriminated union: `ValidationOk<T> | ValidationErr`.

- Success: `{ ok: true, value: T }`
- Failure: `{ ok: false, error: ValidationError }`

`ValidationError` implements `ValidationIssue` and provides access to structured child `issues`. Each issue contains:

- `code`: Stable machine code (`invalid_type`, `invalid_value`, `invalid_format`, `too_small`, `too_big`, `missing_key`, `custom`).
- `message`: Human-readable error description.
- `path`: Segment array describing location (`readonly (string | number)[]`).
- `input`: Retained only when `includeInput: true` is configured in `ValidationOptions`.
- `expected` / `received`: Optional descriptive shape strings.

### Multi-issue aggregation

By default (`abortEarly: false`), object and array validation runs across all fields and elements, collecting all encountered errors in `error.issues`. Callers can pass `{ abortEarly: true }` in `ValidationOptions` to halt execution on the first error:

```ts
const result = schema.validate(data, { abortEarly: false });
if (!result.ok) {
  for (const issue of result.error.issues ?? []) {
    console.error(issue.path.join("."), issue.message);
  }
}
```

### Flattening Errors

To format errors for user interfaces or forms, use the `.flatten()` method on `ValidationError` or the standalone `flatten()` function. Issues with an empty path are grouped into `formErrors`, while nested issues are grouped under `fieldErrors` using formatted dot-and-bracket path notation (e.g. `user.addresses[0].street`):

```ts
import { flatten } from "@codenhub/validation";

const result = signupSchema.validate(formData);

if (!result.ok) {
  const { formErrors, fieldErrors } = flatten(result);
  // or result.error.flatten();

  console.log("Form errors:", formErrors);
  console.log("Email error:", fieldErrors["email"]?.[0]);
  console.log("Address street error:", fieldErrors["addresses[0].street"]?.[0]);
}
```

## Checks and Customization

### Contextual Checks (.check and .superRefine)

Use `.check()` or its alias `.superRefine()` when validation requires dynamic logic, multiple conditional errors, or custom path targeting:

```ts
const passwordResetSchema = val
  .object({
    password: val.string().min(8),
    confirmPassword: val.string(),
  })
  .check((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        message: "Passwords must match",
        path: ["confirmPassword"],
      });
    }
  });
```

The check callback receives the validated value and `ValidationContext`:

- Returning `false` emits a generic failure.
- Returning a `string` emits a failure with that message.
- Calling `ctx.addIssue()` records structured issues.
- Asynchronous checks returning a `Promise` automatically require async validation.

### Refinements & Transformations

Every validator supports synchronous and asynchronous refinements and transformations:

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

### Asynchronous Validation

When schemas use `.refineAsync()`, `.transformAsync()`, or async `.check()`, validation must be executed via `validateAsync()` or `parseAsync()`:

```ts
const usernameSchema = val
  .string()
  .min(3)
  .refineAsync(async (username) => {
    const available = await checkDbForUser(username);
    return available;
  }, "Username already in use");

// Validate asynchronously
const result = await usernameSchema.validateAsync("alice");

// Or parse asynchronously
const validUser = await usernameSchema.parseAsync("alice");
```

Synchronous `.validate()` on a schema containing asynchronous rules returns a failed result indicating that `validateAsync()` is required.

### Custom Validators

`val.custom()` builds reusable, first-class validator schemas that integrate cleanly into objects, arrays, and pipelines:

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

### Coercion Schema Chaining

Schemas returned by `val.coerce.*` return standard typed validators, enabling full chainable constraint validation on coerced values:

```ts
const configSchema = val.object({
  port: val.coerce.number().int().min(1).max(65535),
  maxRetries: val.coerce.int().min(0).default(3),
  enabled: val.coerce.boolean().default(true),
  startDate: val.coerce.date().max(new Date()),
});
```

Objects and functions are rejected by all coercers.
